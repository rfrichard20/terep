// Felhasználók oldal (csak admin, szerveres módban): ki léphet be, milyen szerepkörrel, mely projekteket látja.
// A szerkesztő a Raktár felhasználó-szerkesztőjének mintájára (modal + sec(), szerepkör választó .opt-list).
// Törlés nincs: a kitiltás az „Aktív” kivétele (a következő kérésnél érvényes, a készülékről a letöltött adat törlődik).
import { html, raw, modal, toast, formValues, sec, matcher, sortArrow } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { pageHead, natCompare } from './common.js';

const ROLE_DESC = {
  admin: 'Mindent lát és módosíthat, felhasználókat kezel.',
  iroda: 'Projektek, rajzok, pozíciók, típusok, műveletsor; jelölők lerakása.',
  szerelo: 'Lépések, hibák, megjegyzések rögzítése; terepi felmérés- és hibajelölés. A saját lépését 24 órán belül visszavonhatja.',
  kulsos: 'Mint a szerelő, de csak a kijelölt projekteket látja.',
};
const ROLE_BADGE = { admin: 'badge-err', iroda: 'badge-info', szerelo: 'badge-ok', kulsos: 'badge-warn' };

const st = { q: '', inaktiv: false, sort: 'nev', dir: 1 };

/** A felhasználó projektjei szövegként: „Minden projekt” / „Nincs projekt” / nevek. */
export function projektSzoveg(u) {
  if (D.mindentLat(u)) return 'Minden projekt';
  if (!u.projektek.length) return 'Nincs projekt';
  return u.projektek.map(id => (D.getProjekt(id) || { nev: `(törölt: ${id})` }).nev).sort(natCompare).join(', ');
}

function render(view, params, ctx) {
  const SORT = {
    nev: (a, b) => natCompare(a.nev || a.email, b.nev || b.email),
    szerepkor: (a, b) => D.SZEREPKOROK.indexOf(a.szerepkor) - D.SZEREPKOROK.indexOf(b.szerepkor) || natCompare(a.nev, b.nev),
  };
  view.innerHTML = String(html`
    ${pageHead('Felhasználók', html`<button class="btn btn-primary" id="u-uj">${ICONS.plus}Új felhasználó</button>`)}
    <section class="card">
      <div class="toolbar card-toolbar">
        <input type="search" id="u-q" value="${st.q}" placeholder="Keresés: név, e-mail…" aria-label="Keresés" autocomplete="off">
        <label class="check small"><input type="checkbox" id="u-inaktiv" ${st.inaktiv ? raw('checked') : ''}> Inaktívak is</label>
      </div>
      <div class="table-wrap"><table class="tbl cards nochk">
        <thead><tr>
          <th class="sortable" data-sort="nev">Név${sortArrow(st.sort === 'nev', st.dir)}</th>
          <th class="sortable" data-sort="szerepkor">Szerepkör${sortArrow(st.sort === 'szerepkor', st.dir)}</th>
          <th>Projektek</th><th class="m-hide">Megjegyzés</th>
        </tr></thead>
        <tbody id="u-body"></tbody>
      </table></div>
      <div class="tbl-foot" id="u-foot"></div>
    </section>
    <p class="small muted page-note">A felhasználó a megadott Google-fiókkal léphet be. Kitiltás: az „Aktív” kivétele – a következő
      szinkronnál kijelentkezik, és a letöltött adatok törlődnek a készülékéről.</p>`);

  const fill = () => {
    const ok = matcher(st.q);
    const all = D.felhasznalok();
    const vis = all.filter(u => (st.inaktiv || u.aktiv) && ok(`${u.nev} ${u.email} ${u.megjegyzes}`)).sort((a, b) => SORT[st.sort](a, b) * st.dir);
    view.querySelector('#u-body').innerHTML = String(vis.length ? html`${vis.map(u => html`
      <tr class="click ${u.aktiv ? '' : 'off'}" tabindex="0" data-email="${u.email}">
        <td class="c-main"><b>${u.nev || u.email}</b>${u.email === (D.felhasznalo() || {}).email ? html` <span class="small muted">(te)</span>` : ''}
          <div class="small muted ellipsis">${u.email}</div></td>
        <td class="c-act"><span class="badge ${ROLE_BADGE[u.szerepkor] || 'badge-muted'}">${D.ROLE_LABELS[u.szerepkor] || u.szerepkor}</span>
          ${u.aktiv ? '' : html` <span class="badge badge-muted">Inaktív</span>`}</td>
        <td class="c-f4" data-l="Projektek">${projektSzoveg(u)}</td>
        <td class="m-hide">${u.megjegyzes || ''}</td>
      </tr>`)}` : html`<tr><td colspan="4" class="empty">Nincs találat.</td></tr>`);
    const inakt = all.filter(u => !u.aktiv).length;
    view.querySelector('#u-foot').textContent = `${all.length - inakt} aktív felhasználó${inakt ? ` · ${inakt} inaktív` : ''}`;
  };
  fill();

  view.querySelector('#u-q').addEventListener('input', e => { st.q = e.target.value; fill(); });
  view.querySelector('#u-inaktiv').addEventListener('change', e => { st.inaktiv = e.target.checked; fill(); });
  view.querySelector('#u-uj').addEventListener('click', async () => { if (await editFelhasznalo(null)) ctx.rerender(); });
  view.querySelector('thead').addEventListener('click', e => {
    const th = e.target.closest('[data-sort]'); if (!th) return;
    if (st.sort === th.dataset.sort) st.dir = -st.dir; else { st.sort = th.dataset.sort; st.dir = 1; }
    ctx.rerender();
  });
  const open = async tr => { if (tr && await editFelhasznalo(D.getFelhasznalo(tr.dataset.email))) ctx.rerender(); };
  const body = view.querySelector('#u-body');
  body.addEventListener('click', e => open(e.target.closest('tr[data-email]')));
  body.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); open(e.target.closest('tr[data-email]')); } });
}

/**
 * Felhasználó szerkesztő (új: u = null). Projektek: „Minden projekt” (a később létrehozottak is) vagy a kijelöltek;
 * külsősnél csak a kijelöltek. elore: új felhasználónál előre kijelölt projekt (a Projekt oldalról). Visszaad: true, ha mentett.
 */
export async function editFelhasznalo(u, { elore = null } = {}) {
  const uj = !u;
  u = u || { email: '', nev: '', szerepkor: 'szerelo', aktiv: true, projektek: elore ? [elore] : [], megjegyzes: '' };
  const sajat = u.email === (D.felhasznalo() || {}).email;
  const projektek = D.projektek().slice().sort((a, b) => (a.allapot === b.allapot ? natCompare(a.nev, b.nev) : a.allapot === 'aktiv' ? -1 : 1));
  const mind = !u.projektek.length && u.szerepkor !== 'kulsos';
  const res = await modal({
    title: uj ? 'Új felhasználó' : u.nev || u.email,
    body: html`
      ${sec('Fiók', html`
        <label class="field"><span>Google-fiók e-mail címe *</span><input name="email" type="email" value="${u.email}" ${uj ? '' : raw('readonly')}
          autocomplete="off" placeholder="nev@ceg.hu vagy nev@gmail.com"></label>
        <label class="field"><span>Név (a naplóban ez látszik)</span><input name="nev" value="${u.nev}" maxlength="100" autocomplete="off"></label>`, 'col')}
      ${sec('Szerepkör', html`
        <div class="opt-list">${D.SZEREPKOROK.map(r => html`<label class="opt">
          <input type="radio" name="szerepkor" value="${r}" ${r === u.szerepkor ? raw('checked') : ''} ${sajat && r !== 'admin' ? raw('disabled') : ''}>
          <span class="opt-text"><b>${D.ROLE_LABELS[r]}</b><span class="small muted">${ROLE_DESC[r]}</span></span></label>`)}</div>
        ${sajat ? html`<p class="small muted" style="margin:0">A saját admin jogodat nem veheted el.</p>` : ''}
        <label class="check"><input type="checkbox" name="aktiv" ${u.aktiv ? raw('checked') : ''} ${sajat ? raw('disabled') : ''}> Aktív (beléphet)</label>`, 'col')}
      <div id="u-proj">${sec('Projektek', html`
        <div class="opt-list">
          <label class="opt" id="u-mind-opt"><input type="radio" name="hatokor" value="mind" ${mind ? raw('checked') : ''}>
            <span class="opt-text"><b>Minden projekt</b><span class="small muted">A később létrehozottak is.</span></span></label>
          <label class="opt"><input type="radio" name="hatokor" value="kijelolt" ${mind ? '' : raw('checked')}>
            <span class="opt-text"><b>Csak a kijelölt projektek</b></span></label>
        </div>
        <div class="u-proj-list" id="u-list">${projektek.length ? projektek.map(p => html`<label class="check">
          <input type="checkbox" data-pid="${p.id}" ${u.projektek.includes(p.id) ? raw('checked') : ''}> ${p.nev}
          ${p.allapot === 'lezart' ? html`<span class="badge badge-muted">Lezárt</span>` : ''}</label>`) : html`<p class="small muted">Még nincs projekt.</p>`}</div>`, 'col')}</div>
      ${sec('Megjegyzés', html`<input name="megjegyzes" value="${u.megjegyzes}" maxlength="500" aria-label="Megjegyzés" autocomplete="off">`, 'col')}`,
    onMount(el) {
      // Admin: mindent lát (nincs projektválasztás); külsős: csak a kijelöltek
      const upd = () => {
        const v = formValues(el), role = v.szerepkor;
        el.querySelector('#u-proj').hidden = role === 'admin';
        const mindOpt = el.querySelector('#u-mind-opt'), mindR = mindOpt.querySelector('input');
        mindOpt.hidden = role === 'kulsos';
        if (role === 'kulsos' && mindR.checked) el.querySelector('[name=hatokor][value=kijelolt]').checked = true;
        el.querySelector('#u-list').hidden = formValues(el).hatokor === 'mind';
      };
      el.addEventListener('change', upd);
      upd();
      if (uj) el.querySelector('[name=email]').focus();
    },
    actions: [{ label: 'Mégse', value: null }, { label: 'Mentés', kind: 'primary', onClick: async el => {
      const v = formValues(el);
      const email = String(v.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Adj meg egy érvényes e-mail-címet', 'warn'); return false; }
      if (uj && D.getFelhasznalo(email)) { toast('Ez az e-mail-cím már szerepel', 'warn'); return false; }
      const kijelolt = [...el.querySelectorAll('[data-pid]:checked')].map(c => c.dataset.pid);
      const role = v.szerepkor;
      let lista = role === 'admin' || v.hatokor === 'mind' ? [] : kijelolt;
      // Üres lista = minden projekt (nem külsősnél) – „csak a kijelöltek” üresen nem menthető félreérthetően
      if (role !== 'admin' && role !== 'kulsos' && v.hatokor === 'kijelolt' && !kijelolt.length) {
        toast('Jelölj ki legalább egy projektet, vagy válaszd a „Minden projekt” lehetőséget', 'warn'); return false;
      }
      // A még nem létező (törölt) projektek kimaradnak, a többi megmarad
      lista = lista.filter(id => D.getProjekt(id));
      const r = await D.mentFelhasznalo({ email, nev: v.nev, szerepkor: role, aktiv: sajat ? true : v.aktiv, projektek: lista, megjegyzes: v.megjegyzes });
      if (r.hiba) { toast(r.hiba, 'error', 6000); return false; }
      toast('Mentve', 'ok');
    } }],
  }).done;
  return !!res;
}

export default { render };
