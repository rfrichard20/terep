// Rajz oldal (#/rajz/<id>[?poz=<pozíció-id>]): rajznéző jelölőkkel, szűrő és jelmagyarázat, új pozíció, pozíció adatlap.
// ?poz=…: a Pozíciók oldalról érkezve a rajz a pozícióra nagyít, és a jelölő felvillan.
import { html, raw, matcher, modal, toast, formValues, suggestInput, confirmDialog } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { markerSvg } from '../marker.js';
import { Viewer, openPdf } from '../viewer.js';
import { enterSubmits, tetelBlokk, natCompare, fajtaValaszto } from './common.js';
import { showPozicio, pozNev } from './pozicio.js';
import { tomegesMuvelet } from './tomeges.js';
import { epuletMegnyitva } from './rajzok.js';

const $ = s => document.querySelector(s);

/* ---------- Szerkesztés mód (iroda: jelölő lerakása, áthelyezése, törlése) – ceruza gomb a rajz eszközoszlopának alján;
 * a szerkesztő eszközök (.edit-tools: kivágás, később több) csak bekapcsolt módban látszanak ---------- */
let editOn = false; // nem őrizzük meg: rajz bezárásakor kikapcsol, megnyitáskor mindig kézzel kell bekapcsolni (véletlen módosítás ellen)
const isEdit = () => editOn && D.jog('iroda');
function editKapcsol() {
  editOn = !editOn;
  applyEdit();
}
function applyEdit() {
  const be = isEdit() && !!current;
  document.body.classList.toggle('edit', be);
  const gomb = $('[data-z="edit"]');
  if (gomb) { gomb.classList.toggle('on', be); gomb.setAttribute('aria-pressed', String(be)); }
  const eszk = $('#edit-tools');
  if (eszk) { eszk.classList.toggle('open', be); eszk.inert = !be; }
  const hint = $('#hint');
  if (hint) hint.innerHTML = jel.on || kiv.on ? '' : isEdit() ? '<span>Koppints a rajzra új pozícióhoz · a jelölőt húzva áthelyezheted</span>' : '';
}

/* ---------- Kijelölő mód (tömeges művelet) ----------
 * Jelölőre koppintva kijelöl / visszavon; egy ujjal húzva téglalappal jelöl ki (mozgatás ilyenkor két ujjal / középső gombbal);
 * „Láthatók”: a képernyőn látszó (a szűrőnek megfelelő) jelölők mind. Alul sáv: darabszám, Művelet… (views/tomeges.js).
 */
// kozos: közös elem pozícióinak kiválasztása (views/kozos.js „Kijelölés a rajzon”) – { elem, kint: a más rajzokon lévő
// kapcsolt pozíciók (mentéskor megmaradnak) }; ilyenkor a sávban „Mentés” van a „Művelet…” helyett.
const jel = { on: false, sel: new Set(), kozos: null };
function jelolKapcsol(on, kozosElem = null) {
  jel.on = on;
  jel.sel.clear();
  jel.kozos = null;
  if (on && kozosElem) {
    const el = D.getElem(kozosElem);
    if (el) {
      const helyek = D.kozosHelyek(el.id);
      jel.kozos = { elem: el.id, kint: helyek.filter(p => p.rajzId !== current.id).map(p => p.id) };
      helyek.filter(p => p.rajzId === current.id).forEach(p => jel.sel.add(p.id));
    }
  }
  $('[data-z="sel"]')?.classList.toggle('on', on);
  document.body.classList.toggle('selmod', on); // kék keret + kék gomb: látszik, hogy kijelölő módban vagyunk
  applyEdit();
  applyMarkers();
}
function jelolValt(ids, mind = false) {
  // Közös elem kiválasztásánál a közös elem saját pozíciója nem jelölhető ki
  if (jel.kozos) { const sajat = (D.getElem(jel.kozos.elem) || {}).poz; ids = ids.filter(id => id !== sajat); }
  const minden = mind || ids.some(id => !jel.sel.has(id)); // téglalap: ha van köztük nem kijelölt, mind kijelölődik
  for (const id of ids) if (minden) jel.sel.add(id); else jel.sel.delete(id);
  applyMarkers();
}
function selBar() {
  const bar = $('#selbar');
  if (!bar) return;
  if (kiv.on) { kivBar(); return; }
  bar.hidden = !jel.on;
  if (!jel.on) return;
  const kz = jel.kozos && D.getElem(jel.kozos.elem);
  bar.innerHTML = String(html`<span class="grow">${kz ? html`<b>${jel.sel.size + jel.kozos.kint.length}</b> pozíció közös: ${D.elemNev(kz)}
        ${jel.kozos.kint.length ? html`<span class="small muted">(ebből ${jel.kozos.kint.length} más rajzon)</span>` : ''}`
      : html`<b>${jel.sel.size}</b> kijelölve`}
      <span class="small muted sel-tip">· koppintás vagy téglalap · mozgatás két ujjal</span></span>
    <button type="button" class="btn btn-sm" data-sel="lat">Láthatók</button>
    ${jel.sel.size ? html`<button type="button" class="btn btn-sm" data-sel="ures">Törlés</button>` : ''}
    ${kz ? html`<button type="button" class="btn btn-sm btn-primary" data-sel="kozos">Mentés</button>`
      : html`<button type="button" class="btn btn-sm btn-primary" data-sel="muv" ${jel.sel.size ? '' : raw('disabled')}>Művelet…</button>`}
    <button type="button" class="icon-btn" data-sel="ki" aria-label="${kz ? 'Mégse' : 'Kijelölés befejezése'}" title="${kz ? 'Mégse' : 'Kijelölés befejezése'}">${ICONS.x}</button>`);
}
/** Közös elem kiválasztásának mentése a rajzról. */
async function kozosMentes() {
  const { elem, kint } = jel.kozos;
  const r = await D.kozosMent(elem, [...jel.sel, ...kint]);
  if (r.hiba) { toast(r.hiba, 'error', 6000); return; }
  if (r.kihagyva.length) toast(`Elem nélküli pozícióhoz nem kapcsolható: ${r.kihagyva.join(', ')}`, 'warn', 8000);
  else toast(r.db ? `Közös elem: ${r.db} pozíció` : 'A közös elem kapcsolatai törölve', 'ok');
  jelolKapcsol(false);
  drawMarkers();
}
// A pozíció adatlapjáról (views/kozos.js): ha ez a rajz van nyitva, itt indul a kiválasztás (különben odanavigál)
document.addEventListener('terep:kozos', e => {
  if (!current || !current.viewer || e.detail.rajz !== current.id) return;
  e.preventDefault();
  jelolKapcsol(true, e.detail.elem);
});

/* ---------- Kivágás (iroda): a rajz látszó részének kijelölése (#/…/rajz/<id>?kivagas=1) ----------
 * A teljes oldal látszik; egy ujjal / bal gombbal húzva téglalap (mozgatás két ujjal / középső gombbal). Mentés erre a rajzra,
 * vagy új rajzként ugyanabból a PDF-ből (pl. két torony egy rajzon). A jelölők a teljes oldalhoz viszonyítva tárolódnak, így a
 * kivágás módosítása nem mozdítja el őket.
 */
const kiv = { on: false, rect: null };
function kivBar() {
  const bar = $('#selbar');
  bar.hidden = false;
  bar.innerHTML = String(html`<span class="grow"><b>Kivágás</b>
      <span class="small muted sel-tip">· húzd ki a látszó részt (téglalap) · mozgatás két ujjal</span></span>
    ${kiv.rect ? html`<button type="button" class="btn btn-sm" data-sel="kv-teljes" title="Kivágás nélkül: a teljes rajz látszik">Teljes rajz</button>` : ''}
    <button type="button" class="btn btn-sm" data-sel="kv-uj" ${kiv.rect ? '' : raw('disabled')} title="Új rajz ugyanebből a PDF-ből, ezzel a kivágással">Új rajzként…</button>
    <button type="button" class="btn btn-sm btn-primary" data-sel="kv-mentes">Mentés</button>
    <button type="button" class="icon-btn" data-sel="kv-megse" aria-label="Mégse" title="Mégse">${ICONS.x}</button>`);
}
/** A kijelölt rész kerete (kívül sötétítve) – a néző minden nézetváltásakor igazodik. */
function kivKeret() {
  const el = $('#kiv-keret');
  if (!el || !current || !current.viewer) return;
  el.hidden = !kiv.on || !kiv.rect;
  if (el.hidden) return;
  const v = current.viewer, k = kiv.rect;
  Object.assign(el.style, { left: k.x0 * v.W * v.s + v.tx + 'px', top: k.y0 * v.H * v.s + v.ty + 'px',
    width: (k.x1 - k.x0) * v.W * v.s + 'px', height: (k.y1 - k.y0) * v.H * v.s + 'px' });
}
function kivValaszt(x0, y0, x1, y1) {
  const c = v => Math.min(1, Math.max(0, v));
  const k = { x0: c(x0), y0: c(y0), x1: c(x1), y1: c(y1) };
  if (k.x1 - k.x0 < 0.02 || k.y1 - k.y0 < 0.02) { toast('Túl kicsi rész – húzz nagyobb téglalapot', 'warn'); return; }
  kiv.rect = k;
  kivBar(); kivKeret();
}
const rajzUrl = id => `#/p/${D.aktivId()}/rajz/${id}`;
async function kivMentes(uj) {
  const r = D.getRajz(current.id);
  if (!uj) {
    const kivul = D.kivagasonKivul(r.id, kiv.rect);
    if (kivul.length && !await confirmDialog('Kivágás mentése', `${kivul.length} lerakott jelölő a kivágáson kívül esik, ezen a rajzon nem fog látszani
      (${kivul.slice(0, 6).map(p => p.jel).join(', ')}${kivul.length > 6 ? '…' : ''}). Ha egy másik részhez tartoznak, előbb mentsd azt a részt „Új rajzként” – ott felajánlja az átrakásukat.`, 'Mentés mégis')) return;
    await D.updateRajz(r.id, { kivagas: kiv.rect });
    toast(kiv.rect ? 'Kivágás mentve' : 'A teljes rajz látszik', 'ok');
    location.hash = rajzUrl(r.id);
    return;
  }
  // A kijelölt részen már lerakott jelölők (ezen a rajzon) – átkerülhetnek az új rajzra
  const bent = D.rajzPoziciok(r.id).filter(p => !D.kivagasonKivul(r.id, kiv.rect).includes(p));
  const res = await modal({
    title: 'Új rajz ebből a PDF-ből',
    body: html`<p class="small muted" style="margin-top:0">Az új rajz ugyanezt a PDF-et használja (nem töltődik fel újra), a kijelölt kivágással.
        A PDF cseréje mindegyik rajzra érvényes lesz.</p>
      ${bent.length ? html`<label class="check" style="margin-bottom:.75rem"><input type="checkbox" name="atrak" checked>
        <span>A kijelölt részen lévő ${bent.length} jelölő átkerül az új rajzra (a helyük nem változik)</span></label>` : ''}
      <div class="form-col">
        <label class="field"><span>Megnevezés</span><input name="nev" value="${r.nev} – 2" maxlength="120" autocomplete="off"></label>
        <div class="form-grid">
          <label class="field"><span>Épület</span>${suggestInput('epulet', r.epulet, D.listaErtekek('epulet').sort(natCompare), 'pl. B')}</label>
          <label class="field"><span>Szint</span>${suggestInput('szint', r.szint, D.listaErtekek('szint').sort(natCompare), 'pl. 1')}</label>
          <label class="field"><span>Homlokzat</span>${suggestInput('homlokzat', r.homlokzat, D.listaErtekek('homlokzat').sort(natCompare), 'pl. Észak')}</label>
        </div></div>`,
    actions: [{ label: 'Mégse', value: null }, { label: 'Létrehozás', kind: 'primary', onClick: async el => {
      const v = formValues(el);
      if (!v.nev.trim()) { toast('Add meg a megnevezést', 'warn'); return false; }
      const u = await D.rajzMasolat(r.id, { nev: v.nev.trim(), epulet: v.epulet.trim(), szint: v.szint.trim(), homlokzat: v.homlokzat.trim(), kivagas: kiv.rect });
      if (bent.length && v.atrak) await D.atrakRajzra(bent.map(p => p.id), u.id);
      return u.id;
    } }],
  }).done;
  if (res) { toast('Új rajz létrehozva', 'ok'); location.hash = rajzUrl(res); }
}

/* ================= Rajznéző ================= */
let current = null; // { id, viewer, doc }
let loadSeq = 0;

function close() {
  loadSeq++;
  document.body.classList.remove('edit', 'selmod');
  jel.on = false; jel.sel.clear(); jel.kozos = null;
  kiv.on = false; kiv.rect = null;
  if (!current) return;
  current.viewer && current.viewer.destroy();
  current.doc && current.doc.destroy();
  current = null;
}

async function render(view, params, ctx) {
  close();
  const id = params.id;
  const r = D.getRajz(id);
  if (!r || r.projektId !== ctx.pid) { ctx.pgo('rajzok'); return; }
  const seq = ++loadSeq;
  epuletMegnyitva(r.epulet); // a Rajzok listán ez az épület lesz nyitva
  ctx.setTitle(D.rajzHely(r) ? `${D.rajzHely(r)} · ${r.nev}` : r.nev);
  // Kivágás mód: a teljes oldal látszik, a mostani kivágás kijelölve
  const kivMod = !!params.kivagas && D.jog('iroda');
  view.innerHTML = String(html`<div id="stage" class="stage"></div>
    <div class="kiv-keret" id="kiv-keret" hidden></div>
    <div class="edit-keret" aria-hidden="true"></div>
    <div class="zoom-ctl">
      <button type="button" data-z="in" aria-label="Nagyítás" title="Nagyítás">${ICONS.plus}</button>
      <button type="button" data-z="out" aria-label="Kicsinyítés" title="Kicsinyítés">${ICONS.minus}</button>
      <button type="button" data-z="fit" aria-label="Teljes rajz" title="Teljes rajz">${ICONS.fit}</button>
      ${kivMod ? '' : html`<button type="button" data-z="sel" aria-label="Kijelölés (tömeges művelet)" title="Kijelölés (tömeges művelet)">${ICONS.check}</button>`}
      ${D.jog('iroda') && !kivMod ? html`<hr class="zoom-sep" aria-hidden="true">
      <div class="edit-tools" id="edit-tools" inert><div class="edit-tools-in">
        <button type="button" class="edit-tool" data-z="kiv" aria-label="Kivágás" title="Kivágás: csak a rajz egy része látsszon (vagy új rajz egy részéből)">${ICONS.crop}</button>
      </div></div>
      <button type="button" class="edit-tool" data-z="edit" aria-pressed="false" aria-label="Szerkesztés mód" title="Szerkesztés mód: pozíció lerakása, áthelyezése, kivágás">${ICONS.edit}</button>` : ''}
    </div>
    <div class="legend" id="legend"></div>
    <div class="stage-hint" id="hint"></div>
    <div class="sel-bar stage-selbar" id="selbar" hidden></div>
    <div class="stage-msg" id="msg"><span>Rajz betöltése…</span></div>`);
  bindPanel($('#legend'));
  try {
    const bytes = await D.getPdf(id);
    if (!bytes) throw new Error('A rajz fájlja hiányzik');
    const doc = await openPdf(bytes);
    if (seq !== loadSeq) { doc.destroy(); return; }
    const viewer = new Viewer($('#stage'), doc, {
      kivagas: kivMod ? null : r.kivagas,
      canDrag: () => isEdit() && !jel.on && !kiv.on,
      canSelect: () => jel.on || kiv.on,
      onTap: (x, y) => { if (isEdit() && !jel.on && !kiv.on) newPoz(id, x, y); },
      onMarkerTap: pid => { if (kiv.on) return; if (jel.on) jelolValt([pid]); else openSheet(pid); },
      onMarkerMove: (pid, x, y) => D.updatePoz(pid, { x, y }),
      // Kivágás módban a néző a teljes oldalt mutatja, így a belső arány = oldalarány
      onSelectRect: (x0, y0, x1, y1) => (kiv.on ? kivValaszt(x0, y0, x1, y1)
        : jelolValt([...viewer.markers].filter(([, m]) => m.x >= x0 && m.x <= x1 && m.y >= y0 && m.y <= y1).map(([k]) => k), true)),
      onView: kivKeret,
    });
    current = { id, doc, viewer, verzio: D.pdfVerzio(id), kivagas: JSON.stringify(r.kivagas), kivMod, args: [view, params, ctx] };
    if (kivMod) { kiv.on = true; kiv.rect = r.kivagas; }
    applyEdit();
    view.querySelector('.zoom-ctl').addEventListener('click', e => {
      const b = e.target.closest('[data-z]'); if (!b) return;
      if (b.dataset.z === 'sel') jelolKapcsol(!jel.on);
      else if (b.dataset.z === 'edit') editKapcsol();
      else if (b.dataset.z === 'kiv')location.hash = rajzUrl(id) + '?kivagas=1';
      else if (b.dataset.z === 'fit') viewer.resetView(); else viewer.zoomCenter(b.dataset.z === 'in' ? 1.6 : 1 / 1.6);
    });
    $('#selbar').addEventListener('click', async e => {
      const b = e.target.closest('[data-sel]'); if (!b) return;
      const k = b.dataset.sel;
      if (k === 'kv-teljes') { kiv.rect = null; kivBar(); kivKeret(); }
      else if (k === 'kv-mentes') await kivMentes(false);
      else if (k === 'kv-uj') await kivMentes(true);
      else if (k === 'kv-megse') location.hash = rajzUrl(id);
      else if (k === 'ki') jelolKapcsol(false);
      else if (k === 'ures') { jel.sel.clear(); applyMarkers(); }
      else if (k === 'lat') jelolValt(viewer.visibleMarkerIds(), true);
      else if (k === 'kozos') await kozosMentes();
      else if (k === 'muv' && await tomegesMuvelet([...jel.sel])) { jel.sel.clear(); drawMarkers(); } // a kijelölés törlődik, a mód marad (folytatható)
    });
    drawMarkers();
    await viewer.init();
    if (seq !== loadSeq) return;
    $('#msg').remove();
    focusPoz(params.poz);
    if (params.kozos && D.jog('iroda')) {
      jelolKapcsol(true, params.kozos);
      // A paraméter ne indítsa újra a kiválasztást (pl. frissítéskor)
      history.replaceState(null, '', location.hash.replace(/[?&]kozos=[^&]*/, ''));
    }
  } catch (e) {
    console.error(e);
    if (seq === loadSeq) $('#msg').innerHTML = '<span>A rajz nem jeleníthető meg</span>';
  }
}

/** Ugrás egy pozícióra: ha a szűrő elrejti, a szűrő törlődik; ráközelítés és felvillanás. */
function focusPoz(pid) {
  const p = pid && D.getPoz(pid);
  if (!p || p.torolve || !current || p.rajzId !== current.id) return;
  if (!current.viewer.markers.has(pid)) { resetFilter(); drawMarkers(); }
  current.viewer.focus(p.x, p.y);
  setTimeout(() => current && current.viewer.flash(pid), 150);
}

/* ---------- Szűrő és jelmagyarázat (a rajz bal felső sarkában) ----------
 * A jelmagyarázat egyben szűrő: állapotonként jelölőnégyzet (darabszámmal), „csak hibásak”, típus, keresés.
 * A szűrő a munkamenet alatt megmarad (rajzváltáskor is); a címke tartalma tárolt beállítás (terep_cimke).
 */
const CIMKE_KEY = 'terep_cimke';
const CIMKEK = { jel: 'Jel', tipus: 'Típus', mind: 'Jel · típus', nincs: 'Nincs' };
// off: kikapcsolt állapotok ('' = nincs elkezdve, különben lépés-id); vonal: a közös elemek vonalai látszanak
const flt = { off: new Set(), hiba: false, tipus: '', q: '', vonal: true };
let cimke = (() => { try { return localStorage.getItem(CIMKE_KEY) || 'jel'; } catch { return 'jel'; } })();
// Jelmagyarázat nyitva / csukva: megmarad újrarajzoláskor, szerkesztés mód váltásakor és másik rajzra lépéskor is (null = még nem döntött: asztalon nyitva, mobilon csukva)
const LEGENDA_KEY = 'terep_legenda';
let legNyitva = (() => { try { const v = localStorage.getItem(LEGENDA_KEY); return v === null ? null : v === '1'; } catch { return null; } })();
const szurt = () => flt.off.size || flt.hiba || flt.tipus || flt.q;
function resetFilter() { flt.off.clear(); flt.hiba = false; flt.tipus = ''; flt.q = ''; }

const MAS = '~'; // állapot-kulcs: a helyen csak más termékfajtájú elem van
/**
 * Pozíciók a rajzon, a jelölőhöz szükséges adatokkal. A szín és az állapot a kiválasztott termékfajta elemeiből jön
 * (a legkevésbé kész elem); ha a helyen csak más fajtájú elem van, „Más termékfajta” (a saját elemei szerint színezve).
 * Több elemnél a kör körüli ívek elemenként mutatják az állapotot (minden fajtából).
 */
function pozAdatok() {
  const kat = D.fajta();
  return D.rajzPoziciok(current.id).map(p => {
    const k = p.fajta === 'pozicio' ? D.helyKulcs(p.id, kat) : '';
    const mas = k === null && D.pozElemei(p.id).length > 0;
    // A szín a kiválasztott fajtából, az ívek a hely összes eleméből (így a többi fajta állapota is látszik)
    const j = { ...D.jelolo(p.id, mas ? null : kat), szegmensek: D.jelolo(p.id).szegmensek };
    const t = D.tetel(D.helyElem(p.id, mas ? null : kat) || p);
    return { p, j, t, hiba: j.hiba, nev: pozNev(p), st: mas ? MAS : k || '', tipus: (t && t.tipus) || '' };
  });
}

function drawMarkers() {
  if (!current) return;
  drawPanel();
  applyMarkers();
}

/** Csak a jelölők frissítése a szűrő szerint (a panel nem rajzolódik újra → a keresőmező fókusza megmarad). */
function applyMarkers() {
  if (!current) return;
  const all = pozAdatok();
  const ok = matcher(flt.q);
  const vis = all.filter(x => !flt.off.has(x.st) && (!flt.hiba || x.hiba) && (!flt.tipus || x.tipus === flt.tipus)
    && ok(x.nev + ' ' + x.tipus));
  const label = x => cimke === 'nincs' ? '' : cimke === 'tipus' ? (x.tipus || x.nev)
    : cimke === 'mind' && x.tipus ? `${x.nev} · ${x.tipus}` : x.nev;
  for (const id of jel.sel) if (!all.some(x => x.p.id === id)) jel.sel.delete(id); // közben levett / törölt
  const kzSajat = jel.kozos && (D.getElem(jel.kozos.elem) || {}).poz;
  current.viewer.setMarkers(vis.map(x => ({ id: x.p.id, x: x.p.x, y: x.p.y, label: label(x), svg: markerSvg(x.j),
    cls: jel.sel.has(x.p.id) ? 'sel' : x.p.id === kzSajat ? 'kz-forras' : '' })));
  current.viewer.setLinks(flt.vonal ? D.kozosVonalak(current.id) : []);
  selBar();
  const sum = $('#flt-sum');
  if (sum) sum.textContent = szurt() ? `Szűrő · ${vis.length} / ${all.length} látszik` : `Jelmagyarázat · ${all.length} pozíció`;
  $('#legend')?.classList.toggle('active', !!szurt());
}

function drawPanel() {
  const box = $('#legend');
  if (!box) return;
  const all = pozAdatok();
  const cnt = new Map();
  let hiba = 0;
  for (const x of all) { cnt.set(x.st, (cnt.get(x.st) || 0) + 1); if (x.hiba) hiba++; }
  const tipusok = [...new Set(all.map(x => x.tipus).filter(Boolean))].sort(natCompare);
  if (flt.tipus && !tipusok.includes(flt.tipus)) flt.tipus = '';
  const lep = D.lepesek();
  const vonalak = D.kozosVonalak(current.id).length;
  const sor = (key, svg, nev, n) => html`<li><label><input type="checkbox" data-st="${key}" ${flt.off.has(key) ? '' : raw('checked')}>
    ${raw(svg)}<span>${nev}</span><b>${n || 0}</b></label></li>`;
  // Amíg a felhasználó nem döntött: asztalon nyitva, mobilon csukva (ott kell a hely a rajznak); utána marad, ahogy hagyta (legNyitva)
  const open = legNyitva ?? matchMedia('(min-width: 700px)').matches;
  box.innerHTML = String(html`<details ${open ? raw('open') : ''}><summary id="flt-sum"></summary><div class="flt-body">
    <input type="search" id="flt-q" value="${flt.q}" placeholder="Keresés: jel, típus…" aria-label="Keresés jelre vagy típusra" autocomplete="off">
    ${fajtaValaszto(D.aktivId(), 'flt-fajta')}
    <ul>
      ${sor('', markerSvg({ szin: D.SZIN_NINCS }, 16), 'Nincs elkezdve', cnt.get(''))}
      ${lep.map(l => sor(l.id, markerSvg({ szin: l.szin }, 16), l.nev, cnt.get(l.id)))}
      ${cnt.get(MAS) ? sor(MAS, markerSvg({ szin: D.SZIN_NINCS }, 16), 'Más termékfajta', cnt.get(MAS)) : ''}
      <li class="flt-sep"><label><input type="checkbox" id="flt-hiba" ${flt.hiba ? raw('checked') : ''}>
        ${raw(markerSvg({ szin: D.SZIN_NINCS, hiba: true }, 16))}<span>Csak hibásak</span><b>${hiba}</b></label></li>
      ${vonalak ? html`<li><label><input type="checkbox" id="flt-vonal" ${flt.vonal ? raw('checked') : ''}>
        <svg class="flt-vonal" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><line x1="1" y1="8" x2="15" y2="8"/></svg>
        <span>Közös elem vonalai</span><b>${vonalak}</b></label></li>` : ''}
    </ul>
    ${tipusok.length ? html`<label class="flt-row"><span>Típus</span><select id="flt-tipus"><option value="">Mind</option>
      ${tipusok.map(t => html`<option value="${t}" ${flt.tipus === t ? raw('selected') : ''}>${t}</option>`)}</select></label>` : ''}
    <label class="flt-row"><span>Címke</span><select id="flt-cimke">
      ${Object.entries(CIMKEK).map(([k, l]) => html`<option value="${k}" ${cimke === k ? raw('selected') : ''}>${l}</option>`)}</select></label>
    <button type="button" class="link-btn" id="flt-reset">Szűrő törlése</button>
  </div></details>`);
}

/** A panel eseményei (egyszer, a rajz megnyitásakor kötjük; a tartalma cserélődhet). */
function bindPanel(box) {
  const upd = e => {
    const t = e.target;
    if (t.dataset.st !== undefined) { if (t.checked) flt.off.delete(t.dataset.st); else flt.off.add(t.dataset.st); }
    else if (t.id === 'flt-hiba') flt.hiba = t.checked;
    else if (t.id === 'flt-vonal') flt.vonal = t.checked;
    else if (t.id === 'flt-tipus') flt.tipus = t.value;
    else if (t.id === 'flt-q') flt.q = t.value;
    else if (t.id === 'flt-cimke') { cimke = t.value; try { localStorage.setItem(CIMKE_KEY, cimke); } catch { /* */ } }
    else if (t.id === 'flt-fajta') { D.setFajta(t.value); flt.off.clear(); flt.tipus = ''; drawMarkers(); return; }
    else return;
    applyMarkers();
  };
  // Csak a felhasználó nyitása / csukása számít (a címsorra kattintás a váltás előtt fut, ezért a mostani állapot ellentettje az új)
  box.addEventListener('click', e => {
    const sum = e.target.closest('summary'); if (!sum) return;
    legNyitva = !sum.parentElement.open;
    try { localStorage.setItem(LEGENDA_KEY, legNyitva ? '1' : '0'); } catch { /* */ }
  });
  box.addEventListener('change', upd);
  box.addEventListener('input', e => { if (e.target.id === 'flt-q') upd(e); });
  box.addEventListener('click', e => {
    if (e.target.id !== 'flt-reset') return;
    resetFilter();
    drawMarkers();
  });
}

/* ---------- Új pozíció ---------- */
/**
 * Lerakás: a még le nem rakott pozíciók jeleit a böngésző javaslatlistája kínálja (gépeléskor szűr), alatta az adatai.
 * Ha a rajzon és a pozícióknál is van épület/szint, csak az itt lévők jönnek. Meglévő (le nem rakott) jel → az a pozíció
 * kerül ide; új jel → új pozíció jön létre; máshol már lerakott jel → hibaüzenet.
 */
async function newPoz(rajzId, x, y) {
  const r = D.getRajz(rajzId);
  // Homlokzati rajznál (homlokzat megadva) az épület és a homlokzat szerinti pozíciók – minden szintről
  const hely = { epulet: r.epulet, szint: r.szint, homlokzat: r.homlokzat };
  const szukit = D.RAJZ_HELY.some(sz => hely[sz] && D.vanOszlop(sz));
  const jelek = D.lerakatlan(D.aktivId(), hely).map(p => p.jel);
  await modal({
    title: 'Pozíció lerakása',
    body: html`<label class="field"><span>Pozíció jele</span>${suggestInput('nev', D.nextNev(rajzId), jelek, 'pl. A1A-114')}</label>
      <p class="small muted" style="margin:.4rem 0 0">${jelek.length} még le nem rakott pozíció
        ${szukit ? `itt: ${D.rajzHely(r)}` : 'a projektben'} – gépeléskor a javaslatok szűkülnek. Új jel esetén új pozíció jön létre.</p>
      <div id="np-tetel" style="margin-top:.75rem"></div>`,
    onMount(el) {
      enterSubmits(el); // Enter = Lerakás (gyors egymás utáni lerakáshoz)
      const inp = el.querySelector('input'), box = el.querySelector('#np-tetel');
      inp.setAttribute('enterkeyhint', 'done');
      inp.maxLength = 40;
      const preview = () => {
        const p = D.pozJel(inp.value);
        box.innerHTML = String(!inp.value.trim() ? '' : !p ? html`<p class="small muted" style="margin:0">Új pozíció lesz.</p>`
          : p.rajzId ? html`<p class="small t-warn" style="margin:0">Ez a pozíció már le van rakva: ${D.getRajz(p.rajzId)?.nev || ''}</p>` : tetelBlokk(p, true));
      };
      inp.addEventListener('input', preview);
      preview();
    },
    actions: [{ label: 'Mégse', value: null }, { label: 'Lerakás', kind: 'primary', onClick: async el => {
      const jel = formValues(el).nev.trim();
      if (!jel) { toast('Add meg a pozíció jelét', 'warn'); return false; }
      const p = D.pozJel(jel);
      if (p && p.rajzId) { toast(`A(z) „${jel}” már le van rakva (${D.getRajz(p.rajzId)?.nev || ''})`, 'warn'); return false; }
      if (p) await D.lerakPoz(p.id, rajzId, x, y);
      else await D.addPoz({ jel, rajzId, x, y });
      drawMarkers();
    } }],
  }).done;
}

/* ---------- Pozíció adatlap: views/pozicio.js (a Pozíciók oldalról is ugyanez nyílik) ---------- */
function openSheet(pid) {
  const p = D.getPoz(pid);
  // onOpen: egy kapcsolt (közös elemes) pozíció más rajzon is lehet – „Megnyitás a rajzon” oda visz
  if (p) showPozicio(p.id, { rajzId: p.rajzId, onChange: drawMarkers, onOpen: q => { location.hash = `#/p/${D.aktivId()}/rajz/${q.rajzId}?poz=${q.id}`; } });
}

/** Adatváltozás (szinkron): csak a jelölők és a jelmagyarázat frissül, a rajz nem töltődik újra. */
function refresh() {
  if (!current) return;
  const r = D.getRajz(current.id);
  if (!r) { location.hash = `#/p/${D.aktivId()}/rajzok`; return; } // közben törölték
  // Közben (más eszközön) kicserélték a PDF-et vagy módosították a kivágást: a rajz újratöltődik (a jelölők az arányos helyükön)
  if (D.pdfVerzio(r.id) !== current.verzio || (!current.kivMod && JSON.stringify(r.kivagas) !== current.kivagas)) { render(...current.args); return; }
  drawMarkers();
}

/** Elhagyáskor (másik rajz / oldal) a szerkesztés mód is kikapcsol; a belső close() adatfrissítéskor (refresh) is fut, ott marad. */
function leave() { editOn = false; close(); }
export default { render, close: leave, refresh };
