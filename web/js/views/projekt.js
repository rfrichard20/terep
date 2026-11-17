// Projekt oldal (a kiválasztott projekt beállításai): adatok és állapot, pozíciólista (beillesztés Excelből),
// műveletsor (lépések, színek), projekt törlése. Az editLepesek más oldalról is hívható (onDone).
import { html, raw, modal, confirmDialog, toast, uid, formValues } from '../ui.js';
import * as D from '../data.js';
import { pageHead, natCompare } from './common.js';
import { editFelhasznalo } from './felhasznalok.js';

/* ---------- Hozzáférés (admin, szerveres mód): ki látja a projektet ---------- */
const aktivFelh = () => D.felhasznalok().filter(u => u.aktiv).sort((a, b) => natCompare(a.nev || a.email, b.nev || b.email));
const felhChip = u => html`<li title="${u.email}">${u.nev || u.email} <span class="small muted">· ${D.ROLE_LABELS[u.szerepkor] || u.szerepkor}</span></li>`;
function hozzaferesKartya(p) {
  const all = aktivFelh();
  const mind = all.filter(u => D.mindentLat(u)), kijelolt = all.filter(u => !D.mindentLat(u) && u.projektek.includes(p.id));
  return html`<section class="card">
    <div class="card-head"><h2 class="grow">Hozzáférés</h2>
      <button class="btn btn-sm" id="p-ujf">+ Új felhasználó</button><button class="btn btn-sm" id="p-hozz">Kezelés</button></div>
    <div class="card-pad">
      <p class="small muted" style="margin-top:0">Kijelölve ehhez a projekthez (${kijelolt.length})</p>
      ${kijelolt.length ? html`<ul class="chips plain">${kijelolt.map(felhChip)}</ul>` : html`<p class="muted" style="margin:0">Senki – külsős partnert itt adhatsz hozzá.</p>`}
      <p class="small muted">Minden projektet látnak (${mind.length})</p>
      <ul class="chips plain">${mind.map(felhChip)}</ul>
    </div>
  </section>`;
}
/**
 * Kik látják ezt a projektet: a csak kijelölt projekteket látó felhasználók (külsősök és a korlátozott belsősök) jelölőnégyzettel.
 * Aki csak ezt az egy projektet látja és nem külsős, attól itt nem vehető el (az üres lista „minden projektet” jelentene).
 */
async function editHozzaferes(p) {
  const list = aktivFelh().filter(u => !D.mindentLat(u));
  const res = await modal({
    title: `Hozzáférés – ${p.nev}`,
    body: html`<p class="small muted" style="margin-top:0">Azok a felhasználók, akik csak a kijelölt projekteket látják. Aki minden projektet lát
      (admin, illetve projektlista nélküli iroda / szerelő), az itt nem szerepel – őket a Felhasználók oldalon lehet korlátozni.</p>
      ${list.length ? html`<div class="u-proj-list">${list.map(u => {
        const van = u.projektek.includes(p.id), utolso = van && u.projektek.length === 1 && u.szerepkor !== 'kulsos';
        return html`<label class="check"><input type="checkbox" data-email="${u.email}" ${van ? raw('checked') : ''} ${utolso ? raw('disabled') : ''}>
          <span>${u.nev || u.email} <span class="small muted">· ${D.ROLE_LABELS[u.szerepkor]}${utolso ? ' · csak ezt a projektet látja' : ''}</span></span></label>`;
      })}</div>` : html`<p class="muted">Nincs ilyen felhasználó. Külsős partnert az „+ Új felhasználó” gombbal vehetsz fel.</p>`}`,
    actions: [{ label: 'Mégse', value: null }, { label: 'Mentés', kind: 'primary', onClick: async el => {
      for (const c of el.querySelectorAll('[data-email]:not(:disabled)')) {
        const u = D.getFelhasznalo(c.dataset.email), van = u.projektek.includes(p.id);
        if (c.checked === van) continue;
        const projektek = c.checked ? [...u.projektek, p.id] : u.projektek.filter(id => id !== p.id);
        const r = await D.mentFelhasznalo({ ...u, projektek });
        if (r.hiba) { toast(`${u.nev || u.email}: ${r.hiba}`, 'error', 6000); return false; }
      }
      toast('Mentve', 'ok');
    } }],
  }).done;
  return !!res;
}

function render(view, params, ctx) {
  const p = D.projekt(), iroda = D.jog('iroda'), fajtak = D.projektFajtak(p.id);
  const ujFajtak = D.aktivKategoriak().filter(k => !fajtak.includes(k));
  view.innerHTML = String(html`
    ${pageHead('Projekt')}
    <div class="narrow">
      <section class="card">
        <div class="card-head"><h2 class="grow">${p.nev}</h2>${iroda ? html`<button class="btn btn-sm" id="p-edit">Módosítás</button>` : ''}</div>
        <div class="card-pad">
          <div class="kv"><span>Ügyfél</span><b>${p.ugyfel || '–'}</b></div>
          <div class="kv"><span>Helyszín</span><b>${p.helyszin || '–'}</b></div>
          <div class="kv"><span>Állapot</span><b>${D.PROJEKT_ALLAPOT[p.allapot] || p.allapot}</b></div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="grow">Pozíciólista</h2>
          <a class="btn btn-sm" href="${ctx.purl('poziciok')}">Megnyitás</a></div>
        <div class="card-pad">${listaInfo()}</div>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="grow">Típusok</h2><a class="btn btn-sm" href="${ctx.purl('tipusok')}">Megnyitás</a></div>
        <div class="card-pad"><p style="margin:0">${D.tipusok().length} típus definiálva
          <span class="small muted">– az elemek a típusuktól öröklik a méretet és a tulajdonságokat.</span></p></div>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="grow">Műveletsor</h2>${iroda && ujFajtak.length ? html`<button class="btn btn-sm" id="fajta-uj">+ Termékfajta</button>` : ''}</div>
        <div class="card-pad">${fajtak.length ? fajtak.map(k => { const lep = D.lepesek(p.id, k.id), resz = D.reszesedes(p.id, k.id); return html`
          <div class="seq-fajta">
            <div class="seq-fajta-fej"><b class="grow">${k.nev}</b>${iroda ? html`<button class="btn btn-sm" data-seq="${k.id}">Szerkesztés</button>` : ''}</div>
            <ol class="chips">${lep.map(l => html`<li><span class="dot" style="background:${l.szin}"></span>${l.nev}
              <span class="muted"> · ${Math.round(resz.get(l.id) * 100)}%</span></li>`)}</ol>
          </div>`; }) : html`<p class="muted" style="margin:0">Még nincs termékfajta a projektben.</p>`}
          <p class="small muted" style="margin:.5rem 0 0">Termékfajtánként külön lépéssor (pl. árnyékoló, szúnyogháló, vezérlő). A % a lépés részesedése
            a fajta készültségéből (a megadott súlyok szerint; súly nélkül egyenlő arányban).</p></div>
      </section>
      ${D.jog('admin') && !D.helyi ? hozzaferesKartya(p) : ''}
      ${D.jog('admin') ? html`<p class="page-note"><button type="button" class="btn btn-sm btn-link-danger" id="p-del">Projekt törlése…</button></p>` : ''}
    </div>`);
  view.querySelector('#p-edit')?.addEventListener('click', () => editProjekt(ctx));
  view.querySelector('#p-hozz')?.addEventListener('click', async () => { if (await editHozzaferes(p)) ctx.rerender(); });
  view.querySelector('#p-ujf')?.addEventListener('click', async () => { if (await editFelhasznalo(null, { elore: p.id })) ctx.rerender(); });
  view.querySelectorAll('[data-seq]').forEach(b => b.addEventListener('click', () => editLepesek(ctx.rerender, b.dataset.seq)));
  view.querySelector('#fajta-uj')?.addEventListener('click', () => ujFajta(ujFajtak, ctx));
  view.querySelector('#p-del')?.addEventListener('click', async () => {
    const s = D.projektStat();
    if (!await confirmDialog('Projekt törlése', `A(z) „${p.nev}” projekt végleg törlődik${D.helyi ? '' : ' (mindenkinél)'} a ${s.rajz} rajzzal, ${D.poziciok(p.id).length} pozícióval (${D.elemek(p.id).length} elem), a típusokkal és a naplóval együtt. Ez nem vonható vissza.`, 'Végleges törlés', 'danger')) return;
    await D.delProjekt(p.id);
    toast('A projekt törölve', 'ok');
    ctx.go('projektek');
  });
}

async function editProjekt(ctx) {
  const p = D.projekt();
  await modal({
    title: 'Projekt adatai',
    body: html`<div class="form-col">
      <label class="field"><span>Projekt neve</span><input name="nev" value="${p.nev}" maxlength="80" autocomplete="off"></label>
      <label class="field"><span>Ügyfél</span><input name="ugyfel" value="${p.ugyfel}" maxlength="80" autocomplete="off"></label>
      <label class="field"><span>Helyszín</span><input name="helyszin" value="${p.helyszin}" maxlength="120" autocomplete="off"></label>
      <label class="field"><span>Állapot</span><select name="allapot">
        ${Object.entries(D.PROJEKT_ALLAPOT).map(([k, l]) => html`<option value="${k}" ${p.allapot === k ? raw('selected') : ''}>${l}</option>`)}</select></label>
    </div>`,
    actions: [{ label: 'Mégse', value: null }, { label: 'Mentés', kind: 'primary', onClick: async el => {
      const v = formValues(el);
      if (!v.nev.trim()) { toast('Add meg a projekt nevét', 'warn'); return false; }
      await D.updateProjekt(p.id, { nev: v.nev.trim(), ugyfel: v.ugyfel.trim(), helyszin: v.helyszin.trim(), allapot: v.allapot });
    } }],
  }).done;
  ctx.rerender();
}

/** Összesítő: sorok, ebből lerakva, típusok száma, oszlopok. */
function listaInfo() {
  const poz = D.poziciok(D.aktivId(), 'pozicio');
  if (!poz.length) return html`<p class="muted" style="margin:0">Még nincs pozíció. Az Excelben készült pozíciólista (jel, típus, méretek, épület, szint…)
    a Pozíciók oldalon illeszthető be („Beillesztés Excelből”).</p>`;
  const le = poz.filter(p => p.rajzId).length, tip = D.listaErtekek('tipus').length, osz = D.oszlopok('lista');
  return html`<p>${poz.length} pozíció (${D.elemek().length} elem) · ${le} lerakva a rajzokon${tip ? html` · ${tip} különböző típus` : ''}</p>
    ${osz.length ? html`<p class="small muted" style="margin:0">További adatok: ${osz.join(', ')}</p>` : ''}`;
}

/** Termékfajta hozzáadása a projekthez: a műveletsora a cégszintű sablonból (Termékfajták oldal) másolódik, utána szerkeszthető. */
async function ujFajta(list, ctx) {
  const kat = await modal({
    title: 'Termékfajta a projekthez',
    body: html`<p class="muted small" style="margin-top:0">A fajta műveletsora a cégszintű sablonból kerül a projektbe, utána itt módosítható.
      Elem (pl. szúnyogháló egy ablakhoz) az adatlapon, a „+ Elem” gombbal vehető fel, vagy beillesztéssel (Termékfajta oszlop).</p>
      <label class="field"><span>Termékfajta</span><select name="kat">${list.map(k => html`<option value="${k.id}">${k.nev}${k.vezerlo ? ' (vezérlő)' : ''} – ${k.lepesek.map(l => l.nev).join(' → ')}</option>`)}</select></label>`,
    actions: [{ label: 'Mégse', value: null }, { label: 'Hozzáadás', kind: 'primary', onClick: el => formValues(el).kat }],
  }).done;
  if (!kat) return;
  await D.fajtaHozzaad(kat);
  toast('Hozzáadva', 'ok');
  ctx.rerender();
}

/**
 * Lépéssor-szerkesztő (a projekt műveletsora és a cégszintű termékfajta-sablon is ezt használja): sorok (szín, név, súly, sorrend),
 * „+ Lépés”, sablon betöltése (sablonok: termékfajták). Visszaad: { body, mount(el), ertek(el) → [{ id, nev, szin, suly }] }.
 */
export function lepesSzerkeszto(regi, sablonok = []) {
  const row = (l = { id: '', nev: '', szin: '', suly: 0 }) => html`<div class="seq-row" data-id="${l.id}">
    <span class="seq-n"></span>
    <input type="color" name="szin" value="${l.szin || '#2f7fd8'}" aria-label="A lépés színe a jelölőn" title="A jelölő színe, ha ez a legelőrébb tartó kész lépés">
    <input name="lepes" value="${l.nev}" maxlength="60" aria-label="Lépés neve" placeholder="Lépés neve">
    <span class="seq-suly"><input type="number" name="suly" value="${l.suly || ''}" min="0" max="1000" step="1" inputmode="numeric"
      aria-label="A lépés súlya a készültségben" title="A lépés súlya a készültségben (arányszám)" placeholder="–"><small class="seq-pct"></small></span>
    <button type="button" class="icon-btn" data-mv="-1" aria-label="Feljebb">↑</button>
    <button type="button" class="icon-btn" data-mv="1" aria-label="Lejjebb">↓</button>
    <button type="button" class="icon-btn" data-rm aria-label="Lépés törlése">✕</button></div>`;
  const renum = box => {
    const rows = [...box.querySelectorAll('.seq-row')];
    rows.forEach((r, i) => {
      r.querySelector('.seq-n').textContent = i + 1 + '.';
      r.querySelector('[data-mv="-1"]').disabled = i === 0;
      r.querySelector('[data-mv="1"]').disabled = i === rows.length - 1;
    });
    // A súlyok részesedése (a sorok mellett, %-ban); ha egyiknek sincs súlya, egyenlő arányban
    const s = rows.map(r => Math.max(0, Number(r.querySelector('[name=suly]').value) || 0)), ossz = s.reduce((a, b) => a + b, 0);
    rows.forEach((r, i) => { r.querySelector('.seq-pct').textContent = rows.length ? Math.round((ossz ? s[i] / ossz : 1 / rows.length) * 100) + '%' : ''; });
    const info = box.parentElement && box.parentElement.querySelector('#seq-suly-info');
    if (info) info.textContent = ossz ? `A készültségben a súlyok aránya számít (most összesen ${ossz}).` : 'Nincs megadva súly: minden lépés egyenlő arányban számít a készültségben.';
  };
  return {
    body: html`<div class="seq-fej small muted"><span>Lépés</span><span title="A lépés súlya a készültségben">Súly</span></div>
      <div id="seq-rows">${regi.map(l => row(l))}</div>
      <p class="small muted" id="seq-suly-info" style="margin:.5rem 0 0"></p>
      <div class="btn-row" style="margin-top:.75rem">
        <button type="button" class="btn btn-sm" id="seq-add">+ Lépés</button>
        ${sablonok.length ? html`<select id="seq-tpl" class="seq-tpl" aria-label="Sablon betöltése"><option value="">Sablon betöltése…</option>
          ${sablonok.map((s, i) => html`<option value="${i}">${s.nev}: ${s.lepesek.map(l => l.nev).join(' → ')}</option>`)}</select>` : ''}
      </div>`,
    mount(el) {
      const box = el.querySelector('#seq-rows');
      renum(box);
      box.addEventListener('input', e => { if (e.target.name === 'suly') renum(box); });
      el.querySelector('#seq-add').addEventListener('click', () => {
        const n = box.children.length;
        box.insertAdjacentHTML('beforeend', String(row({ id: '', nev: '', szin: D.alapSzin(n, n + 2) })));
        renum(box);
        box.lastElementChild.querySelector('[name=lepes]').focus();
      });
      el.querySelector('#seq-tpl')?.addEventListener('change', e => {
        const t = sablonok[e.target.value];
        e.target.value = '';
        if (!t) return;
        // A meglévő azonos nevű lépések azonosítója megmarad (így a bejegyzéseik is)
        const byName = new Map([...box.querySelectorAll('.seq-row')].map(r => [r.querySelector('[name=lepes]').value.trim(), r.dataset.id]));
        const n = t.lepesek.length;
        box.innerHTML = String(html`${t.lepesek.map((l, i) => row({ id: byName.get(l.nev) || '', nev: l.nev, szin: l.szin || D.alapSzin(i, n), suly: l.suly || 0 }))}`);
        box.querySelector('input').dispatchEvent(new Event('input', { bubbles: true })); // módosítottnak jelöli
        renum(box);
      });
      box.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        const r = b.closest('.seq-row');
        if (b.hasAttribute('data-rm')) r.remove();
        else if (b.dataset.mv === '-1' && r.previousElementSibling) r.after(r.previousElementSibling);
        else if (b.dataset.mv === '1' && r.nextElementSibling) r.before(r.nextElementSibling);
        r.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));
        renum(box);
      });
    },
    ertek: el => [...el.querySelectorAll('.seq-row')]
      .map(r => ({ id: r.dataset.id || uid('l'), nev: r.querySelector('[name=lepes]').value.trim(), szin: r.querySelector('[name=szin]').value,
        suly: Math.max(0, Number(r.querySelector('[name=suly]').value) || 0) }))
      .filter(l => l.nev),
  };
}

/** A projekt műveletsorának szerkesztése egy termékfajtára (kat; alapból a kiválasztott). */
export async function editLepesek(onDone, kat = D.fajta()) {
  const regi = D.lepesek(D.aktivId(), kat), fajtaNev = (D.getKategoria(kat) || {}).nev || '';
  const sz = lepesSzerkeszto(regi, D.aktivKategoriak().filter(k => k.lepesek.length));
  const mentve = await modal({
    title: fajtaNev ? `Műveletsor – ${fajtaNev}` : 'Műveletsor',
    body: html`<p class="muted small">A projekt ${fajtaNev ? fajtaNev.toLowerCase() + ' ' : ''}elemeinek állapota ezekből a lépésekből áll, ebben a sorrendben. A jelölő a legelőrébb tartó kész lépés
      színét veszi fel (amíg egy sincs kész: szürke). Átnevezéskor a korábbi bejegyzések megmaradnak.</p>${sz.body}`,
    onMount: sz.mount,
    actions: [{ label: 'Mégse', value: null }, { label: 'Mentés', kind: 'primary', onClick: async el => {
      const list = sz.ertek(el);
      if (!list.length) { toast('Legalább egy lépés kell', 'warn'); return false; }
      const kept = new Set(list.map(l => l.id));
      const lost = regi.filter(l => !kept.has(l.id) && D.lepesHasznalt(l.id));
      if (lost.length && !await confirmDialog('Lépés törlése',
        `A(z) ${lost.map(l => '„' + l.nev + '”').join(', ')} lépéshez már van bejegyzés. A bejegyzések a naplóban megmaradnak, de a jelölőkön nem számítanak.`, 'Mentés', 'danger')) return false;
      await D.setLepesek(list, D.aktivId(), kat);
    } }],
  }).done;
  if (mentve) await ajanlPotlas(kat);
  if (onDone) onDone();
}

/**
 * Hézagok pótlása: ha egy pozíción egy későbbi lépés kész, de egy korábbi nem (pl. új lépést szúrtak be elé, vagy átrendezték
 * a sort), felajánlja a hiányzó lépések késznek jelölését. A bejegyzés a későbbi lépés idejével, „Pótlás” megjegyzéssel kerül a naplóba.
 */
export async function ajanlPotlas(kat = D.fajta()) {
  const h = D.hezagok(D.aktivId(), kat);
  if (!h.length) return;
  const nevek = [...new Set(h.flatMap(x => x.hianyzo.map(l => l.nev)))];
  const n = h.reduce((s, x) => s + x.hianyzo.length, 0);
  if (!await confirmDialog('Hiányzó lépések pótlása',
    `${h.length} elemnél egy későbbi lépés már kész, de a(z) ${nevek.map(x => '„' + x + '”').join(', ')} lépés nincs rögzítve. ` +
    `Jelöljem késznek ezeket (${n} bejegyzés)? A naplóban „Pótlás” megjegyzéssel, a későbbi lépés idejével jelennek meg.`, 'Pótlás')) return;
  try { await D.potolHezagok(h); toast(`${n} lépés pótolva`, 'ok'); } catch (e) { toast(e.message, 'error', 8000); }
}

export default { render };
