// Típusok oldal (projekten belül): a típusjelhez tartozó méret és tulajdonságok (pl. T02: 1200 × 1500, ZIP, motoros…).
// A pozíciók a „Típus” mezőjükön keresztül öröklik ezeket. A táblázatban a pozíciókban használt, de nem definiált típusok
// is látszanak (halványan) – rájuk koppintva felvehetők. Típusonként a darabszám és az állapotsáv (lépésszínekkel).
import { html, matcher, sortArrow } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { natCompare, meretSzoveg, pageHead } from './common.js';
import { importTabla, editSor } from './tablak.js';

const st = { q: '', sort: 'jel', dir: 1 };

function render(view, params, ctx) {
  const lep = D.lepesek();
  const lathato = D.oszlopok('tipusok').slice(0, 3); // asztalon az első három tulajdonság oszlopként, a többi a szerkesztőben
  // Pozíciók típusonként: darab és állapot (csak a lerakottaknak van állapota)
  const poz = new Map(); // típus (kisbetűs) → { jel, n, lerakva, cnt: Map, hiba }
  for (const p of D.poziciok(D.aktivId(), 'pozicio')) {
    if (!p.tipus) continue;
    const k = D.kulcs(p.tipus);
    if (!poz.has(k)) poz.set(k, { jel: p.tipus, n: 0, lerakva: 0, cnt: new Map(), hiba: 0 });
    const x = poz.get(k);
    x.n++;
    if (p.rajzId) { x.lerakva++; const a = D.allapot(p.id); const kk = a.lepes ? a.lepes.id : ''; x.cnt.set(kk, (x.cnt.get(kk) || 0) + 1); if (a.hiba) x.hiba++; }
  }
  const sorok = D.tipusok().map(t => ({ jel: t.jel, rec: t, tip: D.tipus(t.jel), p: poz.get(D.kulcs(t.jel)) }));
  const defK = new Set(sorok.map(s => D.kulcs(s.jel)));
  for (const [k, x] of poz) if (!defK.has(k)) sorok.push({ jel: x.jel, rec: null, tip: null, p: x });

  const seg = (n, szin, cim) => (n ? html`<span style="flex:${n};background:${szin}" title="${cim}: ${n}"></span>` : '');
  const sav = p => (p && p.n ? html`<span class="proj-bar mini" aria-hidden="true">${lep.slice().reverse().map(l => seg(p.cnt.get(l.id) || 0, l.szin, l.nev))}
    ${seg(p.cnt.get('') || 0, D.SZIN_NINCS, 'Nincs elkezdve')}${seg(p.n - p.lerakva, 'var(--surface-2)', 'Nincs lerakva')}</span>` : '');
  const SORT = {
    jel: (a, b) => natCompare(a.jel, b.jel),
    db: (a, b) => (a.p?.n || 0) - (b.p?.n || 0) || natCompare(a.jel, b.jel),
  };

  view.innerHTML = String(html`
    ${pageHead('Típusok', D.jog('iroda') ? html`<button class="btn" id="t-imp">Beillesztés Excelből</button><button class="btn btn-primary" id="t-uj">${ICONS.plus}Új típus</button>` : '')}
    <section class="card">
      <div class="toolbar card-toolbar"><input type="search" id="t-q" value="${st.q}" placeholder="Keresés: típus, tulajdonság…" aria-label="Keresés" autocomplete="off"></div>
      <div class="table-wrap"><table class="tbl cards nochk">
        <thead><tr>
          <th class="sortable" data-sort="jel">Típus${sortArrow(st.sort === 'jel', st.dir)}</th><th>Méret</th>
          ${lathato.map(n => html`<th>${n}</th>`)}
          <th class="sortable num" data-sort="db">Pozíció${sortArrow(st.sort === 'db', st.dir)}</th><th>Állapot</th>
        </tr></thead>
        <tbody id="t-body"></tbody>
      </table></div>
      <div class="tbl-foot" id="t-foot"></div>
    </section>
    <p class="small muted page-note">A pozíció a típusától örökli a méretet és a tulajdonságokat; amit a pozíciónál külön megadsz, az az érvényes.</p>`);

  const fill = () => {
    const ok = matcher(st.q);
    const vis = sorok.filter(s => ok([s.jel, s.tip ? s.tip.adatok.map(a => a[1]).join(' ') : ''].join(' '))).sort((a, b) => SORT[st.sort](a, b) * st.dir);
    view.querySelector('#t-body').innerHTML = String(vis.length ? html`${vis.map(s => html`
      <tr class="click ${s.rec ? '' : 'off'}" tabindex="0" data-jel="${s.jel}" data-id="${s.rec ? s.rec.id : ''}">
        <td class="c-main nowrap"><span class="tipus-chip">${s.jel}</span>${s.rec ? '' : html` <span class="small muted">nincs definiálva</span>`}</td>
        <td class="c-f1 nowrap" data-l="Méret">${meretSzoveg(s.tip) || '–'}</td>
        ${lathato.map(n => html`<td class="m-hide">${s.rec ? s.rec.adatok[n] || '–' : '–'}</td>`)}
        <td class="c-f2 num" data-l="Pozíció">${s.p ? s.p.n : 0}${s.p && s.p.hiba ? html` <span class="badge badge-err">${s.p.hiba} hiba</span>` : ''}</td>
        <td class="c-f3" data-l="Állapot">${sav(s.p) || '–'}</td>
      </tr>`)}` : html`<tr><td colspan="${4 + lathato.length}" class="empty">${sorok.length ? 'Nincs találat.' : 'Még nincs típus. Vedd fel egyenként, vagy illeszd be Excelből.'}</td></tr>`);
    view.querySelector('#t-foot').textContent = `${sorok.filter(s => s.rec).length} típus definiálva${sorok.some(s => !s.rec) ? ` · ${sorok.filter(s => !s.rec).length} használt, de nem definiált` : ''}`;
  };
  fill();

  view.querySelector('#t-q').addEventListener('input', e => { st.q = e.target.value; fill(); });
  view.querySelector('#t-imp')?.addEventListener('click', () => importTabla('tipusok', ctx.rerender));
  view.querySelector('#t-uj')?.addEventListener('click', async () => { if (await editSor('tipusok', null)) ctx.rerender(); });
  view.querySelector('thead').addEventListener('click', e => {
    const th = e.target.closest('[data-sort]'); if (!th) return;
    if (st.sort === th.dataset.sort) st.dir = -st.dir; else { st.sort = th.dataset.sort; st.dir = 1; }
    ctx.rerender();
  });
  const open = async tr => {
    if (!tr || !D.jog('iroda')) return;
    const r = tr.dataset.id ? await editSor('tipusok', D.getTipus(tr.dataset.id)) : await editSor('tipusok', null, { minta: { jel: tr.dataset.jel } });
    if (r) ctx.rerender();
  };
  view.querySelector('#t-body').addEventListener('click', e => open(e.target.closest('tr[data-jel]')));
  view.querySelector('#t-body').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); open(e.target.closest('tr[data-jel]')); } });
}

export default { render };
