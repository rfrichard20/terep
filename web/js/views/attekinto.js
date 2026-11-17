// Projekt áttekintő (a projekt kezdőoldala): alapadatok, állapot-összesítő (csempék → szűrt Pozíciók),
// teljes állapotsáv, bontás épület/szint szerint, nyitott hibák, legutóbbi bejegyzések.
// Ide később sok minden kerülhet (határidők, kimutatások, anyagigény…).
import { html, raw, fmtDate } from '../ui.js';
import * as D from '../data.js';
import { markerSvg } from '../marker.js';
import { ICONS } from '../icons.js';
import { natCompare, pageHead, fajtaValaszto, bindFajta } from './common.js';
import { EV_TEXT, showPozicio, pozNev, elemCimke } from './pozicio.js';

function render(view, params, ctx) {
  const p = D.projekt(), lep = D.lepesek(), s = D.projektStat(), kat = D.fajta(), tobbFajta = D.projektFajtak().length > 1;
  const ossz = s.lerakva + s.lerakatlan;
  const utolsoLepes = lep[lep.length - 1];
  const kesz = utolsoLepes ? s.cnt.get(utolsoLepes.id) || 0 : 0;
  const seg = (n, szin, cim) => (n ? html`<span style="flex:${n};background:${szin}" title="${cim}: ${n}"></span>` : '');
  const sav = (cnt, lerakatlan, cls = '') => html`<span class="proj-bar ${cls}" aria-hidden="true">${lep.slice().reverse().map(l => seg(cnt.get(l.id) || 0, l.szin, l.nev))}
    ${seg(cnt.get('') || 0, D.SZIN_NINCS, 'Nincs elkezdve')}${seg(lerakatlan, 'var(--surface-2)', 'Nincs lerakva')}</span>`;

  // Bontás épület / szint szerint (lerakott: a rajz helye; lerakatlan: a lista szerinti hely)
  const helyek = new Map();
  const hely = (e, sz) => { const k = `${e}\u0000${sz}`; if (!helyek.has(k)) helyek.set(k, { e, sz, n: 0, lerakatlan: 0, cnt: new Map(), hiba: 0, ertek: 0 }); return helyek.get(k); };
  // Elemenként (a kiválasztott termékfajtában); a hiba helyenként számít
  const hibasHely = new Set();
  for (const el of D.elemek(D.aktivId(), kat)) {
    const poz = D.getPoz(el.poz);
    if (!poz || poz.fajta !== 'pozicio') continue;
    const r = poz.rajzId && D.getRajz(poz.rajzId);
    if (!r) { const h = hely(poz.epulet || '', poz.szint || ''); h.n++; h.lerakatlan++; continue; }
    // Homlokzati rajznál (nincs szint) a pozíció saját szintje
    const a = D.allapot(el.id), h = hely(r.epulet || poz.epulet || '', r.szint || poz.szint || '');
    const k = a.lepes ? a.lepes.id : '';
    h.n++; h.cnt.set(k, (h.cnt.get(k) || 0) + 1);
    if (D.helyHiba(poz.id) && !hibasHely.has(poz.id)) { hibasHely.add(poz.id); h.hiba++; }
    h.ertek += D.elemKeszultseg(el.id);
  }
  const helySorok = [...helyek.values()].sort((a, b) => natCompare(a.e, b.e) || natCompare(a.sz, b.sz));
  const vanHely = helySorok.some(h => h.e || h.sz);

  // Nyitott hibák és legutóbbi bejegyzések
  const pozok = D.poziciok().filter(x => x.rajzId);
  const hibak = pozok.map(x => ({ x, a: { hiba: D.helyHiba(x.id) } })).filter(y => y.a.hiba).sort((a, b) => String(b.a.hiba.mikor).localeCompare(String(a.a.hiba.mikor)));
  const pozById = new Map(pozok.map(x => [x.id, x]));
  const esemenyek = D.adat().esemenyek.filter(e => pozById.has(e.poz)).slice(-12).reverse();
  const lepNev = id => (D.getLepes(id) || {}).nev || '(törölt lépés)';

  const tile = (href, v, label, dot = '', cls = '') => html`<a class="stat ${cls}" href="${href}"><div class="v">${v}</div><div class="l">${dot ? raw(dot) : ''}${label}</div></a>`;
  view.innerHTML = String(html`
    ${pageHead(p.nev, fajtaValaszto())}
    <p class="muted proj-meta">${[p.ugyfel, p.helyszin].filter(Boolean).join(' · ') || 'Ügyfél és helyszín a Projekt oldalon adható meg.'}
      ${p.allapot === 'lezart' ? html` <span class="badge badge-muted">Lezárt</span>` : ''}</p>
    <div class="stats">
      ${tile(ctx.purl('poziciok'), ossz, tobbFajta ? `Összes ${((D.getKategoria(kat) || {}).nev || 'elem').toLowerCase()}` : 'Összes')}
      ${s.lerakatlan ? tile(ctx.purl('poziciok?allapot=-'), s.lerakatlan, 'Nincs lerakva', '', 'muted-stat') : ''}
      ${tile(ctx.purl('poziciok?allapot='), s.cnt.get('') || 0, 'Nincs elkezdve', markerSvg({ szin: D.SZIN_NINCS }, 14))}
      ${lep.map(l => tile(ctx.purl('poziciok?allapot=' + l.id), s.cnt.get(l.id) || 0, l.nev, markerSvg({ szin: l.szin }, 14)))}
      ${tile(ctx.purl('poziciok?hiba=1'), s.hiba, 'Hibás', markerSvg({ szin: D.SZIN_NINCS, hiba: true }, 14), 'err')}
    </div>
    <section class="card">
      <div class="card-head"><h2 class="grow">Készültség</h2>
        <b class="kesz-pct" title="Súlyozott készültség: a kész lépések a súlyuk arányában számítanak (Projekt → Műveletsor)">${Math.round(s.keszultseg * 100)}%</b>
        <span class="muted small">${utolsoLepes ? `${utolsoLepes.nev.toLowerCase()}: ${kesz} / ${ossz} (${ossz ? Math.round(kesz / ossz * 100) : 0}%)` : ''}${tobbFajta ? ` · minden termékfajta: ${Math.round(s.keszultsegOssz * 100)}%` : ''}</span></div>
      <div class="card-pad">${ossz ? sav(s.cnt, s.lerakatlan, 'big') : html`<p class="muted" style="margin:0">Még nincs pozíció – tölts be pozíciólistát (Pozíciók oldal, „Beillesztés Excelből”), vagy rakj le jelölőket egy rajzon.</p>`}
        <p class="small muted" style="margin:.6rem 0 0">${s.rajz} rajz · ${D.poziciok(D.aktivId(), 'pozicio').filter(x => x.rajzId).length} pozíció lerakva · ${s.elemek} elem · ${D.tipusok().length} típus definiálva${s.felmeres || s.hibajel ? ` · ${s.felmeres} felmérés, ${s.hibajel} hibajelölés` : ''}</p></div>
    </section>
    ${vanHely ? html`<section class="card">
      <div class="card-head"><h2>Épület és szint szerint</h2></div>
      <div class="table-wrap"><table class="tbl cards nochk">
        <thead><tr><th>Hely</th><th class="num">Elem</th><th>Állapot</th><th class="num" title="Súlyozott készültség">Készültség</th><th class="num">Hiba</th></tr></thead>
        <tbody>${helySorok.map(h => { return html`
          <tr class="click" tabindex="0" data-href="${ctx.purl(`poziciok?epulet=${encodeURIComponent(h.e)}&szint=${encodeURIComponent(h.sz)}`)}">
            <td class="c-main">${D.helySzoveg(h.e, h.sz) || html`<span class="muted">Hely nélkül</span>`}</td>
            <td class="c-f1 num" data-l="Elem">${h.n}</td>
            <td class="c-meta">${sav(h.cnt, h.lerakatlan, 'mini')}</td>
            <td class="c-f2 num" data-l="Készültség">${h.n ? Math.round(h.ertek / h.n * 100) : 0}%</td>
            <td class="c-f3 num" data-l="Hiba">${h.hiba ? html`<span class="t-err">${h.hiba}</span>` : '–'}</td>
          </tr>`; })}</tbody>
      </table></div>
    </section>` : ''}
    <div class="att-grid">
      <section class="card">
        <div class="card-head"><h2>Nyitott hibák</h2></div>
        ${hibak.length ? html`<ul class="list">${hibak.map(({ x, a }) => html`<li class="list-item"><button type="button" class="list-main list-btn" data-id="${x.id}">
          <b>${pozNev(x)}</b> <span class="t-err">${a.hiba.megj || 'nincs leírás'}</span>
          ${D.fotok(a.hiba.id).length ? html`<span class="foto-jel" title="Fotó">${ICONS.camera}${D.fotok(a.hiba.id).length}</span>` : ''}
          <span class="sub">${a.hiba.ki || '?'} · ${fmtDate(a.hiba.mikor, true)} · ${D.getRajz(x.rajzId).nev}</span></button></li>`)}</ul>`
          : html`<p class="empty">Nincs nyitott hiba.</p>`}
      </section>
      <section class="card">
        <div class="card-head"><h2>Legutóbbi bejegyzések</h2></div>
        ${esemenyek.length ? html`<ul class="list">${esemenyek.map(e => { const x = pozById.get(e.poz); return html`<li class="list-item"><button type="button" class="list-main list-btn" data-id="${x.id}">
          <b>${pozNev(x)}</b> <span class="ev-${e.tipus}">${elemCimke(e)}${e.lepes ? lepNev(e.lepes) + ': ' : ''}${EV_TEXT[e.tipus] || e.tipus}</span>
          <span class="sub">${e.ki || '?'} · ${fmtDate(e.mikor, true)}${e.megj ? ` · ${e.megj}` : ''}</span></button></li>`; })}</ul>`
          : html`<p class="empty">Még nincs bejegyzés.</p>`}
      </section>
    </div>`);

  bindFajta(view, ctx);
  view.querySelector('tbody')?.addEventListener('click', e => { const tr = e.target.closest('tr[data-href]'); if (tr) location.hash = tr.dataset.href; });
  view.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => showPozicio(b.dataset.id, {
    onChange: () => ctx.rerender(),
    onOpen: poz => ctx.pgo(`rajz/${poz.rajzId}?poz=${poz.id}`),
  })));
}

export default { render };
