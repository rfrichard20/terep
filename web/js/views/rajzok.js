// Rajzok oldal (projekten belül): épület szerint csoportosítva, szint (homlokzat) szerint rendezve, rajzonként állapotsávval.
// PDF megnyitása / mintarajz; a rajz adatai (név, épület, szint, homlokzat) feltöltés után és a ceruza gombbal adhatók meg.
// Az épület/szint/homlokzat mezők a pozíciólista értékeit kínálják (egységes jelölés → lerakáskor csak az ott lévő pozíciók).
// Homlokzati rajz: a homlokzat megadva (a szint általában üres) – lerakáskor az épület és a homlokzat szerinti pozíciók.
import { html, raw, modal, confirmDialog, toast, fmtNum, fmtDate, formValues, suggestInput, folyamat, fmtMB } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { openPdf } from '../viewer.js';
import { pageHead, natCompare } from './common.js';

function render(view, params, ctx) {
  // Épületen belül előbb az alaprajzok (szint szerint), utána a homlokzati rajzok
  const list = D.rajzok().slice().sort((a, b) => natCompare(a.epulet, b.epulet) || (!!a.homlokzat - !!b.homlokzat)
    || natCompare(a.szint, b.szint) || natCompare(a.homlokzat, b.homlokzat) || natCompare(a.nev, b.nev));
  const vanHely = list.some(r => r.epulet);
  // Csoportok épületenként (ha egyik rajzon sincs épület, egy csoport cím nélkül)
  const csoportok = [];
  for (const r of list) {
    const k = vanHely ? r.epulet || '' : null;
    let g = csoportok.find(x => x.k === k);
    if (!g) csoportok.push(g = { k, rajzok: [] });
    g.rajzok.push(r);
  }
  const iroda = D.jog('iroda');
  const all = allapot();
  // Alapból (amíg a felhasználó nem váltott): egy épületnél nyitva; többnél csak az utoljára megnyitott rajz épülete
  const nyitva = k => (all.nyitva ? all.nyitva.includes(k) : csoportok.length === 1 || k === all.utolso);
  view.innerHTML = String(html`
    ${pageHead('Rajzok', iroda ? html`
      <label class="btn btn-primary" title="Egy vagy több PDF (több fájl egyszerre is kijelölhető)">${ICONS.upload}PDF feltöltése…<input type="file" id="file" accept="application/pdf,.pdf" multiple hidden></label>
      <button class="btn" id="minta">Mintarajz</button>` : '')}
    ${csoportok.length > 1 ? html`<p class="csop-gombok"><button type="button" class="link-btn" data-csop="nyit">Mind kinyit</button> · <button type="button" class="link-btn" data-csop="zar">Mind összecsuk</button></p>` : ''}
    ${list.length ? csoportok.map(g => (g.k === null
      ? html`<section class="card"><ul class="list">${g.rajzok.map(r => sor(r, ctx, iroda))}</ul></section>`
      : csoport(g, nyitva(g.k), ctx, iroda)))
      : html`<section class="card"><p class="empty">Ebben a projektben még nincs rajz.${iroda ? ' Nyiss meg egy egyoldalas PDF-et a készülékről, vagy próbáld ki a mintarajzot.' : ''}</p></section>`}
    <p class="small muted page-note">${D.helyi ? 'Helyi mód: minden adat (a rajzok is) csak ezen a készüléken, a böngészőben tárolódik.'
      : 'A rajzok a szerverről töltődnek le, és a készüléken is megmaradnak (internet nélkül is megnyithatók). Új rajz feltöltéséhez internet kell.'}</p>`);

  view.addEventListener('click', e => {
    const sum = e.target.closest('summary.csop-fej');
    if (sum) { // a kattintás a váltás előtt fut: a mostani állapot ellentettje az új
      const d = sum.parentElement, ny = new Set([...view.querySelectorAll('details.csop[open]')].map(x => x.dataset.k));
      if (d.open) ny.delete(d.dataset.k); else ny.add(d.dataset.k);
      ment({ ...all, nyitva: [...ny] });
      return;
    }
    const g = e.target.closest('[data-csop]');
    if (!g) return;
    const nyit = g.dataset.csop === 'nyit';
    view.querySelectorAll('details.csop').forEach(d => { d.open = nyit; });
    ment({ ...all, nyitva: nyit ? [...view.querySelectorAll('details.csop')].map(d => d.dataset.k) : [] });
  });
  view.querySelector('#file')?.addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) importFiles(fs, ctx); });
  view.querySelector('#minta')?.addEventListener('click', () => importMinta(ctx));
  view.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', async () => {
    const r = D.getRajz(b.dataset.edit);
    const res = await rajzAdatai(r, 'Rajz adatai', { csere: true });
    if (res && res.kivagas) { ctx.pgo(`rajz/${r.id}?kivagas=1`); return; }
    if (res && res.csere) await rajzCsere(r, res.csere);
    if (res) ctx.rerender();
  }));
  view.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    const r = D.getRajz(b.dataset.del), n = D.rajzPoziciok(r.id).length;
    // A PDF-jét más rajzok is használják (kivágások): előbb azok törlendők
    const masok = D.kozosPdf(r.id).filter(x => x.forras === r.id);
    if (masok.length) { toast(`Ennek a rajznak a PDF-jét más rajzok is használják (${masok.map(x => x.nev).join(', ')}) – előbb azokat töröld.`, 'warn', 8000); return; }
    const ok = await confirmDialog('Rajz törlése', `A(z) „${r.nev}” rajz törlődik. A rajta lévő ${n} jelölés lekerül: a pozíciók megmaradnak („Nincs lerakva”), a terepi felmérés- és hibajelölések törlődnek. A napló megmarad.`, 'Törlés', 'danger');
    if (!ok) return;
    await D.delRajz(r.id);
    ctx.rerender();
  }));
}

/**
 * A PDF adatai: az eredeti fájlnév (a megnevezés szabadon átírható, így ebből látszik, melyik fájl), méret, verzió – közös
 * PDF-nél (másolat) a forrás rajz neve. A régebben feltöltött rajzoknál a fájlnév nem ismert.
 */
function pdfInfo(r) {
  const f = r.forras ? D.getRajz(r.forras) : r;
  if (!f) return '';
  const v = (f.verzio || 1) > 1 ? `${f.verzio}. verzió (${fmtDate(f.csere)})` : '';
  return [f.fajlnev, r.forras ? `közös PDF: „${f.nev}”` : `${fmtNum(Math.round(f.meret / 1024))} KB`, v].filter(Boolean).join(' · ');
}
/** Másolat jelölése a név előtt (ugyanabból a PDF-ből készült rajz). */
const masolatIkon = r => (r.forras ? html`<span class="ico-inline masolat-ikon" title="Másolat – a PDF-je közös a(z) „${(D.getRajz(r.forras) || {}).nev || ''}” rajzzal"
  aria-label="Másolat">${ICONS.copy}</span> ` : '');
/** Egy rajz pozíciói, állapotszámai a kiválasztott termékfajta szerint (helyenként a legkevésbé kész elem) és hibái. */
function rajzAdat(r) {
  const poz = D.rajzPoziciok(r.id), kat = D.fajta();
  const cnt = new Map();
  let hiba = 0;
  for (const p of poz) {
    const k = D.helyKulcs(p.id, kat);
    if (k !== null) cnt.set(k, (cnt.get(k) || 0) + 1);
    if (D.helyHiba(p.id)) hiba++;
  }
  return { poz, cnt, hiba };
}
/** Állapotsáv (lépésszínekkel) az állapotszámokból. */
function allapotSav(cnt) {
  const seg = (n, szin, cim) => (n ? html`<span style="flex:${n};background:${szin}" title="${cim}: ${n}"></span>` : '');
  return html`<span class="proj-bar mini" aria-hidden="true">${D.lepesek().slice().reverse().map(l => seg(cnt.get(l.id) || 0, l.szin, l.nev))}${seg(cnt.get('') || 0, D.SZIN_NINCS, 'Nincs elkezdve')}</span>`;
}
/** Épület csoportja: összecsukható; a fejlécen a rajzok száma, összesített állapotsáv és hibaszám. */
function csoport(g, nyitva, ctx, iroda) {
  const ossz = new Map();
  let poz = 0, hiba = 0;
  for (const r of g.rajzok) {
    const a = rajzAdat(r);
    poz += a.poz.length; hiba += a.hiba;
    for (const [k, n] of a.cnt) ossz.set(k, (ossz.get(k) || 0) + n);
  }
  return html`<details class="card csop" data-k="${g.k}" ${nyitva ? raw('open') : ''}>
    <summary class="card-head csop-fej"><span class="csop-nyil" aria-hidden="true"></span>
      <div class="grow csop-cim"><h2>${g.k ? `${g.k} épület` : 'Épület megadása nélkül'}</h2>${poz ? allapotSav(ossz) : ''}</div>
      <span class="small muted csop-szam">${g.rajzok.length} rajz${hiba ? html` · <span class="t-err">${hiba} hiba</span>` : ''}</span></summary>
    <ul class="list">${g.rajzok.map(r => sor(r, ctx, iroda))}</ul>
  </details>`;
}
/** Összecsukott / nyitott épületek projektenként (localStorage terep_rajzok): { nyitva: [épület…] (ha a felhasználó váltott), utolso: épület }. */
const CSOP_KEY = 'terep_rajzok';
function allapot() {
  try { return (JSON.parse(localStorage.getItem(CSOP_KEY)) || {})[D.aktivId()] || {}; } catch { return {}; }
}
function ment(a) {
  try { const o = JSON.parse(localStorage.getItem(CSOP_KEY)) || {}; o[D.aktivId()] = a; localStorage.setItem(CSOP_KEY, JSON.stringify(o)); } catch { /* */ }
}
/** A rajz oldal hívja megnyitáskor: ez az épület lesz a „legutóbb nyitott” (és nyitva marad a listán). */
export function epuletMegnyitva(epulet) {
  const a = allapot(), k = epulet || '';
  a.utolso = k;
  if (a.nyitva && !a.nyitva.includes(k)) a.nyitva = [...a.nyitva, k];
  ment(a);
}

/** Egy rajz sora: név, hely, pozíciószám, állapotsáv (lépésszínekkel), szerkesztés, törlés. */
function sor(r, ctx, iroda) {
  const { poz, cnt, hiba } = rajzAdat(r);
  return html`<li class="list-item">
    <a class="list-main" href="${ctx.purl('rajz/' + r.id)}">
      <b class="d-block ellipsis">${D.rajzHely(r) ? html`<span class="hely-chip">${D.rajzHely(r)}</span>` : ''}${masolatIkon(r)}${r.nev}</b>
      <span class="sub">${poz.length} pozíció${hiba ? html` · <span class="t-err">${hiba} hiba</span>` : ''}${r.kivagas ? ' · kivágás' : ''}</span>
      <span class="sub ellipsis d-block" title="A feltöltött PDF">${pdfInfo(r)}</span>
        ${poz.length ? allapotSav(cnt) : ''}
    </a>
    <a class="icon-btn" href="${ctx.purl('poziciok?rajz=' + r.id)}" aria-label="A rajz pozíciói" title="A rajz pozíciói (lista)">${ICONS.list}</a>
    ${iroda ? html`<button class="icon-btn" data-edit="${r.id}" aria-label="Rajz adatai" title="Név, épület, szint, homlokzat">${ICONS.edit}</button>
    <button class="icon-btn" data-del="${r.id}" aria-label="Rajz törlése" title="Rajz törlése">${ICONS.trash}</button>` : ''}
  </li>`;
}

/**
 * A rajz adatai: név, épület, szint (szöveg, pl. „1B”), homlokzat (homlokzati rajznál). A mezők a pozíciólista értékeit kínálják.
 * csere: true esetén „PDF cseréje…” gomb is van (új revízió). Visszaad: true, ha mentett; { csere: File }, ha cserét kért.
 */
export async function rajzAdatai(r, cim = 'Rajz adatai', { csere = false } = {}) {
  const vanL = D.RAJZ_HELY.some(m => D.vanOszlop(m));
  let csereFajl = null;
  const res = await modal({
    title: cim,
    body: html`<div class="form-col">
      ${pdfInfo(r) ? html`<p class="small muted" style="margin:0">${masolatIkon(r)}PDF: ${pdfInfo(r)}</p>` : ''}
      <label class="field"><span>Megnevezés</span><input name="nev" value="${r.nev}" maxlength="120" autocomplete="off"></label>
      <div class="form-grid">
        <label class="field"><span>Épület</span>${suggestInput('epulet', r.epulet, D.listaErtekek('epulet').sort(natCompare), 'pl. A')}</label>
        <label class="field"><span>Szint</span>${suggestInput('szint', r.szint, D.listaErtekek('szint').sort(natCompare), 'pl. 1, 1A, fsz.')}</label>
        <label class="field"><span>Homlokzat</span>${suggestInput('homlokzat', r.homlokzat, D.listaErtekek('homlokzat').sort(natCompare), 'pl. Észak, D')}</label>
      </div>
      <p class="small muted" style="margin:0">${vanL
        ? 'A javaslatok a pozíciólistából jönnek. Ha az épület, a szint és a homlokzat egyezik a lista jelölésével, lerakáskor csak az itt lévő pozíciókat kínálja fel.'
        : 'Ha a pozíciólistában is van épület, szint vagy homlokzat oszlop, lerakáskor csak az itt lévő pozíciókat kínálja fel.'}
        Homlokzati rajznál a szintet hagyd üresen: így minden szint pozícióit felkínálja az adott homlokzatról.</p>
      <section class="fsec" style="margin-top:.5rem"><div class="fsec-title">Kivágás</div>
        <p class="small muted" style="margin:0 0 .5rem">${r.kivagas ? 'A rajznak csak egy része látszik.' : 'A teljes rajz látszik.'}
          Nagy rajznál kijelölhető a lényeges rész (gyorsabb is), vagy egy másik része új rajzként (pl. két torony egy rajzon).</p>
        <button type="button" class="btn btn-sm" id="kivagas-btn">${ICONS.crop}Kivágás…</button></section>
      ${csere ? html`<section class="fsec" style="margin-top:.5rem"><div class="fsec-title">Rajz frissítése (új revízió)</div>
        <p class="small muted" style="margin:0 0 .5rem">A jelölők a helyükön maradnak. Ha az új rajz mérete vagy aránya eltér, előtte figyelmeztet.
          ${D.kozosPdf(r.id).length > 1 ? `A PDF közös ezekkel a rajzokkal, a csere mindegyikre érvényes: ${D.kozosPdf(r.id).filter(x => x.id !== r.id).map(x => x.nev).join(', ')}.` : ''}</p>
        <label class="btn btn-sm">${ICONS.upload}PDF cseréje…<input type="file" id="csere-file" accept="application/pdf,.pdf" hidden></label></section>` : ''}
    </div>`,
    onMount(el, close) {
      el.querySelector('#csere-file')?.addEventListener('change', e => { csereFajl = e.target.files[0]; if (csereFajl) close('csere'); });
      el.querySelector('#kivagas-btn').addEventListener('click', () => close('kivagas'));
    },
    actions: [{ label: 'Mégse', value: null }, { label: 'Mentés', kind: 'primary', onClick: async el => {
      const v = formValues(el);
      if (!v.nev.trim()) { toast('Add meg a rajz megnevezését', 'warn'); return false; }
      await D.updateRajz(r.id, { nev: v.nev.trim(), epulet: v.epulet.trim(), szint: v.szint.trim(), homlokzat: v.homlokzat.trim() });
    } }],
  }).done;
  if (res === 'csere') return { csere: csereFajl };
  if (res === 'kivagas') return { kivagas: true };
  return !!res;
}

/** Oldalméret pontban → „420 × 297 mm”. */
const mm = (W, H) => `${Math.round(W * 25.4 / 72)} × ${Math.round(H * 25.4 / 72)} mm`;

/**
 * Rajzcsere: az új PDF oldalméretét összeveti a régivel. Azonos → csere (a jelölők a helyükön); csak a méretarány egyezik →
 * a jelölők arányosan a helyükön maradnak, de ellenőrizni kell; eltérő arány → a jelölők elcsúszhatnak, át kell helyezni őket.
 */
async function rajzCsere(r, f) {
  const bytes = await f.arrayBuffer();
  if (!pdfE(bytes)) { toast('Ez nem PDF fájl', 'error'); return; }
  if (r.forras) r = D.getRajz(r.forras) || r; // közös PDF: a forrás mérete / verziója számít
  let uj, regi = { W: r.W, H: r.H };
  try {
    const d = await openPdf(bytes); uj = { W: d.W, H: d.H, pages: d.pages }; d.destroy();
    if (!regi.W) { const d2 = await openPdf(await D.getPdf(r.id)); regi = { W: d2.W, H: d2.H }; d2.destroy(); }
  } catch (e) { console.error(e); toast('A PDF nem nyitható meg', 'error'); return; }
  const n = D.rajzPoziciok(r.id).length;
  const kozel = (a, b) => Math.abs(a / b - 1) < 0.005;
  const azonos = kozel(uj.W, regi.W) && kozel(uj.H, regi.H);
  const arany = kozel(uj.W / uj.H, regi.W / regi.H);
  const meretek = `Régi: ${mm(regi.W, regi.H)} · új: ${mm(uj.W, uj.H)}.`;
  const szoveg = azonos ? `Az új rajz mérete azonos (${mm(uj.W, uj.H)}). A rajzon lévő ${n} jelölő a helyén marad.`
    : arany ? `Az új rajz mérete eltér, de az aránya azonos. ${meretek} A rajzon lévő ${n} jelölő arányosan a helyén marad – ellenőrizd, és ha kell, igazítsd (Szerkesztés mód, húzással).`
      : `Az új rajz mérete és aránya is eltér. ${meretek} A rajzon lévő ${n} jelölő elcsúszhat: a csere után át kell helyezni őket (Szerkesztés mód, húzással).`;
  if (!await confirmDialog(`Rajz cseréje – ${r.nev}`, szoveg + (uj.pages > 1 ? ` (A PDF ${uj.pages} oldalas, csak az első oldal kerül be.)` : ''),
    azonos ? 'Csere' : 'Csere mégis', azonos ? 'primary' : 'danger')) return;
  const fo = folyamat('Rajz cseréje');
  fo.set(D.helyi ? 'Mentés…' : `Feltöltés a szerverre (${fmtMB(bytes.byteLength)})…`);
  try { await D.csereRajz(r.id, bytes, { W: uj.W, H: uj.H, fajlnev: f.name }); } catch (e) { fo.close(); toast(e.message, 'error', 8000); return; }
  fo.close();
  toast(`A rajz cserélve (${D.getRajz(r.id).verzio}. verzió)`, 'ok');
}

const pdfE = bytes => /^%PDF-/.test(new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 5))));

/**
 * Rajzok feltöltése (egy vagy több fájl): egymás után, folyamatjelzővel. Egy rajznál utána az adatai (épület, szint) és a rajz
 * megnyílik; többnél egy közös táblázatban adhatók meg az adatok. A hibás fájlok kimaradnak (a végén összesítve).
 * fajlok: [{ nev, fajl (eredeti fájlnév), bytes() → Promise<ArrayBuffer> }]
 */
async function feltoltes(fajlok, ctx) {
  const fo = folyamat(fajlok.length > 1 ? `${fajlok.length} rajz feltöltése` : 'Rajz feltöltése');
  const kesz = [], hibak = [], tobbOldalas = [];
  for (let i = 0; i < fajlok.length; i++) {
    const f = fajlok[i], elo = fajlok.length > 1 ? `${i + 1} / ${fajlok.length}: ${f.nev}` : f.nev;
    try {
      fo.set(`${elo} – beolvasás…`, i / fajlok.length);
      const bytes = await f.bytes();
      if (!pdfE(bytes)) throw new Error('nem PDF fájl');
      let doc;
      try { doc = await openPdf(bytes); } catch { throw new Error('a PDF nem nyitható meg'); }
      const meret = { W: doc.W, H: doc.H }; // a későbbi rajzcseréhez (méret-összevetés)
      if (doc.pages > 1) tobbOldalas.push(f.nev);
      doc.destroy();
      fo.set(D.helyi ? `${elo} – mentés…` : `${elo} – feltöltés a szerverre (${fmtMB(bytes.byteLength)})…`, (i + 0.3) / fajlok.length);
      kesz.push(await D.addRajz(f.nev, bytes, { ...meret, fajlnev: f.fajl }));
    } catch (e) {
      hibak.push(`${f.nev}: ${e.message}`);
      if (e.network) break; // nincs kapcsolat: a többit sem érdemes próbálni
    }
  }
  fo.close();
  if (hibak.length) toast(`Nem sikerült (${hibak.length}): ${hibak.join(' · ')}`, 'error', 10000);
  if (tobbOldalas.length) toast(`Többoldalas PDF – csak az első oldal jelenik meg: ${tobbOldalas.join(', ')}`, 'warn', 8000);
  if (!kesz.length) return;
  if (kesz.length === 1) {
    const res = await rajzAdatai(kesz[0], 'Új rajz – adatok'); // Mégse esetén is megmarad, később pótolható
    ctx.pgo('rajz/' + kesz[0].id + (res && res.kivagas ? '?kivagas=1' : ''));
    return;
  }
  toast(`${kesz.length} rajz feltöltve`, 'ok');
  await rajzokAdatai(kesz.map(r => r.id));
  ctx.rerender();
}

/** Több rajz adatai egy táblázatban (tömeges feltöltés után): megnevezés, épület, szint, homlokzat. */
async function rajzokAdatai(ids) {
  const ep = D.listaErtekek('epulet').sort(natCompare), sz = D.listaErtekek('szint').sort(natCompare), hz = D.listaErtekek('homlokzat').sort(natCompare);
  await modal({
    title: `Új rajzok – adatok (${ids.length})`,
    wide: true,
    body: html`<p class="small muted" style="margin-top:0">Az épület, a szint és a homlokzat később is megadható (ceruza gomb). Ha egyezik a pozíciólista
      jelölésével, lerakáskor csak az ott lévő pozíciókat kínálja fel. Homlokzati rajznál a homlokzatot add meg (a szint maradhat üresen).</p>
      <div class="table-wrap"><table class="tbl rajz-adatok"><thead><tr><th>Megnevezés</th><th>Épület</th><th>Szint</th><th>Homlokzat</th></tr></thead>
      <tbody>${ids.map(id => { const r = D.getRajz(id); return html`<tr data-id="${id}">
        <td><input data-k="nev" value="${r.nev}" maxlength="120" aria-label="Megnevezés" autocomplete="off"></td>
        <td>${suggestInput('epulet-' + id, r.epulet, ep, 'pl. A')}</td>
        <td>${suggestInput('szint-' + id, r.szint, sz, 'pl. 1A')}</td>
        <td>${suggestInput('homlokzat-' + id, r.homlokzat, hz, 'pl. Észak')}</td></tr>`; })}</tbody></table></div>`,
    actions: [{ label: 'Később', value: null }, { label: 'Mentés', kind: 'primary', onClick: async el => {
      for (const tr of el.querySelectorAll('tr[data-id]')) {
        const id = tr.dataset.id, r = D.getRajz(id), ert = k => tr.querySelector(`[name="${k}-${id}"]`).value.trim();
        const v = { nev: tr.querySelector('[data-k=nev]').value.trim() || r.nev, epulet: ert('epulet'), szint: ert('szint'), homlokzat: ert('homlokzat') };
        if (v.nev !== r.nev || v.epulet !== r.epulet || v.szint !== r.szint || v.homlokzat !== r.homlokzat) await D.updateRajz(id, v);
      }
      toast('Mentve', 'ok');
    } }],
  }).done;
}

// fajl: az eredeti fájlnév (a rajz adatainál és a listán látszik – a megnevezés szabadon átírható)
const importFiles = (files, ctx) => feltoltes([...files].map(f => ({ nev: f.name.replace(/\.pdf$/i, ''), fajl: f.name, bytes: () => f.arrayBuffer() })), ctx);
async function importMinta(ctx) {
  await feltoltes([{ nev: 'Mintarajz – 2. emelet (szintetikus)', fajl: 'minta_alaprajz.pdf', bytes: async () => {
    const res = await fetch('minta/minta_alaprajz.pdf');
    if (!res.ok) throw new Error('a mintarajz nem tölthető be');
    return res.arrayBuffer();
  } }], ctx);
}
export default { render };
