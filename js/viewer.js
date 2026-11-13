// Rajznéző: egyoldalas PDF éles megjelenítése nagyítással, mozgatással és jelölőkkel.
//
// Rajzolómotor: PDFium (WebAssembly) háttérszálon (pdf-worker.js). A CAD-rajzok >1 millió műveletből állnak;
// a PDFium a látható részen kívül esőket kihagyja, így egy nagyított kivágás ~10–70 ms (PDF.js-sel ~1 mp volt).
//
// Működés:
//  - „alap” vászon: a teljes oldal egyszer, közepes felbontásban – mozgatás közben ez látszik a még ki nem
//    rajzolt helyeken (méretkorláttal, mert a mobil böngészők a túl nagy vásznat nem bírják);
//  - „részlet”: a látható rész (+ ráhagyás) a kijelző tényleges felbontásán (devicePixelRatio). Mozgatás és csípés
//    közben is folyamatosan kérünk újat (egyszerre egy menet fut, a legfrissebb nézetre), így a kép menet közben élesedik;
//  - nyugalomban a részlet képernyő-koordinátában, képpontrácsra igazítva ül (1 vászonpixel = 1 kijelzőpixel → nincs elmosódás);
//  - a kész képek gyorsítótárban maradnak (visszanagyításkor azonnal megvannak).
// Koordináták: az oldal pontban (forgatással); képernyő = oldal * s + (tx, ty). A jelölők helye oldalarány (0–1).
import { html, raw } from './ui.js';

const COARSE = matchMedia('(pointer: coarse)').matches; // telefon/tablet: kevesebb memória
// Memória: a vásznak képpontonként 4 bájtot foglalnak (pl. 10 M px = 40 MB). Mivel a PDFium-mal az újrarajzolás olcsó,
// kevés és kisebb kész kép is elég. (A PDFium saját memóriája egy nagy CAD-rajznál ~200+ MB – az a motoré, itt nem állítható.)
const BASE_MAX_SIDE = 3072;                      // alap vászon leghosszabb oldala (px) – csak gesztus közbeni átmenet
const BASE_MAX_AREA = COARSE ? 4e6 : 6e6;        // alap vászon területe (px)
const TILE_MAX_AREA = COARSE ? 6e6 : 10e6;       // egy részletkép legnagyobb területe (px)
const TILE_CACHE = COARSE ? 2 : 3;               // ennyi kész részletképet tartunk meg
// A PDFium ideje a kivágásba eső rajzelemek számától függ → előbb csak a látható részt rajzoljuk (gyors),
// és nyugalomban, kis szünet után a háttérben egy ráhagyásos képet is (előtöltés a mozgatáshoz).
const TILE_MARGIN = 0.5;                         // előtöltés: ráhagyás a látható rész körül (a méret arányában, oldalanként)
const LIVE_MARGIN = 0.1;                         // gesztus közben
const PREFETCH_MS = 250;                         // ennyi nyugalom után indul az előtöltés
const SNAP = 0.02;                               // ennyi eltérésnél a nagyítás a kész képhez igazodik (nem látható)
const SETTLE_MS = 120;                           // ennyi nyugalom után igazodik a kép a képpontrácshoz

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
/** Vászon memóriájának azonnali felszabadítása (iOS-en a levett vászon is foglal, amíg a GC el nem viszi). */
const freeCanvas = c => { c.width = 0; c.height = 0; };

/**
 * PDF megnyitása a háttérszálon. Visszaad: { pages, W, H, render(r, x0, y0, pw, ph) → ImageBitmap, destroy() }.
 * Rajzonként egy háttérszál; a destroy leállítja (a WASM-memória teljesen felszabadul).
 */
export async function openPdf(bytes) {
  const worker = new Worker(new URL('./pdf-worker.js', import.meta.url), { type: 'module' });
  const waits = new Map();
  let seq = 0;
  const failAll = msg => { for (const w of waits.values()) w.reject(new Error(msg)); waits.clear(); };
  worker.onmessage = ({ data }) => {
    const w = waits.get(data.id);
    if (!w) return;
    waits.delete(data.id);
    if (data.error) w.reject(new Error(data.error)); else w.resolve(data);
  };
  worker.onerror = e => { e.preventDefault(); failAll('A rajzoló nem indult el' + (e.message ? ': ' + e.message : '')); };
  const call = (msg, transfer = []) => new Promise((resolve, reject) => {
    const id = ++seq;
    waits.set(id, { resolve, reject });
    worker.postMessage({ id, ...msg }, transfer);
  });
  const copy = bytes.slice(0); // a háttérszál átveszi a puffert → a tárolt eredeti marad
  try {
    const info = await call({ op: 'open', bytes: copy }, [copy]);
    return {
      pages: info.pages, W: info.W, H: info.H,
      render: (r, x0, y0, pw, ph) => call({ op: 'render', r, x0, y0, pw, ph }).then(d => d.bitmap),
      mem: () => call({ op: 'mem' }).then(d => d.wasm), // a PDFium memóriája (bájt) – méréshez
      destroy() { worker.terminate(); failAll('A rajz bezárva'); },
    };
  } catch (e) {
    worker.terminate();
    throw e;
  }
}

/** ImageBitmap → vászon (ha lehet, másolás nélkül). */
function bitmapCanvas(bitmap) {
  const c = document.createElement('canvas');
  c.width = bitmap.width; c.height = bitmap.height;
  const br = c.getContext('bitmaprenderer');
  if (br) br.transferFromImageBitmap(bitmap);
  else { c.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close(); }
  return c;
}

export class Viewer {
  /**
   * host: a néző tárolóeleme. doc: openPdf eredménye.
   * opts: { onTap(x, y), onMarkerTap(id), onMarkerMove(id, x, y), canDrag() } – x, y az oldalhoz viszonyított arány.
   */
  constructor(host, doc, opts) {
    this.host = host; this.doc = doc; this.opts = opts;
    this.W = doc.W; this.H = doc.H;
    host.classList.add('stage');
    host.innerHTML = '<div class="world"><canvas class="base"></canvas></div><div class="dlayer"></div><div class="mlayer"></div>';
    this.world = host.querySelector('.world');
    this.base = host.querySelector('.base');
    this.dlayer = host.querySelector('.dlayer');
    this.mlayer = host.querySelector('.mlayer');
    this.world.style.width = this.W + 'px';
    this.world.style.height = this.H + 'px';
    this.s = 1; this.tx = 0; this.ty = 0;
    this.markers = new Map();
    this.ptrs = new Map();
    this.g = null;            // folyamatban lévő gesztus
    this.detail = null;       // a megjelenített részletkép { c, x0, y0, x1, y1, r }
    this.tiles = [];          // kész részletképek (legutóbb használt a végén)
    this.inflight = false;    // fut-e menet (egyszerre egy)
    this.again = false;       // menet közben változott a nézet → utána új menet

    this.on(host, 'pointerdown', e => this.down(e));
    // Középső gomb: a Windows „automatikus görgetés” ikonja ne jelenjen meg (a mozgatást a pointer-események végzik)
    this.on(host, 'mousedown', e => { if (e.button === 1) e.preventDefault(); });
    this.on(host, 'auxclick', e => { if (e.button === 1) e.preventDefault(); });
    this.on(host, 'pointermove', e => this.move(e));
    this.on(host, 'pointerup', e => this.up(e, true));
    this.on(host, 'pointercancel', e => this.up(e, false));
    this.on(host, 'wheel', e => this.wheel(e), { passive: false });
    this.on(host, 'gesturestart', e => e.preventDefault()); // iOS Safari saját oldalnagyítása
    this.on(host, 'contextmenu', e => e.preventDefault());  // hosszú nyomásra ne jöjjön menü
    this.lastSize = this.size();
    this.ro = new ResizeObserver(() => this.resized());
    this.ro.observe(host);
  }
  on(el, ev, fn, o) { el.addEventListener(ev, fn, o); (this.offs ||= []).push(() => el.removeEventListener(ev, fn, o)); }

  /** Előbb a látható rész éles képe, utána a háttérben az alapkép a mozgatáshoz. */
  async init() {
    this.fit();
    this.align();
    this.ready = true;
    await this.request();
    this.renderBase().catch(() => {});
  }
  destroy() {
    this.destroyed = true;
    clearTimeout(this.dt); clearTimeout(this.pf);
    this.ro.disconnect();
    (this.offs || []).forEach(f => f());
    this.tiles.forEach(t => freeCanvas(t.c));
    this.tiles = []; this.detail = null;
    freeCanvas(this.base);
  }

  /* ---------- Nézet ---------- */
  get dpr() { return Math.min(window.devicePixelRatio || 1, 3); }
  size() { return { w: this.host.clientWidth, h: this.host.clientHeight }; }
  fitScale() { const { w, h } = this.size(); return Math.min(w / this.W, h / this.H) * 0.96; }
  /** Nagyítási határok: a teljes oldal felétől addig, amíg 1 pt ≈ 12 CSS px (a legapróbb CAD-felirat is olvasható). */
  limits() { const f = this.fitScale(); return [f * 0.5, Math.max(f * 4, 12)]; }
  fit() {
    const s = this.fitScale(), { w, h } = this.size();
    this.set(s, (w - this.W * s) / 2, (h - this.H * s) / 2);
  }
  set(s, tx, ty) {
    const [mn, mx] = this.limits(), { w, h } = this.size();
    s = clamp(s, mn, mx);
    // A rajz ne tűnhessen el: a lap legalább a képernyő közepéig érjen
    this.s = s;
    this.tx = clamp(tx, w / 2 - this.W * s, w / 2);
    this.ty = clamp(ty, h / 2 - this.H * s, h / 2);
    this.frame();
    this.kick();
  }
  zoomAt(k, px, py) {
    const [mn, mx] = this.limits();
    const ns = clamp(this.s * k, mn, mx), r = ns / this.s;
    this.set(ns, px - (px - this.tx) * r, py - (py - this.ty) * r);
    this.scheduleSettle();
  }
  zoomCenter(k) { const { w, h } = this.size(); this.zoomAt(k, w / 2, h / 2); }
  /** Egy pont (oldalarány) a képernyő közepére, olvasható nagyításon (ha már nagyobb, marad). */
  focus(x, y) {
    const [, mx] = this.limits(), { w, h } = this.size();
    const s = Math.max(this.s, Math.min(mx, this.fitScale() * 5));
    this.set(s, w / 2 - x * this.W * s, h / 2 - y * this.H * s);
    this.scheduleSettle();
  }
  /** Jelölő felvillantása (pl. a Pozíciók oldalról ide ugorva). */
  flash(id) {
    const m = this.markers.get(id);
    if (!m) return;
    m.el.classList.remove('flash');
    void m.el.offsetWidth; // az animáció újraindításához
    m.el.classList.add('flash');
    clearTimeout(m.flashT);
    m.flashT = setTimeout(() => m.el.classList.remove('flash'), 3200); // 3 × 1 mp animáció után
  }
  resetView() { this.fit(); this.scheduleSettle(); }
  frame() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.apply(); });
  }
  apply() {
    this.world.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.s})`;
    const d = this.detail;
    if (d) d.c.style.transform = `translate(${this.tx + d.x0 * this.s}px, ${this.ty + d.y0 * this.s}px) scale(${this.s * this.dpr / d.r})`;
    for (const m of this.markers.values()) this.place(m);
  }
  resized() {
    const { w, h } = this.size(), o = this.lastSize;
    this.lastSize = { w, h };
    if (!w || !h) return;
    this.set(this.s, this.tx + (w - o.w) / 2, this.ty + (h - o.h) / 2);
    this.scheduleSettle();
  }
  /** Képernyőpont (a tárolóhoz képest) → oldalarány. */
  toRel(p) { return { x: (p.x - this.tx) / (this.W * this.s), y: (p.y - this.ty) / (this.H * this.s) }; }
  local(e) { const r = this.host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  /** A látható terület oldalkoordinátában, a lapra vágva. */
  visible() {
    const { w, h } = this.size();
    return {
      x0: Math.max(0, -this.tx / this.s), y0: Math.max(0, -this.ty / this.s),
      x1: Math.min(this.W, (w - this.tx) / this.s), y1: Math.min(this.H, (h - this.ty) / this.s),
    };
  }
  covers(t, v) { return t.x0 <= v.x0 + 0.5 && t.y0 <= v.y0 + 0.5 && t.x1 >= v.x1 - 0.5 && t.y1 >= v.y1 - 0.5; }
  /** A nézethez szükséges felbontás (képpont / pont); óriási kijelzőn a területkorlát miatt kisebb. */
  rTarget(v = this.visible()) {
    const r = this.s * this.dpr, a = (v.x1 - v.x0) * (v.y1 - v.y0);
    return a * r * r > TILE_MAX_AREA ? Math.sqrt(TILE_MAX_AREA / a) : r;
  }
  /** Pontos-e a megjelenített kép a mostani nézethez (felbontás és lefedés). */
  sharp() {
    const d = this.detail, v = this.visible();
    return !!d && Math.abs(d.r / this.rTarget(v) - 1) <= SNAP && this.covers(d, v);
  }
  /** Eltolás a kijelző képpontrácsára: nyugalomban így 1 képpont = 1 kijelzőpont (nincs fél-pixeles elmosódás). */
  align() {
    const dpr = this.dpr;
    this.tx = Math.round(this.tx * dpr) / dpr;
    this.ty = Math.round(this.ty * dpr) / dpr;
    this.apply();
  }
  /** Nagyítás finom igazítása egy kész kép felbontásához (≤2%, nem látható), a képernyő közepe körül. */
  snapTo(r) {
    const { w, h } = this.size(), ns = r / this.dpr, k = ns / this.s;
    this.s = ns;
    this.tx = w / 2 - (w / 2 - this.tx) * k;
    this.ty = h / 2 - (h / 2 - this.ty) * k;
  }

  /* ---------- Rajzolás ---------- */
  async renderBase() {
    const sc = Math.min(BASE_MAX_SIDE / Math.max(this.W, this.H), Math.sqrt(BASE_MAX_AREA / (this.W * this.H)));
    const pw = Math.floor(this.W * sc), ph = Math.floor(this.H * sc);
    const bitmap = await this.doc.render(sc, 0, 0, pw, ph);
    if (this.destroyed) { bitmap.close(); return; }
    this.base.width = pw; this.base.height = ph;
    this.base.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0);
    bitmap.close();
  }
  /** „Élesítés…” jelzés (CSS: .stage.rendering) – csak nyugalomban, gesztus közben nem villog. */
  busy(on) { this.host.classList.toggle('rendering', on && !this.ptrs.size); }
  scheduleSettle() { clearTimeout(this.dt); this.dt = setTimeout(() => this.settle(), SETTLE_MS); }
  /** Nézetváltozáskor: új menet, ha épp nem fut (különben a futó után jön a legfrissebb nézetre). */
  kick() {
    if (!this.ready || this.destroyed) return;
    clearTimeout(this.pf); // a nézet változott: az előtöltés ráér
    if (this.inflight) this.again = true; else this.request();
  }
  /** Nyugalomban: kész kép a gyorsítótárból (azonnal), igazítás a képpontrácshoz, szükség esetén új menet. */
  settle() {
    if (this.destroyed || this.ptrs.size || !this.ready) return;
    const v = this.visible(), r = this.rTarget(v), full = r === this.s * this.dpr;
    if (!this.sharp()) {
      const hit = this.tiles.slice().reverse().find(t => Math.abs(t.r / r - 1) <= SNAP && this.covers(t, v));
      if (hit) { if (full) this.snapTo(hit.r); this.show(hit); }
    }
    if (full && this.detail && Math.abs(this.detail.r / r - 1) <= SNAP) this.snapTo(this.detail.r);
    this.align();
    if (!this.sharp()) this.kick();
  }
  /**
   * Egy menet a mostani nézetre: a látható rész (gesztus közben kis ráhagyással), vagy prefetch esetén
   * ráhagyásos előtöltés a mozgatáshoz (csak nyugalomban, ha a mostani kép már éles).
   */
  async request(prefetch = false) {
    if (this.inflight || this.destroyed) return;
    clearTimeout(this.pf);
    if (prefetch ? (this.ptrs.size || !this.sharp()) : (!this.ptrs.size && this.sharp())) return;
    const dpr = this.dpr, v = this.visible();
    const vw = v.x1 - v.x0, vh = v.y1 - v.y0;
    if (vw <= 0 || vh <= 0) return;
    const r = prefetch ? this.detail.r : this.rTarget(v);
    const grow = Math.sqrt(TILE_MAX_AREA / (vw * vh * r * r));
    const m = clamp((grow - 1) / 2, 0, prefetch ? TILE_MARGIN : this.ptrs.size ? LIVE_MARGIN : 0);
    let x0 = Math.max(0, v.x0 - vw * m), y0 = Math.max(0, v.y0 - vh * m);
    const x1 = Math.min(this.W, v.x1 + vw * m), y1 = Math.min(this.H, v.y1 + vh * m);
    x0 = Math.floor(x0 * r) / r; y0 = Math.floor(y0 * r) / r; // képpontrácshoz igazítás
    // Előtöltés csak akkor, ha érdemben nagyobb területet ad (pl. teljes lap nézetben nincs mit)
    if (prefetch && this.covers(this.detail, { x0: x0 + 1, y0: y0 + 1, x1: x1 - 1, y1: y1 - 1 })) return;
    const pw = Math.ceil((x1 - x0) * r), ph = Math.ceil((y1 - y0) * r);

    this.inflight = true; this.again = false;
    if (!prefetch) this.busy(true);
    const t0 = performance.now();
    let bitmap;
    try { bitmap = await this.doc.render(r, x0, y0, pw, ph); }
    catch { this.inflight = false; this.busy(false); return; } // bezárt rajz / hiba
    this.inflight = false;
    if (this.destroyed) { bitmap.close(); return; }
    this.lastMs = Math.round(performance.now() - t0); // (teszthez: az utolsó menet ideje)
    const c = bitmapCanvas(bitmap);
    c.style.width = pw / dpr + 'px';
    c.style.height = ph / dpr + 'px';
    const t = { c, x0, y0, x1, y1, r };
    this.tiles.push(t);
    // Az előtöltött képet csak akkor tesszük ki, ha közben nem változott a nézet (különben marad a gyorsítótárban)
    if (!prefetch || (!this.ptrs.size && Math.abs(r / this.rTarget() - 1) <= SNAP)) this.show(t);
    // Gyorsítótár korlátja: a legrégebben használtat dobjuk el (a megjelenítettet soha)
    while (this.tiles.length > TILE_CACHE) {
      const old = this.tiles.find(x => x !== this.detail);
      if (!old) break;
      if (old.c.parentNode) old.c.remove();
      freeCanvas(old.c);
      this.tiles = this.tiles.filter(x => x !== old);
    }
    if (this.ptrs.size) { if (this.again) this.request(); }   // gesztus közben: azonnal a legfrissebb nézetre
    else {
      this.busy(false);
      this.settle();                                            // nyugalomban: igazítás, és ha kell, még egy menet
      if (!prefetch && !this.inflight) { clearTimeout(this.pf); this.pf = setTimeout(() => this.request(true), PREFETCH_MS); }
    }
  }
  /** Részletkép megjelenítése (egyszerre egy van a képernyőn; a többi a gyorsítótárban vár). */
  show(t) {
    if (this.detail !== t) {
      if (this.detail) this.detail.c.remove();
      this.detail = t;
      this.dlayer.appendChild(t.c);
      this.tiles = this.tiles.filter(x => x !== t).concat(t); // legutóbb használt a végére
    }
    this.apply();
  }

  /* ---------- Jelölők ---------- */
  /** items: [{ id, x, y, svg, label, cls }] – a teljes jelölőkészlet (a régi elemek lecserélődnek). */
  setMarkers(items) {
    this.markers.clear();
    this.mlayer.innerHTML = String(html`${items.map(m => html`<div class="mk ${m.cls || ''}" data-id="${m.id}"><div class="mk-ring">${raw(m.svg)}</div><div class="mk-label">${m.label}</div></div>`)}`);
    this.mlayer.querySelectorAll('.mk').forEach((el, i) => this.markers.set(items[i].id, { el, x: items[i].x, y: items[i].y }));
    for (const m of this.markers.values()) this.place(m);
  }
  place(m) {
    m.el.style.transform = `translate(${(m.x * this.W * this.s + this.tx).toFixed(1)}px, ${(m.y * this.H * this.s + this.ty).toFixed(1)}px)`;
  }

  /* ---------- Gesztusok (egér, érintés, toll: Pointer Events) ---------- */
  down(e) {
    // Egér: bal gomb (koppintás / húzás) vagy középső gomb (mindig csak mozgatás, mint a CAD-programokban)
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    try { this.host.setPointerCapture(e.pointerId); } catch { /* már nem aktív mutató */ }
    const p = this.local(e);
    this.ptrs.set(e.pointerId, p);
    clearTimeout(this.dt); clearTimeout(this.pf);
    this.busy(false);
    if (this.ptrs.size === 1) {
      const mk = e.target.closest && e.target.closest('.mk');
      if (e.pointerType === 'mouse' && e.button === 1) {
        this.g = { type: 'pan', sx: p.x, sy: p.y, tx: this.tx, ty: this.ty };
        this.host.classList.add('panning');
        return;
      }
      this.g = { type: 'pending', sx: p.x, sy: p.y, tx: this.tx, ty: this.ty, mk: mk ? mk.dataset.id : null, mouse: e.pointerType === 'mouse' };
    } else if (this.ptrs.size === 2) {
      if (this.g && this.g.type === 'drag') this.endDrag();
      if (this.g && this.g.type === 'rect') this.endRect(null);
      const [a, b] = [...this.ptrs.values()];
      this.g = { type: 'pinch', d0: Math.max(dist(a, b), 1), m0: mid(a, b), s0: this.s, tx0: this.tx, ty0: this.ty };
      this.host.classList.remove('panning');
    }
  }
  move(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    const p = this.local(e);
    this.ptrs.set(e.pointerId, p);
    const g = this.g;
    if (!g) return;
    if (g.type === 'pinch') {
      if (this.ptrs.size < 2) return;
      const [a, b] = [...this.ptrs.values()];
      const [mn, mx] = this.limits();
      const ns = clamp(g.s0 * dist(a, b) / g.d0, mn, mx), m = mid(a, b);
      const px = (g.m0.x - g.tx0) / g.s0, py = (g.m0.y - g.ty0) / g.s0; // a csípés kezdőpontja alatti oldalpont
      this.set(ns, m.x - px * ns, m.y - py * ns);
      return;
    }
    if (g.type === 'pending' && Math.hypot(p.x - g.sx, p.y - g.sy) > (g.mouse ? 4 : 9)) {
      const m = g.mk && this.markers.get(g.mk);
      if (m && this.opts.canDrag()) {
        g.type = 'drag'; g.m = m;
        g.ox = m.x * this.W * this.s + this.tx - g.sx; g.oy = m.y * this.H * this.s + this.ty - g.sy;
        m.el.classList.add('dragging');
      } else if (this.opts.canSelect && this.opts.canSelect()) {
        // Kijelölő mód: egy ujjal / bal gombbal húzva téglalap (mozgatás: két ujjal vagy középső gombbal)
        g.type = 'rect';
        g.box = document.createElement('div');
        g.box.className = 'sel-rect';
        this.host.appendChild(g.box);
      } else {
        g.type = 'pan';
        this.host.classList.add('panning');
      }
    }
    if (g.type === 'pan') this.set(this.s, g.tx + p.x - g.sx, g.ty + p.y - g.sy);
    else if (g.type === 'rect') {
      g.ex = p.x; g.ey = p.y;
      Object.assign(g.box.style, { left: Math.min(g.sx, p.x) + 'px', top: Math.min(g.sy, p.y) + 'px',
        width: Math.abs(p.x - g.sx) + 'px', height: Math.abs(p.y - g.sy) + 'px' });
    } else if (g.type === 'drag') {
      const r = this.toRel({ x: p.x + g.ox, y: p.y + g.oy });
      g.m.x = clamp(r.x, 0, 1); g.m.y = clamp(r.y, 0, 1);
      this.place(g.m);
    }
  }
  /** Kijelölő téglalap vége: p = a felengedés helye (null: megszakítva, pl. második ujj). onSelectRect(x0, y0, x1, y1) – oldalarányban. */
  endRect(p) {
    const g = this.g;
    g.box.remove();
    if (!p) return;
    const a = this.toRel({ x: Math.min(g.sx, p.x), y: Math.min(g.sy, p.y) }), b = this.toRel({ x: Math.max(g.sx, p.x), y: Math.max(g.sy, p.y) });
    if (this.opts.onSelectRect) this.opts.onSelectRect(a.x, a.y, b.x, b.y);
  }
  /** A képernyőn éppen látható jelölők azonosítói. */
  visibleMarkerIds() {
    const w = this.host.clientWidth, h = this.host.clientHeight, out = [];
    for (const [id, m] of this.markers) {
      const x = m.x * this.W * this.s + this.tx, y = m.y * this.H * this.s + this.ty;
      if (x >= 0 && x <= w && y >= 0 && y <= h) out.push(id);
    }
    return out;
  }
  endDrag() {
    const g = this.g;
    g.m.el.classList.remove('dragging');
    this.opts.onMarkerMove(g.mk, g.m.x, g.m.y);
  }
  up(e, normal) {
    if (!this.ptrs.has(e.pointerId)) return;
    const p = this.local(e);
    this.ptrs.delete(e.pointerId);
    const g = this.g;
    if (g && g.type === 'pinch') {
      // Az egyik ujj felengedése után a másikkal folytatható a mozgatás
      if (this.ptrs.size === 1) {
        const [q] = [...this.ptrs.values()];
        this.g = { type: 'pan', sx: q.x, sy: q.y, tx: this.tx, ty: this.ty };
      }
    } else if (!this.ptrs.size && g) {
      if (g.type === 'rect') this.endRect(p);
      else if (g.type === 'pending' && normal) {
        if (g.mk) this.opts.onMarkerTap(g.mk);
        else {
          const r = this.toRel(p);
          if (r.x >= 0 && r.x <= 1 && r.y >= 0 && r.y <= 1) this.opts.onTap(r.x, r.y);
        }
      } else if (g.type === 'drag') this.endDrag();
    }
    if (!this.ptrs.size) {
      this.g = null;
      this.host.classList.remove('panning');
      this.scheduleSettle();
    }
  }
  wheel(e) {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    // ctrlKey: érintőpados csípés (a böngésző kerékeseményként küldi) – finomabb lépésekben jön
    const k = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
    const p = this.local(e);
    this.zoomAt(k, p.x, p.y);
  }
}
