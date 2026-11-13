// Teljesítmény oldal (projekten belül): ki mennyit végzett el egy időszakban – lépésenként és típusonként, darabszámban
// (pénzügyi adat nincs; az elszámolás külön táblázatban, az exportból). Szerelő / külsős csak a sajátját látja,
// iroda / admin mindenkiét. Csak az érvényes (vissza nem vont) lépések számítanak, a műveletsor-pótlás nem.
import { html, raw, fmtDate, copyText } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { pageHead, natCompare, meretSzoveg } from './common.js';

const IDOSZAK = { ma: 'Ma', tegnap: 'Tegnap', het: 'Ez a hét', elozo_het: 'Előző hét', honap: 'Ez a hónap', elozo_honap: 'Előző hónap', mind: 'Teljes időszak', egyedi: 'Egyedi…' };
const st = { idoszak: 'honap', tol: '', ig: '', email: '' };
/** Az időszak beállítása más oldalról (pl. Munkám csempéi). */
export function setIdoszak(k) { st.idoszak = k; }

const nap = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plusz = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const isoNap = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Az időszak határai: [tol, ig) – ig kizárólagos; null = nincs határ. */
export function idoszakHatar(kulcs, tol = '', ig = '') {
  const ma = nap(new Date()), hetfo = plusz(ma, -((ma.getDay() + 6) % 7));
  switch (kulcs) {
    case 'ma': return [ma, plusz(ma, 1)];
    case 'tegnap': return [plusz(ma, -1), ma];
    case 'het': return [hetfo, plusz(hetfo, 7)];
    case 'elozo_het': return [plusz(hetfo, -7), hetfo];
    case 'honap': return [new Date(ma.getFullYear(), ma.getMonth(), 1), new Date(ma.getFullYear(), ma.getMonth() + 1, 1)];
    case 'elozo_honap': return [new Date(ma.getFullYear(), ma.getMonth() - 1, 1), new Date(ma.getFullYear(), ma.getMonth(), 1)];
    case 'egyedi': return [tol ? nap(new Date(tol + 'T00:00')) : null, ig ? plusz(nap(new Date(ig + 'T00:00')), 1) : null];
    default: return [null, null];
  }
}

function render(view, params, ctx) {
  const iroda = D.jog('iroda'), en = D.felhasznalo() || {};
  if (!iroda) st.email = en.email || '';
  const [tol, ig] = idoszakHatar(st.idoszak, st.tol, st.ig);
  const mind = D.elvegzett({ tol, ig });
  // A szűrhető felhasználók: akik az időszakban rögzítettek (iroda); a saját magát mindig
  const emberek = new Map(mind.map(x => [x.e.kiEmail, x.e.ki]));
  if (st.email && !emberek.has(st.email)) st.email = iroda ? '' : st.email;
  const sorok = mind.filter(x => !st.email || x.e.kiEmail === st.email);
  const lep = D.lepesek();
  const nev = email => emberek.get(email) || (D.getFelhasznalo(email) || {}).nev || email;

  // Összesítők
  const db = new Map(); // lépés-id → darab
  for (const x of sorok) db.set(x.lepes.id, (db.get(x.lepes.id) || 0) + 1);
  // Pivot: sor (felhasználó vagy típus) × lépés
  const pivot = kulcsFn => {
    const m = new Map();
    for (const x of sorok) {
      const k = kulcsFn(x);
      if (!m.has(k)) m.set(k, new Map());
      const r = m.get(k); r.set(x.lepes.id, (r.get(x.lepes.id) || 0) + 1);
    }
    return m;
  };
  const tabla = (cim, m, nevFn) => html`<section class="card">
    <div class="card-head"><h2>${cim}</h2></div>
    <div class="table-wrap"><table class="tbl telj-tbl">
      <thead><tr><th></th>${lep.map(l => html`<th class="num"><span class="dot" style="background:${l.szin}"></span>${l.nev}</th>`)}<th class="num">Összesen</th></tr></thead>
      <tbody>${[...m.entries()].sort((a, b) => natCompare(nevFn(a[0]), nevFn(b[0]))).map(([k, r]) => html`<tr>
        <td><b>${nevFn(k)}</b></td>${lep.map(l => html`<td class="num">${r.get(l.id) || html`<span class="muted">–</span>`}</td>`)}
        <td class="num"><b>${[...r.values()].reduce((s, v) => s + v, 0)}</b></td></tr>`)}</tbody>
    </table></div></section>`;

  const idoszakSzoveg = st.idoszak === 'mind' ? 'teljes időszak' : `${tol ? fmtDate(tol.toISOString()) : '…'} – ${ig ? fmtDate(plusz(ig, -1).toISOString()) : '…'}`;
  view.innerHTML = String(html`
    ${pageHead('Teljesítmény', html`<button class="btn" id="t-export" ${sorok.length ? '' : raw('disabled')} title="A tételes lista másolása – Excelbe / Sheetbe beilleszthető">${ICONS.copy}Másolás Excelbe</button>`)}
    <section class="card telj-szuro-kartya"><div class="toolbar card-toolbar telj-szuro">
      <select id="t-ido" aria-label="Időszak">${Object.entries(IDOSZAK).map(([k, l]) => html`<option value="${k}" ${st.idoszak === k ? raw('selected') : ''}>${l}</option>`)}</select>
      ${st.idoszak === 'egyedi' ? html`<label class="telj-datum"><span>Tól</span><input type="date" id="t-tol" value="${st.tol}"></label>
        <label class="telj-datum"><span>Ig</span><input type="date" id="t-ig" value="${st.ig}"></label>` : ''}
      ${iroda ? html`<select id="t-ki" aria-label="Felhasználó"><option value="">Mindenki</option>
        ${[...emberek.keys()].sort((a, b) => natCompare(nev(a), nev(b))).map(e => html`<option value="${e}" ${st.email === e ? raw('selected') : ''}>${nev(e)}</option>`)}</select>` : ''}
      <span class="small muted">${idoszakSzoveg}${!iroda ? ' · csak a saját munkád' : ''}</span>
    </div></section>
    <div class="stats">
      <div class="stat"><div class="v">${sorok.length}</div><div class="l">Elvégzett lépés</div></div>
      ${lep.map(l => html`<div class="stat"><div class="v">${db.get(l.id) || 0}</div><div class="l"><span class="dot" style="background:${l.szin}"></span>${l.nev}</div></div>`)}
    </div>
    ${!sorok.length ? html`<section class="card"><p class="empty">Ebben az időszakban nincs rögzített (kész) lépés.</p></section>` : html`
      ${iroda && !st.email ? tabla('Felhasználónként', pivot(x => x.e.kiEmail), nev) : ''}
      ${tabla('Típusonként', pivot(x => x.tipus || '—'), k => (k === '—' ? 'Típus nélkül' : k))}
      <section class="card">
        <details class="telj-tetel"><summary class="card-head"><h2 class="grow">Tételes lista (${sorok.length})</h2><span class="small muted">megnyitás</span></summary>
          <div class="table-wrap"><table class="tbl cards nochk">
            <thead><tr><th>Időpont</th><th>Pozíció</th><th>Típus</th><th>Hely</th><th>Lépés</th>${iroda ? html`<th>Rögzítette</th>` : ''}</tr></thead>
            <tbody>${sorok.slice().reverse().slice(0, 500).map(x => html`<tr>
              <td class="c-f4 small-m" data-l="Időpont">${fmtDate(x.e.mikor, true)}</td>
              <td class="c-main"><b>${x.poz.jel}</b></td>
              <td class="c-f1" data-l="Típus">${x.tipus || '–'}</td>
              <td class="c-f2" data-l="Hely">${D.helySzoveg(x.epulet, x.szint) || '–'}</td>
              <td class="c-meta"><span class="dot" style="background:${x.lepes.szin}"></span>${x.lepes.nev}</td>
              ${iroda ? html`<td class="c-f3" data-l="Rögzítette">${x.e.ki}</td>` : ''}</tr>`)}</tbody>
          </table></div>
          ${sorok.length > 500 ? html`<p class="small muted page-note" style="padding:0 1rem">Az első 500 látszik – a teljes lista a „Másolás Excelbe” gombbal vihető át.</p>` : ''}
        </details>
      </section>`}
    <p class="small muted page-note">Csak a kész (azóta vissza nem vont) lépések számítanak, a rögzítés (terepi) időpontja szerint. A műveletsor módosítása utáni
      pótlás nem számít bele. ${iroda ? 'A „Másolás Excelbe” a tételes listát másolja (dátum, pozíció, típus, méret, hely, lépés, rögzítő) – pl. elszámoláshoz.' : ''}</p>`);

  const rr = () => ctx.rerender();
  view.querySelector('#t-ido').addEventListener('change', e => {
    st.idoszak = e.target.value;
    if (st.idoszak === 'egyedi' && !st.tol) { const [a, b] = idoszakHatar('honap'); st.tol = isoNap(a); st.ig = isoNap(plusz(b, -1)); }
    rr();
  });
  view.querySelector('#t-tol')?.addEventListener('change', e => { st.tol = e.target.value; rr(); });
  view.querySelector('#t-ig')?.addEventListener('change', e => { st.ig = e.target.value; rr(); });
  view.querySelector('#t-ki')?.addEventListener('change', e => { st.email = e.target.value; rr(); });
  view.querySelector('#t-export')?.addEventListener('click', () => {
    const p = D.projekt(), fej = ['Dátum', 'Projekt', 'Pozíció', 'Típus', 'Méret', 'Épület', 'Szint', 'Lépés', 'Rögzítette', 'E-mail'];
    // Tabulátor / sortörés nem lehet a cellában; a „=”, „+”, „-”, „@” kezdetű szöveg elé aposztróf kerül, hogy Excelbe /
    // Sheetbe beillesztve ne képletként fusson le (pl. egy „=HYPERLINK(…)” pozíciójel)
    const tisztit = v => { const s = String(v ?? '').replace(/[\t\r\n]+/g, ' '); return /^[=+\-@]/.test(s) ? "'" + s : s; };
    const sorTxt = sorok.map(x => [fmtDate(x.e.mikor, true), p.nev, x.poz.jel, x.tipus, meretSzoveg(D.tetel(x.poz)), x.epulet, x.szint, x.lepes.nev, x.e.ki, x.e.kiEmail].map(tisztit).join('\t'));
    copyText([fej.join('\t'), ...sorTxt].join('\n'));
  });
}

export default { render };
