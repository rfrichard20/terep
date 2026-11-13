// Rajzok oldal (projekten belül): épület szerint csoportosítva, szint szerint rendezve, rajzonként állapotsávval.
// PDF megnyitása / mintarajz; a rajz adatai (név, épület, szint) feltöltés után és a ceruza gombbal adhatók meg.
// Az épület/szint mezők a pozíciólista értékeit kínálják (egységes jelölés → lerakáskor csak az ott lévő pozíciók).
import { html, modal, confirmDialog, toast, fmtNum, fmtDate, formValues, suggestInput } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { openPdf } from '../viewer.js';
import { pageHead, natCompare } from './common.js';

function render(view, params, ctx) {
  const list = D.rajzok().slice().sort((a, b) => natCompare(a.epulet, b.epulet) || natCompare(a.szint, b.szint) || natCompare(a.nev, b.nev));
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
  view.innerHTML = String(html`
    ${pageHead('Rajzok', iroda ? html`
      <label class="btn btn-primary">${ICONS.upload}PDF megnyitása…<input type="file" id="file" accept="application/pdf,.pdf" hidden></label>
      <button class="btn" id="minta">Mintarajz</button>` : '')}
    ${list.length ? csoportok.map(g => html`<section class="card">
        ${g.k !== null ? html`<div class="card-head"><h2>${g.k ? `${g.k} épület` : 'Épület megadása nélkül'}</h2></div>` : ''}
        <ul class="list">${g.rajzok.map(r => sor(r, ctx, iroda))}</ul>
      </section>`)
      : html`<section class="card"><p class="empty">Ebben a projektben még nincs rajz.${iroda ? ' Nyiss meg egy egyoldalas PDF-et a készülékről, vagy próbáld ki a mintarajzot.' : ''}</p></section>`}
    <p class="small muted page-note">${D.helyi ? 'Helyi mód: minden adat (a rajzok is) csak ezen a készüléken, a böngészőben tárolódik.'
      : 'A rajzok a szerverről töltődnek le, és a készüléken is megmaradnak (internet nélkül is megnyithatók). Új rajz feltöltéséhez internet kell.'}</p>`);

  view.querySelector('#file')?.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f, ctx); });
  view.querySelector('#minta')?.addEventListener('click', () => importMinta(ctx));
  view.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', async () => {
    const r = D.getRajz(b.dataset.edit);
    const res = await rajzAdatai(r, 'Rajz adatai', { csere: true });
    if (res && res.csere) await rajzCsere(r, res.csere);
    if (res) ctx.rerender();
  }));
  view.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    const r = D.getRajz(b.dataset.del), n = D.rajzPoziciok(r.id).length;
    const ok = await confirmDialog('Rajz törlése', `A(z) „${r.nev}” rajz törlődik. A rajta lévő ${n} jelölés lekerül: a pozíciók megmaradnak („Nincs lerakva”), a terepi felmérés- és hibajelölések törlődnek. A napló megmarad.`, 'Törlés', 'danger');
    if (!ok) return;
    await D.delRajz(r.id);
    ctx.rerender();
  }));
}

/** Egy rajz sora: név, hely, pozíciószám, állapotsáv (lépésszínekkel), szerkesztés, törlés. */
function sor(r, ctx, iroda) {
  const poz = D.rajzPoziciok(r.id), lep = D.lepesek();
  const cnt = new Map();
  let hiba = 0;
  for (const p of poz) { const a = D.allapot(p.id); const k = a.lepes ? a.lepes.id : ''; cnt.set(k, (cnt.get(k) || 0) + 1); if (a.hiba) hiba++; }
  const seg = (n, szin, cim) => (n ? html`<span style="flex:${n};background:${szin}" title="${cim}: ${n}"></span>` : '');
  return html`<li class="list-item">
    <a class="list-main" href="${ctx.purl('rajz/' + r.id)}">
      <b class="d-block ellipsis">${D.helySzoveg(r.epulet, r.szint) ? html`<span class="hely-chip">${D.helySzoveg(r.epulet, r.szint)}</span>` : ''}${r.nev}</b>
      <span class="sub">${poz.length} pozíció${hiba ? html` · <span class="t-err">${hiba} hiba</span>` : ''} · ${fmtNum(Math.round(r.meret / 1024))} KB${(r.verzio || 1) > 1 ? ` · ${r.verzio}. verzió (${fmtDate(r.csere)})` : ''}</span>
      ${poz.length ? html`<span class="proj-bar mini" aria-hidden="true">${lep.slice().reverse().map(l => seg(cnt.get(l.id) || 0, l.szin, l.nev))}${seg(cnt.get('') || 0, D.SZIN_NINCS, 'Nincs elkezdve')}</span>` : ''}
    </a>
    <a class="icon-btn" href="${ctx.purl('poziciok?rajz=' + r.id)}" aria-label="A rajz pozíciói" title="A rajz pozíciói (lista)">${ICONS.list}</a>
    ${iroda ? html`<button class="icon-btn" data-edit="${r.id}" aria-label="Rajz adatai" title="Név, épület, szint">${ICONS.edit}</button>
    <button class="icon-btn" data-del="${r.id}" aria-label="Rajz törlése" title="Rajz törlése">${ICONS.trash}</button>` : ''}
  </li>`;
}

/**
 * A rajz adatai: név, épület, szint (szöveg, pl. „1B”). Az épület/szint mezők a pozíciólista értékeit kínálják.
 * csere: true esetén „PDF cseréje…” gomb is van (új revízió). Visszaad: true, ha mentett; { csere: File }, ha cserét kért.
 */
export async function rajzAdatai(r, cim = 'Rajz adatai', { csere = false } = {}) {
  const vanL = D.vanOszlop('epulet') || D.vanOszlop('szint');
  let csereFajl = null;
  const res = await modal({
    title: cim,
    body: html`<div class="form-col">
      <label class="field"><span>Megnevezés</span><input name="nev" value="${r.nev}" maxlength="120" autocomplete="off"></label>
      <div class="form-grid">
        <label class="field"><span>Épület</span>${suggestInput('epulet', r.epulet, D.listaErtekek('epulet').sort(natCompare), 'pl. A')}</label>
        <label class="field"><span>Szint</span>${suggestInput('szint', r.szint, D.listaErtekek('szint').sort(natCompare), 'pl. 1, 1A, fsz.')}</label>
      </div>
      <p class="small muted" style="margin:0">${vanL
        ? 'A javaslatok a pozíciólistából jönnek. Ha az épület és a szint egyezik a lista jelölésével, lerakáskor csak az itt lévő pozíciókat kínálja fel.'
        : 'Ha a pozíciólistában is van épület és szint oszlop, lerakáskor csak az itt lévő pozíciókat kínálja fel.'}</p>
      ${csere ? html`<section class="fsec" style="margin-top:.5rem"><div class="fsec-title">Rajz frissítése (új revízió)</div>
        <p class="small muted" style="margin:0 0 .5rem">A jelölők a helyükön maradnak. Ha az új rajz mérete vagy aránya eltér, előtte figyelmeztet.</p>
        <label class="btn btn-sm">${ICONS.upload}PDF cseréje…<input type="file" id="csere-file" accept="application/pdf,.pdf" hidden></label></section>` : ''}
    </div>`,
    onMount(el, close) {
      el.querySelector('#csere-file')?.addEventListener('change', e => { csereFajl = e.target.files[0]; if (csereFajl) close('csere'); });
    },
    actions: [{ label: 'Mégse', value: null }, { label: 'Mentés', kind: 'primary', onClick: async el => {
      const v = formValues(el);
      if (!v.nev.trim()) { toast('Add meg a rajz megnevezését', 'warn'); return false; }
      await D.updateRajz(r.id, { nev: v.nev.trim(), epulet: v.epulet.trim(), szint: v.szint.trim() });
    } }],
  }).done;
  if (res === 'csere') return { csere: csereFajl };
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
  if (!/^%PDF-/.test(new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 5))))) { toast('Ez nem PDF fájl', 'error'); return; }
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
  if (!D.helyi) toast('Feltöltés a szerverre…');
  try { await D.csereRajz(r.id, bytes, { W: uj.W, H: uj.H }); } catch (e) { toast(e.message, 'error', 8000); return; }
  toast(`A rajz cserélve (${D.getRajz(r.id).verzio}. verzió)`, 'ok');
}

async function importBytes(nev, bytes, ctx) {
  if (!/^%PDF-/.test(new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 5))))) {
    toast('Ez nem PDF fájl', 'error'); return;
  }
  let doc;
  try { doc = await openPdf(bytes); } catch (e) { console.error(e); toast('A PDF nem nyitható meg', 'error'); return; }
  if (doc.pages > 1) toast(`A PDF ${doc.pages} oldalas – csak az első oldal jelenik meg`, 'warn', 6000);
  const meret = { W: doc.W, H: doc.H }; // a későbbi rajzcseréhez (méret-összevetés)
  doc.destroy();
  if (!D.helyi) toast('Feltöltés a szerverre…');
  let r;
  try { r = await D.addRajz(nev, bytes, meret); } catch (e) { toast(e.message, 'error', 8000); return; }
  await rajzAdatai(r, 'Új rajz – adatok'); // Mégse esetén is megmarad, később pótolható
  ctx.pgo('rajz/' + r.id);
}
async function importFile(f, ctx) {
  toast('Rajz betöltése…');
  await importBytes(f.name.replace(/\.pdf$/i, ''), await f.arrayBuffer(), ctx);
}
async function importMinta(ctx) {
  const res = await fetch('minta/minta_alaprajz.pdf');
  if (!res.ok) { toast('A mintarajz nem tölthető be', 'error'); return; }
  await importBytes('Mintarajz – 2. emelet (szintetikus)', await res.arrayBuffer(), ctx);
}
export default { render };
