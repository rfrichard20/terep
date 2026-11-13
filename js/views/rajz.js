// Rajz oldal (#/rajz/<id>[?poz=<pozíció-id>]): rajznéző jelölőkkel, szűrő és jelmagyarázat, új pozíció, pozíció adatlap.
// ?poz=…: a Pozíciók oldalról érkezve a rajz a pozícióra nagyít, és a jelölő felvillan.
import { html, raw, matcher, modal, toast, formValues, suggestInput } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { markerSvg } from '../marker.js';
import { Viewer, openPdf } from '../viewer.js';
import { enterSubmits, tetelBlokk, natCompare } from './common.js';
import { showPozicio, pozNev } from './pozicio.js';
import { tomegesMuvelet } from './tomeges.js';

const $ = s => document.querySelector(s);

/* ---------- Szerkesztés mód (iroda: jelölő lerakása, áthelyezése, törlése) – kapcsoló a felső sávban ---------- */
const EDIT_KEY = 'terep_szerk';
const editBox = $('#edit-mode');
const isEdit = () => editBox.checked && D.jog('iroda');
try { editBox.checked = localStorage.getItem(EDIT_KEY) === '1'; } catch { /* */ }
editBox.addEventListener('change', () => {
  try { localStorage.setItem(EDIT_KEY, isEdit() ? '1' : '0'); } catch { /* */ }
  applyEdit();
});
function applyEdit() {
  document.body.classList.toggle('edit', isEdit() && !!current);
  const hint = $('#hint');
  if (hint) hint.innerHTML = jel.on ? '' : isEdit() ? '<span>Koppints a rajzra új pozícióhoz · a jelölőt húzva áthelyezheted</span>' : '';
}

/* ---------- Kijelölő mód (tömeges művelet) ----------
 * Jelölőre koppintva kijelöl / visszavon; egy ujjal húzva téglalappal jelöl ki (mozgatás ilyenkor két ujjal / középső gombbal);
 * „Láthatók”: a képernyőn látszó (a szűrőnek megfelelő) jelölők mind. Alul sáv: darabszám, Művelet… (views/tomeges.js).
 */
const jel = { on: false, sel: new Set() };
function jelolKapcsol(on) {
  jel.on = on;
  if (!on) jel.sel.clear();
  $('[data-z="sel"]')?.classList.toggle('on', on);
  applyEdit();
  applyMarkers();
}
function jelolValt(ids, mind = false) {
  const minden = mind || ids.some(id => !jel.sel.has(id)); // téglalap: ha van köztük nem kijelölt, mind kijelölődik
  for (const id of ids) if (minden) jel.sel.add(id); else jel.sel.delete(id);
  applyMarkers();
}
function selBar() {
  const bar = $('#selbar');
  if (!bar) return;
  bar.hidden = !jel.on;
  if (!jel.on) return;
  bar.innerHTML = String(html`<span class="grow"><b>${jel.sel.size}</b> kijelölve
      <span class="small muted sel-tip">· koppintás vagy téglalap · mozgatás két ujjal</span></span>
    <button type="button" class="btn btn-sm" data-sel="lat">Láthatók</button>
    ${jel.sel.size ? html`<button type="button" class="btn btn-sm" data-sel="ures">Törlés</button>` : ''}
    <button type="button" class="btn btn-sm btn-primary" data-sel="muv" ${jel.sel.size ? '' : raw('disabled')}>Művelet…</button>
    <button type="button" class="icon-btn" data-sel="ki" aria-label="Kijelölés befejezése" title="Kijelölés befejezése">${ICONS.x}</button>`);
}

/* ================= Rajznéző ================= */
let current = null; // { id, viewer, doc }
let loadSeq = 0;

function close() {
  loadSeq++;
  document.body.classList.remove('edit');
  jel.on = false; jel.sel.clear();
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
  ctx.setTitle(D.helySzoveg(r.epulet, r.szint) ? `${D.helySzoveg(r.epulet, r.szint)} · ${r.nev}` : r.nev);
  view.innerHTML = String(html`<div id="stage" class="stage"></div>
    <div class="zoom-ctl">
      <button type="button" data-z="in" aria-label="Nagyítás" title="Nagyítás">${ICONS.plus}</button>
      <button type="button" data-z="out" aria-label="Kicsinyítés" title="Kicsinyítés">${ICONS.minus}</button>
      <button type="button" data-z="fit" aria-label="Teljes rajz" title="Teljes rajz">${ICONS.fit}</button>
      <button type="button" data-z="sel" aria-label="Kijelölés (tömeges művelet)" title="Kijelölés (tömeges művelet)">${ICONS.check}</button>
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
      canDrag: () => isEdit() && !jel.on,
      canSelect: () => jel.on,
      onTap: (x, y) => { if (isEdit() && !jel.on) newPoz(id, x, y); },
      onMarkerTap: pid => { if (jel.on) jelolValt([pid]); else openSheet(pid); },
      onMarkerMove: (pid, x, y) => D.updatePoz(pid, { x, y }),
      onSelectRect: (x0, y0, x1, y1) => jelolValt([...viewer.markers].filter(([, m]) => m.x >= x0 && m.x <= x1 && m.y >= y0 && m.y <= y1).map(([k]) => k), true),
    });
    current = { id, doc, viewer, verzio: r.verzio, args: [view, params, ctx] };
    applyEdit();
    view.querySelector('.zoom-ctl').addEventListener('click', e => {
      const b = e.target.closest('[data-z]'); if (!b) return;
      if (b.dataset.z === 'sel') jelolKapcsol(!jel.on);
      else if (b.dataset.z === 'fit') viewer.resetView(); else viewer.zoomCenter(b.dataset.z === 'in' ? 1.6 : 1 / 1.6);
    });
    $('#selbar').addEventListener('click', async e => {
      const b = e.target.closest('[data-sel]'); if (!b) return;
      const k = b.dataset.sel;
      if (k === 'ki') jelolKapcsol(false);
      else if (k === 'ures') { jel.sel.clear(); applyMarkers(); }
      else if (k === 'lat') jelolValt(viewer.visibleMarkerIds(), true);
      else if (k === 'muv' && await tomegesMuvelet([...jel.sel])) drawMarkers();
    });
    drawMarkers();
    await viewer.init();
    if (seq !== loadSeq) return;
    $('#msg').remove();
    focusPoz(params.poz);
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
const flt = { off: new Set(), hiba: false, tipus: '', q: '' }; // off: kikapcsolt állapotok ('' = nincs elkezdve, különben lépés-id)
let cimke = (() => { try { return localStorage.getItem(CIMKE_KEY) || 'jel'; } catch { return 'jel'; } })();
const szurt = () => flt.off.size || flt.hiba || flt.tipus || flt.q;
function resetFilter() { flt.off.clear(); flt.hiba = false; flt.tipus = ''; flt.q = ''; }

/** Pozíciók a rajzon, a jelölőhöz szükséges adatokkal (állapot, tétel). */
function pozAdatok() {
  return D.rajzPoziciok(current.id).map(p => {
    const a = D.allapot(p.id), t = D.tetel(p);
    return { p, a, t, nev: pozNev(p), st: a.lepes ? a.lepes.id : '', tipus: (t && t.tipus) || '' };
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
  const vis = all.filter(x => !flt.off.has(x.st) && (!flt.hiba || x.a.hiba) && (!flt.tipus || x.tipus === flt.tipus)
    && ok(x.nev + ' ' + x.tipus));
  const label = x => cimke === 'nincs' ? '' : cimke === 'tipus' ? (x.tipus || x.nev)
    : cimke === 'mind' && x.tipus ? `${x.nev} · ${x.tipus}` : x.nev;
  for (const id of jel.sel) if (!all.some(x => x.p.id === id)) jel.sel.delete(id); // közben levett / törölt
  current.viewer.setMarkers(vis.map(x => ({ id: x.p.id, x: x.p.x, y: x.p.y, label: label(x), svg: markerSvg(D.jelolo(x.p.id)), cls: jel.sel.has(x.p.id) ? 'sel' : '' })));
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
  for (const x of all) { cnt.set(x.st, (cnt.get(x.st) || 0) + 1); if (x.a.hiba) hiba++; }
  const tipusok = [...new Set(all.map(x => x.tipus).filter(Boolean))].sort(natCompare);
  if (flt.tipus && !tipusok.includes(flt.tipus)) flt.tipus = '';
  const lep = D.lepesek();
  const sor = (key, svg, nev, n) => html`<li><label><input type="checkbox" data-st="${key}" ${flt.off.has(key) ? '' : raw('checked')}>
    ${raw(svg)}<span>${nev}</span><b>${n || 0}</b></label></li>`;
  // Első megjelenéskor asztalon nyitva, mobilon csukva (ott kell a hely a rajznak); utána marad, ahogy a felhasználó hagyta
  const open = box.querySelector('details') ? box.querySelector('details').open : matchMedia('(min-width: 700px)').matches;
  box.innerHTML = String(html`<details ${open ? raw('open') : ''}><summary id="flt-sum"></summary><div class="flt-body">
    <input type="search" id="flt-q" value="${flt.q}" placeholder="Keresés: jel, típus…" aria-label="Keresés jelre vagy típusra" autocomplete="off">
    <ul>
      ${sor('', markerSvg({ szin: D.SZIN_NINCS }, 16), 'Nincs elkezdve', cnt.get(''))}
      ${lep.map(l => sor(l.id, markerSvg({ szin: l.szin }, 16), l.nev, cnt.get(l.id)))}
      <li class="flt-sep"><label><input type="checkbox" id="flt-hiba" ${flt.hiba ? raw('checked') : ''}>
        ${raw(markerSvg({ szin: D.SZIN_NINCS, hiba: true }, 16))}<span>Csak hibásak</span><b>${hiba}</b></label></li>
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
    else if (t.id === 'flt-tipus') flt.tipus = t.value;
    else if (t.id === 'flt-q') flt.q = t.value;
    else if (t.id === 'flt-cimke') { cimke = t.value; try { localStorage.setItem(CIMKE_KEY, cimke); } catch { /* */ } }
    else return;
    applyMarkers();
  };
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
  const hely = { epulet: r.epulet, szint: r.szint };
  const szukit = ['epulet', 'szint'].some(sz => hely[sz] && D.vanOszlop(sz));
  const jelek = D.lerakatlan(D.aktivId(), hely).map(p => p.jel);
  await modal({
    title: 'Pozíció lerakása',
    body: html`<label class="field"><span>Pozíció jele</span>${suggestInput('nev', D.nextNev(rajzId), jelek, 'pl. A1A-114')}</label>
      <p class="small muted" style="margin:.4rem 0 0">${jelek.length} még le nem rakott pozíció
        ${szukit ? `itt: ${D.helySzoveg(r.epulet, r.szint)}` : 'a projektben'} – gépeléskor a javaslatok szűkülnek. Új jel esetén új pozíció jön létre.</p>
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
  if (p) showPozicio(p.id, { rajzId: p.rajzId, onChange: drawMarkers });
}

/** Adatváltozás (szinkron): csak a jelölők és a jelmagyarázat frissül, a rajz nem töltődik újra. */
function refresh() {
  if (!current) return;
  const r = D.getRajz(current.id);
  if (!r) { location.hash = `#/p/${D.aktivId()}/rajzok`; return; } // közben törölték
  // Közben (más eszközön) kicserélték a PDF-et: a rajz újratöltődik (a jelölők az arányos helyükön)
  if (r.verzio !== current.verzio) { render(...current.args); return; }
  drawMarkers();
}

export default { render, close, refresh };
