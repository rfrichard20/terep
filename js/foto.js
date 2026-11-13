// Fotók: kicsinyítés a telefonon (a feltöltés így mobilneten is gyors), előnézetek betöltése, teljes képernyős nézegető.
import { html, raw, modal, confirmDialog, toast, fmtDate } from './ui.js';
import * as D from './data.js';
import { ICONS } from './icons.js';

export const NAGY = 1600, KICSI = 360; // a hosszabb oldal képpontban

/** Kép (File / Blob) → { full, kicsi } JPEG ArrayBuffer-ek. A telefon tájolása (EXIF) szerint forgat. */
export async function kepKeszit(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error(`A kép nem olvasható (${file.name || 'fotó'}) – csak JPEG / PNG / WebP fénykép tölthető fel.`); }
  const meretez = async (max, q) => {
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); // átlátszó PNG → fehér háttér
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    return blob.arrayBuffer();
  };
  try { return { full: await meretez(NAGY, 0.82), kicsi: await meretez(KICSI, 0.7) }; }
  finally { bmp.close && bmp.close(); }
}

/** Előnézetek betöltése egy elemen belül: <img data-foto="id"> → forrás a készülékről / szerverről (aszinkron). */
export function elonezetek(root) {
  root.querySelectorAll('img[data-foto]:not([src])').forEach(img => {
    D.fotoUrl(img.dataset.foto, true).then(u => { img.src = u; }, () => { img.alt = 'A fotó nem tölthető be'; img.classList.add('hibas'); });
  });
}
/** Egy bejegyzés fotóinak előnézet-sora (HTML). */
export const fotoSor = fotok => (fotok.length ? html`<span class="foto-sor">${fotok.map(f => html`<button type="button" class="foto-kis ${f.fuggo ? 'fuggo' : ''}"
  data-fotonez="${f.id}" aria-label="Fotó megnyitása" title="${f.fuggo ? 'Feltöltésre vár' : 'Fotó'}"><img data-foto="${f.id}" alt=""></button>`)}</span>` : '');

/**
 * Teljes képernyős nézegető: lapozás (gombok, nyilak, húzás), és a saját / irodai fotónál törlés.
 * ids: a fotók azonosítói (sorrendben), i: a kezdő. onChange(): törlés után.
 */
export function fotoNezo(ids, i = 0, onChange = null) {
  let akt = i;
  const dlg = modal({ title: 'Fotó', wide: true, body: html`<div class="foto-nezo"><img id="fn-kep" alt="">
    <button type="button" class="foto-lap bal" data-lap="-1" aria-label="Előző">‹</button>
    <button type="button" class="foto-lap jobb" data-lap="1" aria-label="Következő">›</button></div>
    <div class="foto-info small muted" id="fn-info"></div>`, actions: [{ label: 'Bezárás', value: null }] });
  const el = dlg.el, img = el.querySelector('#fn-kep');
  const mutat = async () => {
    const f = D.getFoto(ids[akt]);
    if (!f) { dlg.close(); return; }
    el.querySelector('.modal-head h2').textContent = ids.length > 1 ? `Fotó ${akt + 1} / ${ids.length}` : 'Fotó';
    el.querySelectorAll('.foto-lap').forEach(b => { b.hidden = ids.length < 2; });
    const torolheto = f.kiEmail === (D.felhasznalo() || {}).email || D.jog('iroda');
    el.querySelector('#fn-info').innerHTML = String(html`${f.ki || ''} · ${fmtDate(f.mikor, true)}${f.fuggo ? ' · feltöltésre vár' : ''}
      ${torolheto ? html` · <button type="button" class="link-btn t-err" data-torol>${raw(String(ICONS.trash))} Törlés</button>` : ''}`);
    img.removeAttribute('src');
    img.classList.add('tolt');
    try {
      img.src = await D.fotoUrl(f.id, true); // előbb az előnézet (azonnal), utána a nagy kép
      img.src = await D.fotoUrl(f.id, false);
    } catch (e) { toast(e.message, 'error'); }
    img.classList.remove('tolt');
  };
  const lap = d => { akt = (akt + d + ids.length) % ids.length; mutat(); };
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-lap]');
    if (b) { lap(Number(b.dataset.lap)); return; }
    if (e.target.closest('[data-torol]')) {
      if (!await confirmDialog('Fotó törlése', 'A fotó törlődik (a szerveren a kukába kerül).', 'Törlés', 'danger')) return;
      await D.delFoto(ids[akt]);
      ids.splice(akt, 1);
      if (onChange) onChange();
      if (!ids.length) { dlg.close(); return; }
      akt = Math.min(akt, ids.length - 1);
      mutat();
    }
  });
  const onKey = e => { if (e.key === 'ArrowLeft') lap(-1); else if (e.key === 'ArrowRight') lap(1); };
  document.addEventListener('keydown', onKey);
  dlg.done.then(() => document.removeEventListener('keydown', onKey));
  // Húzás (mobil): balra / jobbra lapoz
  let x0 = null;
  img.addEventListener('pointerdown', e => { x0 = e.clientX; });
  img.addEventListener('pointerup', e => { if (x0 !== null && Math.abs(e.clientX - x0) > 50 && ids.length > 1) lap(e.clientX < x0 ? 1 : -1); x0 = null; });
  mutat();
  return dlg;
}
