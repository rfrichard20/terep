// UI segédfüggvények. A közös mag (html sablon, formázás, keresés, toast, modal, popover, űrlapsegédek) a
// web/kozos/ui.js-ben van (KÖZÖS fájl, forrása a Kozos_Claude repó); itt csak a Terep saját segédei.
// A nézetek mindent innen importálnak.
export * from '../kozos/ui.js';
import { html } from '../kozos/ui.js';

/** Fájlméret megabájtban („4,2 MB”). */
export const fmtMB = b => (b / 1048576).toLocaleString('hu-HU', { maximumFractionDigits: 1 }) + ' MB';

/**
 * Folyamatjelző ablak (pl. rajzfeltöltés): forgó jel + szöveg + opcionális sáv, gomb nélkül (nem zárható be, amíg fut).
 * Visszaad: { set(szöveg, arány 0–1 | null), close() }.
 */
export function folyamat(cim) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = String(html`<div class="modal folyamat" role="alertdialog" aria-modal="true" aria-live="polite">
    <div class="modal-body"><div class="fo-sor"><span class="spinner" aria-hidden="true"></span><b class="fo-cim">${cim}</b></div>
      <p class="fo-szoveg small muted"></p><div class="fo-sav" hidden><span></span></div></div></div>`);
  document.body.appendChild(back);
  document.body.classList.add('modal-open');
  const $ = s => back.querySelector(s);
  return {
    set(szoveg, arany = null) {
      $('.fo-szoveg').textContent = szoveg || '';
      $('.fo-sav').hidden = arany == null;
      if (arany != null) $('.fo-sav span').style.width = Math.round(Math.max(0, Math.min(1, arany)) * 100) + '%';
    },
    close() {
      back.remove();
      if (!document.querySelector('.modal-back')) document.body.classList.remove('modal-open');
    },
  };
}

/** Rövid, ütközésmentes azonosító (pozíció, lépés, esemény). Állandó: soha nem írjuk át. */
export function uid(prefix = '') {
  const a = crypto.getRandomValues(new Uint8Array(8));
  return prefix + Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
