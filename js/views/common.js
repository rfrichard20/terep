// Több oldalon használt felületi elemek: névbekérés, Enter = elsődleges gomb, tétel adatblokk, rendezés.
import { html, modal, toast, formValues } from '../ui.js';
import * as D from '../data.js';

/** Egysoros párbeszédablakban az Enter az elsődleges gombot nyomja meg (modal onMount-jához). */
export function enterSubmits(el) {
  el.querySelector('input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); el.querySelector('.btn-primary').click(); }
  });
}

/** Név bekérése az első bejegyzés előtt (helyi módban nincs belépés; így látszik a naplóban, ki rögzítette). Szerveres módban a név a belépésből jön. */
export async function ensureNev() {
  // Szerveres módban a név a belépésből jön (a Felhasznalok lapról) – itt nem kérhető be, és nem is kell
  if (!D.helyi || D.getNev()) return true;
  return editNev();
}
export async function editNev() {
  const res = await modal({
    title: 'Neved',
    body: html`<p class="muted small">A naplóban ez a név jelenik meg a bejegyzéseid mellett. Csak ezen a készüléken tárolódik.</p>
      <label class="field"><span>Név</span><input name="nev" value="${D.getNev()}" maxlength="60" autocomplete="name" enterkeyhint="done"></label>`,
    onMount: enterSubmits,
    actions: [{ label: 'Mégse', value: null }, { label: 'Mentés', kind: 'primary', onClick: el => {
      const v = formValues(el).nev.trim();
      if (!v) { toast('Add meg a neved', 'warn'); return false; }
      D.setNev(v);
    } }],
  }).done;
  return !!res;
}

/**
 * A pozíció adatai: nagyban a típus (ezt keresi a szerelő a csomagon), mellette a méret, a többi lenyitva. p: pozíció.
 * (Lerakáskor az előnézet: ha a beírt jel nincs a pozíciók között, új pozíció lesz.)
 */
export function tetelBlokk(p, kompakt = false) {
  const t = p && D.tetel(p);
  if (!t) return '';
  const meret = meretSzoveg(t);
  return html`<div class="tetel">
    <div class="tetel-fo">
      ${t.tipus ? html`<span class="tetel-tipus">${t.tipus}</span>` : ''}
      ${meret ? html`<span class="tetel-meret"><b>${meret}</b><span class="sub">${t.szel && t.mag ? 'szélesség × magasság' : t.szel ? 'szélesség' : 'magasság'}</span></span>` : ''}
    </div>
    ${!kompakt && t.adatok.length ? html`<details class="tetel-tobb"><summary>További adatok (${t.adatok.length})</summary>
      <dl>${t.adatok.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl></details>` : ''}
  </div>`;
}
/** „1200 × 1500” (ami van belőle). */
export const meretSzoveg = t => (t ? [t.szel, t.mag].filter(Boolean).join(' × ') : '');

/** Természetes rendezés jelekhez (A1A-9 < A1A-10), magyar ábécé szerint. */
export const natCompare = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'hu', { numeric: true });

/** Oldalfejléc: cím + jobb oldali műveletek (mobilon a cím a felső sávba kerül – app.js). */
export const pageHead = (title, actions = '') => html`<div class="page-head"><h1>${title}</h1>${actions ? html`<div class="actions">${actions}</div>` : ''}</div>`;
