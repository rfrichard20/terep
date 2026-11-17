// Projekt-táblák közös felülete: pozíciólista ('lista' – helyek + elemek) és típusok ('tipusok').
//  - importTabla(kind): beillesztés Excelből, oszlopszerepekkel (a fejlécből javasolva). Pozíciólistánál egy sor = egy ELEM;
//    az azonos jelű sorok egy pozícióba (helyre) kerülnek.
//  - editPoz(poz, { elem }): pozíció (hely) szerkesztése / új felvétele – egyelemes helynél (vagy újnál) az elem adataival együtt
//  - editElem(poz, elem): egy elem szerkesztése / új elem a helyre
//  - editSor('tipusok', rec): típus szerkesztése / új felvétele (a Raktár szerkesztő mintájára: modal + sec() + .field)
import { html, raw, norm, modal, confirmDialog, toast, sec, suggestInput, formValues } from '../ui.js';
import * as D from '../data.js';
import { natCompare } from './common.js';

const NEV = { lista: 'pozíciólista', tipusok: 'típuslista' };

/** Oszlop szerepének kitalálása a fejléc alapján (a felhasználó átállíthatja). */
function guessSzerep(kind, fejlec, foglalt) {
  const n = norm(fejlec);
  const ha = (sz, ok) => (ok && sz in D.TABLAK[kind] && !foglalt.has(sz) ? (foglalt.add(sz), sz) : null);
  return (kind === 'lista' ? ha('jel', /poz|^jel|azonosit/.test(n)) : ha('jel', /tipus|^jel|^kod/.test(n)))
    || ha('kategoria', /fajta|termek|kategor/.test(n)) || ha('tipus', /tipus/.test(n)) || ha('szel', /szel|^sz\b|width/.test(n))
    || ha('mag', /mag|height/.test(n)) || ha('db', /^db\b|darab|mennyiseg/.test(n)) || ha('helyiseg', /^helyiseg( ?neve?)?$/.test(n))
    || ha('epulet', /epulet|^ep\b|haz|building/.test(n)) || ha('szint', /szint|emelet|level/.test(n))
    || ha('kozos', /^kozos/.test(n)) || ha('homlokzat', /homlokzat/.test(n))
    // A többi: a helyre jellemző nevek hely adatként, minden más az elem adata (szín, motor, mozgatás…)
    || (kind === 'lista' && !/lakas|lepcsohaz|homlokzat|tajolas|helyseg|^hely\b/.test(n) ? 'eadat' : 'adat');
}

/** A beillesztett jelek rövid felsorolása („A1, A2, A3 … +12”). */
const roviden = (jelek, n = 8) => jelek.slice(0, n).join(', ') + (jelek.length > n ? ` … +${jelek.length - n}` : '');
/** Beillesztés után: a „Közös ezekkel” oszlopból létrejött kapcsolatok; az ismeretlen jelek külön figyelmeztetésben. */
const kozosInfo = r => {
  if (r.kozosHiba && r.kozosHiba.length) toast(`Közös elem: ismeretlen vagy elem nélküli jel – ${roviden(r.kozosHiba)}`, 'warn', 9000);
  return r.kozos ? ` · ${r.kozos} közös elem kapcsolat` : '';
};
/** Termékfajta-választó (alapérték: a projektben kiválasztott). */
const fajtaSelect = (name, cur, csakAktiv = true) => html`<select name="${name}">${(csakAktiv ? D.aktivKategoriak() : D.kategoriak())
  .map(k => html`<option value="${k.id}" ${k.id === cur ? raw('selected') : ''}>${k.nev}${k.vezerlo ? ' (vezérlő)' : ''}</option>`)}</select>`;

/**
 * Táblázat beillesztése Excelből. Ha már van tábla, alapból BŐVÍT: az új jelek (és elemek) hozzáadódnak, az egyező jeleket
 * kiírja (megtartja vagy – választás szerint – frissíti őket; az üres cella nem ír felül). Külön választható a teljes csere
 * (előtte jelzi, mely lerakott jelölők / használt típusok maradnának adat nélkül).
 */
export async function importTabla(kind, onDone) {
  const SZ = D.TABLAK[kind];
  const van = D.vanTabla(kind);
  const db = () => (kind === 'lista' ? D.poziciok(D.aktivId(), 'pozicio') : D.tipusok()).length;
  let parsed = null; // { fej: [...], sorok: [[...]], szerep: [...] }
  let mod = 'bovit', frissit = false, kategoria = D.fajta() || (D.aktivKategoriak().find(k => !k.vezerlo) || {}).id;
  const mapping = () => html`
    <p class="small">${parsed.sorok.length} sor, ${parsed.fej.length} oszlop. Add meg, melyik oszlop mi – a „${SZ.jel}” kötelező.
      ${kind === 'lista' ? 'Egy sor = egy elem (pl. egy zsalúzia); az azonos jelű sorok egy pozícióba kerülnek (pl. zsalúzia + szúnyogháló). A „Hely adat” a pozícióé (lakás, homlokzat…), az „Elem adat” az elemé (szín, motor…). A „Közös ezekkel” oszlopba a több pozícióhoz tartozó elem (pl. két ablak fölötti védőtető) sorában a többi pozíció jele kerül, vesszővel elválasztva.'
        : 'Az elemek a „Típus” mezőjükön keresztül öröklik a típus méretét és tulajdonságait.'}</p>
    <div class="map-list">${parsed.fej.map((h, i) => html`<label class="map-row">
      <span class="map-name"><b>${h}</b><span class="sub ellipsis">${parsed.sorok.map(r => r[i]).find(Boolean) || '–'}</span></span>
      <select data-col="${i}">${Object.entries(SZ).map(([k, l]) => html`<option value="${k}" ${parsed.szerep[i] === k ? raw('selected') : ''}>${l}</option>`)}</select>
    </label>`)}</div>
    <label class="field" style="margin-top:.75rem"><span>${kind === 'lista' ? 'Termékfajta (ha nincs „Termékfajta” oszlop, vagy a cella üres)' : 'A típusok termékfajtája'}</span>
      ${fajtaSelect('tbl-fajta', kategoria)}</label>
    <div id="tbl-mod"></div>`;
  /** A beillesztett adat a szerepekkel: { tabla, hiba } */
  const build = () => {
    const jelek = parsed.szerep.filter(s => s === 'jel').length;
    const egyedi = Object.keys(SZ).filter(k => !['adat', 'eadat', 'kihagy'].includes(k)).find(sz => parsed.szerep.filter(s => s === sz).length > 1);
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
    const elemInfo = kind === 'lista' && e.elemek !== e.uj.length + e.egyezo.length ? ` (${e.elemek} elem)` : '';
    box.innerHTML = String(html`<section class="fsec" style="margin-top:1rem"><div class="fsec-title">Betöltés módja</div>
      ${van ? html`<div class="opt-list">
        <label class="opt"><input type="radio" name="tbl-mod" value="bovit" ${mod === 'bovit' ? raw('checked') : ''}>
          <span class="opt-text"><b>Bővítés</b><span class="sub">${e.uj.length} új ${kind === 'lista' ? 'pozíció' : 'sor'} kerül a ${NEV[kind]} végére${e.uj.length ? ` (${roviden(e.uj)})` : ''}${elemInfo}.</span>
          ${e.egyezo.length ? html`<span class="sub t-warn">${e.egyezo.length} jel már szerepel: ${roviden(e.egyezo)}${kind === 'lista' ? ' – az új elemeik hozzáadódnak' : ''}</span>
            <span class="sub check"><input type="checkbox" id="tbl-frissit" ${frissit ? raw('checked') : ''} aria-label="Az egyező sorok frissüljenek"> Az egyező sorok frissüljenek az új adatokkal (az üres cella nem ír felül)</span>` : ''}</span></label>
        <label class="opt"><input type="radio" name="tbl-mod" value="csere" ${mod === 'csere' ? raw('checked') : ''}>
          <span class="opt-text"><b>Teljes csere</b><span class="sub">A jelenlegi ${NEV[kind]} (${db()} sor) helyére az új kerül${kind === 'lista' ? ' (a rajzon lévő pozíciók helye és az elemeik állapota megmarad)' : ''}.</span>
          ${e.arva.length ? html`<span class="sub t-err">${e.arva.length} ${mit} nem szerepel az új listában, az adatai elvesznek: ${roviden(e.arva)}</span>` : ''}</span></label>
      </div>` : html`<p class="small" style="margin:0">${b.tabla.sorok.length} sor kerül be${elemInfo}.</p>`}</section>`);
  };
  await modal({
    title: kind === 'lista' ? 'Pozíciólista beillesztése' : 'Típusok beillesztése',
    wide: true,
    body: html`<p class="muted small">Excelben jelöld ki a táblázatot a fejléccel együtt
      (${kind === 'lista' ? 'pl. Pozíció, Termékfajta, Típus, Szélesség, Magasság, Épület, Szint…' : 'pl. Típus, Szélesség, Magasság, Szín, Mozgatás…'}),
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
        if (e.target.name === 'tbl-fajta') kategoria = e.target.value;
        if (e.target.id === 'tbl-frissit') frissit = e.target.checked;
      });
    },
    actions: [{ label: 'Mégse', value: null }, { label: 'Betöltés', kind: 'primary', onClick: async () => {
      if (!parsed) { toast('Előbb illeszd be a táblázatot', 'warn'); return false; }
      const b = build();
      if (b.hiba) { toast(b.hiba, 'warn'); return false; }
      try {
        if (!van || mod === 'csere') {
          const e = D.elemezTabla(kind, b.tabla);
          if (van && e.arva.length && !await confirmDialog('Teljes csere',
            `${e.arva.length} ${kind === 'lista' ? 'lerakott jelölő' : 'használt típus'} nem szerepel az új listában, az adatai elvesznek (${roviden(e.arva, 5)}). Folytatod?`, 'Csere', 'danger')) return false;
          const r = await D.importal(kind, b.tabla, { mod: 'csere', kategoria });
          toast(`${r.uj + r.egyezo} ${kind === 'lista' ? 'pozíció' : 'sor'} betöltve${r.egyezo ? ` (ebből ${r.egyezo} meglévőhöz kapcsolva)` : ''}${kozosInfo(r)}`, 'ok', 5000);
        } else {
          const r = await D.importal(kind, b.tabla, { mod: 'bovit', frissit, kategoria });
          toast(`${r.uj} új ${kind === 'lista' ? 'pozíció' : 'sor'} hozzáadva${r.egyezo ? ` · ${r.egyezo} egyező ${frissit ? 'frissítve' : 'változatlan'}` : ''}${kozosInfo(r)}`, 'ok', 5000);
        }
      } catch (x) { toast(x.message, 'error', 8000); return false; }
    } }],
  }).done;
  if (onDone) onDone();
}

/* ---------- Szerkesztők ---------- */
const ujMezoBlokk = (felirat, id) => html`<div class="span-2" id="${id}"></div>
  <div class="span-2"><button type="button" class="btn btn-sm" data-ujmezo="${id}">+ Új ${felirat}</button></div>`;
/** „+ Új mező” gombok: név + érték sor (új oszlop a projektben). */
function ujMezoKezelo(el) {
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-ujmezo]'); if (!b) return;
    const box = el.querySelector('#' + b.dataset.ujmezo);
    box.insertAdjacentHTML('beforeend', String(html`<div class="form-grid uj-mezo-sor">
      <label class="field"><span>Mező neve</span><input data-mn placeholder="pl. Szín" autocomplete="off"></label>
      <label class="field"><span>Érték</span><input data-mv autocomplete="off"></label></div>`));
    box.lastElementChild.querySelector('input').focus();
  });
}
/** Az új mezők felvétele a projekthez és az értékük az adatokba. */
async function ujMezok(el, boxId, kind, adatok) {
  for (const r of el.querySelectorAll(`#${boxId} .uj-mezo-sor`)) {
    const n = r.querySelector('[data-mn]').value.trim();
    if (!n) continue;
    await D.addOszlop(kind, n);
    adatok[n] = r.querySelector('[data-mv]').value;
  }
}
const helyErtek = m => [...new Set(D.listaErtekek(m).concat(m === 'helyiseg' ? [] : D.rajzok().map(r => r[m])).filter(Boolean))].sort(natCompare);
const mezo = (name, felirat, ertek, extra = {}) => html`<label class="field"><span>${felirat}</span>
  ${extra.list ? suggestInput(name, ertek, extra.list, extra.ph || '')
    : html`<input name="${name}" value="${ertek ?? ''}" placeholder="${extra.ph || ''}" autocomplete="off" ${extra.num ? raw('inputmode="decimal"') : ''}>`}</label>`;
/** Az elem szakaszai (termékfajta, típus, méret, darab, elem adatok) – a mezők neve 'e:' előtagú. */
function elemSzakaszok(elem, minta = {}) {
  const v = m => String((elem ? elem[m] : minta[m]) ?? '');
  const tip = D.tipus(v('tipus'));
  const tipusJelek = [...new Set([...D.tipusok().map(t => t.jel), ...D.listaErtekek('tipus')])].sort(natCompare);
  const kat = (elem && elem.kategoriaId) || minta.kategoriaId || D.fajta() || (D.aktivKategoriak()[0] || {}).id;
  const zarolt = elem && D.allapot(elem.id).kesz.size > 0; // van már lépése: a fajta nem cserélhető
  return html`
    ${sec('Elem', html`<label class="field"><span>Termékfajta</span>${zarolt ? html`<input value="${(D.getKategoria(kat) || {}).nev || ''}" disabled title="Már van rögzített lépése">`
      : fajtaSelect('e:kategoriaId', kat)}</label>
      ${mezo('e:tipus', 'Típus', v('tipus'), { list: tipusJelek, ph: 'pl. T02' })}
      ${mezo('e:szel', 'Szélesség', v('szel'), { num: true, ph: tip && tip.szel ? `típusból: ${tip.szel}` : '' })}
      ${mezo('e:mag', 'Magasság', v('mag'), { num: true, ph: tip && tip.mag ? `típusból: ${tip.mag}` : '' })}
      ${mezo('e:db', 'Darab', elem ? elem.db : minta.db || 1, { num: true })}`)}
    ${sec('Elem adatai', html`${D.oszlopok('elem').map(n => mezo('ea:' + n, n, elem ? elem.adatok[n] : ''))}${ujMezoBlokk('elem adat', 'uj-eadat')}`)}`;
}
/** Az űrlap elem-mezői → mentElem f-je. */
function elemErtekek(v, elem) {
  const f = { adatok: { ...(elem ? elem.adatok : {}) } };
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith('e:')) f[k.slice(2)] = x;
    else if (k.startsWith('ea:')) f.adatok[k.slice(3)] = x;
  }
  return f;
}

/**
 * Pozíció (hely) szerkesztése / új felvétele (poz = null). Ha a helynek egy eleme van (vagy új pozíció), az elem adatai is itt
 * szerkeszthetők; több elemnél csak a hely (az elemek az adatlapon, külön). minta: új felvételnél a kezdőértékek.
 * Visszaad: Promise<{ mentve: true, id } | { torolve: true } | null>.
 */
export async function editPoz(poz, { minta = {} } = {}) {
  const isNew = !poz;
  const elemek = poz ? D.pozElemei(poz.id) : [];
  const elem = elemek.length === 1 ? elemek[0] : null, vanElemResz = isNew || !!elem;
  const v = m => String((poz ? poz[m] : minta[m]) ?? '');
  const body = html`
    ${sec('Pozíció', html`${mezo('h:jel', 'Pozíció jele', v('jel'), { ph: 'pl. A1A-114' })}
      ${mezo('h:helyiseg', 'Helyiség', v('helyiseg'), { list: helyErtek('helyiseg'), ph: 'pl. Nappali' })}
      ${mezo('h:epulet', 'Épület', v('epulet'), { list: helyErtek('epulet'), ph: 'pl. A' })}
      ${mezo('h:szint', 'Szint', v('szint'), { list: helyErtek('szint'), ph: 'pl. 1, 1A' })}
      ${mezo('h:homlokzat', 'Homlokzat', poz ? D.helyMezo(poz, 'homlokzat') : v('homlokzat'), { list: helyErtek('homlokzat'), ph: 'pl. Észak, D' })}`)}
    ${sec('Hely adatai', html`${D.oszlopok('lista').map(n => mezo('ha:' + n, n, poz ? poz.adatok[n] : ''))}${ujMezoBlokk('hely adat', 'uj-hadat')}`)}
    ${vanElemResz ? elemSzakaszok(elem, minta) : html`<p class="small muted" style="margin:0">A pozíción ${elemek.length} elem van – ezeket az adatlapon, egyenként szerkesztheted.</p>`}
    ${vanElemResz ? html`<p class="small muted" style="margin:0">A méret üresen hagyható: ilyenkor a típus méretét kapja (Típusok oldal).</p>` : ''}`;
  let eredmeny = null;
  await modal({
    title: isNew ? 'Új pozíció' : `Pozíció: ${poz.jel || D.FAJTAK[poz.fajta]}`,
    wide: true,
    body: html`<div data-main>${body}</div>`,
    onMount: ujMezoKezelo,
    actions: [
      ...(isNew ? [] : [{ label: 'Törlés', kind: 'danger', onClick: async () => {
        const ok = await confirmDialog('Pozíció törlése', `A(z) „${poz.jel}” pozíció${elemek.length ? ` és ${elemek.length} eleme` : ''} a Lomtárba kerül${poz.rajzId ? ' (a rajzról is lekerül)' : ''}. Onnan visszaállítható, a naplója megmarad.`, 'Törlés', 'danger');
        if (!ok) return false;
        await D.delPoz(poz.id);
        toast('A pozíció a Lomtárba került', 'ok');
        eredmeny = { torolve: true };
      } }]),
      { label: 'Mégse', value: null },
      { label: 'Mentés', kind: 'primary', onClick: async el => {
        const vals = formValues(el.querySelector('[data-main]'));
        const h = { adatok: { ...(poz ? poz.adatok : {}) } };
        for (const [k, x] of Object.entries(vals)) {
          if (k.startsWith('h:')) h[k.slice(2)] = x;
          else if (k.startsWith('ha:')) h.adatok[k.slice(3)] = x;
        }
        await ujMezok(el, 'uj-hadat', 'lista', h.adatok);
        const ef = vanElemResz ? elemErtekek(vals, elem) : null;
        if (ef) await ujMezok(el, 'uj-eadat', 'elem', ef.adatok);
        if (isNew) {
          const res = await D.mentPoz(null, { ...h, elem: ef });
          if (res.hiba) { toast(res.hiba, 'warn'); return false; }
          eredmeny = { mentve: true, id: res.poz.id };
        } else {
          const res = await D.mentPoz(poz.id, h);
          if (res.hiba) { toast(res.hiba, 'warn'); return false; }
          if (elem) { const r2 = await D.mentElem(elem.id, ef); if (r2.hiba) { toast(r2.hiba, 'warn'); return false; } }
          eredmeny = { mentve: true, id: poz.id };
        }
        toast('Mentve', 'ok');
      } },
    ],
  }).done;
  return eredmeny;
}

/** Egy elem szerkesztése / új elem a pozícióba (elem = null). Visszaad: Promise<{ mentve, id } | { torolve } | null>. */
export async function editElem(poz, elem, { minta = {} } = {}) {
  let eredmeny = null;
  await modal({
    title: elem ? `Elem: ${D.elemNev(elem)}` : `Új elem – ${poz.jel}`,
    wide: true,
    body: html`<div data-main>${elemSzakaszok(elem, minta)}</div>`,
    onMount: ujMezoKezelo,
    actions: [
      ...(elem ? [{ label: 'Törlés', kind: 'danger', onClick: async () => {
        if (!await confirmDialog('Elem törlése', `A(z) „${D.elemNev(elem)}” elem törlődik a(z) „${poz.jel}” pozícióról (a kapcsolataival együtt). A naplója megmarad.`, 'Törlés', 'danger')) return false;
        await D.delElem(elem.id);
        toast('Törölve', 'ok');
        eredmeny = { torolve: true };
      } }] : []),
      { label: 'Mégse', value: null },
      { label: 'Mentés', kind: 'primary', onClick: async el => {
        const f = elemErtekek(formValues(el.querySelector('[data-main]')), elem);
        await ujMezok(el, 'uj-eadat', 'elem', f.adatok);
        const res = await D.mentElem(elem ? elem.id : null, elem ? f : { ...f, poz: poz.id });
        if (res.hiba) { toast(res.hiba, 'warn'); return false; }
        toast('Mentve', 'ok');
        eredmeny = { mentve: true, id: res.elem.id };
      } },
    ],
  }).done;
  return eredmeny;
}

/**
 * Típus szerkesztése / új felvétele (rec = null) – kind: 'tipusok'. (Pozícióhoz: editPoz / editElem; a 'lista' itt editPoz-t hív.)
 * minta: új felvételnél a kezdőértékek. Visszaad: Promise<{ mentve: true, id } | { torolve: true } | null>.
 */
export async function editSor(kind, rec, { minta = {} } = {}) {
  if (kind === 'lista') return editPoz(rec, { minta });
  const isNew = !rec;
  const val = m => String((rec ? rec[m] : minta[m]) ?? '');
  const body = html`
    ${sec('Típus', html`${mezo('m:jel', 'Típus jele', val('jel'), { ph: 'pl. T02' })}
      <label class="field"><span>Termékfajta</span>${fajtaSelect('m:kategoriaId', (rec && rec.kategoriaId) || minta.kategoriaId || D.fajta(), false)}</label>`)}
    ${sec('Méret', html`${mezo('m:szel', 'Szélesség', val('szel'), { num: true })}${mezo('m:mag', 'Magasság', val('mag'), { num: true })}`)}
    ${sec('Tulajdonságok', html`${D.oszlopok('tipusok').map(n => mezo('a:' + n, n, rec ? rec.adatok[n] : ''))}${ujMezoBlokk('tulajdonság', 'uj-tul')}`)}`;
  let eredmeny = null;
  await modal({
    title: isNew ? 'Új típus' : `Típus: ${rec.jel}`,
    wide: true,
    body: html`<div data-main>${body}</div>`,
    onMount: ujMezoKezelo,
    actions: [
      ...(isNew ? [] : [{ label: 'Törlés', kind: 'danger', onClick: async () => {
        if (!await confirmDialog('Típus törlése', `A(z) „${rec.jel}” típus törlődik. Az ezt használó elemek típusjele megmarad, de a méretet és a tulajdonságokat nem öröklik tovább.`, 'Törlés', 'danger')) return false;
        await D.delTipus(rec.id);
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
        await ujMezok(el, 'uj-tul', 'tipusok', f.adatok);
        const res = await D.mentTipus(rec ? rec.id : null, f);
        if (res.hiba) { toast(res.hiba, 'warn'); return false; }
        toast('Mentve', 'ok');
        eredmeny = { mentve: true, id: res.tipus.id };
      } },
    ],
  }).done;
  return eredmeny;
}
