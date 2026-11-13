// Pozíció adatlapja – a Raktár tétel-adatlapjának (showItemDetail) felépítésével:
//   fejrész: bal oldalt a kiemelt érték (típus, állapotszínű csíkkal, alatta az állapot és a méret), jobb oldalt adatlista;
//   műveletgombok (Szerkesztés, Megnyitás a rajzon, Levétel a rajzról); szakaszok: Lépések, Megjegyzés, Napló.
// A rajzról (jelölőre koppintva), a Pozíciók és az Áttekintő oldalról is ez nyílik. Egy pozíció = egy sor (data.js);
// a felmérés- és hibajelölésnek (fajta) nincs lépése, csak adatai, megjegyzése és naplója.
import { html, raw, modal, confirmDialog, toast, fmtDate, folyamat } from '../ui.js';
import * as D from '../data.js';
import { ICONS } from '../icons.js';
import { markerSvg } from '../marker.js';
import { kepKeszit, elonezetek, fotoSor, fotoNezo } from '../foto.js';
import { ensureNev, meretSzoveg } from './common.js';
import { editSor } from './tablak.js';

export const EV_TEXT = { kesz: 'kész', visszavon: 'visszavonva', hiba: 'Hiba jelezve', hiba_vege: 'Hiba megszűnt', megj: 'Megjegyzés' };
/** A pozíció megjelenített neve (a felmérés / hibajelölésnek nem kötelező a jel). */
export const pozNev = p => p.jel || D.FAJTAK[p.fajta] || 'Pozíció';

function body(id, opts, fuggo = []) {
  const poz = D.getPoz(id), t = D.tetel(poz), lep = D.lepesek(poz.projektId);
  const rajz = poz.rajzId && D.getRajz(poz.rajzId);
  const lerakva = !!rajz, lepeses = poz.fajta === 'pozicio';
  const a = lerakva ? D.allapot(poz.id) : null;
  const j = lerakva ? D.jelolo(poz.id) : { szin: 'var(--border)', fajta: poz.fajta };
  const hely = D.helySzoveg(rajz ? rajz.epulet : t.epulet, rajz ? rajz.szint : t.szint);
  const meret = meretSzoveg(t);
  const tipusMeret = t.honnan.szel || t.honnan.mag;
  const head = html`<div class="detail-head">
      <div class="detail-hero" style="--st:${j.szin}">
        <div class="hero-label">${lepeses ? 'Típus' : D.FAJTAK[poz.fajta]}</div>
        <div class="hero-value">${lepeses ? t.tipus || '–' : poz.jel || '–'}</div>
        <div class="hero-status">${lerakva ? html`${raw(markerSvg(j, 16))}&nbsp;${lepeses ? (a.lepes ? a.lepes.nev : 'Nincs elkezdve') : D.FAJTAK[poz.fajta]}
          ${a.hiba ? html`&nbsp;<span class="badge badge-err">Hiba</span>` : ''}` : html`<span class="muted">Nincs lerakva rajzra</span>`}</div>
        ${lepeses ? html`<dl class="hero-levels">
          <div><dt>Méret${tipusMeret ? ' (típusból)' : ''}</dt><dd>${meret || '–'}</dd></div>
          ${lerakva ? html`<div><dt>Lépések</dt><dd>${a.flags.filter(Boolean).length} / ${lep.length}</dd></div>` : ''}
        </dl>` : ''}
      </div>
      <dl class="facts">
        <dt>Hely</dt><dd>${hely || '–'}</dd>
        <dt>Rajz</dt><dd>${rajz ? rajz.nev : '–'}</dd>
        ${a && a.hiba ? html`<dt>Hiba</dt><dd class="t-err">${a.hiba.megj || 'nincs leírás'} <span class="muted">(${a.hiba.ki}, ${fmtDate(a.hiba.mikor, true)})</span>
          ${fotoSor(D.fotok(a.hiba.id))}</dd>` : ''}
        ${t.adatok.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}
      </dl>
    </div>
    <div class="detail-actions">
      ${D.jog('iroda') ? html`<button class="btn" data-do="edit">${ICONS.edit} Szerkesztés</button>` : ''}
      ${lerakva && opts.rajzId !== poz.rajzId ? html`<button class="btn" data-do="open">${ICONS.map} Megnyitás a rajzon</button>` : ''}
      ${lerakva && (D.jog('iroda') || (!lepeses && poz.letrehozta === (D.felhasznalo() || {}).email)) ? html`<button class="btn" data-do="levesz">${lepeses ? 'Levétel a rajzról' : 'Törlés'}</button>` : ''}
    </div>`;
  if (!lerakva) return html`${head}<p class="muted small" style="margin-top:1rem">A lépések a rajzra helyezés után rögzíthetők (Rajz → Szerkesztés mód → koppintás a helyére, és válaszd ki a jelét).</p>`;

  const log = D.naplo(poz.id).slice().reverse();
  const lepNev = lid => (lep.find(l => l.id === lid) || {}).nev || '(törölt lépés)';
  // Kötött sorrend: a következő lépés az első még nem kész; visszavonni csak az utolsó kész lépést lehet
  const next = lepeses ? lep[a.flags.indexOf(false)] || null : null;
  const last = a.flags.lastIndexOf(true);
  return html`${head}
    ${lepeses ? html`<h3 class="sec-h">Lépések</h3>
    ${next ? html`<button type="button" class="btn btn-primary btn-block btn-lg" data-do="next" data-step="${next.id}">
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
          ${e && i === last ? html`<button type="button" class="link-btn step-act" data-do="undo" data-step="${l.id}">Visszavonás</button>`
            : !e && !isNext ? html`<button type="button" class="link-btn step-act" data-do="upto" data-i="${i}">Idáig kész</button>` : ''}
        </li>`; })}
    </ol>` : ''}
    <h3 class="sec-h">Megjegyzés és fotó</h3>
    <div class="form-col">
      <textarea id="p-megj" maxlength="500" placeholder="Nem kötelező. A megjegyzés és a fotók a következő rögzített bejegyzéshez (lépés, hiba, megjegyzés) kerülnek."></textarea>
      <div class="foto-fuggo" id="p-fotok">${fuggoHtml(fuggo)}</div>
      <div class="btn-row">
        <label class="btn btn-sm" title="Fotó készítése vagy választása (legfeljebb ${D.MAX_FOTO})">${ICONS.camera} Fotó<input type="file" id="p-foto" accept="image/*" multiple hidden></label>
        <button type="button" class="btn btn-sm" data-do="megj">Megjegyzés mentése</button>
        ${lepeses ? html`<button type="button" class="btn btn-sm ${a.hiba ? '' : 'btn-danger'}" data-do="hiba">${a.hiba ? 'Hiba megszűnt' : 'Hiba jelzése'}</button>` : ''}</div>
    </div>
    <h3 class="sec-h">Napló</h3>
    ${log.length ? html`<ul class="log">${log.map(e => html`<li>
      <span class="when">${fmtDate(e.mikor, true)} · ${e.ki || '?'}</span>
      <span class="ev-${e.tipus}">${e.lepes ? lepNev(e.lepes) + ': ' : ''}${EV_TEXT[e.tipus] || e.tipus}</span>
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
      for (const [tipus, extra] of items) utolso = await D.addEsemeny(id, tipus, extra);
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
    const act = b.dataset.do, poz = D.getPoz(id), lep = D.lepesek(poz.projektId);
    if (act === 'edit') {
      // A szerkesztő az adatlap fölött nyílik; mentés után az adatlap frissül, törlés után bezárul
      const res = await editSor('lista', poz);
      if (res && res.torolve) bezar(); else if (res) rerender();
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
      await record([['kesz', { lepes: b.dataset.step, megj: takeMegj() }]]);
    } else if (act === 'upto') {
      // Kihagyott rögzítés pótlása: minden még nem kész lépés eddig a lépésig, egy névvel és időponttal
      const i = Number(b.dataset.i), flags = D.allapot(id).flags;
      const todo = lep.slice(0, i + 1).filter((l, k) => !flags[k]);
      if (todo.length > 1 && !await confirmDialog('Több lépés rögzítése',
        `A következő ${todo.length} lépés kerül késznek jelölésre: ${todo.map(l => l.nev).join(', ')}.`, 'Rögzítés')) return;
      const megj = takeMegj();
      await record(todo.map((l, k) => ['kesz', { lepes: l.id, megj: k === todo.length - 1 ? megj : '' }]));
    } else if (act === 'undo') {
      const l = lep.find(x => x.id === b.dataset.step);
      if (!await confirmDialog('Lépés visszavonása', `A(z) „${l.nev}” lépés újra nem kész lesz. A visszavonás is bekerül a naplóba.`, 'Visszavonás', 'danger')) return;
      await record([['visszavon', { lepes: l.id, megj: takeMegj() }]]);
    } else if (act === 'fotoki') {
      const [k] = fuggo.splice(Number(b.dataset.i), 1);
      if (k) URL.revokeObjectURL(k.url);
      fuggoFrissit();
    } else if (act === 'megj') {
      const v = takeMegj();
      if (!v && !fuggo.length) { toast('Írd be a megjegyzést, vagy csatolj fotót', 'warn'); return; }
      await record([['megj', { megj: v }]]);
    } else if (act === 'hiba') {
      await record([[D.allapot(id).hiba ? 'hiba_vege' : 'hiba', { megj: takeMegj() }]]);
    }
  });
  return dlg;
}
