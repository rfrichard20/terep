// Munkám – a külsős szerelők kezdőoldala a projektben (az Áttekintő helyett): a saját elvégzett munka (ma, a héten, a hónapban),
// gyors út a rajzokhoz / pozíciókhoz, a projekt nyitott hibái és a saját legutóbbi bejegyzések. A projekt teljes állapota,
// készültsége nem jelenik meg (az a külsősnek felesleges).
import { html, fmtDate } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { pageHead } from './common.js';
import { EV_TEXT, showPozicio, pozNev, elemCimke } from './pozicio.js';
import { idoszakHatar, setIdoszak } from './teljesitmeny.js';

function render(view, params, ctx) {
  const p = D.projekt(), en = (D.felhasznalo() || {}).email;
  const darab = k => { const [tol, ig] = idoszakHatar(k); return D.elvegzett({ tol, ig, email: en }).length; };
  const pozok = D.poziciok().filter(x => x.rajzId);
  const pozById = new Map(pozok.map(x => [x.id, x]));
  const hibak = pozok.map(x => ({ x, a: { hiba: D.helyHiba(x.id) } })).filter(y => y.a.hiba).sort((a, b) => String(b.a.hiba.mikor).localeCompare(String(a.a.hiba.mikor)));
  const sajat = D.adat().esemenyek.filter(e => e.kiEmail === en && pozById.has(e.poz)).slice(-15).reverse();
  const lepNev = id => (D.getLepes(id) || {}).nev || '(törölt lépés)';
  const tile = (k, label) => html`<a class="stat" href="${ctx.purl('teljesitmeny')}" data-ido="${k}"><div class="v">${darab(k)}</div><div class="l">${label}</div></a>`;

  view.innerHTML = String(html`
    ${pageHead(p.nev)}
    <p class="muted proj-meta">${[p.ugyfel, p.helyszin].filter(Boolean).join(' · ')}</p>
    <div class="munkam-gyors">
      <a class="btn btn-primary" href="${ctx.purl('rajzok')}">${ICONS.map} Rajzok</a>
      <a class="btn" href="${ctx.purl('poziciok')}">${ICONS.list} Pozíciók</a>
    </div>
    <h2 class="sec-cim">Elvégzett lépéseim</h2>
    <div class="stats">${tile('ma', 'Ma')}${tile('het', 'Ezen a héten')}${tile('honap', 'Ebben a hónapban')}</div>
    <div class="att-grid">
      <section class="card">
        <div class="card-head"><h2>Nyitott hibák</h2></div>
        ${hibak.length ? html`<ul class="list">${hibak.map(({ x, a }) => html`<li class="list-item"><button type="button" class="list-main list-btn" data-id="${x.id}">
          <b>${pozNev(x)}</b> <span class="t-err">${a.hiba.megj || 'nincs leírás'}</span>
          ${D.fotok(a.hiba.id).length ? html`<span class="foto-jel" title="Fotó">${ICONS.camera}${D.fotok(a.hiba.id).length}</span>` : ''}
          <span class="sub">${a.hiba.kiEmail === en ? 'Te jelezted' : ''}${a.hiba.kiEmail === en ? ' · ' : ''}${fmtDate(a.hiba.mikor, true)} · ${D.getRajz(x.rajzId).nev}</span></button></li>`)}</ul>`
          : html`<p class="empty">Nincs nyitott hiba.</p>`}
      </section>
      <section class="card">
        <div class="card-head"><h2>Legutóbbi bejegyzéseim</h2></div>
        ${sajat.length ? html`<ul class="list">${sajat.map(e => { const x = pozById.get(e.poz); return html`<li class="list-item"><button type="button" class="list-main list-btn" data-id="${x.id}">
          <b>${pozNev(x)}</b> <span class="ev-${e.tipus}">${elemCimke(e)}${e.lepes ? lepNev(e.lepes) + ': ' : ''}${EV_TEXT[e.tipus] || e.tipus}</span>
          <span class="sub">${fmtDate(e.mikor, true)}${e.megj ? ` · ${e.megj}` : ''}</span></button></li>`; })}</ul>`
          : html`<p class="empty">Még nincs bejegyzésed ebben a projektben.</p>`}
      </section>
    </div>`);

  view.querySelectorAll('[data-ido]').forEach(a => a.addEventListener('click', () => setIdoszak(a.dataset.ido)));
  view.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => showPozicio(b.dataset.id, {
    onChange: () => ctx.rerender(),
    onOpen: poz => ctx.pgo(`rajz/${poz.rajzId}?poz=${poz.id}`),
  })));
}

export default { render };
