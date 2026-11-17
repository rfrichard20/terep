// Fiók oldal: a felhasználó (szerveres módban a belépés adatai, helyi módban a naplóba kerülő név), szinkron állapota
// (függő és elutasított műveletek, letöltött rajzok), kijelentkezés, téma.
import { html, raw, confirmDialog, toast, fmtMB } from '../ui.js';
import * as D from '../data.js';
import * as S from '../store.js';
import { editNev, pageHead } from './common.js';

const ROLE_LABELS = window.TerepLogic.ROLE_LABELS;
const idoSzoveg = iso => (iso ? new Date(iso).toLocaleString('hu-HU', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');

/** Egy művelet rövid leírása (a függő / elutasított listához). */
function muveletNev(op) {
  const poz = id => { const p = D.getPoz(id); return p ? `„${p.jel || D.FAJTAK[p.fajta]}”` : ''; };
  switch (op.type) {
    case 'esemeny': {
      const e = op.esemeny || {}, l = D.getLepes(e.lepes_id);
      const t = { kesz: `kész: ${l ? l.nev : 'lépés'}`, visszavon: `visszavonás: ${l ? l.nev : 'lépés'}`, hiba: 'hiba jelzése', hiba_vege: 'hiba megoldva', megj: 'megjegyzés' }[e.tipus] || e.tipus;
      return `Pozíció ${poz(e.poz_id)} – ${t}`;
    }
    case 'poz_mentes': return op.rows.length > 1 ? `${op.rows.length} pozíció mentése` : `Pozíció mentése ${poz(op.rows[0].poz_id) || '„' + (op.rows[0].jel || '') + '”'}`;
    case 'poz_lerakas': return op.rajz_id ? `Pozíció lerakása ${poz(op.poz_id)}` : `Levétel a rajzról ${poz(op.poz_id)}`;
    case 'poz_torles': return `Pozíció törlése ${poz(op.poz_id)}`;
    case 'poz_visszaallitas': return `Pozíció visszaállítása ${op.jel || ''}`.trim();
    case 'tipus_mentes': return op.rows.length > 1 ? `${op.rows.length} típus mentése` : `Típus mentése „${op.rows[0].jel || ''}”`;
    case 'tipus_torles': return 'Típus törlése';
    case 'projekt_mentes': return `Projekt mentése „${(op.projekt || {}).nev || ''}”`;
    case 'projekt_torles': return 'Projekt törlése';
    case 'lepesek_mentes': return `Műveletsor mentése${D.getKategoria(op.kategoria_id) ? ' – ' + D.getKategoria(op.kategoria_id).nev : ''}`;
    case 'elem_mentes': return op.rows.length > 1 ? `${op.rows.length} elem mentése` : `Elem mentése ${poz(op.rows[0].poz_id || (D.getElem(op.rows[0].elem_id) || {}).poz)}`;
    case 'elem_torles': return 'Elem törlése';
    case 'kategoria_mentes': return `Termékfajta mentése „${(op.kategoria || {}).nev || ''}”`;
    case 'kapcsolat_mentes': return 'Kapcsolat mentése';
    case 'kapcsolat_torles': return 'Kapcsolat törlése';
    case 'csatorna_mentes': return 'Csatorna mentése';
    case 'csatorna_torles': return 'Csatorna törlése';
    case 'rajz_mentes': return `Rajz adatai „${(op.rajz || {}).nev || ''}”`;
    case 'rajz_torles': return 'Rajz törlése';
    case 'esemenyek': return `${(op.esemenyek || []).length} bejegyzés (tömeges / pótlás)`;
    case 'foto': return `Fotó ${poz(op.poz_id)}`;
    case 'foto_torles': return 'Fotó törlése';
    case 'felhasznalo_mentes': return `Felhasználó mentése (${(op.felhasznalo || {}).email || ''})`;
    default: return op.type;
  }
}

function render(view, params, ctx) {
  const s = S.state, u = s.user || {};
  const mine = S.myOutbox();
  view.innerHTML = String(html`
    ${pageHead('Fiók')}
    <div class="narrow">
      <section class="card">
        <div class="card-head"><h2 class="grow">${S.isHelyi ? 'Helyi mód' : 'Bejelentkezve'}</h2>
          ${S.isHelyi ? '' : html`<button class="btn btn-sm" id="kilep">Kijelentkezés</button>`}</div>
        <div class="card-pad">
          ${S.isHelyi ? html`
            <div class="kv"><span>Név</span><b>${D.getNev() || '–'}</b><button class="btn btn-sm" id="nev">Módosítás</button></div>
            <p class="small muted" style="margin:.75rem 0 0">Nincs beállítva szerver (config.js → API_URL): minden adat csak ezen a készüléken
              tárolódik. A név a naplóban jelenik meg a bejegyzéseid mellett.</p>` : html`
            <div class="kv"><span>Név</span><b>${u.nev || '–'}</b></div>
            <div class="kv"><span>E-mail</span><b>${u.email || ''}</b></div>
            <div class="kv"><span>Szerepkör</span><b>${ROLE_LABELS[u.szerepkor] || u.szerepkor || ''}</b></div>`}
        </div>
      </section>
      ${S.isHelyi ? '' : html`<section class="card">
        <div class="card-head"><h2 class="grow">Szinkron</h2><button class="btn btn-sm" id="sync" ${s.syncing ? raw('disabled') : ''}>Szinkronizálás most</button></div>
        <div class="card-pad">
          <div class="kv"><span>Állapot</span><b>${s.syncing ? 'Szinkronizálás…' : !s.online ? 'Offline' : s.lastError ? 'Hiba' : 'Rendben'}</b></div>
          ${s.lastError ? html`<p class="small" style="color:var(--err)">${s.lastError}</p>` : ''}
          <div class="kv"><span>Utolsó</span><b>${idoSzoveg(s.at)}</b></div>
          <div class="kv"><span>Rajzok</span><b id="rajzok">…</b></div>
          ${S.fotosorSajat().length ? html`<div class="kv"><span>Fotók</span><b>${S.fotosorSajat().length} vár feltöltésre</b></div>` : ''}
          <p class="small muted" style="margin:.75rem 0 0">Az adatok és a megnyitott projekt rajzai a készüléken is megmaradnak, így internet nélkül
            is dolgozhatsz; a rögzítések a kapcsolat helyreálltakor töltődnek fel. Új rajz feltöltéséhez internet kell.</p>
        </div>
      </section>`}
      ${mine.length ? html`<section class="card">
        <div class="card-head"><h2 class="grow">Feltöltésre vár (${mine.length})</h2></div>
        <div class="card-pad"><ul class="op-list">${mine.slice(0, 50).map(op => html`<li>
          <div class="grow"><div>${muveletNev(op)}</div><div class="small muted">${idoSzoveg(op.created)}${op.localError ? html` · <span class="t-err">${op.localError}</span>` : ''}</div></div>
          <button class="btn btn-sm btn-link-danger" data-dobd="${op.op_id}">Elvetés</button></li>`)}</ul>
          ${mine.length > 50 ? html`<p class="small muted">… és még ${mine.length - 50}</p>` : ''}</div>
      </section>` : ''}
      ${s.rejected.length ? html`<section class="card">
        <div class="card-head"><h2 class="grow">Elutasított változtatások (${s.rejected.length})</h2></div>
        <div class="card-pad"><p class="small muted" style="margin-top:0">Ezeket a szerver nem fogadta el (pl. közben valaki más módosította ugyanazt,
          vagy nincs hozzá jogod). Az adat a szerver szerinti állapotban van.</p>
          <ul class="op-list">${s.rejected.map((x, i) => html`<li>
          <div class="grow"><div>${muveletNev(x.op)}</div><div class="small t-err">${x.error}</div><div class="small muted">${idoSzoveg(x.op.created)}</div></div>
          <button class="btn btn-sm" data-ok="${i}">Rendben</button></li>`)}</ul></div>
      </section>` : ''}
      <section class="card">
        <div class="card-head"><h2>Beállítások</h2></div>
        <div class="card-pad">
          <div class="kv"><span>Téma</span><select id="theme" aria-label="Téma">
            ${[['auto', 'Automatikus'], ['light', 'Világos'], ['dark', 'Sötét']].map(([v, l]) => html`<option value="${v}" ${window.TerepTheme.get() === v ? raw('selected') : ''}>${l}</option>`)}
          </select></div>
        </div>
      </section>
    </div>`);
  const $ = sel => view.querySelector(sel);
  $('#nev')?.addEventListener('click', async () => { if (await editNev()) ctx.rerender(); });
  $('#sync')?.addEventListener('click', () => S.sync());
  $('#kilep')?.addEventListener('click', async () => {
    const n = S.myOutbox().length;
    if (!await confirmDialog('Kijelentkezés', `A letöltött adatok és rajzok törlődnek erről a készülékről.${n ? ` A ${n} még fel nem töltött rögzítésed megmarad, és a következő belépéskor feltöltődik.` : ''}`, 'Kijelentkezés')) return;
    try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* */ }
    await S.logout();
  });
  $('#theme').addEventListener('change', e => window.TerepTheme.set(e.target.value));
  $('.narrow').addEventListener('click', async e => {
    const d = e.target.closest('[data-dobd]'), ok = e.target.closest('[data-ok]');
    if (d) {
      if (!await confirmDialog('Rögzítés elvetése', 'Ez a változtatás nem kerül fel a szerverre, és eltűnik erről a készülékről. Nem vonható vissza.', 'Elvetés', 'danger')) return;
      await S.discardOutboxItem(d.dataset.dobd);
      toast('Elvetve', 'ok');
    } else if (ok) { await S.dismissRejected(Number(ok.dataset.ok)); ctx.rerender(); }
  });
  if (!S.isHelyi) S.letoltottRajzok().then(r => {
    const el = view.querySelector('#rajzok');
    if (el) el.textContent = D.projekt() ? `${r.db} / ${r.ossz} letöltve (${fmtMB(r.meret)}) – ${D.projekt().nev}` : 'Nincs kiválasztott projekt';
  });
}

export default { render };
