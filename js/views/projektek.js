// Projektek oldal (kezdőlap): projektkártyák állapotsávval és összesítővel, új projekt. Kártyára koppintva a projekt rajzai.
import { html, modal, toast, formValues } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { pageHead, enterSubmits, natCompare } from './common.js';

function render(view, params, ctx) {
  const list = D.projektek().slice().sort((a, b) => (a.allapot === b.allapot ? natCompare(a.nev, b.nev) : a.allapot === 'aktiv' ? -1 : 1));
  view.innerHTML = String(html`
    ${pageHead('Projektek', D.jog('iroda') ? html`<button class="btn btn-primary" id="uj">${ICONS.plus}Új projekt</button>` : '')}
    ${list.length ? html`<div class="proj-grid">${list.map(p => kartya(p))}</div>`
      : html`<section class="card"><p class="empty">${D.jog('iroda') ? 'Még nincs projekt. Hozz létre egyet az „Új projekt” gombbal.' : 'Még nincs hozzád rendelt projekt.'}</p></section>`}`);
  view.querySelector('#uj')?.addEventListener('click', () => ujProjekt(ctx));
}

/** Projektkártya: név, ügyfél/helyszín, állapotsáv (lépésszínekkel), számok. */
function kartya(p) {
  const lep = D.lepesek(p.id);
  // Szerveres módban csak a megnyitott projekt adata van a készüléken: a többinél csak a név és a műveletsor
  const s = D.projektStat(p.id);
  if (!s) {
    return html`<a class="card proj-card ${p.allapot === 'lezart' ? 'off' : ''}" href="#/p/${p.id}/attekinto">
      <div class="proj-top"><b class="proj-nev">${p.nev}</b>${p.allapot === 'lezart' ? html`<span class="badge badge-muted">Lezárt</span>` : ''}</div>
      ${p.ugyfel || p.helyszin ? html`<div class="sub ellipsis">${[p.ugyfel, p.helyszin].filter(Boolean).join(' · ')}</div>` : ''}
      <div class="proj-bar" aria-hidden="true"></div>
      <div class="proj-num"><span class="muted">Megnyitáskor töltődik le</span></div>
    </a>`;
  }
  const ossz = s.lerakva + s.lerakatlan; // a sáv a teljes listát (vagy ha nincs lista, a lerakott pozíciókat) mutatja
  const vege = lep.length ? s.cnt.get(lep[lep.length - 1].id) || 0 : 0;
  const seg = (n, szin, cim) => (n ? html`<span style="flex:${n};background:${szin}" title="${cim}: ${n}"></span>` : '');
  return html`<a class="card proj-card ${p.allapot === 'lezart' ? 'off' : ''} ${p.id === D.aktivId() ? 'cur' : ''}" href="#/p/${p.id}/attekinto">
    <div class="proj-top"><b class="proj-nev">${p.nev}</b>${p.allapot === 'lezart' ? html`<span class="badge badge-muted">Lezárt</span>` : ''}</div>
    ${p.ugyfel || p.helyszin ? html`<div class="sub ellipsis">${[p.ugyfel, p.helyszin].filter(Boolean).join(' · ')}</div>` : ''}
    <div class="proj-bar" aria-hidden="true">${ossz ? html`
      ${lep.slice().reverse().map(l => seg(s.cnt.get(l.id) || 0, l.szin, l.nev))}
      ${seg(s.cnt.get('') || 0, D.SZIN_NINCS, 'Nincs elkezdve')}
      ${seg(s.lerakatlan, 'var(--surface-2)', 'Nincs lerakva')}` : ''}</div>
    <div class="proj-num">
      <span><b>${ossz}</b> pozíció</span>
      ${lep.length ? html`<span><b>${ossz ? Math.round(vege / ossz * 100) : 0}%</b> ${lep[lep.length - 1].nev.toLowerCase()}</span>` : ''}
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
      <label class="field"><span>Műveletsor (később módosítható)</span><select name="sablon">
        ${D.SABLONOK.map((s, i) => html`<option value="${i}">${s.nev}: ${s.lepesek.join(' → ')}</option>`)}</select></label>
    </div>`,
    onMount: enterSubmits,
    actions: [{ label: 'Mégse', value: null }, { label: 'Létrehozás', kind: 'primary', onClick: async el => {
      const v = formValues(el);
      if (!v.nev.trim()) { toast('Add meg a projekt nevét', 'warn'); return false; }
      const p = await D.addProjekt({ nev: v.nev.trim(), ugyfel: v.ugyfel.trim(), helyszin: v.helyszin.trim(), sablon: Number(v.sablon) });
      ctx.go(`p/${p.id}/attekinto`);
    } }],
  }).done;
}
export default { render };
