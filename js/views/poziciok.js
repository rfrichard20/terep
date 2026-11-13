// Pozíciók oldal (projekten belül): a pozíciólista és a rajzokon lévő jelölők egyben – állapot-összesítő, szűrő
// (keresés, típus, épület, szint), rendezhető táblázat. Sorok: a lista minden sora (lerakva vagy sem) + a rajzokon lévő,
// listában nem szereplő jelölők. Hely (épület, szint): lerakott pozíciónál a rajzé, különben a listáé.
// Sorra koppintva a pozíció adatlapja nyílik (onnan „Megnyitás a rajzon”). A címből érkező szűrők (pl. a Rajzok vagy az
// Áttekintő linkjeiről): ?rajz=<id>, ?epulet=…&szint=…, ?allapot=<kulcs>, ?hiba=1.
import { html, raw, matcher, fmtDate, sortArrow } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { markerSvg } from '../marker.js';
import { natCompare, meretSzoveg, pageHead } from './common.js';
import { showPozicio } from './pozicio.js';
import { editSor, importTabla } from './tablak.js';
import { tomegesMuvelet } from './tomeges.js';

const LERAKATLAN = '-'; // állapot-kulcs: a lista sora, ami még egyik rajzon sincs
const NINCS = '';       // állapot-kulcs: lerakva, de még nincs kész lépés
const MAX_ROWS = 1000;  // ennyi sornál többet nem rajzolunk ki egyszerre (a szűrő szűkít)

// A szűrő és a rendezés a munkamenet alatt megmarad (oldalváltáskor is); projektváltáskor törlődik
// jelol: kijelölő mód (tömeges művelethez), sel: a kijelölt pozíciók (a szűrőtől függetlenül megmaradnak)
const st = { pid: null, hash: null, q: '', allapot: null, hiba: false, tipus: '', epulet: '', szint: '', rajz: '', sort: 'jel', dir: 1, jelol: false, sel: new Set() };

/**
 * Az oldal sorai (a „pozíció” fajtájú pozíciók; egy pozíció = egy sor):
 * { id, jel, t (összesített adatok), poz (csak ha lerakott), rajz, epulet, szint, a (állapot), key (állapot-kulcs), lep (lépés-index), ut }
 */
function rows() {
  const lep = D.lepesek();
  return D.poziciok(D.aktivId(), 'pozicio').map(p => {
    const rajz = p.rajzId && D.getRajz(p.rajzId), poz = rajz ? p : null;
    const a = poz && D.allapot(p.id), t = D.tetel(p);
    return {
      id: p.id, jel: p.jel, t, poz, rajz, a,
      epulet: rajz ? rajz.epulet || '' : t.epulet,
      szint: rajz ? rajz.szint || '' : t.szint,
      key: !poz ? LERAKATLAN : a.lepes ? a.lepes.id : NINCS,
      lep: !poz ? -2 : a.lepes ? lep.indexOf(a.lepes) : -1,
      ut: D.utolso(p.id),
    };
  });
}

const SORT = {
  jel: (a, b) => natCompare(a.jel, b.jel),
  tipus: (a, b) => natCompare(a.t?.tipus, b.t?.tipus) || natCompare(a.jel, b.jel),
  hely: (a, b) => natCompare(a.epulet, b.epulet) || natCompare(a.szint, b.szint) || natCompare(a.jel, b.jel),
  allapot: (a, b) => a.lep - b.lep || natCompare(a.jel, b.jel),
  ut: (a, b) => String(a.ut?.mikor || '').localeCompare(String(b.ut?.mikor || '')) || natCompare(a.jel, b.jel),
};
const kulonbozo = vals => [...new Set(vals.filter(Boolean))].sort(natCompare);

function render(view, params, ctx) {
  if (st.pid !== ctx.pid) Object.assign(st, { pid: ctx.pid, q: '', allapot: null, hiba: false, tipus: '', epulet: '', szint: '', rajz: '', jelol: false, sel: new Set() });
  // Linkről érkező szűrő (egyszer, az adott címre; utána a felhasználó szabadon módosítja)
  if (st.hash !== location.hash) {
    st.hash = location.hash;
    if (['rajz', 'epulet', 'szint', 'allapot', 'hiba'].some(k => k in params)) {
      Object.assign(st, { q: '', allapot: 'allapot' in params ? params.allapot : null, hiba: params.hiba === '1', tipus: '',
        epulet: params.epulet || '', szint: params.szint || '', rajz: params.rajz || '' });
    }
  }
  const szuroRajz = st.rajz && D.getRajz(st.rajz);
  if (!szuroRajz) st.rajz = '';
  const all = rows();
  const lep = D.lepesek();
  for (const id of st.sel) if (!D.getPoz(id)) st.sel.delete(id); // közben törölt pozíciók
  let vis = [];
  const tipusok = kulonbozo(all.map(r => r.t?.tipus));
  const epuletek = kulonbozo(all.map(r => r.epulet));
  if (st.tipus && !tipusok.includes(st.tipus)) st.tipus = '';
  if (st.epulet && !epuletek.includes(st.epulet)) st.epulet = '';
  const vanLista = all.length > 0;
  const opts = (id, label, mind, list, cur) => html`<select id="${id}" aria-label="${label}"><option value="">${mind}</option>
    ${list.map(v => html`<option value="${v}" ${cur === v ? raw('selected') : ''}>${v}</option>`)}</select>`;

  view.innerHTML = String(html`
    ${pageHead('Pozíciók', D.jog('iroda') ? html`<button class="btn" id="p-imp">${ICONS.upload}Beillesztés Excelből</button>
      <button class="btn btn-primary" id="p-uj">${ICONS.plus}Új pozíció</button>` : '')}
    <div class="stats" id="p-stats"></div>
    <section class="card">
      <div class="toolbar card-toolbar">
        <input type="search" id="p-q" value="${st.q}" placeholder="Keresés: jel, típus, adat…" aria-label="Keresés" autocomplete="off">
        ${tipusok.length ? opts('p-tipus', 'Típus', 'Minden típus', tipusok, st.tipus) : ''}
        ${epuletek.length ? opts('p-epulet', 'Épület', 'Minden épület', epuletek, st.epulet) : ''}
        <span id="p-szint-box"></span>
        ${szuroRajz ? html`<button type="button" class="chip on" id="p-rajz-x" title="Rajzszűrő törlése">${ICONS.map} ${szuroRajz.nev} ${ICONS.x}</button>` : ''}
        ${vanLista ? html`<button type="button" class="btn btn-sm ${st.jelol ? 'btn-primary' : ''}" id="p-jelol" title="Több pozíció kijelölése tömeges művelethez">${ICONS.check} Kijelölés</button>` : ''}
      </div>
      <div class="table-wrap"><table class="tbl cards ${st.jelol ? 'jelol' : 'nochk'}">
        <thead><tr>
          ${st.jelol ? html`<th class="c-chk"><input type="checkbox" id="p-all" aria-label="A szűrt pozíciók kijelölése"></th>` : ''}
          ${[['jel', 'Jel'], ['tipus', 'Típus'], [null, 'Méret'], ['hely', 'Hely'], [null, 'Rajz'], ['allapot', 'Állapot'], ['ut', 'Utolsó bejegyzés']].map(([k, l]) =>
            k ? html`<th class="sortable" data-sort="${k}">${l}${sortArrow(st.sort === k, st.dir)}</th>` : html`<th>${l}</th>`)}
        </tr></thead>
        <tbody id="p-body"></tbody>
      </table></div>
      <div class="tbl-foot" id="p-foot"></div>
    </section>
    ${st.jelol ? html`<div class="sel-bar" id="p-selbar"></div>` : ''}
    ${!vanLista ? html`<p class="small muted page-note">Még nincs pozíció. A pozíciólista a „Beillesztés Excelből” gombbal tölthető be,
      egyenként az „Új pozíció” gombbal vehető fel, vagy a rajzon lerakáskor jön létre.</p>` : ''}`);

  // Szint-választó: csak a kiválasztott épület szintjei (épület nélkül az összes)
  const szintBox = () => {
    const szintek = kulonbozo(all.filter(r => !st.epulet || r.epulet === st.epulet).map(r => r.szint));
    if (st.szint && !szintek.includes(st.szint)) st.szint = '';
    view.querySelector('#p-szint-box').outerHTML = String(html`<span id="p-szint-box" class="contents">${szintek.length ? opts('p-szint', 'Szint', 'Minden szint', szintek, st.szint) : ''}</span>`);
    view.querySelector('#p-szint')?.addEventListener('change', e => { st.szint = e.target.value; fill(); });
  };

  const fill = () => {
    // Összesítő csempék (állapotonként, a többi szűrő nélkül) – kattintásra szűrnek
    const cnt = new Map();
    let hiba = 0;
    for (const r of all) { cnt.set(r.key, (cnt.get(r.key) || 0) + 1); if (r.a?.hiba) hiba++; }
    const tile = (key, label, n, dot, cls = '') => html`<button type="button" class="stat ${cls} ${st.allapot === key ? 'sel' : ''}" data-st="${key ?? ''}" data-all="${key === null ? 1 : ''}">
      <div class="v">${n}</div><div class="l">${dot ? raw(dot) : ''}${label}</div></button>`;
    view.querySelector('#p-stats').innerHTML = String(html`
      ${tile(null, 'Összes', all.length)}
      ${vanLista ? tile(LERAKATLAN, 'Nincs lerakva', cnt.get(LERAKATLAN) || 0, '', 'muted-stat') : ''}
      ${tile(NINCS, 'Nincs elkezdve', cnt.get(NINCS) || 0, markerSvg({ szin: D.SZIN_NINCS }, 14))}
      ${lep.map(l => tile(l.id, l.nev, cnt.get(l.id) || 0, markerSvg({ szin: l.szin }, 14)))}
      <button type="button" class="stat err ${st.hiba ? 'sel' : ''}" data-hiba="1"><div class="v">${hiba}</div><div class="l">${raw(markerSvg({ szin: D.SZIN_NINCS, hiba: true }, 14))}Hibás</div></button>`);

    const ok = matcher(st.q);
    vis = all.filter(r => (st.allapot === null || r.key === st.allapot) && (!st.hiba || r.a?.hiba)
      && (!st.tipus || r.t?.tipus === st.tipus) && (!st.epulet || r.epulet === st.epulet) && (!st.szint || r.szint === st.szint)
      && (!st.rajz || r.poz?.rajzId === st.rajz)
      && ok([r.jel, r.t.tipus, r.rajz?.nev, ...r.t.adatok.map(x => x[1])].join(' ')));
    vis.sort((a, b) => SORT[st.sort](a, b) * st.dir);

    const allapotCell = r => !r.poz ? html`<span class="muted">Nincs lerakva</span>`
      : html`<span class="st-cell">${raw(markerSvg(D.jelolo(r.poz.id), 18))}${r.a.lepes ? r.a.lepes.nev : 'Nincs elkezdve'}</span>
        ${r.a.hiba ? html` <span class="badge badge-err" title="${r.a.hiba.megj || ''}">Hiba</span>` : ''}`;
    view.querySelector('#p-body').innerHTML = String(vis.length ? html`${vis.slice(0, MAX_ROWS).map(r => html`
      <tr class="click ${r.poz ? '' : 'off'} ${st.sel.has(r.id) ? 'sel' : ''}" tabindex="0" data-id="${r.id}">
        ${st.jelol ? html`<td class="c-chk"><input type="checkbox" data-chk ${st.sel.has(r.id) ? raw('checked') : ''} aria-label="${r.jel} kijelölése"></td>` : ''}
        <td class="c-main nowrap"><b>${r.jel}</b></td>
        <td class="c-f1" data-l="Típus">${r.t?.tipus ? html`<span class="tipus-chip">${r.t.tipus}</span>` : '–'}</td>
        <td class="c-f2 nowrap" data-l="Méret">${meretSzoveg(r.t) || '–'}</td>
        <td class="c-f3 nowrap" data-l="Hely">${D.helySzoveg(r.epulet, r.szint) || '–'}</td>
        <td class="m-hide">${r.rajz ? r.rajz.nev : '–'}</td>
        <td class="c-meta">${allapotCell(r)}</td>
        <td class="c-f4 small-m" data-l="Utolsó bejegyzés">${r.ut ? html`${fmtDate(r.ut.mikor, true)} · ${r.ut.ki || '?'}` : '–'}</td>
      </tr>`)}` : html`<tr><td colspan="${st.jelol ? 8 : 7}" class="empty">${all.length ? 'Nincs a szűrésnek megfelelő pozíció.' : 'Még nincs pozíció: tölts be pozíciólistát, vagy rakj le jelölőket egy rajzon.'}</td></tr>`);
    view.querySelector('#p-foot').textContent = vis.length > MAX_ROWS
      ? `${vis.length} találat – az első ${MAX_ROWS} látszik, szűkítsd a keresést`
      : `${vis.length} / ${all.length} pozíció`;
    selBar();
  };
  // Kijelölő mód: alsó sáv a darabszámmal és a műveletekkel; a fejléc jelölőnégyzete a szűrt (látható) sorokra vonatkozik
  const selBar = () => {
    const bar = view.querySelector('#p-selbar');
    if (!bar) return;
    const latszik = vis.slice(0, MAX_ROWS);
    const rejtett = [...st.sel].filter(id => !latszik.some(r => r.id === id)).length;
    bar.innerHTML = String(html`<span class="grow"><b>${st.sel.size}</b> kijelölve${rejtett ? html` <span class="small muted">(${rejtett} a szűrőn kívül)</span>` : ''}</span>
      ${st.sel.size ? html`<button type="button" class="btn btn-sm" data-sel="ures">Törlés</button>` : ''}
      <button type="button" class="btn btn-sm btn-primary" data-sel="muv" ${st.sel.size ? '' : raw('disabled')}>Művelet…</button>`);
    const all = view.querySelector('#p-all');
    if (all) {
      const n = latszik.filter(r => st.sel.has(r.id)).length;
      all.checked = n > 0 && n === latszik.length;
      all.indeterminate = n > 0 && n < latszik.length;
    }
  };
  szintBox();
  fill();

  // Események (a táblázat és a csempék cserélődnek, a mezők maradnak → a keresőmező fókusza megmarad)
  view.querySelector('#p-q').addEventListener('input', e => { st.q = e.target.value; fill(); });
  view.querySelector('#p-tipus')?.addEventListener('change', e => { st.tipus = e.target.value; fill(); });
  view.querySelector('#p-epulet')?.addEventListener('change', e => { st.epulet = e.target.value; szintBox(); fill(); });
  view.querySelector('#p-stats').addEventListener('click', e => {
    const b = e.target.closest('.stat'); if (!b) return;
    if (b.dataset.hiba) st.hiba = !st.hiba;
    else if (b.dataset.all) { st.allapot = null; st.hiba = false; }
    else st.allapot = st.allapot === b.dataset.st ? null : b.dataset.st;
    fill();
  });
  view.querySelector('thead').addEventListener('click', e => {
    const th = e.target.closest('[data-sort]'); if (!th) return;
    if (st.sort === th.dataset.sort) st.dir = -st.dir; else { st.sort = th.dataset.sort; st.dir = 1; }
    ctx.rerender();
  });
  view.querySelector('#p-rajz-x')?.addEventListener('click', () => { st.rajz = ''; ctx.pgo('poziciok'); });
  view.querySelector('#p-uj')?.addEventListener('click', async () => { if (await editSor('lista', null)) ctx.rerender(); });
  view.querySelector('#p-imp')?.addEventListener('click', () => importTabla('lista', ctx.rerender));
  view.querySelector('#p-jelol')?.addEventListener('click', () => { st.jelol = !st.jelol; ctx.rerender(); });
  view.querySelector('#p-all')?.addEventListener('change', e => {
    for (const r of vis.slice(0, MAX_ROWS)) if (e.target.checked) st.sel.add(r.id); else st.sel.delete(r.id);
    fill();
  });
  view.querySelector('#p-selbar')?.addEventListener('click', async e => {
    const b = e.target.closest('[data-sel]'); if (!b) return;
    if (b.dataset.sel === 'ures') { st.sel.clear(); fill(); return; }
    if (await tomegesMuvelet([...st.sel])) ctx.rerender();
  });
  // Sorra koppintva: adatlap (onnan „Megnyitás a rajzon”); kijelölő módban a kijelölés vált
  const open = tr => {
    if (!tr) return;
    if (st.jelol) {
      const id = tr.dataset.id;
      if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id);
      tr.classList.toggle('sel', st.sel.has(id));
      tr.querySelector('[data-chk]').checked = st.sel.has(id);
      selBar();
      return;
    }
    showPozicio(tr.dataset.id, {
      onChange: () => ctx.rerender(),
      onOpen: poz => ctx.pgo(`rajz/${poz.rajzId}?poz=${poz.id}`),
    });
  };
  view.querySelector('#p-body').addEventListener('click', e => {
    // A jelölőnégyzetre kattintva a böngésző már átbillentette – a sor kezelője állítja be újra (egy helyen)
    if (e.target.matches('[data-chk]')) e.target.checked = !e.target.checked;
    open(e.target.closest('tr[data-id]'));
  });
  view.querySelector('#p-body').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.target.closest('tr[data-id]')); } });
}

export default { render };
