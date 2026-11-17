// Közös elem (pl. VT-3 védőtető két zsalúzia fölött): a kapcsolt pozíciók kiválasztása (iroda).
//  - kozosSzerkeszto(elem, { rajzId }): kereshető lista a projekt pozícióiból (jelölőnégyzettel); mentéskor a kapcsolatok
//    erre állnak be (D.kozosMent). „Kijelölés a rajzon”: a rajzon koppintással választható ki (views/rajz.js, kozosKijeles).
//  - kozosRajzon(elem, rajzId): a rajzos kiválasztás indítása (ha a rajz már nyitva van, ott; különben odanavigál).
import { html, raw, modal, toast, matcher } from '../ui.js';
import * as D from '../data.js';
import { natCompare } from './common.js';

const pozSor = (p, kijelolt) => {
  const els = D.pozElemei(p.id).map(D.elemNev).join(', ');
  const hely = D.helySzoveg(p.epulet, p.szint);
  return html`<label class="check" data-q="${[p.jel, els, hely, p.helyiseg].join(' ')}">
    <input type="checkbox" data-poz="${p.id}" ${kijelolt ? raw('checked') : ''}>
    <span><b>${p.jel}</b> <span class="small muted">${[els || 'nincs eleme', hely, p.rajzId ? '' : 'nincs lerakva'].filter(Boolean).join(' · ')}</span></span></label>`;
};

/** A rajz, amelyen a rajzos kiválasztás indul: a megadott (nyitott), a közös elem helyéé, egy kapcsolt pozícióé, vagy az első. */
function celRajz(el, rajzId) {
  if (rajzId) return rajzId;
  const sajat = D.getPoz(el.poz);
  if (sajat && sajat.rajzId) return sajat.rajzId;
  const kapcsolt = D.kozosHelyek(el.id).find(p => p.rajzId);
  return kapcsolt ? kapcsolt.rajzId : (D.rajzok()[0] || {}).id || null;
}

/** Rajzos kiválasztás: ha a rajz nyitva van, az fogadja az eseményt; különben odanavigálunk (?kozos=<elem>). */
export function kozosRajzon(el, rajzId) {
  const r = celRajz(el, rajzId);
  if (!r) { toast('A projektben még nincs rajz', 'warn'); return; }
  const kezelt = !document.dispatchEvent(new CustomEvent('terep:kozos', { detail: { elem: el.id, rajz: r }, cancelable: true }));
  if (!kezelt) location.hash = `#/p/${D.aktivId()}/rajz/${r}?kozos=${el.id}`;
}

/**
 * A közös elem kapcsolt pozícióinak szerkesztése. Visszaad: true (mentve), 'rajz' (a rajzos kiválasztás indul – a hívó zárja be
 * az adatlapot) vagy null.
 */
export async function kozosSzerkeszto(el, { rajzId = null } = {}) {
  const sajat = D.getPoz(el.poz);
  const kijelolt = new Set(D.kozosHelyek(el.id).map(p => p.id));
  const lista = D.poziciok(D.aktivId(), 'pozicio').filter(p => p.id !== el.poz && p.jel)
    .sort((a, b) => (kijelolt.has(b.id) - kijelolt.has(a.id)) || natCompare(a.jel, b.jel));
  let eredmeny = null;
  const szamlalo = box => { box.querySelector('#kz-db').textContent = `${kijelolt.size} pozíció kiválasztva`; };
  await modal({
    title: 'Közös elem',
    body: html`<p class="small" style="margin-top:0">A(z) <b>${D.elemNev(el)}</b> (saját pozíciója: <b>${sajat ? sajat.jel : '–'}</b>)
        a kiválasztott pozíciókon is megjelenik: ott is rögzíthetők a lépései, és a jelölő színébe is beleszámít.
        A készültségben egyszer számít.</p>
      <input type="search" id="kz-q" placeholder="Keresés: jel, elem, épület…" aria-label="Keresés a pozíciók közt" autocomplete="off">
      <p class="small muted" id="kz-db" style="margin:.5rem 0"></p>
      <div class="u-proj-list" id="kz-list">${lista.length ? lista.map(p => pozSor(p, kijelolt.has(p.id)))
        : html`<p class="small muted">A projektben nincs más pozíció.</p>`}</div>`,
    onMount(box) {
      szamlalo(box);
      box.querySelector('#kz-q').addEventListener('input', e => {
        const ok = matcher(e.target.value);
        box.querySelectorAll('#kz-list label').forEach(l => { l.hidden = !ok(l.dataset.q); });
      });
      box.querySelector('#kz-list').addEventListener('change', e => {
        const id = e.target.dataset.poz;
        if (!id) return;
        if (e.target.checked) kijelolt.add(id); else kijelolt.delete(id);
        szamlalo(box);
      });
    },
    actions: [
      { label: 'Mégse', value: null },
      ...(D.rajzok().length ? [{ label: 'Kijelölés a rajzon', onClick: () => { eredmeny = 'rajz'; } }] : []),
      { label: 'Mentés', kind: 'primary', onClick: async () => {
        const r = await D.kozosMent(el.id, [...kijelolt]);
        if (r.hiba) { toast(r.hiba, 'error', 6000); return false; }
        if (r.kihagyva.length) toast(`Elem nélküli pozícióhoz nem kapcsolható: ${r.kihagyva.join(', ')}`, 'warn', 8000);
        else toast(r.db ? `Közös elem: ${r.db} pozíció` : 'A közös elem kapcsolatai törölve', 'ok');
        eredmeny = true;
      } },
    ],
  }).done;
  if (eredmeny === 'rajz') kozosRajzon(el, rajzId);
  return eredmeny;
}
