// Projektek oldal (kezdőlap): felül a kedvenc projektek kártyái (állapotsávval, összesítővel), alatta az összes projekt
// listaként – kereshető, állapot szerint szűrhető, rendezhető. Csillag: kedvenc (eszközönként és felhasználónként tárolva).
import { html, raw, modal, toast, formValues, matcher, sortArrow, fmtDate } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { pageHead, enterSubmits, natCompare } from './common.js';

/* ---------- Kedvencek (localStorage terep_kedvencek: { email: [projekt-id…] }) ---------- */
const KEDV_KEY = 'terep_kedvencek';
const kedvKulcs = () => (D.felhasznalo() || {}).email || 'helyi';
function kedvencek() {
  try { const m = JSON.parse(localStorage.getItem(KEDV_KEY) || '{}'); return new Set(m[kedvKulcs()] || []); } catch { return new Set(); }
}
function kedvencValt(id) {
  let m = {};
  try { m = JSON.parse(localStorage.getItem(KEDV_KEY) || '{}'); } catch { /* */ }
  const s = new Set(m[kedvKulcs()] || []);
  if (s.has(id)) s.delete(id); else s.add(id);
  m[kedvKulcs()] = [...s];
  try { localStorage.setItem(KEDV_KEY, JSON.stringify(m)); } catch { /* privát mód */ }
}

// Szűrő és rendezés a munkamenet alatt
const st = { q: '', allapot: 'aktiv', sort: 'nev', dir: 1 };
const ALLAPOT_SZURO = { aktiv: 'Aktív projektek', lezart: 'Lezárt projektek', '': 'Minden projekt' };

function render(view, params, ctx) {
  const kedv = kedvencek();
  const all = D.projektek();
  const kedvList = all.filter(p => kedv.has(p.id)).sort((a, b) => natCompare(a.nev, b.nev));
  const SORT = {
    nev: (a, b) => natCompare(a.nev, b.nev),
    ugyfel: (a, b) => natCompare(a.ugyfel || '~', b.ugyfel || '~') || natCompare(a.nev, b.nev),
    helyszin: (a, b) => natCompare(a.helyszin || '~', b.helyszin || '~') || natCompare(a.nev, b.nev),
    letrehozva: (a, b) => String(a.letrehozva || '').localeCompare(String(b.letrehozva || '')) || natCompare(a.nev, b.nev),
  };
  const th = (k, l) => html`<th class="sortable" data-sort="${k}">${l}${sortArrow(st.sort === k, st.dir)}</th>`;
  view.innerHTML = String(html`
    ${pageHead('Projektek', D.jog('iroda') ? html`<button class="btn btn-primary" id="uj">${ICONS.plus}Új projekt</button>` : '')}
    ${kedvList.length ? html`<h2 class="sec-cim">${ICONS.star} Kedvencek</h2><div class="proj-grid">${kedvList.map(p => kartya(p))}</div>` : ''}
    ${all.length ? html`<section class="card" style="margin-top:${kedvList.length ? '1.25rem' : '0'}">
      <div class="toolbar card-toolbar">
        <input type="search" id="pr-q" value="${st.q}" placeholder="Keresés: név, ügyfél, helyszín…" aria-label="Keresés" autocomplete="off">
        <select id="pr-all" aria-label="Állapot">${Object.entries(ALLAPOT_SZURO).map(([k, l]) => html`<option value="${k}" ${st.allapot === k ? raw('selected') : ''}>${l}</option>`)}</select>
      </div>
      <div class="table-wrap"><table class="tbl cards nochk proj-tbl">
        <thead><tr><th class="kedv-th" aria-label="Kedvenc"></th>${th('nev', 'Projekt')}${th('ugyfel', 'Ügyfél')}${th('helyszin', 'Helyszín')}<th>Állapot</th>${th('letrehozva', 'Létrehozva')}</tr></thead>
        <tbody id="pr-body"></tbody>
      </table></div>
      <div class="tbl-foot" id="pr-foot"></div>
    </section>
    ${kedvList.length ? '' : html`<p class="small muted page-note">A csillaggal (<span class="ico-inline">${ICONS.star}</span>) kedvencnek jelölt projektek felül, kártyaként jelennek meg – így gyorsan elérhetők. A kedvencek ezen az eszközön tárolódnak.</p>`}`
    : html`<section class="card"><p class="empty">${D.jog('iroda') ? 'Még nincs projekt. Hozz létre egyet az „Új projekt” gombbal.' : 'Még nincs hozzád rendelt projekt.'}</p></section>`}`);

  const fill = () => {
    const ok = matcher(st.q);
    const vis = all.filter(p => (!st.allapot || p.allapot === st.allapot) && ok(`${p.nev} ${p.ugyfel} ${p.helyszin}`))
      .sort((a, b) => SORT[st.sort](a, b) * st.dir);
    const body = view.querySelector('#pr-body');
    if (!body) return;
    body.innerHTML = String(vis.length ? html`${vis.map(p => html`
      <tr class="click ${p.allapot === 'lezart' ? 'off' : ''} ${p.id === D.aktivId() ? 'cur' : ''}" tabindex="0" data-id="${p.id}">
        <td class="c-act kedv-td"><button type="button" class="icon-btn kedv ${kedv.has(p.id) ? 'on' : ''}" data-kedv="${p.id}"
          aria-pressed="${kedv.has(p.id) ? 'true' : 'false'}" aria-label="Kedvenc" title="${kedv.has(p.id) ? 'Kivétel a kedvencek közül' : 'Kedvencnek jelölés'}">${ICONS.star}</button></td>
        <td class="c-main"><b>${p.nev}</b>${p.id === D.aktivId() ? html` <span class="small muted">· megnyitva</span>` : ''}</td>
        <td class="c-f1" data-l="Ügyfél">${p.ugyfel || '–'}</td>
        <td class="c-f2" data-l="Helyszín">${p.helyszin || '–'}</td>
        <td class="c-f3" data-l="Állapot">${p.allapot === 'lezart' ? html`<span class="badge badge-muted">Lezárt</span>` : html`<span class="badge badge-ok">Aktív</span>`}</td>
        <td class="c-f4 small-m" data-l="Létrehozva">${p.letrehozva ? fmtDate(p.letrehozva) : '–'}</td>
      </tr>`)}` : html`<tr><td colspan="6" class="empty">Nincs a szűrésnek megfelelő projekt.</td></tr>`);
    view.querySelector('#pr-foot').textContent = `${vis.length} / ${all.length} projekt`;
  };
  fill();

  view.querySelector('#uj')?.addEventListener('click', () => ujProjekt(ctx));
  view.querySelector('#pr-q')?.addEventListener('input', e => { st.q = e.target.value; fill(); });
  view.querySelector('#pr-all')?.addEventListener('change', e => { st.allapot = e.target.value; fill(); });
  view.querySelector('thead')?.addEventListener('click', e => {
    const t = e.target.closest('[data-sort]'); if (!t) return;
    if (st.sort === t.dataset.sort) st.dir = -st.dir; else { st.sort = t.dataset.sort; st.dir = 1; }
    ctx.rerender();
  });
  const body = view.querySelector('#pr-body');
  body?.addEventListener('click', e => {
    const k = e.target.closest('[data-kedv]');
    if (k) { kedvencValt(k.dataset.kedv); ctx.rerender(); return; }
    const tr = e.target.closest('tr[data-id]');
    if (tr) ctx.go(`p/${tr.dataset.id}/attekinto`);
  });
  body?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.closest('[data-kedv]')) return;
    const tr = e.target.closest('tr[data-id]'); if (tr) { e.preventDefault(); ctx.go(`p/${tr.dataset.id}/attekinto`); }
  });
  view.querySelector('.proj-grid')?.addEventListener('click', e => {
    const k = e.target.closest('[data-kedv]');
    if (k) { e.preventDefault(); kedvencValt(k.dataset.kedv); ctx.rerender(); }
  });
}

/** Projektkártya (kedvencek): név, ügyfél/helyszín, állapotsáv (lépésszínekkel), számok; jobb felül a csillag. */
function kartya(p) {
  const lep = D.lepesek(p.id);
  const csillag = html`<button type="button" class="icon-btn kedv on" data-kedv="${p.id}" aria-label="Kivétel a kedvencek közül" title="Kivétel a kedvencek közül">${ICONS.star}</button>`;
  const fej = html`<div class="proj-top"><b class="proj-nev">${p.nev}</b>${p.allapot === 'lezart' ? html`<span class="badge badge-muted">Lezárt</span>` : ''}${csillag}</div>
    ${p.ugyfel || p.helyszin ? html`<div class="sub ellipsis">${[p.ugyfel, p.helyszin].filter(Boolean).join(' · ')}</div>` : ''}`;
  // Szerveres módban csak a megnyitott projekt adata van a készüléken: a többinél csak a név és a műveletsor
  const s = D.projektStat(p.id);
  if (!s) {
    return html`<a class="card proj-card ${p.allapot === 'lezart' ? 'off' : ''}" href="#/p/${p.id}/attekinto">${fej}
      <div class="proj-bar" aria-hidden="true"></div>
      <div class="proj-num"><span class="muted">Megnyitáskor töltődik le</span></div>
    </a>`;
  }
  const ossz = s.lerakva + s.lerakatlan; // a sáv a kiválasztott termékfajta elemeit mutatja (lerakva vagy sem)
  const vege = lep.length ? s.cnt.get(lep[lep.length - 1].id) || 0 : 0;
  const seg = (n, szin, cim) => (n ? html`<span style="flex:${n};background:${szin}" title="${cim}: ${n}"></span>` : '');
  return html`<a class="card proj-card ${p.allapot === 'lezart' ? 'off' : ''} ${p.id === D.aktivId() ? 'cur' : ''}" href="#/p/${p.id}/attekinto">${fej}
    <div class="proj-bar" aria-hidden="true">${ossz ? html`
      ${lep.slice().reverse().map(l => seg(s.cnt.get(l.id) || 0, l.szin, l.nev))}
      ${seg(s.cnt.get('') || 0, D.SZIN_NINCS, 'Nincs elkezdve')}
      ${seg(s.lerakatlan, 'var(--surface-2)', 'Nincs lerakva')}` : ''}</div>
    <div class="proj-num">
      <span><b>${D.poziciok(p.id, 'pozicio').length}</b> pozíció</span>
      <span title="Súlyozott készültség (minden termékfajta)"><b>${Math.round(s.keszultsegOssz * 100)}%</b> kész</span>
      ${lep.length ? html`<span><b>${vege}</b> ${lep[lep.length - 1].nev.toLowerCase()}</span>` : ''}
      <span><b>${s.rajz}</b> rajz</span>
      ${s.hiba ? html`<span class="t-err"><b>${s.hiba}</b> hiba</span>` : ''}
    </div>
  </a>`;
}

async function ujProjekt(ctx) {
  await modal({
    title: 'Új projekt',
    body: html`<div class="form-col">
      <label class="field"><span>Projekt neve</span><input name="nev" maxlength="80" autocomplete="off" placeholder="pl. DPR1 társasház"></label>
      <label class="field"><span>Ügyfél</span><input name="ugyfel" maxlength="80" autocomplete="off"></label>
      <label class="field"><span>Helyszín</span><input name="helyszin" maxlength="120" autocomplete="off"></label>
      <label class="field"><span>Termékfajta (a műveletsor később módosítható, további fajta is felvehető)</span><select name="kategoria">
        ${D.aktivKategoriak().map(k => html`<option value="${k.id}">${k.nev}: ${k.lepesek.map(l => l.nev).join(' → ')}</option>`)}</select></label>
    </div>`,
    onMount: enterSubmits,
    actions: [{ label: 'Mégse', value: null }, { label: 'Létrehozás', kind: 'primary', onClick: async el => {
      const v = formValues(el);
      if (!v.nev.trim()) { toast('Add meg a projekt nevét', 'warn'); return false; }
      const p = await D.addProjekt({ nev: v.nev.trim(), ugyfel: v.ugyfel.trim(), helyszin: v.helyszin.trim(), kategoria: v.kategoria });
      kedvencValt(p.id); // az új projekt kedvenc lesz (gyakran ezzel dolgozik utána)
      ctx.go(`p/${p.id}/attekinto`);
    } }],
  }).done;
}
export default { render };
