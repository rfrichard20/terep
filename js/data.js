// Adatréteg a felületnek: olvasás a store modelljéből (szerver-pillanatkép + függő műveletek, model.js szerkezetben),
// írás műveletekkel (store.enqueue → TerepLogic.applyOp helyben azonnal, utána szinkron a szerverre).
// A felület modellje és a szerver táblái: model.js. Helyi módban (nincs API_URL) ugyanez fut, a „szerver” a böngészőben van.
// Eseménytípusok: kesz, visszavon (lépéshez) · hiba, hiba_vege · megj (önálló megjegyzés).
import * as S from './store.js';
import { uid, toast } from './ui.js';
import { helyiNev, setHelyiNev } from './backend.js';
import { SZIN_NINCS, SZIN_KESZ, alapSzin, SABLONOK, sablonLepesek, PROJEKT_ALLAPOT, FAJTAK, MEZOK, most, ures, kulcs } from './model.js';

export { SZIN_NINCS, SZIN_KESZ, alapSzin, SABLONOK, PROJEKT_ALLAPOT, FAJTAK, MEZOK, kulcs };
export const SZEREPEK = { jel: 'Pozíció jele', tipus: 'Típus', szel: 'Szélesség', mag: 'Magasság', epulet: 'Épület', szint: 'Szint', adat: 'További adat', kihagy: 'Nem kell' };
export const SZEREPEK_TIPUS = { jel: 'Típus jele', szel: 'Szélesség', mag: 'Magasság', adat: 'Tulajdonság', kihagy: 'Nem kell' };
export const TABLAK = { lista: SZEREPEK, tipusok: SZEREPEK_TIPUS };

const M = () => S.state.model;
/**
 * Indexek a modell tömbjeihez (azonosító → elem, pozíció → bejegyzések, állapotok). A tömbök minden adatváltozáskor újak
 * (store → fromServer), ezért a WeakMap-ben tárolt index magától érvénytelenné válik – nem kell kézzel üríteni.
 * Nagy projektnél (több ezer pozíció és bejegyzés) ettől nem lassul négyzetesen a lista, a jelölők és az összesítők számítása.
 */
const indexek = new WeakMap();
function index(tomb, nev, epit) {
  let m = indexek.get(tomb);
  if (!m) indexek.set(tomb, m = {});
  return m[nev] || (m[nev] = epit(tomb));
}
const azon = tomb => index(tomb, 'id', t => new Map(t.map(x => [x.id, x])));
const csoport = (tomb, mezo) => index(tomb, 'by:' + mezo, t => {
  const m = new Map();
  for (const x of t) { const k = x[mezo]; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
});
const URES = Object.freeze([]);
const AKTIV_KEY = 'terep_projekt';
let aktiv = null;

/** Indulás: a kiválasztott projekt és a store (bejelentkezés, letöltött adat, szinkron). */
export async function load() {
  try { aktiv = localStorage.getItem(AKTIV_KEY) || null; } catch { /* */ }
  await S.init(aktiv);
  // A kiválasztott projekt már nem látható (törölték, elvették a hozzáférést): nincs kiválasztott projekt
  if (aktiv && M().projektek.length && !getProjekt(aktiv)) await setAktiv(null);
}
export const adat = () => M();
/** Szerveres mód (nem helyi), a bejelentkezett felhasználó, jogosultság (szerepkör: kulsos < szerelo < iroda < admin). */
export const helyi = S.isHelyi;
export const felhasznalo = () => S.state.user;
export const jog = role => S.can(role);

/* ---------- Felhasználók (admin) ---------- */
// Szerepkörök (TerepLogic): kulsos < szerelo < iroda < admin. projektek: a látható projektek azonosítói;
// üres lista = minden projekt (külsősnél: egyik sem). Törlés nincs – a kitiltás az „aktív” kivétele.
export const ROLE_LABELS = window.TerepLogic.ROLE_LABELS;
export const SZEREPKOROK = ['admin', 'iroda', 'szerelo', 'kulsos'];
export const felhasznalok = () => M().felhasznalok;
export const getFelhasznalo = email => M().felhasznalok.find(u => u.email === String(email || '').toLowerCase()) || null;
/** Mindent lát-e (a projektlista üres, és nem külsős) – ilyenkor minden projekt, a később létrehozottak is. */
export const mindentLat = u => u.szerepkor === 'admin' || (u.szerepkor !== 'kulsos' && !u.projektek.length);
/** Látja-e a projektet (mint a szerver: TerepLogic.lathatja). */
/** Felhasználó mentése (új vagy meglévő): { email, nev, szerepkor, aktiv, projektek: [id], megjegyzes } → { hiba } | {}. */
export const mentFelhasznalo = u => muvelet({ type: 'felhasznalo_mentes', pid: null,
  felhasznalo: { email: String(u.email).trim().toLowerCase(), nev: String(u.nev || '').trim(), szerepkor: u.szerepkor, aktiv: u.aktiv !== false,
    projektek: u.projektek || [], megjegyzes: String(u.megjegyzes || '').trim() } });

/* ---------- Felhasználó neve (a naplóban) ---------- */
// Szerveres módban a belépésből jön (a Felhasznalok lapról); helyi módban a készüléken tárolt név.
export function getNev() { return S.isHelyi ? helyiNev() : (S.state.user && S.state.user.nev) || ''; }
export function setNev(v) { if (!S.isHelyi) return; setHelyiNev(v); S.setUserNev(v); }

/** Hiba a művelet ellenőrzésekor (TerepLogic) → { hiba } (a hívó jelzi), más hiba továbbmegy. */
async function muvelet(ops, ok) {
  try { await S.enqueue(ops); } catch (e) { if (e.validation) return { hiba: e.message }; throw e; }
  return ok ? ok() : {};
}
/** Mint a muvelet, de a hibát dobja (a felületen a globális hibakezelő jelzi). */
async function vegrehajt(ops) { await S.enqueue(ops); }

/* ---------- Projektek ---------- */
export const projektek = () => M().projektek;
export const getProjekt = id => azon(M().projektek).get(id) || null;
/** A kiválasztott projekt (az app ebbe nyílik legközelebb is). */
export const aktivId = () => aktiv;
export const projekt = () => getProjekt(aktiv);
/** Megvan-e a projekt részletes adata a készüléken (szerveres módban csak a megnyitott projekté). */
export const betoltve = (pid = aktiv) => M().betoltve.has(pid);
/** Projektváltás: a store betölti a projekt adatát (ha még nincs a készüléken, megvárja a letöltést). */
export async function setAktiv(id) {
  aktiv = id || null;
  try { localStorage.setItem(AKTIV_KEY, aktiv || ''); } catch { /* */ }
  await S.setProjekt(aktiv);
}
const projektSor = (p, extra = {}) => ({ projekt_id: p.id, nev: p.nev, ugyfel: p.ugyfel, helyszin: p.helyszin, allapot: p.allapot, ...extra });
export async function addProjekt({ nev, ugyfel = '', helyszin = '', sablon = 0 }) {
  const id = uid('j');
  await vegrehajt({ type: 'projekt_mentes', pid: null, projekt: { projekt_id: id, nev, ugyfel, helyszin, allapot: 'aktiv', oszlopok: [], tipus_oszlopok: [] },
    lepesek: sablonLepesek(sablon).map(l => ({ lepes_id: l.id, nev: l.nev, szin: l.szin })) });
  return getProjekt(id);
}
export const updateProjekt = (id, fields) => vegrehajt({ type: 'projekt_mentes', pid: null, projekt: projektSor({ ...getProjekt(id), ...fields }) });
/** Projekt törlése a rajzaival, pozícióival, típusaival és naplójával együtt (admin). */
export async function delProjekt(id) {
  await vegrehajt({ type: 'projekt_torles', pid: null, projekt_id: id });
  if (aktiv === id) await setAktiv(null);
  await S.projektCacheTorol(id);
}

/* ---------- Műveletsor (projektenként) ---------- */
export const lepesek = (pid = aktiv) => (getProjekt(pid) || {}).lepesek || [];
export const setLepesek = (list, pid = aktiv) => vegrehajt({ type: 'lepesek_mentes', projekt_id: pid,
  lepesek: list.map(l => ({ lepes_id: l.id, nev: l.nev, szin: l.szin, suly: Number(l.suly) || 0 })) });
/**
 * A lépések részesedése a készültségből (0–1, összegük 1): a súlyok arányában; ha egyiknek sincs súlya, egyenlő arányban.
 * Visszaad: Map(lépés-id → részesedés).
 */
export function reszesedes(pid = aktiv) {
  const lep = lepesek(pid), ossz = lep.reduce((s, l) => s + (l.suly || 0), 0);
  return new Map(lep.map(l => [l.id, ossz > 0 ? (l.suly || 0) / ossz : 1 / lep.length]));
}
/** Egy pozíció készültsége (0–1): a kész lépései részesedésének összege (le nem rakott pozíció: 0). */
export function pozKeszultseg(poz, resz = null) {
  const p = getPoz(poz);
  if (!p || !p.rajzId) return 0;
  resz = resz || reszesedes(p.projektId);
  let v = 0;
  for (const id of allapot(poz).kesz.keys()) v += resz.get(id) || 0;
  return Math.min(1, v);
}
/** Van-e bejegyzés az adott lépéshez (törlés előtti figyelmeztetéshez). */
export const lepesHasznalt = id => M().esemenyek.some(e => e.lepes === id);

/* ---------- Rajzok ---------- */
export const rajzok = (pid = aktiv) => M().rajzok.filter(r => r.projektId === pid);
/** Új rajz feltöltése (szerveres módban csak online). meta: { epulet, szint, W, H } – W, H: az oldal mérete pontban. */
export async function addRajz(nev, bytes, { epulet = '', szint = '', W = 0, H = 0 } = {}, pid = aktiv) {
  const id = await S.feltolt({ rajz_id: uid('r'), projekt_id: pid, nev, epulet, szint, W, H }, bytes);
  return getRajz(id);
}
export const getRajz = id => azon(M().rajzok).get(id);
export const updateRajz = (id, fields) => {
  const r = { ...getRajz(id), ...fields };
  return vegrehajt({ type: 'rajz_mentes', rajz: { rajz_id: id, nev: r.nev, epulet: r.epulet, szint: r.szint } });
};
/**
 * Rajzcsere (új revízió): a PDF kicserélődik, a jelölők az oldalhoz viszonyított helyükön maradnak (x, y: 0–1).
 * W, H: az új oldal mérete pontban (az eltérést a hívó ellenőrzi és jelzi). A verziószám nő. Szerveres módban csak online.
 */
export const csereRajz = (id, bytes, { W, H }) => S.feltolt({ rajz_id: id, W, H }, bytes);
/** A rajz PDF-je (bájtok). Ha offline csak egy régebbi verzió van meg a készüléken, azt adja, és jelez. */
export async function getPdf(id) {
  const res = await S.pdf(id);
  if (res.stale) toast('Offline: a rajz egy korábbi verziója látszik (az újabb még nincs letöltve)', 'warn', 6000);
  return res.bytes;
}
/**
 * Rajz törlése. A rajta lévő pozíciók (fajta: pozíció) nem vesznek el, csak lekerülnek a rajzról („nincs lerakva”);
 * a terepi felmérés- és hibajelölések törlődnek (jelöléssel). A napló megmarad.
 */
export const delRajz = id => vegrehajt({ type: 'rajz_torles', rajz_id: id });
/** „A · 1B” – a hely (épület · szint), ami meg van adva. */
export const helySzoveg = (epulet, szint) => [epulet, szint].filter(Boolean).join(' · ');

/* ---------- Pozíciók (egy pozíció = egy sor; lerakva, ha van rajzId) ---------- */
/** A projekt összes (nem törölt) pozíciója – fajta szerint szűrhető. */
export const poziciok = (pid = aktiv, fajta = null) => M().poziciok.filter(p => p.projektId === pid && (!fajta || p.fajta === fajta));
/** Egy rajzon lévő (lerakott) jelölések. */
export const rajzPoziciok = rajzId => (rajzId ? (csoport(M().poziciok, 'rajzId').get(rajzId) || URES).slice() : []);
export const getPoz = id => azon(M().poziciok).get(id);
/** Pozíció a jele alapján (fajta: pozíció), vagy null. */
export function pozJel(jel, pid = aktiv) {
  const k = kulcs(jel);
  if (!k) return null;
  // Jel → pozíció index projektenként (az első egyező, mint korábban a find)
  const m = index(M().poziciok, 'jel:' + pid, () => {
    const out = new Map();
    for (const p of poziciok(pid, 'pozicio')) { const kk = kulcs(p.jel); if (kk && !out.has(kk)) out.set(kk, p); }
    return out;
  });
  return m.get(k) || null;
}

/** poz_mentes sor: csak a megadott mezők (részleges frissítés). */
function pozSor(id, f, pid) {
  const row = { poz_id: id };
  if (pid) row.projekt_id = pid;
  if (f.fajta) row.fajta = f.fajta;
  for (const m of MEZOK) if (m in f) row[m] = String(f[m] ?? '').trim();
  if (f.adatok) row.adatok = f.adatok;
  return row;
}
const lerakOp = (id, rajzId, x, y) => ({ type: 'poz_lerakas', poz_id: id, rajz_id: rajzId || '', x: rajzId ? x : 0, y: rajzId ? y : 0 });
/** Új pozíció (f: mezők, és ha le van rakva: rajzId, x, y). */
export async function addPoz(f, pid = aktiv) {
  const id = uid('p'), ops = [{ type: 'poz_mentes', rows: [pozSor(id, { fajta: 'pozicio', ...f }, pid)] }];
  if (f.rajzId) ops.push(lerakOp(id, f.rajzId, f.x, f.y));
  await vegrehajt(ops);
  return getPoz(id);
}
/** Módosítás: a mezők (jel, típus…) és / vagy a hely (rajzId, x, y – a rajzId elhagyható, ha marad). */
export async function updatePoz(id, fields) {
  const p = getPoz(id), ops = [];
  if (MEZOK.some(m => m in fields) || fields.adatok) ops.push({ type: 'poz_mentes', rows: [pozSor(id, fields)] });
  if ('x' in fields || 'rajzId' in fields) {
    const rajzId = 'rajzId' in fields ? fields.rajzId : p.rajzId;
    ops.push(lerakOp(id, rajzId, fields.x ?? p.x, fields.y ?? p.y));
  }
  await vegrehajt(ops);
}
/** Lerakás a rajzra (meglévő, még le nem rakott pozíció). */
export const lerakPoz = (id, rajzId, x, y) => vegrehajt(lerakOp(id, rajzId, x, y));
/** Levétel a rajzról: a pozíció megmarad („nincs lerakva”); a felmérés- és hibajelölés ilyenkor törlődik. */
export async function leveszPoz(id) {
  const p = getPoz(id);
  if (p.fajta === 'pozicio') await vegrehajt(lerakOp(id, null));
  else await delPoz(id);
}
/** Törlés jelöléssel (nem fizikai törlés): az azonosító és a napló megmarad. */
export const delPoz = id => vegrehajt({ type: 'poz_torles', poz_id: id });
/**
 * Pozíció mentése (új: id = null; lerakatlan). f: { jel, tipus, szel, mag, epulet, szint, adatok }.
 * A jel a projekt pozíciói között egyedi. Visszaad: { hiba } vagy { poz }.
 */
export async function mentPoz(id, f, pid = aktiv) {
  const jel = String(f.jel ?? (id ? getPoz(id).jel : '')).trim();
  const fajta = id ? getPoz(id).fajta : f.fajta || 'pozicio';
  if (fajta === 'pozicio' && !jel) return { hiba: 'Add meg a pozíció jelét' };
  const masik = fajta === 'pozicio' && pozJel(jel, pid);
  if (masik && masik.id !== id) return { hiba: `A(z) „${jel}” jel már szerepel` };
  const tiszta = {};
  for (const m of MEZOK) if (m in f) tiszta[m] = String(f[m] ?? '').trim();
  if (f.adatok) tiszta.adatok = Object.fromEntries(Object.entries(f.adatok).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v));
  const ujId = id || uid('p');
  return muvelet({ type: 'poz_mentes', rows: [pozSor(ujId, id ? tiszta : { ...tiszta, fajta }, id ? null : pid)] }, () => ({ poz: getPoz(ujId) }));
}

/** Javasolt jel az új pozíciónak: az utolsó jel végén lévő számot növeli (A-12 → A-13), különben sorszám. */
export function nextNev(rajzId) {
  const list = rajzPoziciok(rajzId).filter(p => p.fajta === 'pozicio');
  const last = list[list.length - 1];
  const m = last && /^(.*?)(\d+)(\D*)$/.exec(last.jel);
  if (m) return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') + m[3];
  return String(list.length + 1);
}
/**
 * A még le nem rakott pozíciók (a lerakáskori választóhoz). hely = { epulet, szint } esetén csak az ott lévők
 * (ha a rajzon meg van adva és a pozícióknál van ilyen adat) – így a javaslatlista csak a releváns pozíciókat kínálja.
 */
export function lerakatlan(pid = aktiv, hely = {}) {
  const szuro = ['epulet', 'szint'].filter(sz => hely[sz] && vanOszlop(sz, pid));
  return poziciok(pid, 'pozicio').filter(p => !p.rajzId && p.jel && szuro.every(sz => kulcs(p[sz]) === kulcs(hely[sz])));
}
/** Van-e a pozícióknál ilyen adat (pl. épület, szint). */
export const vanOszlop = (mezo, pid = aktiv) => poziciok(pid, 'pozicio').some(p => !ures(p[mezo]));
/** Egy mező különböző értékei a pozíciók között – az épület/szint/típus mezők javaslatlistájához. */
export const listaErtekek = (mezo, pid = aktiv) => [...new Set(poziciok(pid, 'pozicio').map(p => String(p[mezo] ?? '').trim()).filter(Boolean))];

/* ---------- Típusok ---------- */
export const tipusok = (pid = aktiv) => M().tipusok.filter(t => t.projektId === pid);
export const getTipus = id => azon(M().tipusok).get(id);
export function tipusJel(jel, pid = aktiv) { const k = kulcs(jel); return k ? tipusok(pid).find(t => kulcs(t.jel) === k) || null : null; }
/** A tulajdonságok a projekt oszlopsorrendjében: [[név, érték]…] (csak a kitöltöttek). */
const rendezett = (adatok, sorrend) => {
  const e = Object.entries(adatok || {}).filter(([, v]) => !ures(v));
  const ix = k => { const i = sorrend.indexOf(k); return i < 0 ? 1e6 : i; };
  return e.sort((a, b) => ix(a[0]) - ix(b[0]));
};
/** Egy típus: { jel, szel, mag, adatok: [[név, érték]…] } vagy null. */
export function tipus(jel, pid = aktiv) {
  const t = tipusJel(jel, pid);
  return t ? { jel: t.jel, szel: t.szel, mag: t.mag, adatok: rendezett(t.adatok, (getProjekt(pid) || {}).tipusOszlopok || []) } : null;
}
const tipusSor = (id, r, pid) => ({ tipus_id: id, projekt_id: pid, jel: r.jel, szel: r.szel || '', mag: r.mag || '', adatok: r.adatok || {} });
/** Típus mentése (új: id = null). Átnevezéskor a pozíciók „tipus” mezője követi. Visszaad: { hiba } vagy { tipus }. */
export async function mentTipus(id, f, pid = aktiv) {
  const jel = String(f.jel ?? '').trim();
  if (!jel) return { hiba: 'Add meg a típus jelét' };
  const masik = tipusJel(jel, pid);
  if (masik && masik.id !== id) return { hiba: `A(z) „${jel}” típus már szerepel` };
  const rec = { jel, szel: String(f.szel ?? '').trim(), mag: String(f.mag ?? '').trim(),
    adatok: Object.fromEntries(Object.entries(f.adatok || {}).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v)) };
  const ujId = id || uid('t');
  return muvelet({ type: 'tipus_mentes', rows: [tipusSor(ujId, rec, pid)] }, () => ({ tipus: getTipus(ujId) }));
}
export const delTipus = id => vegrehajt({ type: 'tipus_torles', tipus_id: id });
/** Új tulajdonság-/adatoszlop felvétele a projekthez (kind: 'lista' → oszlopok, 'tipusok' → tipusOszlopok). */
export async function addOszlop(kind, nev, pid = aktiv) {
  const p = getProjekt(pid), lista = oszlopok(kind, pid);
  if (lista.includes(nev)) return;
  const uj = [...lista, nev];
  await vegrehajt({ type: 'projekt_mentes', pid: null, projekt: projektSor(p, kind === 'lista' ? { oszlopok: uj } : { tipus_oszlopok: uj }) });
}
export const oszlopok = (kind, pid = aktiv) => (getProjekt(pid) || {})[kind === 'lista' ? 'oszlopok' : 'tipusOszlopok'] || [];

/**
 * A pozíció összesített adatai (a típusból örökölve): { jel, tipus, szel, mag, epulet, szint, adatok, honnan: { szel, mag }, tipusDef }.
 * Amit a pozíció nem ad meg (üres), az a típusból jön (honnan.szel / honnan.mag = 'tipus'); a típus tulajdonságai a pozíció
 * saját adatai előtt (azonos nevűnél a pozícióé érvényes). p: pozíció vagy azonosító.
 */
export function tetel(p) {
  if (typeof p === 'string') p = getPoz(p);
  if (!p) return null;
  const t = tipus(p.tipus, p.projektId);
  const sajat = rendezett(p.adatok, (getProjekt(p.projektId) || {}).oszlopok || []);
  const nevek = new Set(sajat.map(a => kulcs(a[0])));
  return {
    jel: p.jel, tipus: p.tipus || '', epulet: p.epulet || '', szint: p.szint || '',
    szel: p.szel || (t ? t.szel : ''), mag: p.mag || (t ? t.mag : ''),
    honnan: { szel: !p.szel && t && t.szel ? 'tipus' : '', mag: !p.mag && t && t.mag ? 'tipus' : '' },
    adatok: [...(t ? t.adatok.filter(a => !nevek.has(kulcs(a[0]))) : []), ...sajat],
    tipusDef: !!t,
  };
}

/* ---------- Beillesztés Excelből (pozíciók: 'lista', típusok: 'tipusok') ----------
 * uj = { oszlopok: [{ nev, szerep }], sorok: [{ oszlopnév: érték }] } – a szerepes oszlopok a rögzített mezőkbe,
 * a „további adat” oszlopok az adatok közé kerülnek (oszlopnév szerint).
 */
function rekordok(kind, uj) {
  const out = [], latott = new Set();
  for (const s of uj.sorok) {
    const rec = { adatok: {} };
    for (const o of uj.oszlopok) {
      const v = String(s[o.nev] ?? '').trim();
      if (o.szerep === 'adat') { if (v) rec.adatok[o.nev] = v; } else if (o.szerep in TABLAK[kind] && o.szerep !== 'kihagy') rec[o.szerep] = v;
    }
    const k = kulcs(rec.jel);
    if (!k || latott.has(k)) continue; // az első érvényes
    latott.add(k);
    out.push(rec);
  }
  return out;
}
const keres = (kind, jel, pid) => (kind === 'lista' ? pozJel(jel, pid) : tipusJel(jel, pid));
export const vanTabla = (kind, pid = aktiv) => (kind === 'lista' ? poziciok(pid, 'pozicio').length : tipusok(pid).length) > 0;
/**
 * Előnézet: { uj: [jel], egyezo: [jel], arva: [jel] }. arva: teljes cserénél ami adat nélkül maradna – pozíciónál a lerakott
 * (rajzon lévő) pozíciók, amelyek nincsenek az új listában; típusnál a pozíciókban használt típusok.
 */
export function elemezTabla(kind, uj, pid = aktiv) {
  const recs = rekordok(kind, uj), ujK = new Set(recs.map(r => kulcs(r.jel)));
  const out = { uj: [], egyezo: [], arva: [] };
  for (const r of recs) (keres(kind, r.jel, pid) ? out.egyezo : out.uj).push(r.jel);
  out.arva = kind === 'lista' ? poziciok(pid, 'pozicio').filter(p => p.rajzId && !ujK.has(kulcs(p.jel))).map(p => p.jel)
    : [...new Set(listaErtekek('tipus', pid))].filter(t => tipusJel(t, pid) && !ujK.has(kulcs(t)));
  return out;
}
const DARAB = 500; // egy műveletben legfeljebb ennyi sor (a szerver kérésmérete miatt)
const darabol = (rows, fn) => { const out = []; for (let i = 0; i < rows.length; i += DARAB) out.push(fn(rows.slice(i, i + DARAB))); return out; };
const URES_MEZOK = { tipus: '', szel: '', mag: '', epulet: '', szint: '' };
/**
 * Beillesztés. mod 'bovit' (alap): az új jelek hozzáadódnak; az egyezők frissit=true esetén frissülnek (csak a nem üres
 * cellák írnak felül), különben változatlanok. mod 'csere': a teljes lista lecserélődik – pozíciónál a rajzon lévő, de az új
 * listában nem szereplő pozíciók jele és helye megmarad, az adataik törlődnek; a le nem rakottak törlődnek.
 * Visszaad: { uj, egyezo } darabszámok. Az egész egy lépésben kerül a kimenő sorba (vagy semmi, ha hibás).
 */
export async function importal(kind, uj, { mod = 'bovit', frissit = false } = {}, pid = aktiv) {
  const recs = rekordok(kind, uj);
  const p = getProjekt(pid);
  const ujOsz = uj.oszlopok.filter(o => o.szerep === 'adat').map(o => o.nev);
  const osz = mod === 'csere' ? ujOsz : [...new Set([...oszlopok(kind, pid), ...ujOsz])];
  const ops = [{ type: 'projekt_mentes', pid: null, projekt: projektSor(p, kind === 'lista' ? { oszlopok: osz } : { tipus_oszlopok: osz }) }];
  const sorok = [], torol = [];
  let n = 0, e = 0;
  if (mod === 'csere') {
    const ujK = new Map(recs.map(r => [kulcs(r.jel), r]));
    if (kind === 'lista') {
      for (const x of poziciok(pid, 'pozicio')) {
        const r = ujK.get(kulcs(x.jel));
        if (r) { sorok.push(pozSor(x.id, { ...URES_MEZOK, ...r, jel: r.jel })); ujK.delete(kulcs(x.jel)); e++; }
        else if (x.rajzId) sorok.push(pozSor(x.id, { ...URES_MEZOK, adatok: {} }));
        else torol.push({ type: 'poz_torles', poz_id: x.id });
      }
      for (const r of ujK.values()) { sorok.push(pozSor(uid('p'), { fajta: 'pozicio', ...r }, pid)); n++; }
    } else {
      for (const t of tipusok(pid)) torol.push({ type: 'tipus_torles', tipus_id: t.id });
      for (const r of recs) { sorok.push(tipusSor(uid('t'), r, pid)); n++; }
    }
  } else {
    for (const r of recs) {
      const x = keres(kind, r.jel, pid);
      if (x) {
        e++;
        if (!frissit) continue;
        const f = Object.fromEntries(Object.entries(r).filter(([k, v]) => k !== 'adatok' && k !== 'jel' && !ures(v)));
        const adatok = { ...x.adatok, ...r.adatok };
        sorok.push(kind === 'lista' ? pozSor(x.id, { ...f, adatok }) : tipusSor(x.id, { ...x, ...f, adatok }, pid));
      } else if (kind === 'lista') { sorok.push(pozSor(uid('p'), { fajta: 'pozicio', ...r }, pid)); n++; }
      else { sorok.push(tipusSor(uid('t'), r, pid)); n++; }
    }
  }
  // Előbb a törlések (a csere után egy régi jel újra szerepelhet), utána a mentések
  ops.push(...torol, ...darabol(sorok, rows => ({ type: kind === 'lista' ? 'poz_mentes' : 'tipus_mentes', rows })));
  await vegrehajt(ops);
  return { uj: n, egyezo: e };
}

/**
 * Excelből másolt táblázat (tabulátorral elválasztva; ha nincs benne tabulátor, pontosvesszővel – magyar CSV) → sorok.
 * Kezeli az Excel idézőjeles celláit (bennük sortörés, tabulátor, "" = idézőjel).
 */
export function parseTabla(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = first.includes('\t') ? '\t' : first.includes(';') ? ';' : '\t';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
}

/* ---------- Események és állapot ---------- */
/** Bejegyzés (a rögzítő a bejelentkezésből; az időpont a készüléké – offline rögzítésnél is a valódi idő). */
export async function addEsemeny(poz, tipus, { lepes, megj } = {}) {
  const id = uid('e');
  await vegrehajt({ type: 'esemeny', esemeny: { esemeny_id: id, poz_id: poz, tipus, lepes_id: lepes || '', mikor: most(), megj: megj || '' } });
  return M().esemenyek.find(e => e.id === id);
}
/**
 * Több bejegyzés egy lépésben (tömeges művelet, pótlás): [{ poz, tipus, lepes?, megj?, mikor? }]. Mindent vagy semmit
 * (a szabályok bármelyik bejegyzésnél elutasíthatják – az üzenet a pozíció jelével). 500-anként egy művelet.
 */
export async function addEsemenyek(list) {
  const t = most();
  const rows = list.map(x => ({ esemeny_id: uid('e'), poz_id: x.poz, tipus: x.tipus, lepes_id: x.lepes || '', mikor: x.mikor || t, megj: x.megj || '' }));
  if (rows.length) await vegrehajt(darabol(rows, esemenyek => ({ type: 'esemenyek', esemenyek })));
  return rows.length;
}
/** Egy pozíció bejegyzései időrendben (másolat – a hívó szabadon rendezheti / megfordíthatja). */
export const naplo = poz => (csoport(M().esemenyek, 'poz').get(poz) || URES).slice();

/* ---------- Fotók (bejegyzésenként; a feltöltés a bejegyzés után, offline is sorban áll) ---------- */
export const MAX_FOTO = window.TerepLogic.MAX_FOTO_ESEMENYENKENT;
export const fotok = esemenyId => (csoport(M().fotok, 'esemeny').get(esemenyId) || URES).slice();
export const getFoto = id => azon(M().fotok).get(id) || null;
/** Képek csatolása egy bejegyzéshez: kepek = [{ full, kicsi }] (foto.js kepKeszit). */
export async function addFotok(esemeny, kepek) {
  for (const k of kepek) await S.fotoHozzaad({ esemeny_id: esemeny.id, poz_id: esemeny.poz, mikor: esemeny.mikor }, k.full, k.kicsi);
}
export const delFoto = id => S.fotoTorol(id);
export const fotoUrl = (id, kicsi) => S.fotoUrl(id, kicsi);
/** Legutóbbi esemény egy pozíción (vagy null). */
export function utolso(poz) {
  const ev = csoport(M().esemenyek, 'poz').get(poz);
  return ev && ev.length ? ev[ev.length - 1] : null;
}

/**
 * Egy pozíció állapota az eseményekből (a pozíció projektjének műveletsora szerint):
 *   kesz: Map(lepesId → a „kész” esemény), hiba: esemény | null,
 *   flags: [bool…] a műveletsor sorrendjében, mely lépések készek,
 *   lepes: a sorrendben legelőrébb tartó kész lépés (vagy null) – a jelölő ennek a színét veszi fel.
 */
export function allapot(poz) {
  // Egy adatállapoton belül pozíciónként egyszer számolódik (a lista, a jelölők és az összesítők ugyanazt kérik többször)
  const tar = index(M().esemenyek, 'allapot', () => new Map());
  if (tar.has(poz)) return tar.get(poz);
  const kesz = new Map();
  let hiba = null;
  for (const e of csoport(M().esemenyek, 'poz').get(poz) || URES) {
    if (e.tipus === 'kesz') kesz.set(e.lepes, e);
    else if (e.tipus === 'visszavon') kesz.delete(e.lepes);
    else if (e.tipus === 'hiba') hiba = e;
    else if (e.tipus === 'hiba_vege') hiba = null;
  }
  const p = getPoz(poz);
  const lep = lepesek(p ? p.projektId : aktiv);
  const flags = lep.map(l => kesz.has(l.id));
  const i = flags.lastIndexOf(true);
  const a = { kesz, hiba, flags, lepes: i < 0 ? null : lep[i] };
  tar.set(poz, a);
  return a;
}
/** A pozíció jelölőjének színe és állapota a markerSvg-hez (fajta: a felmérés / hibajelzés saját jelet kap). */
export function jelolo(poz) {
  const a = allapot(poz), p = getPoz(poz);
  return { szin: a.lepes ? a.lepes.szin : SZIN_NINCS, mind: a.flags.length > 0 && a.flags.every(Boolean), hiba: !!a.hiba, fajta: p ? p.fajta : 'pozicio' };
}
/* ---------- Elvégzett munka (Teljesítmény, Munkám) ----------
 * Csak az érvényes (azóta vissza nem vont) „kész” bejegyzések számítanak; a műveletsor-módosítás utáni pótlás nem
 * (az adminisztráció, nem munka). Mennyiségek – pénzügyi adat nincs.
 */
export const POTLAS = 'Pótlás';
/**
 * Az elvégzett lépések a projektben: [{ e (esemény), poz, lepes, tipus, epulet, szint }], időrendben.
 * Szűrés: tol / ig (Date, ig kizárólagos), email (a rögzítő).
 */
export function elvegzett({ tol = null, ig = null, email = null } = {}, pid = aktiv) {
  const lep = new Map(lepesek(pid).map(l => [l.id, l])), out = [];
  for (const p of poziciok(pid, 'pozicio')) {
    if (!p.rajzId) continue;
    const r = getRajz(p.rajzId), t = tetel(p);
    for (const e of allapot(p.id).kesz.values()) {
      if (!lep.has(e.lepes) || String(e.megj || '').startsWith(POTLAS)) continue;
      const m = Date.parse(e.mikor);
      if ((tol && m < tol.getTime()) || (ig && m >= ig.getTime()) || (email && e.kiEmail !== email)) continue;
      out.push({ e, poz: p, lepes: lep.get(e.lepes), tipus: t.tipus || '', epulet: r ? r.epulet || '' : '', szint: r ? r.szint || '' : '' });
    }
  }
  return out.sort((a, b) => String(a.e.mikor).localeCompare(String(b.e.mikor)));
}

/* ---------- Hézagok: egy későbbi lépés kész, egy korábbi nem (pl. új lépés beszúrása után) ---------- */
/**
 * A projekt lerakott pozíciói, ahol egy lépés hiányzik, de egy későbbi már kész: [{ poz, hianyzo: [lépés], mikor }].
 * mikor: a hiányzó lépés utáni első kész lépés ideje (a pótlás ezzel az idővel kerül a naplóba, így az időrend nem borul).
 */
export function hezagok(pid = aktiv) {
  const lep = lepesek(pid), out = [];
  for (const p of poziciok(pid, 'pozicio')) {
    if (!p.rajzId) continue;
    const a = allapot(p.id), utolso = a.flags.lastIndexOf(true);
    const hianyzo = lep.filter((l, i) => i < utolso && !a.flags[i]);
    if (!hianyzo.length) continue;
    const elso = lep.findIndex((l, i) => i > lep.indexOf(hianyzo[0]) && a.flags[i]);
    out.push({ poz: p, hianyzo, mikor: a.kesz.get(lep[elso].id).mikor });
  }
  return out;
}
/** A hézagok pótlása: a hiányzó lépések késznek jelölése („Pótlás” megjegyzéssel). Visszaad: a bejegyzések száma. */
export function potolHezagok(list, megj = POTLAS + ' (a műveletsor módosítása után)') {
  return addEsemenyek(list.flatMap(h => h.hianyzo.map(l => ({ poz: h.poz.id, tipus: 'kesz', lepes: l.id, mikor: h.mikor, megj }))));
}

/* ---------- Tömeges műveletek (a kijelölt pozíciókon) ----------
 * Lépés és hiba csak a lerakott, „pozíció” fajtájú pozíciókon (ahogy az adatlapon is). Mind { bejegyzes|modositva, kihagyva }-t ad vissza.
 */
const lepesesek = ids => ids.map(getPoz).filter(p => p && p.fajta === 'pozicio' && p.rajzId);
/** Előnézet / végrehajtás: a lépésig minden hiányzó lépés kész („Idáig kész”). */
export function tervKesz(ids, lepesId) {
  const lep = lepesek(), ix = lep.findIndex(l => l.id === lepesId), list = [];
  let kesz = 0;
  for (const p of lepesesek(ids)) {
    const f = allapot(p.id).flags, hiany = lep.slice(0, ix + 1).filter((l, i) => !f[i]);
    if (!hiany.length) kesz++;
    hiany.forEach(l => list.push({ poz: p.id, tipus: 'kesz', lepes: l.id }));
  }
  return { list, poz: new Set(list.map(x => x.poz)).size, mar: kesz, kihagyva: ids.length - lepesesek(ids).length };
}
/** A lépéstől kezdve minden kész lépés visszavonása (a legutolsótól visszafelé). */
export function tervVissza(ids, lepesId) {
  const lep = lepesek(), ix = lep.findIndex(l => l.id === lepesId), list = [];
  for (const p of lepesesek(ids)) {
    const f = allapot(p.id).flags;
    for (let i = lep.length - 1; i >= ix; i--) if (f[i]) list.push({ poz: p.id, tipus: 'visszavon', lepes: lep[i].id });
  }
  return { list, poz: new Set(list.map(x => x.poz)).size, kihagyva: ids.length - lepesesek(ids).length };
}
/** Hiba jelzése / megoldása / megjegyzés. hiba_vege csak ott, ahol van nyitott hiba. */
export function tervEsemeny(ids, tipus) {
  const ps = lepesesek(ids).filter(p => tipus !== 'hiba_vege' || allapot(p.id).hiba);
  return { list: ps.map(p => ({ poz: p.id, tipus })), poz: ps.length, kihagyva: ids.length - ps.length };
}
/** Adat átírása (iroda): mezo = 'tipus'|'epulet'|'szint'|'szel'|'mag' vagy 'adat:<oszlopnév>'; üres érték = törlés. */
export async function tomegesAdat(ids, mezo, ertek) {
  const v = String(ertek ?? '').trim();
  const rows = ids.map(getPoz).filter(p => p && p.fajta === 'pozicio').map(p => {
    if (mezo.startsWith('adat:')) {
      const adatok = { ...p.adatok }, k = mezo.slice(5);
      if (v) adatok[k] = v; else delete adatok[k];
      return pozSor(p.id, { adatok });
    }
    return pozSor(p.id, { [mezo]: v });
  });
  if (mezo.startsWith('adat:') && v) await addOszlop('lista', mezo.slice(5));
  if (rows.length) await vegrehajt(darabol(rows, r => ({ type: 'poz_mentes', rows: r })));
  return rows.length;
}
/** Levétel a rajzról (iroda): a pozíciók megmaradnak („nincs lerakva”); felmérés / hibajelölés: törlés. */
export async function tomegesLevetel(ids) {
  const ps = ids.map(getPoz).filter(p => p && p.rajzId);
  await vegrehajt(ps.map(p => (p.fajta === 'pozicio' ? lerakOp(p.id, null) : { type: 'poz_torles', poz_id: p.id })));
  return ps.length;
}

/**
 * Projekt-összesítő (csak a „pozíció” fajtájúak): { rajz, lerakva, lerakatlan, cnt: Map(állapot-kulcs → db), hiba, keszultseg (0–1, súlyozott), felmeres, hibajel },
 * vagy null, ha a projekt adata nincs a készüléken (szerveres módban csak a megnyitott projekté van meg).
 * Állapot-kulcs: '' = nincs elkezdve, különben a legelőrébb tartó kész lépés id-je.
 */
export function projektStat(pid = aktiv) {
  if (!betoltve(pid)) return null;
  const all = poziciok(pid);
  const poz = all.filter(p => p.fajta === 'pozicio');
  const cnt = new Map(), resz = reszesedes(pid);
  let hiba = 0, lerakva = 0, ertek = 0;
  for (const p of poz) {
    if (!p.rajzId) continue;
    lerakva++;
    const a = allapot(p.id);
    const k = a.lepes ? a.lepes.id : '';
    cnt.set(k, (cnt.get(k) || 0) + 1);
    if (a.hiba) hiba++;
    for (const id of a.kesz.keys()) ertek += resz.get(id) || 0;
  }
  // keszultseg: súlyozott készültség (0–1) a projekt összes pozícióján (a le nem rakottak 0-val számítanak)
  return { rajz: rajzok(pid).length, lerakva, lerakatlan: poz.length - lerakva, cnt, hiba, keszultseg: poz.length ? ertek / poz.length : 0,
    felmeres: all.filter(p => p.fajta === 'felmeres').length, hibajel: all.filter(p => p.fajta === 'hiba').length };
}
