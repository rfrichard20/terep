// Tömeges művelet a kijelölt pozíciókon / elemeken (a Pozíciók listáról – elemek – és a rajzról – helyek – is ez nyílik):
// lépés rögzítése („idáig kész”), visszavonás, hiba / hiba megoldva / megjegyzés, és (iroda) adat átírása, levétel a rajzról.
// A bejegyzések egy műveletben mennek fel (esemenyek – mindent vagy semmit); a szabályok ugyanazok, mint egyenként.
// v2: a lépés a kiválasztott termékfajta elemeire vonatkozik (a hely elemei közül), a hiba / megjegyzés a helyre.
import { html, raw, modal, toast, formValues, confirmDialog, suggestInput } from '../ui.js';
import * as D from '../data.js';
import { natCompare } from './common.js';

const MUVELETEK = [
  { k: 'kesz', nev: 'Lépés rögzítése', leiras: 'A választott lépésig minden még nem kész lépés kész lesz („Idáig kész”).', lepes: true },
  { k: 'vissza', nev: 'Lépés visszavonása', leiras: 'A választott lépés és az utána következő kész lépések visszavonása.', lepes: true },
  { k: 'hiba', nev: 'Hiba jelzése', leiras: 'A megjegyzés lesz a hiba leírása.', megj: 'kell' },
  { k: 'hiba_vege', nev: 'Hiba megoldva', leiras: 'Csak azokon, ahol nyitott hiba van.', megj: 'lehet' },
  { k: 'megj', nev: 'Megjegyzés', leiras: 'Közös megjegyzés a naplóba.', megj: 'kell' },
  { k: 'adat', nev: 'Adat módosítása', leiras: 'Típus, méret, darab, épület, szint, helyiség vagy további adat átírása (üresen hagyva: törlés).', iroda: true },
  { k: 'levesz', nev: 'Levétel a rajzról', leiras: 'A pozíciók megmaradnak („Nincs lerakva”), később újra lerakhatók.', iroda: true },
  { k: 'torol', nev: 'Törlés', leiras: 'A pozíciók az elemeikkel a Lomtárba kerülnek (onnan visszaállíthatók).', iroda: true },
];
// Elem mezők (a kijelölés elemein, a választott fajtában) és hely mezők (a pozíciókon)
const MEZO_NEV = { tipus: 'Típus', szel: 'Szélesség', mag: 'Magasság', db: 'Darab', epulet: 'Épület', szint: 'Szint', helyiseg: 'Helyiség', homlokzat: 'Homlokzat' };

/** Tömeges művelet ablaka. ids: pozíció- vagy elem-azonosítók. Visszaad: true, ha végrehajtott valamit. */
export async function tomegesMuvelet(ids) {
  if (!ids.length) return false;
  const iroda = D.jog('iroda');
  const muv = MUVELETEK.filter(m => !m.iroda || iroda);
  const lep = D.lepesek(), fajtaNev = (D.getKategoria(D.fajta()) || {}).nev || '';
  const mezok = [...Object.entries(MEZO_NEV), ...D.oszlopok('elem').map(n => ['eadat:' + n, n + ' (elem)']), ...D.oszlopok('lista').map(n => ['adat:' + n, n + ' (hely)'])];
  const helyek = D.helyIdk(ids), elemek = D.elemIdk(ids), lerakatlan = helyek.map(D.getPoz).filter(p => !p.rajzId).length;
  const torolheto = helyek.map(D.getPoz).filter(p => p.fajta === 'pozicio').length;
  const ertekek = mezo => (mezo.startsWith('eadat:') ? [...new Set(D.elemek().map(e => e.adatok[mezo.slice(6)]).filter(Boolean))]
    : mezo.startsWith('adat:')
    ? [...new Set(D.poziciok(D.aktivId(), 'pozicio').map(p => p.adatok[mezo.slice(5)]).filter(Boolean))]
    : D.listaErtekek(mezo)).sort(natCompare).slice(0, 200);
  let terv = null;

  const res = await modal({
    title: `Tömeges művelet – ${helyek.length} pozíció`,
    body: html`
      ${lerakatlan ? html`<p class="small muted" style="margin-top:0">${lerakatlan} kijelölt pozíció nincs lerakva rajzra – lépés és hiba csak a lerakottakon rögzíthető.</p>` : ''}
      <div class="opt-list">${muv.map((m, i) => html`<label class="opt"><input type="radio" name="muv" value="${m.k}" ${i === 0 ? raw('checked') : ''}>
        <span class="opt-text"><b>${m.nev}</b><span class="small muted">${m.leiras}</span></span></label>`)}</div>
      <div class="form-col" style="margin-top:1rem">
        <label class="field" id="tm-lepes"><span>Lépés${fajtaNev && D.projektFajtak().length > 1 ? ` (${fajtaNev})` : ''}</span><select name="lepes">${lep.map((l, i) => html`<option value="${l.id}" ${i === 0 ? raw('selected') : ''}>${i + 1}. ${l.nev}</option>`)}</select></label>
        <div class="form-grid" id="tm-adat">
          <label class="field"><span>Mező</span><select name="mezo">${mezok.map(([k, n]) => html`<option value="${k}">${n}</option>`)}</select></label>
          <label class="field" id="tm-ertek"><span>Új érték</span>${suggestInput('ertek', '', ertekek('tipus'), 'üresen: törlés')}</label>
        </div>
        <label class="field" id="tm-megj"><span>Megjegyzés</span><textarea name="megj" maxlength="500" rows="2"></textarea></label>
        <p class="small" id="tm-elo" style="margin:0"></p>
      </div>`,
    onMount(el) {
      const upd = e => {
        const v = formValues(el), m = MUVELETEK.find(x => x.k === v.muv);
        el.querySelector('#tm-lepes').hidden = !m.lepes;
        el.querySelector('#tm-adat').hidden = m.k !== 'adat';
        el.querySelector('#tm-megj').hidden = m.k === 'adat' || m.k === 'levesz' || m.k === 'torol';
        el.querySelector('#tm-megj span').textContent = m.megj === 'kell' ? 'Megjegyzés *' : 'Megjegyzés (nem kötelező)';
        if (e && e.target && e.target.name === 'mezo') {
          el.querySelector('#tm-ertek').innerHTML = `<span>Új érték</span>${suggestInput('ertek', '', ertekek(v.mezo), 'üresen: törlés')}`;
        }
        terv = m.k === 'kesz' ? D.tervKesz(ids, v.lepes) : m.k === 'vissza' ? D.tervVissza(ids, v.lepes)
          : ['hiba', 'hiba_vege', 'megj'].includes(m.k) ? D.tervEsemeny(ids, m.k) : null;
        const elo = el.querySelector('#tm-elo');
        const elemMezo = v.mezo && (v.mezo.startsWith('eadat:') || D.ELEM_MEZOK.includes(v.mezo));
        const mezoNev = (mezok.find(x => x[0] === v.mezo) || [])[1];
        if (m.k === 'adat') elo.textContent = elemMezo ? `${elemek.length} elem („${fajtaNev}”) „${mezoNev}” mezője változik.`
          : `${helyek.map(D.getPoz).filter(p => p.fajta === 'pozicio').length} pozíció „${mezoNev}” mezője változik.`;
        else if (m.k === 'levesz') elo.textContent = `${helyek.length - lerakatlan} lerakott pozíció kerül le a rajzról.`;
        else if (m.k === 'torol') elo.textContent = `${torolheto} pozíció kerül a Lomtárba.`;
        else elo.textContent = !terv.list.length ? 'Nincs mit rögzíteni a kijelölteken.'
          : `${terv.poz} ${m.lepes ? 'elemen' : 'pozíción'} ${terv.list.length} bejegyzés${terv.mar ? ` · ${terv.mar} már kész` : ''}${terv.kihagyva ? ` · ${terv.kihagyva} kimarad` : ''}.`;
      };
      el.addEventListener('change', upd);
      upd();
    },
    actions: [{ label: 'Mégse', value: null }, { label: 'Végrehajtás', kind: 'primary', onClick: async el => {
      const v = formValues(el), m = MUVELETEK.find(x => x.k === v.muv), megj = String(v.megj || '').trim();
      try {
        if (m.k === 'adat') {
          const n = await D.tomegesAdat(ids, v.mezo, v.ertek);
          toast(`${n} sor módosítva`, 'ok');
          return;
        }
        if (m.k === 'levesz') {
          if (!await confirmDialog('Levétel a rajzról', `${helyek.length - lerakatlan} pozíció lekerül a rajzról (a felmérés- és hibajelölések törlődnek). A napló megmarad.`, 'Levétel', 'danger')) return false;
          toast(`${await D.tomegesLevetel(ids)} pozíció levéve`, 'ok');
          return;
        }
        if (m.k === 'torol') {
          if (!await confirmDialog('Pozíciók törlése', `${torolheto} pozíció az elemeivel a Lomtárba kerül (a rajzról is lekerül). Onnan visszaállítható, a napló megmarad.`, 'Törlés', 'danger')) return false;
          toast(`${await D.tomegesTorles(ids)} pozíció a Lomtárba került`, 'ok');
          return;
        }
        if (m.megj === 'kell' && !megj) { toast('Írd be a megjegyzést', 'warn'); return false; }
        if (!terv.list.length) { toast('Nincs mit rögzíteni', 'warn'); return false; }
        if (m.k === 'vissza' && !await confirmDialog('Tömeges visszavonás',
          `${terv.poz} elemen ${terv.list.length} lépés vonódik vissza. A visszavonás is bekerül a naplóba.`, 'Visszavonás', 'danger')) return false;
        if (megj) terv.list.forEach(x => { x.megj = megj; });
        const n = await D.addEsemenyek(terv.list);
        toast(`${n} bejegyzés rögzítve`, 'ok');
      } catch (e) {
        toast(e.message, 'error', 8000);
        return false;
      }
    } }],
  }).done;
  return !!res;
}
