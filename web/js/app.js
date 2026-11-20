// Alkalmazás váz (a Raktár app.js mintájára): útvonalak, navigáció (asztalon oldalsáv, mobilon alsó sáv), oldalcím.
// Szerkezet: Projektek → projekten belül Áttekintő, Rajzok (épület/szint szerint), Pozíciók, Típusok, Projekt (beállítások).
// Útvonalak: #/projektek, #/fiok, és projekten belül
//   #/p/<projekt>/attekinto | rajzok | rajz/<id>[?poz=…] | poziciok[?rajz=…&epulet=…&szint=…&allapot=…&hiba=1] | tipusok | projekt.
// Az oldalak a views/ mappában: { render(view, params, ctx), close?() };
// ctx: { pid, rerender(), go(útvonal), pgo(projekten belüli útvonal), purl(projekten belüli útvonal) → href, setTitle(cím) }.
import { html, popover, toast, initNavToggle } from './ui.js';
import { ICONS } from './icons.js';
import * as D from './data.js';
import * as S from './store.js';
import { renderBelepes } from './views/belepes.js';
import projektek from './views/projektek.js';
import attekinto from './views/attekinto.js';
import rajzok from './views/rajzok.js';
import rajz from './views/rajz.js';
import poziciok from './views/poziciok.js';
import tipusok from './views/tipusok.js';
import projekt from './views/projekt.js';
import fiok from './views/fiok.js';
import felhasznalok from './views/felhasznalok.js';
import kategoriak from './views/kategoriak.js';
import teljesitmeny from './views/teljesitmeny.js';
import munkam from './views/munkam.js';
import lomtar from './views/lomtar.js';

// A sorrend a menü sorrendje. proj: projekten belüli oldal; bottom: asztalon az oldalsáv alján; parent: menüben nincs;
// pin: mobilon az alsó sávban kint van (a többi a „Több” gomb alatt)
const ROUTES = {
  projektek: { view: projektek, label: 'Projektek', icon: 'folder' },
  // kulsos: a külsős szerelő ezt látja helyette (Munkám); belso: külsősnek nem jelenik meg
  attekinto: { view: attekinto, label: 'Áttekintő', icon: 'grid', proj: true, pin: true, kulsos: { view: munkam, label: 'Munkám', icon: 'work' } },
  rajzok: { view: rajzok, label: 'Rajzok', icon: 'map', proj: true, pin: true },
  poziciok: { view: poziciok, label: 'Pozíciók', icon: 'list', proj: true, pin: true },
  tipusok: { view: tipusok, label: 'Típusok', icon: 'tag', proj: true, belso: true },
  teljesitmeny: { view: teljesitmeny, label: 'Teljesítmény', icon: 'chart', proj: true },
  projekt: { view: projekt, label: 'Projekt', icon: 'settings', proj: true, belso: true },
  // Lomtár: a Pozíciók oldal gombjáról (most csak törölt pozíciók vannak benne – ha több is lesz, kerülhet a menübe)
  lomtar: { view: lomtar, label: 'Lomtár', icon: 'trash', proj: true, jog: 'iroda', parent: 'poziciok' },
  // jog: csak ennek a szerepkörnek (helyi módban is – a helyi felhasználó admin); beallitas: a „Beállítások” szekcióban (oldalsáv alja)
  kategoriak: { view: kategoriak, label: 'Termékfajták', icon: 'layers', beallitas: true, jog: 'admin' },
  felhasznalok: { view: felhasznalok, label: 'Felhasználók', icon: 'users', beallitas: true, admin: true },
  // Fiók: a felső sáv monogram-gombjával (a Raktár megoldása) – a menüben nincs
  fiok: { view: fiok, label: 'Fiók', icon: 'user', nav: false },
  rajz: { view: rajz, label: 'Rajz', proj: true, parent: 'rajzok' },
};
// Régi (projekt előtti) útvonalak → a kiválasztott projekten belül
const REGI = { torzsadatok: 'projekt' };

const $ = id => document.getElementById(id);
const view = $('view');
let current = null;
initNavToggle('terep:navMini'); // összecsukható (ikonos) oldalsáv, hamburger gomb a felső sávban

/** #/p/<pid>/név/azonosító?a=b vagy #/név/azonosító?a=b → { pid, name, params: { id, a } } */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  let parts = path.split('/').filter(Boolean);
  let pid = null;
  if (parts[0] === 'p') { pid = parts[1]; parts = parts.slice(2); }
  const [name, id] = parts;
  return { pid, name: REGI[name] || name || '', params: { ...Object.fromEntries(new URLSearchParams(q || '')), ...(id ? { id } : {}) } };
}
const go = path => { location.hash = '#/' + path; };
const purl = path => `#/p/${D.aktivId()}/${path}`;
function setTitle(t) {
  $('ptext').textContent = t;
  document.title = t + ' – Terep';
}
const ctx = {
  get pid() { return D.aktivId(); },
  rerender: () => renderView(), go, purl, setTitle,
  pgo: path => go(`p/${D.aktivId()}/${path}`),
};

/** Menü: asztalon minden pont az oldalsávban; mobilon (projekten belül) a pin-es pontok kint, a többi a „Több” alatt. */
// admin: csak adminnak és csak szerveres módban (helyi módban nincs felhasználókezelés)
const kulsos = () => !!D.felhasznalo() && !D.jog('szerelo');
const engedett = r => (!r.admin || (D.jog('admin') && !D.helyi)) && (!r.jog || D.jog(r.jog)) && (!r.belso || !kulsos());
/** Az útvonal a felhasználónak (a külsős a kulsos változatot kapja: más oldal, felirat, ikon). */
const ut = r => (r && r.kulsos && kulsos() ? { ...r, ...r.kulsos } : r);
const navItems = () => Object.entries(ROUTES).filter(([, r]) => !r.parent && r.nav !== false && (!r.proj || D.projekt()) && engedett(r)).map(([k, r]) => [k, ut(r)]);
const extraKeys = () => (D.projekt() ? navItems().filter(([, r]) => !r.pin).map(([k]) => k) : []);
const hrefOf = (key, r) => (r.proj ? purl(key) : '#/' + key);
/**
 * Menü-szekciók (a Raktár csoportjai): cím nélkül a Projektek; „Projekt” (a kiválasztott projekt nevével) a projekten belüli oldalak;
 * „Beállítások” (asztalon az oldalsáv alján) a cégszintű oldalak. [{ kulcs, cim, nev?, items: [[kulcs, route]] }]
 */
function navSzekciok(items = navItems()) {
  const p = D.projekt();
  return [
    { kulcs: 'fo', cim: '', items: items.filter(([, r]) => !r.proj && !r.beallitas) },
    { kulcs: 'projekt', cim: 'Projekt', nev: p ? p.nev : '', items: items.filter(([, r]) => r.proj) },
    { kulcs: 'beallitas', cim: 'Beállítások', items: items.filter(([, r]) => r.beallitas) },
  ].filter(g => g.items.length);
}
function renderNav(active) {
  const extra = extraKeys();
  const link = (key, r) => html`<a href="${hrefOf(key, r)}" class="${key === active ? 'active' : ''} ${extra.includes(key) ? 'nav-extra' : ''}" ${key === active ? html`aria-current="page"` : ''}>
    ${ICONS[r.icon]}<span class="lbl">${r.label}</span></a>`;
  const fej = g => (g.kulcs === 'projekt' ? html`<div class="nav-proj" title="${g.nev}"><span class="nav-proj-l">Projekt</span><b class="ellipsis">${g.nev}</b></div>`
    : g.cim ? html`<div class="nav-group ${g.kulcs === 'beallitas' ? 'nav-bottom' : ''}">${g.cim}</div>` : '');
  $('nav').innerHTML = String(html`
    ${navSzekciok().map(g => html`${fej(g)}${g.items.map(([k, r]) => link(k, r))}`)}
    ${extra.length ? html`<button type="button" class="nav-more ${extra.includes(active) ? 'active' : ''}" data-navmore aria-label="További menüpontok">
      ${ICONS.more}<span class="lbl">Több</span></button>` : ''}`);
  $('userbtn').classList.toggle('active', active === 'fiok');
}
// „Több” (mobil): a kint nem lévő menüpontok a gomb fölött, nagy, jól eltalálható sorokkal, szekciócímekkel (a Raktár megoldása)
$('nav').addEventListener('click', e => {
  const b = e.target.closest('[data-navmore]');
  if (!b) return;
  const extra = extraKeys();
  const szekciok = navSzekciok(navItems().filter(([k]) => extra.includes(k)));
  const item = ([k, r]) => html`<a class="pop-item ${current && (ROUTES[current.name].parent || current.name) === k ? 'sel' : ''}" href="${hrefOf(k, r)}">${ICONS[r.icon]}<span class="grow">${r.label}</span></a>`;
  popover(b, html`<div class="nav-pop">${szekciok.map(g => html`${szekciok.length > 1 && g.cim ? html`<div class="pop-title">${g.cim}</div>` : ''}${g.items.map(item)}`)}</div>`, {
    minWidth: 220,
    onMount: (pop, close) => pop.addEventListener('click', ev => { if (ev.target.closest('a')) close(); }),
  });
});

// A projekt adata még nincs a készüléken (szerveres mód, első megnyitás offline): üzenet, a letöltés után magától frissül
const nincsBetoltve = {
  render(v) {
    v.innerHTML = String(html`<section class="card narrow" style="margin-top:1rem"><div class="card-pad">
      <p style="margin-top:0"><b>${S.state.syncing ? 'A projekt adatainak letöltése…' : 'A projekt adatai még nincsenek letöltve erre a készülékre.'}</b></p>
      ${S.state.syncing ? '' : html`<p class="small muted">${S.state.lastError || 'Kapcsolódj az internethez, és próbáld újra.'}</p>
        <button class="btn btn-sm" id="ujra">Újrapróbálás</button>`}</div></section>`);
    v.querySelector('#ujra')?.addEventListener('click', () => S.sync());
  },
  placeholder: true,
};

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  // Szerveres mód, nincs bejelentkezve: belépés oldal (menü nélkül)
  if (!S.state.user) {
    if (current && current.view.close) current.view.close();
    current = null;
    document.body.classList.add('belepes');
    document.body.classList.remove('drawing');
    $('back').hidden = true;
    $('pproj').textContent = '';
    setTitle('Belépés');
    renderBelepes(view);
    return;
  }
  document.body.classList.remove('belepes');
  S.syncHaRegi();
  let { pid, name, params } = parseHash();
  let r = ut(ROUTES[name]);
  if (r && !engedett(r)) r = null;
  // Projekten belüli oldal: a címben lévő projekt lesz a kiválasztott; projekt nélkül (régi link) a kiválasztotté
  if (r && r.proj) {
    if (pid && pid !== D.aktivId() && D.getProjekt(pid)) {
      view.innerHTML = '<p class="muted">Betöltés…</p>';
      await D.setAktiv(pid);
      if (seq !== renderSeq) return;
    }
    if (!D.projekt()) r = null;
    else if (pid !== D.aktivId()) { history.replaceState(null, '', purl(name + (params.id ? '/' + params.id : ''))); }
  }
  if (!r) {
    name = D.projekt() ? 'attekinto' : 'projektek'; params = {};
    r = ut(ROUTES[name]);
    history.replaceState(null, '', r.proj ? purl(name) : '#/' + name);
  }
  if (current && current.view.close) current.view.close();
  const pageView = r.proj && !D.betoltve() ? nincsBetoltve : r.view;
  current = { name, params, view: pageView };
  renderNav(r.parent || name);
  // Rajz nézet: teljes képernyős néző (mobilon alsó sáv nélkül), vissza gomb a felső sávban
  // (a Szerkesztés mód ceruza gombja a rajz eszközoszlopában van – a szerkesztés az iroda joga)
  const drawing = name === 'rajz' && pageView === r.view;
  document.body.classList.toggle('drawing', drawing);
  $('back').hidden = !drawing;
  if (drawing) $('back').href = purl('rajzok');
  $('pproj').textContent = r.proj && D.projekt() ? D.projekt().nev : '';
  setTitle(r.label);
  window.scrollTo(0, 0);
  pageView.render(view, params, ctx);
}
function renderView() {
  if (!current || current.view.placeholder) return render();
  const scroll = window.scrollY;
  renderNav(ROUTES[current.name].parent || current.name);
  $('pproj').textContent = ROUTES[current.name].proj && D.projekt() ? D.projekt().nev : '';
  current.view.render(view, current.params, ctx);
  window.scrollTo(0, scroll);
}

/* ---------- Adatváltozás (szinkron, saját rögzítés): az oldal frissül ----------
 * Ha az oldalnak van refresh()-e (rajz: csak a jelölők), az fut; különben újrarajzolás. Gépelés közben (fókusz egy
 * szövegmezőn az oldalon) nem rajzolunk újra – a mező elhagyásakor pótoljuk.
 */
let pendingRefresh = false;
const isTextInput = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'color'].includes(el.type)));
let started = false; // indulás közben (D.load) a store eseményei még nem rajzolnak
function frissit() {
  if (!started) return;
  if (!S.state.user || document.body.classList.contains('belepes') || !current) return render();
  // A kiválasztott projekt közben eltűnt (törölték, elvették a hozzáférést): vissza a projektekhez
  if (ROUTES[current.name] && ROUTES[current.name].proj && !D.projekt()) return render();
  if (isTextInput(document.activeElement) && view.contains(document.activeElement)) { pendingRefresh = true; return; }
  pendingRefresh = false;
  if (current.view.refresh) { renderNav(ROUTES[current.name].parent || current.name); current.view.refresh(); }
  else renderView();
}
view.addEventListener('focusout', () => { if (pendingRefresh) setTimeout(() => { if (pendingRefresh && !(isTextInput(document.activeElement) && view.contains(document.activeElement))) frissit(); }, 200); });
S.subscribe(kind => {
  renderStatus();
  if (kind === 'data') frissit();
  if (kind === 'elutasitva') toast('A szerver egy vagy több változtatást nem fogadott el – részletek a Fiók oldalon', 'error', 8000);
});

/* ---------- Szinkron jelző a felső sávban (a Raktár megoldása) ---------- */
const fmtTime = t => {
  const ma = new Date().toDateString() === t.toDateString();
  const hm = t.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  return ma ? hm : `${t.toLocaleDateString('hu-HU', { month: '2-digit', day: '2-digit' })} ${hm}`;
};
export function syncSzoveg() {
  const s = S.state, n = S.myOutbox().length + S.fotosorSajat().length;
  let cls = 'ok', text;
  if (s.syncing) { cls = 'busy'; text = 'Szinkronizálás…'; }
  else if (s.authError) { cls = 'err'; text = 'Bejelentkezés szükséges'; }
  else if (!s.online) { cls = 'warn'; text = n ? `Offline · ${n} feltöltésre vár` : 'Offline'; }
  else if (s.lastError) { cls = 'err'; text = 'Szinkron hiba'; }
  else if (n) { cls = 'warn'; text = `${n} feltöltésre vár`; }
  else text = s.at ? `Szinkronban · ${fmtTime(new Date(s.at))}` : 'Szinkronban';
  if (s.rejected.length) { cls = 'err'; text += ` · ${s.rejected.length} elutasítva`; }
  return { cls, text, n };
}
const HELYI_SZOVEG = 'Helyi mód – nincs szerver, az adatok csak ebben a böngészőben vannak';
function renderStatus() {
  const s = S.state, el = $('sync'), ub = $('userbtn');
  ub.hidden = el.hidden = !s.user;
  if (!s.user) return;
  // Monogram: a név (helyi módban a Fiók oldalon megadott név) kezdőbetűi
  const nev = (S.isHelyi ? D.getNev() : s.user.nev) || s.user.email || '?';
  ub.textContent = nev.split(/[\s.@]+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  ub.title = S.isHelyi ? `${nev} (helyi mód) – Fiók` : `${s.user.nev || ''} (${s.user.email}) – Fiók`;
  ub.setAttribute('aria-label', ub.title);
  if (S.isHelyi) {
    // Helyi mód: nincs szinkron – a jelző ezt mutatja (koppintásra magyarázat)
    el.className = 'sync-pill muted';
    el.innerHTML = ICONS.cloudOff;
    el.title = HELYI_SZOVEG;
    el.setAttribute('aria-label', HELYI_SZOVEG);
    return;
  }
  const { cls, text, n } = syncSzoveg();
  const icon = s.syncing ? 'sync' : cls === 'err' ? 'syncErr' : !s.online ? 'cloudOff' : n ? 'cloudUp' : 'cloudOk';
  el.className = 'sync-pill ' + cls;
  el.innerHTML = `${ICONS[icon]}${n ? `<span class="sync-n">${n}</span>` : ''}`;
  el.title = text + (s.lastError ? ` – ${s.lastError}` : '');
  el.setAttribute('aria-label', text);
}
$('sync').addEventListener('click', e => {
  e.preventDefault();
  const s = S.state, el = $('sync'), { text, n } = syncSzoveg();
  if (S.isHelyi) {
    popover(el, html`<div style="padding:.35rem .5rem;max-width:280px"><b>Helyi mód</b>
        <div class="small muted" style="margin-top:.2rem">Nincs megadva szerver, ezért nincs szinkronizálás: minden adat (a rajzok is) csak ebben a
          böngészőben tárolódik. Éles használatban a szerver beállítása után itt látszik a szinkron állapota.</div></div>
      <div class="pop-foot"><span></span><a class="small" href="#/fiok" data-x="more">Fiók ›</a></div>`, {
      minWidth: 240,
      onMount: (p, close) => p.addEventListener('click', ev => { if (ev.target.closest('[data-x]')) close(); }),
    });
    return;
  }
  popover(el, html`<div style="padding:.35rem .5rem;max-width:260px">
      <b>${text}</b>
      <div class="small muted" style="margin-top:.2rem">Utolsó szinkron: ${s.at ? fmtTime(new Date(s.at)) : '–'}${n ? ` · ${n} tétel vár feltöltésre` : ''}</div>
      ${s.lastError ? html`<div class="small" style="color:var(--err);margin-top:.3rem">${s.lastError}</div>` : ''}
    </div>
    <div class="pop-foot"><button class="btn btn-sm" data-x="sync" ${s.syncing ? 'disabled' : ''}>Szinkronizálás most</button><a class="small" href="#/fiok" data-x="more">Részletek ›</a></div>`, {
    minWidth: 240,
    onMount: (p, close) => p.addEventListener('click', ev => {
      const x = ev.target.closest('[data-x]');
      if (!x) return;
      if (x.dataset.x === 'sync') S.sync();
      close();
    }),
  });
});

// A műveletek hibái (a szabályok elutasították, nincs kapcsolat…), amelyeket az oldal nem kezelt: üzenet
window.addEventListener('unhandledrejection', e => {
  const err = e.reason;
  if (err && err.message && (err.validation || err.network || err.auth || !(err instanceof TypeError))) toast(err.message, 'error', 6000);
});

/* ---------- Keresőmezők: nagyító ikon és saját, jól megnyomható törlőgomb (a Raktár enhanceSearch-e) ---------- */
function enhanceSearch(input) {
  if (input.dataset.enh) return;
  input.dataset.enh = '1';
  const wrap = document.createElement('span');
  wrap.className = 'search-wrap';
  input.parentNode.insertBefore(wrap, input);
  const ico = document.createElement('span');
  ico.className = 'search-ico';
  ico.innerHTML = String(ICONS.search);
  wrap.append(ico, input);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'search-clear';
  btn.title = 'Keresés törlése';
  btn.setAttribute('aria-label', 'Keresés törlése');
  btn.innerHTML = String(ICONS.x);
  wrap.appendChild(btn);
  const sync = () => wrap.classList.toggle('has-value', !!input.value);
  input.addEventListener('input', sync);
  btn.addEventListener('mousedown', e => e.preventDefault()); // a fókusz a mezőben marad
  btn.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  sync();
}
new MutationObserver(muts => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.matches('input[type=search]')) enhanceSearch(n);
    n.querySelectorAll?.('input[type=search]').forEach(enhanceSearch);
  }
}).observe(document.body, { childList: true, subtree: true });

/* ---------- Indulás ---------- */
(async function start() {
  view.innerHTML = '<p class="muted">Betöltés…</p>';
  try {
    await D.load();
  } catch (e) {
    console.error(e);
    view.innerHTML = '<p>Az adatok nem tölthetők be ezen a készüléken (a böngésző tárolója nem elérhető).</p>';
    return;
  }
  window.addEventListener('hashchange', render);
  started = true;
  render();
  renderStatus();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  // Service worker csak élesben: a helyi fejlesztésnél a gyorsítótár régi fájlokat adna
  if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
