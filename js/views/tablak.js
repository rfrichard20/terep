// Projekt-táblák közös felülete: pozíciólista ('lista') és típusok ('tipusok').
//  - importTabla(kind): beillesztés Excelből, oszlopszerepekkel (a fejlécből javasolva)
//  - editSor(kind, rec): pozíció / típus szerkesztése vagy új felvétele – a Raktár szerkesztő mintájára (modal + sec() + .field)
import { html, raw, norm, modal, confirmDialog, toast, sec, suggestInput, formValues } from '../ui.js';
import * as D from '../data.js';
import { natCompare } from './common.js';

const NEV = { lista: 'pozíciólista', tipusok: 'típuslista' };

/** Oszlop szerepének kitalálása a fejléc alapján (a felhasználó átállíthatja). */
function guessSzerep(kind, fejlec, foglalt) {
  const n = norm(fejlec);
  const ha = (sz, ok) => (ok && sz in D.TABLAK[kind] && !foglalt.has(sz) ? (foglalt.add(sz), sz) : null);
  return (kind === 'lista' ? ha('jel', /poz|^jel|azonosit/.test(n)) : ha('jel', /tipus|^jel|^kod/.test(n)))
    || ha('tipus', /tipus/.test(n)) || ha('szel', /szel|^sz\b|width/.test(n)) || ha('mag', /mag|height/.test(n))
    || ha('epulet', /epulet|^ep\b|haz|building/.test(n)) || ha('szint', /szint|emelet|level/.test(n)) || 'adat';
}

/** A beillesztett jelek rövid felsorolása („A1, A2, A3 … +12”). */
const roviden = (jelek, n = 8) => jelek.slice(0, n).join(', ') + (jelek.length > n ? ` … +${jelek.length - n}` : '');

/**
 * Táblázat beillesztése Excelből. Ha már van tábla, alapból BŐVÍT: az új jelek a végére kerülnek, az egyező jeleket
 * kiírja (megtartja vagy – választás szerint – frissíti őket; az üres cella nem ír felül). Külön választható a teljes csere
 * (előtte jelzi, mely lerakott jelölők / használt típusok maradnának adat nélkül).
 */
export async function importTabla(kind, onDone) {
  const SZ = D.TABLAK[kind];
  const van = D.vanTabla(kind);
  const db = () => (kind === 'lista' ? D.poziciok(D.aktivId(), 'pozicio') : D.tipusok()).length;
  let parsed = null; // { fej: [...], sorok: [[...]], szerep: [...] }
  let mod = 'bovit', frissit = false;
  const mapping = () => html`
    <p class="small">${parsed.sorok.length} sor, ${parsed.fej.length} oszlop. Add meg, melyik oszlop mi – a „${SZ.jel}” kötelező.
      ${kind === 'lista' ? 'A pozíció jele köti a sort a rajzon lévő jelölőhöz (jelölő neve = jel); az „Épület” és „Szint” a rajzéval egyeztetve szűkíti a lerakáskor felkínált pozíciókat.'
        : 'A pozíciók a „Típus” mezőjükön keresztül öröklik a típus méretét és tulajdonságait.'}</p>
    <div class="map-list">${parsed.fej.map((h, i) => html`<label class="map-row">
      <span class="map-name"><b>${h}</b><span class="sub ellipsis">${parsed.sorok.map(r => r[i]).find(Boolean) || '–'}</span></span>
      <select data-col="${i}">${Object.entries(SZ).map(([k, l]) => html`<option value="${k}" ${parsed.szerep[i] === k ? raw('selected') : ''}>${l}</option>`)}</select>
    </label>`)}</div>
    <div id="tbl-mod"></div>`;
  /** A beillesztett adat a szerepekkel: { tabla, hiba } */
  const build = () => {
    const jelek = parsed.szerep.filter(s => s === 'jel').length;
    const egyedi = Object.keys(SZ).filter(k => !['adat', 'kihagy'].includes(k)).find(sz => parsed.szerep.filter(s => s === sz).length > 1);
    if (jelek !== 1) return { hiba: `Pontosan egy oszlop legyen „${SZ.jel}”.` };
    if (egyedi) return { hiba: `A „${SZ[egyedi]}” szerep csak egy oszlopé lehet.` };
    const ji = parsed.szerep.indexOf('jel');
    const oszlopok = parsed.fej.map((nev, i) => ({ nev, szerep: parsed.szerep[i] })).filter(o => o.szerep !== 'kihagy');
    const sorok = parsed.sorok.filter(r => (r[ji] || '').trim()).map(r => Object.fromEntries(oszlopok.map(o => [o.nev, r[parsed.fej.indexOf(o.nev)] || ''])));
    return { tabla: { oszlopok, sorok } };
  };
  // Betöltés módja és előnézet (új / egyező / csere esetén adat nélkül maradó jelek)
  const modBox = el => {
    const box = el.querySelector('#tbl-mod');
    if (!box) return;
    const b = build();
    if (b.hiba) { box.innerHTML = String(html`<p class="small t-warn">${b.hiba}</p>`); return; }
    const e = D.elemezTabla(kind, b.tabla);
    const mit = kind === 'lista' ? 'lerakott jelölő' : 'pozíciókban használt típus';
    box.innerHTML = String(html`<section class="fsec" style="margin-top:1rem"><div class="fsec-title">Betöltés módja</div>
      ${van ? html`<div class="opt-list">
        <label class="opt"><input type="radio" name="tbl-mod" value="bovit" ${mod === 'bovit' ? raw('checked') : ''}>
          <span class="opt-text"><b>Bővítés</b><span class="sub">${e.uj.length} új sor kerül a ${NEV[kind]} végére${e.uj.length ? ` (${roviden(e.uj)})` : ''}.</span>
          ${e.egyezo.length ? html`<span class="sub t-warn">${e.egyezo.length} jel már szerepel: ${roviden(e.egyezo)}</span>
            <span class="sub check"><input type="checkbox" id="tbl-frissit" ${frissit ? raw('checked') : ''} aria-label="Az egyező sorok frissüljenek"> Az egyező sorok frissüljenek az új adatokkal (az üres cella nem ír felül)</span>` : ''}</span></label>
        <label class="opt"><input type="radio" name="tbl-mod" value="csere" ${mod === 'csere' ? raw('checked') : ''}>
          <span class="opt-text"><b>Teljes csere</b><span class="sub">A jelenlegi ${NEV[kind]} (${db()} sor) helyére az új kerül${kind === 'lista' ? ' (a rajzon lévő pozíciók helye megmarad)' : ''}.</span>
          ${e.arva.length ? html`<span class="sub t-err">${e.arva.length} ${mit} nem szerepel az új listában, az adatai elvesznek: ${roviden(e.arva)}</span>` : ''}</span></label>
      </div>` : html`<p class="small" style="margin:0">${b.tabla.sorok.length} sor kerül be.</p>`}</section>`);
  };
  await modal({
    title: kind === 'lista' ? 'Pozíciólista beillesztése' : 'Típusok beillesztése',
    wide: true,
    body: html`<p class="muted small">Excelben jelöld ki a táblázatot a fejléccel együtt
      (${kind === 'lista' ? 'pl. Pozíció, Típus, Szélesség, Magasság, Épület, Szint…' : 'pl. Típus, Szélesség, Magasság, Szín, Mozgatás…'}),
      másold (Ctrl+C), és illeszd be ide (Ctrl+V).${van ? ` A meglévő ${NEV[kind]} alapból bővül; a teljes csere külön választható.` : ''}</p>
      <textarea id="tbl-txt" rows="6" placeholder="Ide illeszd be az Excelből másolt táblázatot"></textarea>
      <div id="tbl-map" style="margin-top:1rem"></div>`,
    onMount(el) {
      const box = el.querySelector('#tbl-map');
      el.querySelector('#tbl-txt').addEventListener('input', e => {
        const rows = D.parseTabla(e.target.value);
        if (rows.length < 2) { parsed = null; box.innerHTML = rows.length ? '<p class="small t-warn">Legalább egy fejlécsor és egy adatsor kell.</p>' : ''; return; }
        // Fejlécnevek: üres → „N. oszlop”, ismétlődő → sorszámmal
        const seen = new Map();
        const fej = rows[0].map((h, i) => {
          const n = h || `${i + 1}. oszlop`;
          const k = seen.get(n) || 0; seen.set(n, k + 1);
          return k ? `${n} (${k + 1})` : n;
        });
        const width = Math.max(...rows.map(r => r.length));
        while (fej.length < width) fej.push(`${fej.length + 1}. oszlop`);
        const foglalt = new Set();
        parsed = { fej, sorok: rows.slice(1), szerep: fej.map(h => guessSzerep(kind, h, foglalt)) };
        box.innerHTML = String(mapping());
        modBox(el);
      });
      box.addEventListener('change', e => {
        const s = e.target.closest('[data-col]');
        if (s) { parsed.szerep[Number(s.dataset.col)] = s.value; modBox(el); return; }
        if (e.target.name === 'tbl-mod') mod = e.target.value;
        if (e.target.id === 'tbl-frissit') frissit = e.target.checked;
      });
    },
    actions: [{ label: 'Mégse', value: null }, { label: 'Betöltés', kind: 'primary', onClick: async () => {
      if (!parsed) { toast('Előbb illeszd be a táblázatot', 'warn'); return false; }
      const b = build();
      if (b.hiba) { toast(b.hiba, 'warn'); return false; }
      if (!van || mod === 'csere') {
        const e = D.elemezTabla(kind, b.tabla);
        if (van && e.arva.length && !await confirmDialog('Teljes csere',
          `${e.arva.length} ${kind === 'lista' ? 'lerakott jelölő' : 'használt típus'} nem szerepel az új listában, az adatai elvesznek (${roviden(e.arva, 5)}). Folytatod?`, 'Csere', 'danger')) return false;
        const r = await D.importal(kind, b.tabla, { mod: 'csere' });
        toast(`${r.uj + r.egyezo} sor betöltve${r.egyezo ? ` (ebből ${r.egyezo} meglévő pozícióhoz kapcsolva)` : ''}`, 'ok', 5000);
      } else {
        const r = await D.importal(kind, b.tabla, { mod: 'bovit', frissit });
        toast(`${r.uj} új sor hozzáadva${r.egyezo ? ` · ${r.egyezo} egyező ${frissit ? 'frissítve' : 'változatlan'}` : ''}`, 'ok', 5000);
      }
    } }],
  }).done;
  if (onDone) onDone();
}

/**
 * Pozíció vagy típus szerkesztése / új felvétele (rec = null) – a Raktár szerkesztő mintájára: szakaszok (sec), mezők (.field),
 * javaslatlisták. Pozíciónál a méret üresen hagyható: akkor a típusból jön (a mezőben mintaszövegként látszik).
 * minta: új felvételnél a kezdőértékek ({ mező: érték }). Új tulajdonság/adat oszlop a „+ Új mező” gombbal vehető fel.
 * Visszaad: Promise<{ mentve: true, id } | { torolve: true } | null>.
 */
export async function editSor(kind, rec, { minta = {} } = {}) {
  const SZ = D.TABLAK[kind], isNew = !rec;
  const val = m => String((rec ? rec[m] : minta[m]) ?? '');
  const adatVal = n => (rec && rec.adatok ? rec.adatok[n] ?? '' : '');
  const field = (m, extra = {}) => html`<label class="field"><span>${SZ[m]}</span>
    ${extra.list ? suggestInput('m:' + m, val(m), extra.list, extra.ph || '')
      : html`<input name="m:${m}" value="${val(m)}" placeholder="${extra.ph || ''}" autocomplete="off" ${extra.num ? raw('inputmode="decimal"') : ''}>`}</label>`;
  const adatMezok = D.oszlopok(kind).map(n => html`<label class="field"><span>${n}</span><input name="a:${n}" value="${adatVal(n)}" autocomplete="off"></label>`);
  const tip = kind === 'lista' ? D.tipus(val('tipus')) : null;
  const tipusJelek = [...new Set([...D.tipusok().map(t => t.jel), ...D.listaErtekek('tipus')])].sort(natCompare);
  const helyErtek = m => [...new Set(D.listaErtekek(m).concat(D.rajzok().map(r => r[m])).filter(Boolean))].sort(natCompare);
  const ujMezo = html`<div class="span-2" id="uj-mezo"></div>
    <div class="span-2"><button type="button" class="btn btn-sm" id="mezo-add">+ Új ${kind === 'lista' ? 'adatmező' : 'tulajdonság'}</button></div>`;
  const body = kind === 'lista' ? html`
      ${sec('Pozíció', html`${field('jel', { ph: 'pl. A1A-114' })}${field('tipus', { list: tipusJelek, ph: 'pl. T02' })}`)}
      ${sec('Hely', html`${field('epulet', { list: helyErtek('epulet'), ph: 'pl. A' })}${field('szint', { list: helyErtek('szint'), ph: 'pl. 1, 1A' })}`)}
      ${sec('Méret', html`${field('szel', { num: true, ph: tip && tip.szel ? `típusból: ${tip.szel}` : '' })}${field('mag', { num: true, ph: tip && tip.mag ? `típusból: ${tip.mag}` : '' })}`)}
      ${sec('További adatok', html`${adatMezok}${ujMezo}`)}
      <p class="small muted" style="margin:0">A méret üresen hagyható: ilyenkor a típus méretét kapja (Típusok oldal).</p>`
    : html`
      ${sec('Típus', html`${field('jel', { ph: 'pl. T02' })}`)}
      ${sec('Méret', html`${field('szel', { num: true })}${field('mag', { num: true })}`)}
      ${sec('Tulajdonságok', html`${adatMezok}${ujMezo}`)}`;
  const cim = kind === 'lista' ? 'Pozíció' : 'Típus';
  let eredmeny = null;
  await modal({
    title: isNew ? `Új ${cim.toLowerCase()}` : `${cim}: ${rec.jel}`,
    wide: true,
    body: html`<div data-main>${body}</div>`,
    onMount(el) {
      // Új adatmező / tulajdonság (új oszlop a projektben): név + érték
      el.querySelector('#mezo-add').addEventListener('click', () => {
        el.querySelector('#uj-mezo').insertAdjacentHTML('beforeend', String(html`<div class="form-grid uj-mezo-sor">
          <label class="field"><span>Mező neve</span><input data-mn placeholder="pl. Szín" autocomplete="off"></label>
          <label class="field"><span>Érték</span><input data-mv autocomplete="off"></label></div>`));
        el.querySelector('#uj-mezo').lastElementChild.querySelector('input').focus();
      });
    },
    actions: [
      ...(isNew ? [] : [{ label: 'Törlés', kind: 'danger', onClick: async () => {
        const ok = await confirmDialog(`${cim} törlése`,
          kind === 'lista' ? `A(z) „${rec.jel}” pozíció törlődik${rec.rajzId ? ' (a rajzról is)' : ''}. A naplója megmarad.`
            : `A(z) „${rec.jel}” típus törlődik. Az ezt használó pozíciók típusjele megmarad, de a méretet és a tulajdonságokat nem öröklik tovább.`, 'Törlés', 'danger');
        if (!ok) return false;
        if (kind === 'lista') await D.delPoz(rec.id); else await D.delTipus(rec.id);
        toast('Törölve', 'ok');
        eredmeny = { torolve: true };
      } }]),
      { label: 'Mégse', value: null },
      { label: 'Mentés', kind: 'primary', onClick: async el => {
        const v = formValues(el.querySelector('[data-main]'));
        const f = { adatok: { ...(rec ? rec.adatok : {}) } };
        for (const [k, x] of Object.entries(v)) {
          if (k.startsWith('m:')) f[k.slice(2)] = x;
          else if (k.startsWith('a:')) f.adatok[k.slice(2)] = x;
        }
        for (const r of el.querySelectorAll('.uj-mezo-sor')) {
          const n = r.querySelector('[data-mn]').value.trim();
          if (!n) continue;
          await D.addOszlop(kind, n);
          f.adatok[n] = r.querySelector('[data-mv]').value;
        }
        const res = kind === 'lista' ? await D.mentPoz(rec ? rec.id : null, f) : await D.mentTipus(rec ? rec.id : null, f);
        if (res.hiba) { toast(res.hiba, 'warn'); return false; }
        toast('Mentve', 'ok');
        eredmeny = { mentve: true, id: (res.poz || res.tipus).id };
      } },
    ],
  }).done;
  return eredmeny;
}
