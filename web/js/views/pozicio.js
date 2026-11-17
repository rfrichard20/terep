// Pozíció adatlapja – a Raktár tétel-adatlapjának (showItemDetail) felépítésével:
//   fejrész: bal oldalt a kiemelt érték (egyelemes helynél a típus, állapotszínű csíkkal; több elemnél a pozíció jele),
//   jobb oldalt adatlista; műveletgombok (Szerkesztés, + Elem, Megnyitás a rajzon, Levétel a rajzról);
//   szakaszok: Lépések (elemenként – több elemnél elemkártyánként), Megjegyzés, Napló.
// v2: a pozíció a HELY (hiba, megjegyzés, napló), a lépések az ELEMEKÉ (data.js). Egyelemes helynél a megjelenés a régi.
// A felmérés- és hibajelölésnek (fajta) nincs eleme, csak adatai, megjegyzése és naplója.
import { html, raw, modal, confirmDialog, toast, fmtDate, folyamat } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { markerSvg } from '../marker.js';
import { kepKeszit, elonezetek, fotoSor, fotoNezo } from '../foto.js';
import { ensureNev, meretSzoveg } from './common.js';
import { editPoz, editElem } from './tablak.js';
import { kozosSzerkeszto } from './kozos.js';

export const EV_TEXT = { kesz: 'kész', visszavon: 'visszavonva', hiba: 'Hiba jelezve', hiba_vege: 'Hiba megszűnt', megj: 'Megjegyzés' };
/** A pozíció megjelenített neve (a felmérés / hibajelölésnek nem kötelező a jel). */
export const pozNev = p => p.jel || D.FAJTAK[p.fajta] || 'Pozíció';
/**
 * Bejegyzés előtagja a naplóban / listákban: az elem neve, ha a helyen több elem van („SZ1 szúnyogháló – ”), vagy ha a bejegyzés
 * egy másik pozícióról kapcsolt közös elemé (pozId: a megjelenítő pozíció; alapból az elem sajátja), különben üres.
 */
export const elemCimke = (e, pozId) => {
  const el = e && e.elem && D.getElem(e.elem);
  if (!el) return '';
  const hely = pozId || el.poz;
  return el.poz !== hely || D.helyElemei(hely).length > 1 ? D.elemNev(el) + ' – ' : '';
};
/** Pozíciójelek gombként (az adatlapon: koppintásra az a pozíció nyílik meg). */
const pozLinkek = ps => html`${ps.map((p, i) => html`${i ? ', ' : ''}<button type="button" class="link-btn" data-do="poz-nyit" data-poz="${p.id}">${p.jel}</button>`)}`;

/** Egy elem lépései (kötött sorrend: a következő az első még nem kész; visszavonni csak az utolsó kész lépést lehet). */
function stepper(el, nagy) {
  const a = D.allapot(el.id), lep = a.lep;
  if (!lep.length) return html`<p class="muted small">Ennek a termékfajtának nincs műveletsora a projektben (Projekt oldal).</p>`;
  const next = lep[a.flags.indexOf(false)] || null, last = a.flags.lastIndexOf(true);
  return html`${next ? html`<button type="button" class="btn btn-primary btn-block ${nagy ? 'btn-lg' : ''}" data-do="next" data-elem="${el.id}" data-step="${next.id}">
      <span class="dot" style="background:${next.szin}"></span>${next.nev} – kész</button>`
    : html`<p class="all-done">✓ Minden lépés kész</p>`}
    <ol class="stepper">
      ${lep.map((l, i) => {
        const e = a.kesz.get(l.id), isNext = next && l.id === next.id;
        return html`<li class="${e ? 'st-done' : isNext ? 'st-next' : 'st-later'}" style="--c:${l.szin}">
          <span class="step-mark" aria-hidden="true"></span>
          <span class="step-body"><b>${l.nev}</b>
            ${e ? html`<span class="sub">${e.ki || '?'} · ${fmtDate(e.mikor, true)}</span>${e.megj ? html`<span class="opt-note">${e.megj}</span>` : ''}`
              : isNext ? html`<span class="sub">Következő lépés</span>` : ''}</span>
          ${e && i === last ? html`<button type="button" class="link-btn step-act" data-do="undo" data-elem="${el.id}" data-step="${l.id}">Visszavonás</button>`
            : !e && !isNext ? html`<button type="button" class="link-btn step-act" data-do="upto" data-elem="${el.id}" data-i="${i}">Idáig kész</button>` : ''}
        </li>`; })}
    </ol>`;
}

/**
 * Elemkártya (több elemes helynél): fejléc (név, méret, állapot), közös elem sora, saját adatok lenyitva, lépések.
 * Más pozícióról kapcsolt közös elemnél: „Közös – <saját pozíciója>”, szerkeszteni ott lehet; a lépései itt is rögzíthetők.
 */
function elemKartya(el, poz, lerakva) {
  const t = D.tetel(el), meret = meretSzoveg(t), a = D.allapot(el.id);
  const behozott = el.poz !== poz.id, haza = behozott && D.getPoz(el.poz);
  const helyKulcsok = new Set(Object.keys((behozott ? haza : poz).adatok || {}).map(D.kulcs));
  const sajat = t.adatok.filter(([k]) => !helyKulcsok.has(D.kulcs(k)));
  const szin = a.lepes ? a.lepes.szin : D.SZIN_NINCS;
  const helyek = behozott ? [] : D.kozosHelyek(el.id);
  return html`<section class="elem-kartya ${behozott ? 'kozos' : ''}" style="--st:${szin}">
    <div class="elem-fej">
      <span class="elem-nev"><b>${t.tipus || (t.kategoria || {}).nev || 'Elem'}</b>
        <span class="sub">${[t.tipus && t.kategoria ? t.kategoria.nev : '', meret, el.db > 1 ? el.db + ' db' : ''].filter(Boolean).join(' · ')}</span></span>
      <span class="elem-allapot small">${lerakva ? `${a.flags.filter(Boolean).length} / ${a.lep.length}` : ''}</span>
      ${D.jog('iroda') && !behozott ? html`<button type="button" class="icon-btn" data-do="kozos" data-elem="${el.id}" aria-label="Közös elem – pozíciók" title="Közös elem – pozíciók">${ICONS.link}</button>
        <button type="button" class="icon-btn" data-do="elem-edit" data-elem="${el.id}" aria-label="Elem szerkesztése" title="Elem szerkesztése">${ICONS.edit}</button>` : ''}
    </div>
    ${behozott ? html`<p class="elem-kozos small"><span class="ico-inline">${ICONS.link}</span> Közös elem – saját pozíciója: ${pozLinkek([haza])}</p>`
      : helyek.length ? html`<p class="elem-kozos small"><span class="ico-inline">${ICONS.link}</span> Közös ezekkel: ${pozLinkek(helyek)}</p>` : ''}
    ${sajat.length ? html`<details class="tetel-tobb"><summary>Adatok (${sajat.length})</summary>
      <dl>${sajat.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl></details>` : ''}
    ${lerakva ? stepper(el, false) : ''}
  </section>`;
}

function body(id, opts, fuggo = []) {
  const poz = D.getPoz(id), elemek = D.pozElemei(poz.id), kozos = D.kozosElemek(poz.id);
  const egy = elemek.length === 1 && !kozos.length ? elemek[0] : null;
  const kartyak = [...elemek, ...kozos];
  const egyHelyek = egy ? D.kozosHelyek(egy.id) : [];
  const t = D.tetel(egy || poz);
  const rajz = poz.rajzId && D.getRajz(poz.rajzId);
  const lerakva = !!rajz, lepeses = poz.fajta === 'pozicio';
  const hiba = D.helyHiba(poz.id);
  const a = lerakva && egy ? D.allapot(egy.id) : null;
  const j = lerakva ? D.jelolo(poz.id) : { szin: 'var(--border)', fajta: poz.fajta };
  // Hely: a rajzé, ami ott nincs megadva (pl. homlokzati rajznál a szint), az a pozícióé
  const hm = m => (rajz && rajz[m]) || D.helyMezo(poz, m);
  const hely = D.helySzoveg(hm('epulet'), hm('szint'), hm('homlokzat'));
  const meret = meretSzoveg(t);
  const tipusMeret = t.honnan.szel || t.honnan.mag;
  // Adatlista: egy elemnél minden (hely + típus + elem), több elemnél csak a hely adatai (az elemeké a kártyákon)
  const tenyek = egy || !kartyak.length ? t.adatok : Object.entries(poz.adatok || {}).filter(([, v]) => String(v ?? '').trim());
  // Egyelemes helynél a fejrész a régi (típus, méret, lépésszám); több elemnél a jel és az elemek száma
  const allapotSzoveg = !lepeses ? D.FAJTAK[poz.fajta] : egy ? (a && a.lepes ? a.lepes.nev : 'Nincs elkezdve') // a: csak lerakott pozíciónál van állapot
    : kartyak.length ? `${kartyak.length} elem` : 'Nincs eleme';
  const head = html`<div class="detail-head">
      <div class="detail-hero" style="--st:${j.szin}">
        <div class="hero-label">${!lepeses ? D.FAJTAK[poz.fajta] : egy ? (t.kategoria ? t.kategoria.nev : 'Típus') : 'Pozíció'}</div>
        <div class="hero-value">${lepeses && egy ? t.tipus || '–' : poz.jel || '–'}</div>
        <div class="hero-status">${lerakva ? html`${raw(markerSvg(j, 16))}&nbsp;${allapotSzoveg}
          ${hiba ? html`&nbsp;<span class="badge badge-err">Hiba</span>` : ''}` : html`<span class="muted">Nincs lerakva rajzra</span>`}</div>
        ${lepeses && egy ? html`<dl class="hero-levels">
          <div><dt>Méret${tipusMeret ? ' (típusból)' : ''}</dt><dd>${meret || '–'}</dd></div>
          ${egy.db > 1 ? html`<div><dt>Darab</dt><dd>${egy.db}</dd></div>` : ''}
          ${lerakva ? html`<div><dt>Lépések</dt><dd>${a.flags.filter(Boolean).length} / ${a.lep.length}</dd></div>` : ''}
        </dl>` : ''}
      </div>
      <dl class="facts">
        <dt>Hely</dt><dd>${hely || '–'}</dd>
        ${poz.helyiseg ? html`<dt>Helyiség</dt><dd>${poz.helyiseg}</dd>` : ''}
        <dt>Rajz</dt><dd>${rajz ? rajz.nev : '–'}</dd>
        ${hiba ? html`<dt>Hiba</dt><dd class="t-err">${hiba.megj || 'nincs leírás'} <span class="muted">(${hiba.ki}, ${fmtDate(hiba.mikor, true)})</span>
          ${fotoSor(D.fotok(hiba.id))}</dd>` : ''}
        ${egyHelyek.length ? html`<dt>Közös ezekkel</dt><dd>${pozLinkek(egyHelyek)}</dd>` : ''}
        ${tenyek.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}
      </dl>
    </div>
    <div class="detail-actions">
      ${D.jog('iroda') ? html`<button class="btn" data-do="edit">${ICONS.edit} Szerkesztés</button>` : ''}
      ${D.jog('iroda') && lepeses ? html`<button class="btn" data-do="elem-uj">${ICONS.plus} Elem</button>` : ''}
      ${D.jog('iroda') && egy ? html`<button class="btn" data-do="kozos" data-elem="${egy.id}" title="Ez az elem más pozíciókhoz is tartozik (pl. közös védőtető)">${ICONS.link} Közös…</button>` : ''}
      ${lerakva && opts.rajzId !== poz.rajzId ? html`<button class="btn" data-do="open">${ICONS.map} Megnyitás a rajzon</button>` : ''}
      ${lerakva && (D.jog('iroda') || (!lepeses && poz.letrehozta === (D.felhasznalo() || {}).email)) ? html`<button class="btn" data-do="levesz">${lepeses ? 'Levétel a rajzról' : 'Törlés'}</button>` : ''}
      ${lepeses && D.jog('iroda') ? html`<button class="btn btn-danger" data-do="torol" title="A pozíció a Lomtárba kerül, onnan visszaállítható">${ICONS.trash} Törlés</button>` : ''}
    </div>`;
  const elemResz = !lepeses ? '' : egy ? (lerakva ? html`<h3 class="sec-h">Lépések</h3>${stepper(egy, true)}` : '')
    : kartyak.length ? html`<h3 class="sec-h">Elemek</h3><div class="elem-lista">${kartyak.map(el => elemKartya(el, poz, lerakva))}</div>`
      : html`<p class="muted small" style="margin-top:1rem">A pozíción még nincs elem${D.jog('iroda') ? ' – a „+ Elem” gombbal vehetsz fel' : ''}.</p>`;
  if (!lerakva) return html`${head}${elemResz}<p class="muted small" style="margin-top:1rem">A lépések a rajzra helyezés után rögzíthetők (Rajz → Szerkesztés mód → koppintás a helyére, és válaszd ki a jelét).</p>`;

  // Napló: a hely bejegyzései és a más pozícióról kapcsolt közös elemek bejegyzései (azok a saját pozíciójuk naplójában vannak)
  const log = [...D.naplo(poz.id), ...kozos.flatMap(el => D.naplo(el.poz).filter(e => e.elem === el.id))]
    .sort((x, y) => String(x.mikor).localeCompare(String(y.mikor))).reverse();
  const lepNev = lid => (D.getLepes(lid) || {}).nev || '(törölt lépés)';
  return html`${head}${elemResz}
    <h3 class="sec-h">Megjegyzés és fotó</h3>
    <div class="form-col">
      <textarea id="p-megj" maxlength="500" placeholder="Nem kötelező. A megjegyzés és a fotók a következő rögzített bejegyzéshez (lépés, hiba, megjegyzés) kerülnek."></textarea>
      <div class="foto-fuggo" id="p-fotok">${fuggoHtml(fuggo)}</div>
      <div class="btn-row">
        <label class="btn btn-sm" title="Fotó készítése vagy választása (legfeljebb ${D.MAX_FOTO})">${ICONS.camera} Fotó<input type="file" id="p-foto" accept="image/*" multiple hidden></label>
        <button type="button" class="btn btn-sm" data-do="megj">Megjegyzés mentése</button>
        ${lepeses ? html`<button type="button" class="btn btn-sm ${hiba ? '' : 'btn-danger'}" data-do="hiba">${hiba ? 'Hiba megszűnt' : 'Hiba jelzése'}</button>` : ''}</div>
    </div>
    <h3 class="sec-h">Napló</h3>
    ${log.length ? html`<ul class="log">${log.map(e => html`<li>
      <span class="when">${fmtDate(e.mikor, true)} · ${e.ki || '?'}</span>
      <span class="ev-${e.tipus}">${elemCimke(e, poz.id)}${e.lepes ? lepNev(e.lepes) + ': ' : ''}${EV_TEXT[e.tipus] || e.tipus}</span>
      ${e.megj ? html`<span class="note">${e.megj}</span>` : ''}${fotoSor(D.fotok(e.id))}</li>`)}</ul>` : html`<p class="muted small">Még nincs bejegyzés.</p>`}`;
}
/** A még nem rögzített (a következő bejegyzéshez csatolandó) fotók előnézete, eltávolító gombbal. */
const fuggoHtml = fuggo => html`${fuggo.map((k, i) => html`<span class="foto-kis fuggo"><img src="${k.url}" alt="">
  <button type="button" class="foto-ki" data-do="fotoki" data-i="${i}" aria-label="Fotó eltávolítása">✕</button></span>`)}
  ${fuggo.length ? html`<span class="small muted">${fuggo.length} fotó – a következő bejegyzéssel kerül rögzítésre</span>` : ''}`;

/**
 * Adatlap megnyitása. id: a pozíció azonosítója. opts:
 *   rajzId – ha a rajzról nyílik (ott nincs „Megnyitás a rajzon”), onChange() – változás után (jelölők / lista frissítése),
 *   onOpen(poz) – „Megnyitás a rajzon”.
 */
export function showPozicio(id, opts = {}) {
  if (!D.getPoz(id)) return null;
  const cim = () => pozNev(D.getPoz(id));
  // A következő bejegyzéshez csatolandó fotók: [{ full, kicsi, url }] (újrarajzoláskor is megmaradnak)
  const fuggo = [];
  const dlg = modal({ title: cim(), body: body(id, opts, fuggo), wide: true, actions: [{ label: 'Bezárás', value: null }] });
  const el = dlg.el, bodyEl = el.querySelector('.modal-body');
  const rerender = () => {
    const megj = bodyEl.querySelector('#p-megj')?.value || '';
    bodyEl.innerHTML = String(body(id, opts, fuggo));
    const t = bodyEl.querySelector('#p-megj'); if (t) t.value = megj;
    el.querySelector('.modal-head h2').textContent = cim();
    elonezetek(bodyEl);
    if (opts.onChange) opts.onChange();
  };
  elonezetek(bodyEl);
  dlg.done.then(() => fuggo.forEach(k => URL.revokeObjectURL(k.url)));
  const fuggoFrissit = () => { const box = bodyEl.querySelector('#p-fotok'); if (box) box.innerHTML = String(fuggoHtml(fuggo)); };
  // Fotó kiválasztása / készítése: kicsinyítés a készüléken, utána a függő fotók közé
  bodyEl.addEventListener('change', async e => {
    if (e.target.id !== 'p-foto') return;
    const files = [...e.target.files]; e.target.value = '';
    const hely = D.MAX_FOTO - fuggo.length;
    if (files.length > hely) toast(`Egy bejegyzéshez legfeljebb ${D.MAX_FOTO} fotó tartozhat – ${hely} került be`, 'warn', 6000);
    const fo = files.length > 1 ? folyamat('Fotók feldolgozása') : null;
    try {
      for (const [i, f] of files.slice(0, hely).entries()) {
        if (fo) fo.set(`${i + 1} / ${Math.min(files.length, hely)}`, i / Math.min(files.length, hely));
        const k = await kepKeszit(f);
        fuggo.push({ ...k, url: URL.createObjectURL(new Blob([k.kicsi], { type: 'image/jpeg' })) });
      }
    } catch (x) { toast(x.message, 'error', 6000); }
    finally { if (fo) fo.close(); }
    fuggoFrissit();
  });
  const bezar = () => { dlg.close(); if (opts.onChange) opts.onChange(); };
  const takeMegj = () => (bodyEl.querySelector('#p-megj')?.value || '').trim();
  // Amíg egy bejegyzés rögzítése folyik (pl. nyitva a névbekérő), újabb művelet nem indulhat:
  // egy dupla koppintás különben azonnal vissza is vonná az előbb rögzített lépést.
  let busy = false;
  // items: [[tipus, extra], …] – egy művelet több bejegyzést is írhat (pl. „Idáig kész”)
  const record = async items => {
    if (busy) return false;
    busy = true;
    try {
      if (!await ensureNev()) return false;
      let utolso = null;
      // Az elem bejegyzése az elem saját pozíciójára kerül (más pozícióról kapcsolt közös elemnél is)
      for (const [tipus, extra] of items) utolso = await D.addEsemeny(extra.elem ? D.getElem(extra.elem).poz : id, tipus, extra);
      // A függő fotók az utolsó bejegyzéshez kerülnek
      if (utolso && fuggo.length) {
        await D.addFotok(utolso, fuggo);
        fuggo.splice(0).forEach(k => URL.revokeObjectURL(k.url));
      }
      const t = bodyEl.querySelector('#p-megj'); if (t) t.value = '';
      rerender();
      return true;
    } finally { busy = false; }
  };
  el.addEventListener('click', async e => {
    // Előnézetre koppintva: nézegető (az adott bejegyzés fotói közt lapozva)
    const n = e.target.closest('[data-fotonez]');
    if (n) {
      const f = D.getFoto(n.dataset.fotonez);
      if (f) { const ids = D.fotok(f.esemeny).map(x => x.id); fotoNezo(ids, ids.indexOf(f.id), rerender); }
      return;
    }
    const b = e.target.closest('[data-do]'); if (!b) return;
    const act = b.dataset.do, poz = D.getPoz(id), elemId = b.dataset.elem;
    const lep = elemId ? D.allapot(elemId).lep : [];
    if (act === 'edit') {
      // A szerkesztő az adatlap fölött nyílik; mentés után az adatlap frissül, törlés után bezárul
      const res = await editPoz(poz);
      if (res && res.torolve) bezar(); else if (res) rerender();
    } else if (act === 'elem-uj' || act === 'elem-edit') {
      const res = await editElem(poz, elemId ? D.getElem(elemId) : null);
      if (res) rerender();
    } else if (act === 'torol') {
      const n = D.pozElemei(id).length;
      if (!await confirmDialog('Pozíció törlése', `A(z) „${pozNev(poz)}” pozíció${n ? ` és ${n} eleme` : ''} a Lomtárba kerül${poz.rajzId ? ' (a rajzról is lekerül)' : ''}. Onnan visszaállítható, a napló megmarad.`, 'Törlés', 'danger')) return;
      await D.delPoz(id);
      toast('A pozíció a Lomtárba került', 'ok');
      bezar();
    } else if (act === 'kozos') {
      const res = await kozosSzerkeszto(D.getElem(elemId), { rajzId: opts.rajzId });
      if (res === 'rajz') dlg.close(); else if (res) rerender();
    } else if (act === 'poz-nyit') {
      // Kapcsolt (közös elemes) pozíció: ugyanazokkal a beállításokkal nyílik meg, ez bezárul
      dlg.close();
      showPozicio(b.dataset.poz, opts);
    } else if (act === 'open') {
      dlg.close();
      if (opts.onOpen) opts.onOpen(poz);
    } else if (act === 'levesz') {
      const lepeses = poz.fajta === 'pozicio';
      if (!await confirmDialog(lepeses ? 'Levétel a rajzról' : `${D.FAJTAK[poz.fajta]} törlése`,
        lepeses ? `A(z) „${pozNev(poz)}” lekerül a rajzról, de a pozíció megmarad („Nincs lerakva”), később újra lerakható. A napló megmarad.`
          : `A(z) „${pozNev(poz)}” jelölés törlődik. A napló megmarad.`, lepeses ? 'Levétel' : 'Törlés', 'danger')) return;
      await D.leveszPoz(id);
      toast(lepeses ? 'Levéve a rajzról' : 'Törölve', 'ok');
      if (lepeses) rerender(); else bezar();
    } else if (act === 'next') {
      await record([['kesz', { elem: elemId, lepes: b.dataset.step, megj: takeMegj() }]]);
    } else if (act === 'upto') {
      // Kihagyott rögzítés pótlása: minden még nem kész lépés eddig a lépésig, egy névvel és időponttal
      const i = Number(b.dataset.i), flags = D.allapot(elemId).flags;
      const todo = lep.slice(0, i + 1).filter((l, k) => !flags[k]);
      if (todo.length > 1 && !await confirmDialog('Több lépés rögzítése',
        `A következő ${todo.length} lépés kerül késznek jelölésre: ${todo.map(l => l.nev).join(', ')}.`, 'Rögzítés')) return;
      const megj = takeMegj();
      await record(todo.map((l, k) => ['kesz', { elem: elemId, lepes: l.id, megj: k === todo.length - 1 ? megj : '' }]));
    } else if (act === 'undo') {
      const l = lep.find(x => x.id === b.dataset.step);
      if (!await confirmDialog('Lépés visszavonása', `A(z) „${l.nev}” lépés újra nem kész lesz. A visszavonás is bekerül a naplóba.`, 'Visszavonás', 'danger')) return;
      await record([['visszavon', { elem: elemId, lepes: l.id, megj: takeMegj() }]]);
    } else if (act === 'fotoki') {
      const [k] = fuggo.splice(Number(b.dataset.i), 1);
      if (k) URL.revokeObjectURL(k.url);
      fuggoFrissit();
    } else if (act === 'megj') {
      const v = takeMegj();
      if (!v && !fuggo.length) { toast('Írd be a megjegyzést, vagy csatolj fotót', 'warn'); return; }
      await record([['megj', { megj: v }]]);
    } else if (act === 'hiba') {
      await record([[D.helyHiba(id) ? 'hiba_vege' : 'hiba', { megj: takeMegj() }]]);
    }
  });
  return dlg;
}
