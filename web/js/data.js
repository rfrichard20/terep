// Adatréteg a felületnek: olvasás a store modelljéből (szerver-pillanatkép + függő műveletek, model.js szerkezetben),
// írás műveletekkel (store.enqueue → TerepLogic.applyOp helyben azonnal, utána szinkron a szerverre).
// v2 (ATALAKITAS_V2.md): pozíció = HELY (jelölő a rajzon, hiba, napló); ELEM = ami a helyre kerül (termékfajta, típus, méret,
// darab) – a lépések, a készültség és a teljesítmény elemenként. A lépésekhez kötött nézetek (csempék, jelmagyarázat, Teljesítmény)
// a projektben kiválasztott termékfajtára vonatkoznak (fajta() / setFajta()).
// Eseménytípusok: kesz, visszavon (elem lépéséhez) · hiba, hiba_vege · megj (a helyhez, vagy egy elemhez).
import * as S from './store.js';
import { uid, toast } from './ui.js';
import { helyiNev, setHelyiNev } from './backend.js';
import { SZIN_NINCS, SZIN_KESZ, alapSzin, PROJEKT_ALLAPOT, FAJTAK, MEZOK, HELY_MEZOK, ELEM_MEZOK, most, ures, kulcs } from './model.js';

export { SZIN_NINCS, SZIN_KESZ, alapSzin, PROJEKT_ALLAPOT, FAJTAK, MEZOK, HELY_MEZOK, ELEM_MEZOK, kulcs };
export const SZEREPEK = { jel: 'Pozíció jele', kategoria: 'Termékfajta', tipus: 'Típus', szel: 'Szélesség', mag: 'Magasság', db: 'Darab',
  epulet: 'Épület', szint: 'Szint', helyiseg: 'Helyiség', homlokzat: 'Homlokzat', adat: 'Hely adat', eadat: 'Elem adat', kozos: 'Közös ezekkel (jelek)', kihagy: 'Nem kell' };
export const SZEREPEK_TIPUS = { jel: 'Típus jele', szel: 'Szélesség', mag: 'Magasság', adat: 'Tulajdonság', kihagy: 'Nem kell' };
export const TABLAK = { lista: SZEREPEK, tipusok: SZEREPEK_TIPUS };
export const KAPCSOLAT_TIPUSOK = window.TerepLogic.KAPCSOLAT_TIPUSOK;
export const KAPCSOLAT_ALLAPOT = window.TerepLogic.KAPCSOLAT_ALLAPOT;

const M = () => S.state.model;
/**
 * Indexek a modell tömbjeihez (azonosító → elem, csoportosítások, állapotok). A tömbök minden adatváltozáskor újak
 * (store → fromServer), ezért a WeakMap-ben tárolt index magától érvénytelenné válik – nem kell kézzel üríteni.
 * A modell tömbjeit és az indexből kapott elemeket ne módosítsd helyben (a listás függvények másolatot adnak).
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
const tisztaAdatok = a => Object.fromEntries(Object.entries(a || {}).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v));

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
/** Új projekt; a választott termékfajta műveletsora a sablonból (cégszintű lista) másolódik. */
export async function addProjekt({ nev, ugyfel = '', helyszin = '', kategoria = null }) {
  const id = uid('j');
  const ops = [{ type: 'projekt_mentes', pid: null, projekt: { projekt_id: id, nev, ugyfel, helyszin, allapot: 'aktiv' } }];
  const k = getKategoria(kategoria) || aktivKategoriak().find(x => !x.vezerlo);
  if (k) ops.push(lepesekSablonbol(k, id));
  await vegrehajt(ops);
  return getProjekt(id);
}
export const updateProjekt = (id, fields) => vegrehajt({ type: 'projekt_mentes', pid: null, projekt: projektSor({ ...getProjekt(id), ...fields }) });
/** Projekt törlése a rajzaival, pozícióival, elemeivel, típusaival és naplójával együtt (admin). */
export async function delProjekt(id) {
  await vegrehajt({ type: 'projekt_torles', pid: null, projekt_id: id });
  if (aktiv === id) await setAktiv(null);
  await S.projektCacheTorol(id);
}

/* ---------- Termékfajták (cégszintű) és a projekt műveletsora fajtánként ---------- */
export const kategoriak = () => M().kategoriak;
export const getKategoria = id => azon(M().kategoriak).get(id) || null;
export const aktivKategoriak = () => M().kategoriak.filter(k => k.aktiv);
/** Termékfajta mentése (admin): { id?, nev, szin, lepesek: [{nev, szin, suly}], oszlopok, vezerlo, aktiv, sorrend } → { hiba } | { kategoria }. */
export function mentKategoria(k) {
  const id = k.id || 'k' + uid('').slice(0, 10);
  return muvelet({ type: 'kategoria_mentes', pid: null, kategoria: { kategoria_id: id, nev: k.nev, szin: k.szin, sorrend: k.sorrend,
    lepesek: k.lepesek, oszlopok: k.oszlopok, vezerlo: k.vezerlo, aktiv: k.aktiv } }, () => ({ kategoria: getKategoria(id) }));
}
/** A projektben használt termékfajták (amelyeknek lépései vagy elemei vannak), a lista sorrendjében. */
export function projektFajtak(pid = aktiv) {
  const ids = new Set();
  for (const l of csoport(M().lepesek, 'projektId').get(pid) || URES) ids.add(l.kategoriaId);
  for (const e of csoport(M().elemek, 'projektId').get(pid) || URES) ids.add(e.kategoriaId);
  return M().kategoriak.filter(k => ids.has(k.id));
}
// A kiválasztott termékfajta projektenként (a lépésekhez kötött nézetek ezt mutatják); eszközönként megmarad
const FAJTA_KEY = 'terep_fajta';
let fajtaMap = (() => { try { return JSON.parse(localStorage.getItem(FAJTA_KEY) || '{}') || {}; } catch { return {}; } })();
/** A projektben kiválasztott termékfajta azonosítója (ha nincs / már nincs a projektben: az első használt fajta). */
export function fajta(pid = aktiv) {
  const fk = projektFajtak(pid);
  return fk.some(k => k.id === fajtaMap[pid]) ? fajtaMap[pid] : (fk.find(k => !k.vezerlo) || fk[0] || {}).id || '';
}
export function setFajta(katId, pid = aktiv) {
  fajtaMap = { ...fajtaMap, [pid]: katId };
  try { localStorage.setItem(FAJTA_KEY, JSON.stringify(fajtaMap)); } catch { /* */ }
}
/** A projekt műveletsora egy termékfajtára (alapból a kiválasztottra). */
export const lepesek = (pid = aktiv, kat = fajta(pid)) => (csoport(M().lepesek, 'projektId').get(pid) || URES).filter(l => l.kategoriaId === kat);
export const getLepes = id => azon(M().lepesek).get(id) || null;
const lepesekOp = (list, pid, kat) => ({ type: 'lepesek_mentes', projekt_id: pid, kategoria_id: kat,
  lepesek: list.map(l => ({ lepes_id: l.id, nev: l.nev, szin: l.szin, suly: Number(l.suly) || 0 })) });
export const setLepesek = (list, pid = aktiv, kat = fajta(pid)) => vegrehajt(lepesekOp(list, pid, kat));
/** A termékfajta sablonjából a projekt műveletsora (új lépés-azonosítókkal). */
const lepesekSablonbol = (k, pid) => lepesekOp((k.lepesek.length ? k.lepesek : [{ nev: 'Kész', szin: SZIN_KESZ }])
  .map((l, i, t) => ({ id: uid('l'), nev: l.nev, szin: l.szin || alapSzin(i, t.length), suly: l.suly || 0 })), pid, k.id);
/** Termékfajta a projekthez (ha még nincs műveletsora: a sablonból). */
export async function fajtaHozzaad(katId, pid = aktiv) {
  const k = getKategoria(katId);
  if (!k || lepesek(pid, katId).length) return;
  await vegrehajt(lepesekSablonbol(k, pid));
}
/**
 * A lépések részesedése a készültségből (0–1, összegük 1) egy fajtában: a súlyok arányában; ha egyiknek sincs súlya,
 * egyenlő arányban. Visszaad: Map(lépés-id → részesedés).
 */
export function reszesedes(pid = aktiv, kat = fajta(pid)) {
  const lep = lepesek(pid, kat), ossz = lep.reduce((s, l) => s + (l.suly || 0), 0);
  return new Map(lep.map(l => [l.id, ossz > 0 ? (l.suly || 0) / ossz : 1 / lep.length]));
}
/** Van-e bejegyzés az adott lépéshez (törlés előtti figyelmeztetéshez). */
export const lepesHasznalt = id => M().esemenyek.some(e => e.lepes === id);

/* ---------- Rajzok ---------- */
export const rajzok = (pid = aktiv) => M().rajzok.filter(r => r.projektId === pid);
/**
 * Új rajz feltöltése (szerveres módban csak online). meta: { epulet, szint, homlokzat, W, H } – W, H: az oldal mérete pontban;
 * homlokzat: homlokzati rajznál a homlokzat neve (ilyenkor a szint általában üres).
 */
export async function addRajz(nev, bytes, { epulet = '', szint = '', homlokzat = '', W = 0, H = 0, fajlnev = '' } = {}, pid = aktiv) {
  const id = await S.feltolt({ rajz_id: uid('r'), projekt_id: pid, nev, epulet, szint, homlokzat, W, H, fajlnev }, bytes);
  return getRajz(id);
}
export const getRajz = id => azon(M().rajzok).get(id);
const kivagasStr = k => (k ? [k.x0, k.y0, k.x1, k.y1].map(v => Math.round(v * 1e5) / 1e5).join(',') : '');
/** Módosítás: nev, epulet, szint, homlokzat, kivagas ({ x0, y0, x1, y1 } oldalarányban, vagy null = teljes oldal). */
export const updateRajz = (id, fields) => {
  const r = { ...getRajz(id), ...fields };
  return vegrehajt({ type: 'rajz_mentes', rajz: { rajz_id: id, nev: r.nev, epulet: r.epulet, szint: r.szint, homlokzat: r.homlokzat || '',
    kivagas: kivagasStr(r.kivagas) } });
};
/**
 * Új rajz ugyanabból a PDF-ből (más kivágással; pl. két torony egy rajzon). A fájl nem másolódik: a forrásé (a csere mindegyikre
 * érvényes). f: { nev, epulet, szint, homlokzat, kivagas }. Visszaad: az új rajz.
 */
export async function rajzMasolat(forrasId, f) {
  const id = uid('r'), src = getRajz(forrasId);
  await vegrehajt({ type: 'rajz_masolat', rajz: { rajz_id: id, forras: src.forras || src.id, nev: f.nev, epulet: f.epulet || '', szint: f.szint || '',
    homlokzat: f.homlokzat || '', kivagas: kivagasStr(f.kivagas) } });
  return getRajz(id);
}
/** Egy rajz jelölői, amelyek a kivágáson kívül esnek (k = { x0, y0, x1, y1 }; null: egy sem). */
export const kivagasonKivul = (rajzId, k) => (k ? rajzPoziciok(rajzId).filter(p => p.x < k.x0 || p.x > k.x1 || p.y < k.y0 || p.y > k.y1) : []);
/**
 * Jelölők átrakása egy közös PDF-ű másik rajzra (ugyanaz az oldal → a hely változatlan). Pl. kettévágott rajznál a másik rész
 * jelölői az új rajzra. Visszaad: az átrakott jelölők száma.
 */
export async function atrakRajzra(ids, rajzId) {
  const ps = ids.map(getPoz).filter(p => p && p.rajzId);
  if (ps.length) await vegrehajt(ps.map(p => lerakOp(p.id, rajzId, p.x, p.y)));
  return ps.length;
}
/** A rajzok, amelyek ennek a rajznak a PDF-jét használják (a forrással együtt). */
export const kozosPdf = id => { const r = getRajz(id), f = r.forras || r.id; return rajzok(r.projektId).filter(x => x.id === f || x.forras === f); };
/**
 * Rajzcsere (új revízió): a PDF kicserélődik, a jelölők az oldalhoz viszonyított helyükön maradnak (x, y: 0–1).
 * W, H: az új oldal mérete pontban (az eltérést a hívó ellenőrzi és jelzi). A verziószám nő. Szerveres módban csak online.
 * Közös PDF-ű rajznál a forrás fájlja cserélődik (mindegyik rajzon).
 */
export const csereRajz = (id, bytes, { W, H, fajlnev = '' }) => S.feltolt({ rajz_id: getRajz(id).forras || id, W, H, fajlnev }, bytes);
/** A rajz PDF-jének eredeti fájlneve (közös PDF-nél a forrásé), vagy ''. */
export const pdfNev = id => { const r = getRajz(id); const f = r && r.forras ? getRajz(r.forras) : r; return f ? f.fajlnev : ''; };
/** A rajz PDF-jének verziója (közös PDF-nél a forrásé) – a nézőnek az újratöltéshez. */
export const pdfVerzio = id => { const r = getRajz(id); const f = r && r.forras ? getRajz(r.forras) : r; return f ? f.verzio : 0; };
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
/** „A · 1B” / „A · Észak homlokzat” – a hely (épület · szint · homlokzat), ami meg van adva. */
export const helySzoveg = (epulet, szint, homlokzat = '') =>
  [epulet, szint, homlokzat ? (/homlokzat/i.test(homlokzat) ? homlokzat : homlokzat + ' homlokzat') : ''].filter(Boolean).join(' · ');
/** A rajz helye szövegként (épület · szint · homlokzat). */
export const rajzHely = r => (r ? helySzoveg(r.epulet, r.szint, r.homlokzat) : '');
/**
 * Egy pozíció hely-mezője (épület, szint, homlokzat…). A homlokzat régebbi beillesztésnél „Hely adat” oszlopként is bekerülhetett
 * (pl. „Homlokzat”) – ilyenkor onnan.
 */
export function helyMezo(p, m) {
  if (p[m]) return p[m];
  if (m !== 'homlokzat') return '';
  const k = Object.keys(p.adatok || {}).find(x => /^homlokzat/.test(kulcs(x).normalize('NFD').replace(/[̀-ͯ]/g, '')));
  return k ? String(p.adatok[k]).trim() : '';
}

/* ---------- Pozíciók (helyek; lerakva, ha van rajzId) ---------- */
/** A projekt összes (nem törölt) pozíciója – fajta (pozíció / felmérés / hiba) szerint szűrhető. */
export const poziciok = (pid = aktiv, pfajta = null) => (csoport(M().poziciok, 'projektId').get(pid) || URES).filter(p => !pfajta || p.fajta === pfajta);
/** Egy rajzon lévő (lerakott) jelölések. */
export const rajzPoziciok = rajzId => (rajzId ? (csoport(M().poziciok, 'rajzId').get(rajzId) || URES).slice() : []);
export const getPoz = id => azon(M().poziciok).get(id);
/** Pozíció a jele alapján (fajta: pozíció), vagy null. */
export function pozJel(jel, pid = aktiv) {
  const k = kulcs(jel);
  if (!k) return null;
  const m = index(M().poziciok, 'jel:' + pid, () => {
    const out = new Map();
    for (const p of poziciok(pid, 'pozicio')) { const kk = kulcs(p.jel); if (kk && !out.has(kk)) out.set(kk, p); }
    return out;
  });
  return m.get(k) || null;
}

/** poz_mentes sor: csak a megadott hely-mezők (részleges frissítés). */
function pozSor(id, f, pid) {
  const row = { poz_id: id };
  if (pid) row.projekt_id = pid;
  if (f.fajta) row.fajta = f.fajta;
  for (const m of HELY_MEZOK) if (m in f) row[m] = String(f[m] ?? '').trim();
  if (f.adatok) row.adatok = f.adatok;
  return row;
}
/** elem_mentes sor: csak a megadott elem-mezők. Új elemnél poz + kategoriaId kell. */
function elemSor(id, f, uj = false) {
  const row = { elem_id: id };
  if (uj) { row.poz_id = f.poz; row.kategoria_id = f.kategoriaId; }
  else if (f.kategoriaId) row.kategoria_id = f.kategoriaId;
  for (const m of ['tipus', 'szel', 'mag']) if (m in f) row[m] = String(f[m] ?? '').trim();
  if ('db' in f) row.db = Number(String(f.db).replace(',', '.')) || 1;
  if (f.adatok) row.adatok = f.adatok;
  if ('sorrend' in f) row.sorrend = f.sorrend;
  return row;
}
const lerakOp = (id, rajzId, x, y) => ({ type: 'poz_lerakas', poz_id: id, rajz_id: rajzId || '', x: rajzId ? x : 0, y: rajzId ? y : 0 });
/** A termékfajta műveletsora a projektben (ha még nincs: a sablonból) – egy új elem előtt. */
function fajtaOpok(katId, pid) {
  const k = getKategoria(katId);
  return k && !lepesek(pid, katId).length ? [lepesekSablonbol(k, pid)] : [];
}
/**
 * Új pozíció (hely) egy elemmel: f = hely mezők (+ rajzId, x, y ha le van rakva) + elem: { kategoriaId, tipus, szel, mag, db, adatok }
 * (kategoriaId nélkül a kiválasztott fajta). A felmérés / hibajelölés elem nélkül is lehet (elem: null).
 */
export async function addPoz(f, pid = aktiv) {
  const id = uid('p'), ops = [{ type: 'poz_mentes', rows: [pozSor(id, { fajta: 'pozicio', ...f }, pid)] }];
  if (f.elem !== null) {
    const katId = (f.elem && f.elem.kategoriaId) || fajta(pid);
    if (katId) ops.push(...fajtaOpok(katId, pid), { type: 'elem_mentes', rows: [elemSor(id + '-1', { ...(f.elem || {}), poz: id, kategoriaId: katId }, true)] });
  }
  if (f.rajzId) ops.push(lerakOp(id, f.rajzId, f.x, f.y));
  await vegrehajt(ops);
  return getPoz(id);
}
/** Módosítás: a hely mezői és / vagy a hely a rajzon (rajzId, x, y – a rajzId elhagyható, ha marad). */
export async function updatePoz(id, fields) {
  const p = getPoz(id), ops = [];
  if (HELY_MEZOK.some(m => m in fields) || fields.adatok) ops.push({ type: 'poz_mentes', rows: [pozSor(id, fields)] });
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
/** Törlés jelöléssel (nem fizikai törlés) – a Lomtárba kerül: az azonosító és a napló megmarad; az elemei is törlődnek. */
export const delPoz = id => vegrehajt({ type: 'poz_torles', poz_id: id });
/** Lomtár (iroda): a projekt törölt pozíciói, a legutóbb törölt elöl – { id, jel, epulet, szint, helyiseg, rajzId, torolve, elemek }. */
export const lomtar = (pid = aktiv) => (M().lomtar || URES).filter(p => p.projektId === pid);
/**
 * Visszaállítás a Lomtárból (az elemeivel, kapcsolataival; a rajzon a helyére, ha a rajz megvan). jel: új jel, ha a régit közben
 * más pozíció kapta meg. Visszaad: { hiba } | { poz }.
 */
export function visszaallit(id, jel) {
  const op = { type: 'poz_visszaallitas', poz_id: id };
  if (jel !== undefined) op.jel = String(jel).trim();
  return muvelet(op, () => ({ poz: getPoz(id) }));
}
/** Tömeges törlés (iroda): a kijelölt helyek a Lomtárba kerülnek. Visszaad: a törölt pozíciók száma. */
export async function tomegesTorles(ids) {
  const ps = helyIdk(ids).filter(id => getPoz(id).fajta === 'pozicio');
  if (ps.length) await vegrehajt(ps.map(id => ({ type: 'poz_torles', poz_id: id })));
  return ps.length;
}
/**
 * Pozíció (hely) mentése (új: id = null – ilyenkor f.elem is megadható, lásd addPoz; lerakatlan). f: { jel, epulet, szint, helyiseg, adatok }.
 * A jel a projekt pozíciói között egyedi. Visszaad: { hiba } vagy { poz }.
 */
export async function mentPoz(id, f, pid = aktiv) {
  const jel = String(f.jel ?? (id ? getPoz(id).jel : '')).trim();
  const pfajta = id ? getPoz(id).fajta : f.fajta || 'pozicio';
  if (pfajta === 'pozicio' && !jel) return { hiba: 'Add meg a pozíció jelét' };
  const masik = pfajta === 'pozicio' && pozJel(jel, pid);
  if (masik && masik.id !== id) return { hiba: `A(z) „${jel}” jel már szerepel` };
  const tiszta = {};
  for (const m of HELY_MEZOK) if (m in f) tiszta[m] = String(f[m] ?? '').trim();
  if (f.adatok) tiszta.adatok = tisztaAdatok(f.adatok);
  if (id) return muvelet({ type: 'poz_mentes', rows: [pozSor(id, tiszta)] }, () => ({ poz: getPoz(id) }));
  const ujId = uid('p'), ops = [{ type: 'poz_mentes', rows: [pozSor(ujId, { ...tiszta, fajta: pfajta }, pid)] }];
  if (f.elem) {
    const katId = f.elem.kategoriaId || fajta(pid);
    ops.push(...fajtaOpok(katId, pid), { type: 'elem_mentes', rows: [elemSor(ujId + '-1', { ...f.elem, adatok: tisztaAdatok(f.elem.adatok), poz: ujId, kategoriaId: katId }, true)] });
  }
  return muvelet(ops, () => ({ poz: getPoz(ujId) }));
}

/** Javasolt jel az új pozíciónak: az utolsó jel végén lévő számot növeli (A-12 → A-13), különben sorszám. */
export function nextNev(rajzId) {
  const list = rajzPoziciok(rajzId).filter(p => p.fajta === 'pozicio');
  const last = list[list.length - 1];
  const m = last && /^(.*?)(\d+)(\D*)$/.exec(last.jel);
  if (m) return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') + m[3];
  return String(list.length + 1);
}
/** A rajz hely-mezői, amelyek szerint a lerakáskor szűrünk (homlokzati rajznál a homlokzat is). */
export const RAJZ_HELY = ['epulet', 'szint', 'homlokzat'];
/**
 * A még le nem rakott pozíciók (a lerakáskori választóhoz). hely = { epulet, szint, homlokzat } esetén csak az ott lévők
 * (ha a rajzon meg van adva és a pozícióknál van ilyen adat) – így a javaslatlista csak a releváns pozíciókat kínálja.
 * Homlokzati rajz (homlokzat megadva, szint üres): az épület és a homlokzat szerint – minden szint pozíciói.
 */
export function lerakatlan(pid = aktiv, hely = {}) {
  const szuro = RAJZ_HELY.filter(sz => hely[sz] && vanOszlop(sz, pid));
  return poziciok(pid, 'pozicio').filter(p => !p.rajzId && p.jel && szuro.every(sz => kulcs(helyMezo(p, sz)) === kulcs(hely[sz])));
}
/** Van-e ilyen adat (hely mező: a pozícióknál; elem mező: az elemeknél). */
export const vanOszlop = (mezo, pid = aktiv) => listaErtekek(mezo, pid).length > 0;
/** Egy mező különböző értékei – javaslatlistához. Hely mező (épület, szint, helyiség, homlokzat): a pozíciókból; elem mező (típus…): az elemekből. */
export function listaErtekek(mezo, pid = aktiv) {
  const hely = HELY_MEZOK.includes(mezo), forras = hely ? poziciok(pid, 'pozicio') : elemek(pid);
  return [...new Set(forras.map(p => String((hely ? helyMezo(p, mezo) : p[mezo]) ?? '').trim()).filter(Boolean))];
}

/* ---------- Elemek (ami a helyre kerül) ---------- */
/** A projekt élő elemei – termékfajta szerint szűrhető (kat = null: mind). */
export const elemek = (pid = aktiv, kat = null) => (csoport(M().elemek, 'projektId').get(pid) || URES).filter(e => !kat || e.kategoriaId === kat);
export const getElem = id => azon(M().elemek).get(id);
/** Egy pozíció (hely) elemei (sorrendben). */
export const pozElemei = (pozId, kat = null) => (csoport(M().elemek, 'poz').get(pozId) || URES).filter(e => !kat || e.kategoriaId === kat);
/**
 * Elem mentése (új: id = null – f.poz és f.kategoriaId kell). f: { kategoriaId, tipus, szel, mag, db, adatok }.
 * Új fajtánál a projekt műveletsora a sablonból jön létre. Visszaad: { hiba } vagy { elem }.
 */
export function mentElem(id, f) {
  const tiszta = { ...f };
  if (f.adatok) tiszta.adatok = tisztaAdatok(f.adatok);
  if (id) return muvelet([...(f.kategoriaId ? fajtaOpok(f.kategoriaId, getElem(id).projektId) : []),
    { type: 'elem_mentes', rows: [elemSor(id, tiszta)] }], () => ({ elem: getElem(id) }));
  const p = getPoz(f.poz);
  if (!p) return Promise.resolve({ hiba: 'Ismeretlen pozíció' });
  const ujId = uid('e');
  return muvelet([...fajtaOpok(f.kategoriaId, p.projektId), { type: 'elem_mentes', rows: [elemSor(ujId, tiszta, true)] }], () => ({ elem: getElem(ujId) }));
}
export const delElem = id => vegrehajt({ type: 'elem_torles', elem_id: id });
/** Megjelenítéshez: az elem neve – „T04 zsalúzia” / „Szúnyogháló”, darabszámmal, ha több. */
export function elemNev(e) {
  const k = getKategoria(e.kategoriaId);
  return [e.tipus, k ? k.nev.toLowerCase() : ''].filter(Boolean).join(' ') + (e.db > 1 ? ` (${e.db} db)` : '') || 'Elem';
}

/* ---------- Típusok ---------- */
export const tipusok = (pid = aktiv, kat = null) => M().tipusok.filter(t => t.projektId === pid && (!kat || t.kategoriaId === kat));
export const getTipus = id => azon(M().tipusok).get(id);
export function tipusJel(jel, pid = aktiv) { const k = kulcs(jel); return k ? tipusok(pid).find(t => kulcs(t.jel) === k) || null : null; }
/** A tulajdonságok a megadott oszlopsorrendben: [[név, érték]…] (csak a kitöltöttek). */
const rendezett = (adatok, sorrend) => {
  const e = Object.entries(adatok || {}).filter(([, v]) => !ures(v));
  const ix = k => { const i = sorrend.indexOf(k); return i < 0 ? 1e6 : i; };
  return e.sort((a, b) => ix(a[0]) - ix(b[0]));
};
/** Egy típus: { jel, szel, mag, kategoriaId, adatok: [[név, érték]…] } vagy null. */
export function tipus(jel, pid = aktiv) {
  const t = tipusJel(jel, pid);
  return t ? { jel: t.jel, szel: t.szel, mag: t.mag, kategoriaId: t.kategoriaId, adatok: rendezett(t.adatok, (getProjekt(pid) || {}).tipusOszlopok || []) } : null;
}
const tipusSor = (id, r, pid) => ({ tipus_id: id, projekt_id: pid, kategoria_id: r.kategoriaId || fajta(pid), jel: r.jel, szel: r.szel || '', mag: r.mag || '', adatok: r.adatok || {} });
/** Típus mentése (új: id = null). Átnevezéskor az elemek „tipus” mezője követi. Visszaad: { hiba } vagy { tipus }. */
export async function mentTipus(id, f, pid = aktiv) {
  const jel = String(f.jel ?? '').trim();
  if (!jel) return { hiba: 'Add meg a típus jelét' };
  const masik = tipusJel(jel, pid);
  if (masik && masik.id !== id) return { hiba: `A(z) „${jel}” típus már szerepel` };
  const rec = { jel, szel: String(f.szel ?? '').trim(), mag: String(f.mag ?? '').trim(), adatok: tisztaAdatok(f.adatok),
    kategoriaId: f.kategoriaId || (id && getTipus(id).kategoriaId) || fajta(pid) };
  const ujId = id || uid('t');
  return muvelet({ type: 'tipus_mentes', rows: [tipusSor(ujId, rec, pid)] }, () => ({ tipus: getTipus(ujId) }));
}
export const delTipus = id => vegrehajt({ type: 'tipus_torles', tipus_id: id });
const OSZLOP_MEZO = { lista: ['oszlopok', 'oszlopok'], elem: ['elemOszlopok', 'elem_oszlopok'], tipusok: ['tipusOszlopok', 'tipus_oszlopok'] };
/** Új adatoszlop felvétele a projekthez (kind: 'lista' → hely, 'elem' → elem, 'tipusok' → típus tulajdonság). */
export async function addOszlop(kind, nev, pid = aktiv) {
  const p = getProjekt(pid), lista = oszlopok(kind, pid);
  if (lista.includes(nev)) return;
  await vegrehajt({ type: 'projekt_mentes', pid: null, projekt: projektSor(p, { [OSZLOP_MEZO[kind][1]]: [...lista, nev] }) });
}
export const oszlopok = (kind, pid = aktiv) => (getProjekt(pid) || {})[OSZLOP_MEZO[kind][0]] || [];

/**
 * Egy elem összesített adatai (a típusból és a helyről örökölve): { jel, tipus, szel, mag, db, epulet, szint, helyiseg, adatok,
 * honnan: { szel, mag }, tipusDef, kategoria }. Amit az elem nem ad meg (üres), az a típusból jön; az adatok sorrendje:
 * a hely adatai, a típus tulajdonságai, az elem saját adatai (azonos nevűnél a későbbi érvényes).
 * x: elem (vagy azonosító); pozícióra (vagy azonosítóra) az első eleme – elem nélküli helynél csak a hely adatai.
 */
export function tetel(x) {
  if (typeof x === 'string') x = getElem(x) || getPoz(x);
  if (!x) return null;
  const elem = 'kategoriaId' in x ? x : pozElemei(x.id)[0] || null;
  const p = elem ? getPoz(elem.poz) : x;
  if (!p) return null;
  const proj = getProjekt(p.projektId) || {};
  const t = elem ? tipus(elem.tipus, p.projektId) : null;
  const sajat = elem ? rendezett(elem.adatok, proj.elemOszlopok || []) : [];
  const hely = rendezett(p.adatok, proj.oszlopok || []);
  const nevek = new Set(sajat.map(a => kulcs(a[0])));
  const tAdat = t ? t.adatok.filter(a => !nevek.has(kulcs(a[0]))) : [];
  tAdat.forEach(a => nevek.add(kulcs(a[0])));
  return {
    jel: p.jel, epulet: p.epulet || '', szint: p.szint || '', helyiseg: p.helyiseg || '',
    tipus: elem ? elem.tipus || '' : '', db: elem ? elem.db : 0,
    szel: elem ? elem.szel || (t ? t.szel : '') : '', mag: elem ? elem.mag || (t ? t.mag : '') : '',
    honnan: { szel: elem && !elem.szel && t && t.szel ? 'tipus' : '', mag: elem && !elem.mag && t && t.mag ? 'tipus' : '' },
    adatok: [...hely.filter(a => !nevek.has(kulcs(a[0]))), ...tAdat, ...sajat],
    tipusDef: !!t, kategoria: elem ? getKategoria(elem.kategoriaId) : null, elem,
  };
}

/* ---------- Beillesztés Excelből (pozíciók + elemek: 'lista', típusok: 'tipusok') ----------
 * uj = { oszlopok: [{ nev, szerep }], sorok: [{ oszlopnév: érték }] }. Pozíciólistánál egy sor = egy ELEM; az azonos jelű
 * sorok egy pozícióba (helyre) kerülnek. A termékfajta a „Termékfajta” oszlopból (név szerint), különben a választott (alapKat).
 */
function katNevbol(nev, alapKat) {
  const k = kulcs(nev);
  return (k && (kategoriak().find(x => kulcs(x.nev) === k) || kategoriak().find(x => kulcs(x.id) === k)) || {}).id || alapKat;
}
/** Pozíciólista sorai → [{ jel, hely: { epulet, szint, helyiseg, adatok }, elemek: [{ kategoriaId, tipus, szel, mag, db, adatok }] }] */
function helyRekordok(uj, alapKat) {
  const out = new Map();
  for (const s of uj.sorok) {
    const hely = { adatok: {} }, elem = { adatok: {} };
    let jel = '', kat = '';
    for (const o of uj.oszlopok) {
      const v = String(s[o.nev] ?? '').trim();
      if (o.szerep === 'jel') jel = v;
      else if (o.szerep === 'kategoria') kat = v;
      else if (o.szerep === 'adat') { if (v) hely.adatok[o.nev] = v; }
      else if (o.szerep === 'eadat') { if (v) elem.adatok[o.nev] = v; }
      else if (o.szerep === 'kozos') elem.kozos = v;
      else if (HELY_MEZOK.includes(o.szerep)) hely[o.szerep] = v;
      else if (ELEM_MEZOK.includes(o.szerep)) elem[o.szerep] = v;
    }
    const k = kulcs(jel);
    if (!k) continue;
    elem.kategoriaId = katNevbol(kat, alapKat);
    if (!out.has(k)) out.set(k, { jel, hely, elemek: [] });
    else { const h = out.get(k).hely; for (const [m, v] of Object.entries(hely)) if (m === 'adatok') Object.assign(h.adatok, v); else if (v && !h[m]) h[m] = v; }
    out.get(k).elemek.push(elem);
  }
  return [...out.values()];
}
function tipusRekordok(uj) {
  const out = [], latott = new Set();
  for (const s of uj.sorok) {
    const rec = { adatok: {} };
    for (const o of uj.oszlopok) {
      const v = String(s[o.nev] ?? '').trim();
      if (o.szerep === 'adat') { if (v) rec.adatok[o.nev] = v; } else if (o.szerep in SZEREPEK_TIPUS && o.szerep !== 'kihagy') rec[o.szerep] = v;
    }
    const k = kulcs(rec.jel);
    if (!k || latott.has(k)) continue; // az első érvényes
    latott.add(k);
    out.push(rec);
  }
  return out;
}
export const vanTabla = (kind, pid = aktiv) => (kind === 'lista' ? poziciok(pid, 'pozicio').length : tipusok(pid).length) > 0;
/**
 * Előnézet: { uj: [jel], egyezo: [jel], arva: [jel], elemek } – pozíció (hely) szinten. arva: teljes cserénél ami adat nélkül maradna –
 * a lerakott (rajzon lévő) pozíciók, amelyek nincsenek az új listában; típusnál a használt, de az új listában nem szereplő típusok.
 */
export function elemezTabla(kind, uj, pid = aktiv) {
  const out = { uj: [], egyezo: [], arva: [], elemek: 0 };
  if (kind === 'lista') {
    const recs = helyRekordok(uj, fajta(pid)), ujK = new Set(recs.map(r => kulcs(r.jel)));
    for (const r of recs) { (pozJel(r.jel, pid) ? out.egyezo : out.uj).push(r.jel); out.elemek += r.elemek.length; }
    out.arva = poziciok(pid, 'pozicio').filter(p => p.rajzId && !ujK.has(kulcs(p.jel))).map(p => p.jel);
  } else {
    const recs = tipusRekordok(uj), ujK = new Set(recs.map(r => kulcs(r.jel)));
    for (const r of recs) (tipusJel(r.jel, pid) ? out.egyezo : out.uj).push(r.jel);
    out.arva = [...new Set(listaErtekek('tipus', pid))].filter(t => tipusJel(t, pid) && !ujK.has(kulcs(t)));
  }
  return out;
}
const DARAB = 500; // egy műveletben legfeljebb ennyi sor (a szerver kérésmérete miatt)
const darabol = (rows, fn) => { const out = []; for (let i = 0; i < rows.length; i += DARAB) out.push(fn(rows.slice(i, i + DARAB))); return out; };
const URES_HELY = { epulet: '', szint: '', helyiseg: '', homlokzat: '' };
const URES_ELEM = { tipus: '', szel: '', mag: '' };
const nemUres = o => Object.fromEntries(Object.entries(o).filter(([k, v]) => k !== 'adatok' && !ures(v)));
/**
 * Beillesztés. mod 'bovit' (alap): az új jelek (helyek) és az új elemek hozzáadódnak; az egyező helyek / elemek frissit=true esetén
 * frissülnek (csak a nem üres cellák írnak felül). Az elemek egyezése: a helyen belül termékfajta + sorrend szerint.
 * mod 'csere': a teljes lista lecserélődik – de csak a beillesztett termékfajtákban (a más fajtájú elemek érintetlenek).
 * A listában nem szereplő, rajzon lévő pozíciók jele és helye (és az elemeik állapota) megmarad, az adataik törlődnek; a le nem
 * rakottak törlődnek (ha más fajtájú elemük is van, csak a beillesztett fajták elemei); a listában szereplő helyek fölösleges elemei törlődnek.
 * Visszaad: { uj, egyezo } (helyek). Az egész egy lépésben kerül a kimenő sorba (vagy semmi, ha hibás).
 */
export async function importal(kind, uj, { mod = 'bovit', frissit = false, kategoria = null } = {}, pid = aktiv) {
  const p = getProjekt(pid);
  const osz = sz => uj.oszlopok.filter(o => o.szerep === sz).map(o => o.nev);
  const ops = [], torol = [], helySorok = [], elemSorok = [];
  let n = 0, e = 0;
  if (kind !== 'lista') {
    const recs = tipusRekordok(uj).map(r => ({ ...r, kategoriaId: kategoria || fajta(pid) }));
    const ujOsz = osz('adat'), tOsz = mod === 'csere' ? ujOsz : [...new Set([...oszlopok('tipusok', pid), ...ujOsz])];
    ops.push({ type: 'projekt_mentes', pid: null, projekt: projektSor(p, { tipus_oszlopok: tOsz }) });
    const sorok = [];
    if (mod === 'csere') {
      for (const t of tipusok(pid)) torol.push({ type: 'tipus_torles', tipus_id: t.id });
      for (const r of recs) { sorok.push(tipusSor(uid('t'), r, pid)); n++; }
    } else {
      for (const r of recs) {
        const x = tipusJel(r.jel, pid);
        if (x) { e++; if (frissit) sorok.push(tipusSor(x.id, { ...x, ...nemUres(r), adatok: { ...x.adatok, ...r.adatok } }, pid)); }
        else { sorok.push(tipusSor(uid('t'), r, pid)); n++; }
      }
    }
    ops.push(...torol, ...darabol(sorok, rows => ({ type: 'tipus_mentes', rows })));
    await vegrehajt(ops);
    return { uj: n, egyezo: e };
  }
  const alapKat = kategoria || fajta(pid);
  const recs = helyRekordok(uj, alapKat);
  const hOsz = osz('adat'), eOsz = osz('eadat');
  ops.push({ type: 'projekt_mentes', pid: null, projekt: projektSor(p, {
    oszlopok: mod === 'csere' ? hOsz : [...new Set([...oszlopok('lista', pid), ...hOsz])],
    elem_oszlopok: mod === 'csere' ? eOsz : [...new Set([...oszlopok('elem', pid), ...eOsz])] }) });
  // A beillesztett termékfajták: teljes cserénél csak ezek elemei cserélődnek / törlődnek (egy árnyékoló-lista
  // nem törli a szúnyogháló- vagy vezérlő-elemeket)
  const ujFajtak = new Set(recs.flatMap(r => r.elemek.map(x => x.kategoriaId)));
  const erintett = el => ujFajtak.has(el.kategoriaId);
  // A használt termékfajták műveletsora (ha a projektben még nincs)
  for (const k of ujFajtak) ops.push(...fajtaOpok(k, pid));
  // „Közös ezekkel” oszlop: a beillesztés utáni elemazonosítók (a kapcsolatokhoz) – kulcs(jel) → { poz, elem: első elem }
  const vanKozos = osz('kozos').length > 0, elsoElem = new Map(), kozosSorok = [];
  const jegyez = (jel, pozId, elemId, ue) => {
    if (!elsoElem.has(kulcs(jel))) elsoElem.set(kulcs(jel), { poz: pozId, elem: elemId });
    if (vanKozos) kozosSorok.push({ elem: elemId, poz: pozId, ertek: ue.kozos || '' });
  };
  const ujElem = (ue, pozId, jel) => { const id = uid('e'); elemSorok.push(elemSor(id, { ...ue, poz: pozId }, true)); jegyez(jel, pozId, id, ue); };
  /** Egy hely elemeinek egyeztetése: fajtánként sorrendben párosít; a fölöslegeseket (csere, csak a beillesztett fajtákban) törli. */
  const elemekEgyeztet = (pozId, ujElemek, csere, jel) => {
    const regiek = pozElemei(pozId), hasznalt = new Set();
    for (const ue of ujElemek) {
      const x = regiek.find(r => r.kategoriaId === ue.kategoriaId && !hasznalt.has(r.id));
      if (x) {
        hasznalt.add(x.id);
        if (csere) elemSorok.push(elemSor(x.id, { ...URES_ELEM, db: 1, ...ue, adatok: ue.adatok }));
        else if (frissit) elemSorok.push(elemSor(x.id, { ...nemUres(ue), adatok: { ...x.adatok, ...ue.adatok } }));
        jegyez(jel, pozId, x.id, ue);
      } else ujElem(ue, pozId, jel);
    }
    if (csere) regiek.filter(r => !hasznalt.has(r.id) && erintett(r)).forEach(r => torol.push({ type: 'elem_torles', elem_id: r.id }));
  };
  if (mod === 'csere') {
    const ujK = new Map(recs.map(r => [kulcs(r.jel), r]));
    for (const x of poziciok(pid, 'pozicio')) {
      const r = ujK.get(kulcs(x.jel)), sajat = pozElemei(x.id);
      if (r) {
        helySorok.push(pozSor(x.id, { ...URES_HELY, ...r.hely, jel: r.jel, adatok: r.hely.adatok }));
        elemekEgyeztet(x.id, r.elemek, true, r.jel);
        ujK.delete(kulcs(x.jel)); e++;
      } else if (x.rajzId) {
        // Lerakott: a hely és az elemek (állapotukkal) megmaradnak; a beillesztett fajták elemeinek adatai törlődnek,
        // a hely adatai csak akkor, ha nincs más fajtájú eleme
        if (sajat.every(erintett)) helySorok.push(pozSor(x.id, { ...URES_HELY, adatok: {} }));
        sajat.filter(erintett).forEach(el => elemSorok.push(elemSor(el.id, { ...URES_ELEM, adatok: {} })));
      } else if (sajat.length && !sajat.every(erintett)) {
        // Le nem rakott, más fajtájú eleme is van: a hely megmarad, csak a beillesztett fajták elemei törlődnek
        sajat.filter(erintett).forEach(el => torol.push({ type: 'elem_torles', elem_id: el.id }));
      } else torol.push({ type: 'poz_torles', poz_id: x.id });
    }
    for (const r of ujK.values()) {
      const id = uid('p');
      helySorok.push(pozSor(id, { fajta: 'pozicio', jel: r.jel, ...r.hely }, pid));
      r.elemek.forEach(ue => ujElem(ue, id, r.jel));
      n++;
    }
  } else {
    for (const r of recs) {
      const x = pozJel(r.jel, pid);
      if (x) {
        e++;
        if (frissit) helySorok.push(pozSor(x.id, { ...nemUres(r.hely), adatok: { ...x.adatok, ...r.hely.adatok } }));
        elemekEgyeztet(x.id, r.elemek, false, r.jel);
      } else {
        const id = uid('p');
        helySorok.push(pozSor(id, { fajta: 'pozicio', jel: r.jel, ...r.hely }, pid));
        r.elemek.forEach(ue => ujElem(ue, id, r.jel));
        n++;
      }
    }
  }
  // Közös elemek („Közös ezekkel” oszlop: vesszővel / pontosvesszővel elválasztott jelek). Új kapcsolat a hiányzókra;
  // teljes cserénél és frissítésnél a felsorolásban nem szereplő kapcsolatok törlődnek (üres cella: nincs közös).
  const kapcsOps = [], kozosHiba = new Set();
  const toroltPoz = new Set(torol.filter(o => o.type === 'poz_torles').map(o => o.poz_id));
  const toroltElem = new Set(torol.filter(o => o.type === 'elem_torles').map(o => o.elem_id));
  for (const s of kozosSorok) {
    const celok = new Map(); // pozId → elemId
    for (const j of s.ertek.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean)) {
      let c = elsoElem.get(kulcs(j));
      if (!c) {
        const p = pozJel(j, pid);
        const el = p && !toroltPoz.has(p.id) && pozElemei(p.id).find(x => x.id !== s.elem && !toroltElem.has(x.id));
        if (el) c = { poz: p.id, elem: el.id };
      }
      if (!c) kozosHiba.add(j);
      else if (c.poz !== s.poz) celok.set(c.poz, c.elem);
    }
    const regi = getElem(s.elem) ? kozosCelok(s.elem) : [];
    for (const x of regi) {
      if (x.poz.id === s.poz || toroltElem.has(x.elem.id)) continue; // a törölt elem kapcsolata vele törlődik
      if (celok.has(x.poz.id)) celok.delete(x.poz.id); // már megvan
      else if (mod === 'csere' || frissit) kapcsOps.push({ type: 'kapcsolat_torles', kapcsolat_id: x.kapcsolat.id });
    }
    for (const elemId of celok.values()) {
      kapcsOps.push({ type: 'kapcsolat_mentes', kapcsolat: { kapcsolat_id: uid('kp'), tipus: 'kozos', forras_elem: s.elem, cel_elem: elemId } });
    }
  }
  // Előbb a törlések (a csere után egy régi jel újra szerepelhet), utána a helyek, az elemek, végül a kapcsolatok
  ops.push(...torol, ...darabol(helySorok, rows => ({ type: 'poz_mentes', rows })), ...darabol(elemSorok, rows => ({ type: 'elem_mentes', rows })), ...kapcsOps);
  await vegrehajt(ops);
  return { uj: n, egyezo: e, kozos: kapcsOps.filter(o => o.type === 'kapcsolat_mentes').length, kozosHiba: [...kozosHiba] };
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

/* ---------- Események ---------- */
/**
 * Bejegyzés (a rögzítő a bejelentkezésből; az időpont a készüléké – offline rögzítésnél is a valódi idő).
 * A lépés (kesz / visszavon) egy elemhez tartozik (elem kötelező); a hiba / megjegyzés a helyhez (elem nélkül) vagy egy elemhez.
 */
export async function addEsemeny(poz, tipus, { lepes, megj, elem } = {}) {
  const id = uid('e');
  await vegrehajt({ type: 'esemeny', esemeny: { esemeny_id: id, poz_id: poz, elem_id: elem || '', tipus, lepes_id: lepes || '', mikor: most(), megj: megj || '' } });
  return azon(M().esemenyek).get(id);
}
/**
 * Több bejegyzés egy lépésben (tömeges művelet, pótlás): [{ poz, elem?, tipus, lepes?, megj?, mikor? }]. Mindent vagy semmit
 * (a szabályok bármelyik bejegyzésnél elutasíthatják – az üzenet a pozíció jelével). 500-anként egy művelet.
 */
export async function addEsemenyek(list) {
  const t = most();
  const rows = list.map(x => ({ esemeny_id: uid('e'), poz_id: x.poz, elem_id: x.elem || '', tipus: x.tipus, lepes_id: x.lepes || '', mikor: x.mikor || t, megj: x.megj || '' }));
  if (rows.length) await vegrehajt(darabol(rows, esemenyek => ({ type: 'esemenyek', esemenyek })));
  return rows.length;
}
/** Egy pozíció (hely) összes bejegyzése időrendben – az elemeiéi is (másolat). */
export const naplo = poz => (csoport(M().esemenyek, 'poz').get(poz) || URES).slice();
/** Legutóbbi bejegyzés egy pozíción (vagy null). */
export function utolso(poz) {
  const ev = csoport(M().esemenyek, 'poz').get(poz);
  return ev && ev.length ? ev[ev.length - 1] : null;
}

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

/* ---------- Állapot ---------- */
/**
 * Egy ELEM állapota az eseményekből (a projekt műveletsora az elem fajtájára):
 *   kesz: Map(lepesId → a „kész” esemény), flags: [bool…] a műveletsor sorrendjében, lep: a műveletsor,
 *   lepes: a sorrendben legelőrébb tartó kész lépés (vagy null) – a jelölő ennek a színét veszi fel.
 */
export function allapot(elemId) {
  const tar = index(M().esemenyek, 'allapot', () => new Map());
  if (tar.has(elemId)) return tar.get(elemId);
  const el = getElem(elemId), kesz = new Map();
  for (const e of csoport(M().esemenyek, 'elem').get(elemId) || URES) {
    if (e.tipus === 'kesz') kesz.set(e.lepes, e);
    else if (e.tipus === 'visszavon') kesz.delete(e.lepes);
  }
  const lep = el ? lepesek(el.projektId, el.kategoriaId) : [];
  const flags = lep.map(l => kesz.has(l.id));
  const i = flags.lastIndexOf(true);
  const a = { kesz, flags, lep, lepes: i < 0 ? null : lep[i] };
  tar.set(elemId, a);
  return a;
}
/** Egy elem készültsége (0–1): a kész lépései részesedése a fajta súlyai szerint. */
export function elemKeszultseg(elemId) {
  const el = getElem(elemId);
  if (!el) return 0;
  const resz = index(M().lepesek, 'resz:' + el.projektId + ':' + el.kategoriaId, () => reszesedes(el.projektId, el.kategoriaId));
  let v = 0;
  for (const id of allapot(elemId).kesz.keys()) v += resz.get(id) || 0;
  return Math.min(1, v);
}
/** A pozíció (hely) nyitott hibája (a legutóbbi „hiba”, ha azóta nincs „hiba megszűnt”), vagy null. Hely szintű. */
export function helyHiba(pozId) {
  const tar = index(M().esemenyek, 'hiba', () => new Map());
  if (tar.has(pozId)) return tar.get(pozId);
  let hiba = null;
  for (const e of csoport(M().esemenyek, 'poz').get(pozId) || URES) {
    if (e.tipus === 'hiba') hiba = e; else if (e.tipus === 'hiba_vege') hiba = null;
  }
  tar.set(pozId, hiba);
  return hiba;
}
/**
 * A hely „mérvadó” eleme egy fajtában (kat = null: bármelyik): a legkevésbé kész (a jelölő színét ez adja), vagy null.
 * A más pozícióról ide kapcsolt közös elemek is számítanak.
 */
export function helyElem(pozId, kat = null) {
  let best = null, bv = 2;
  for (const e of helyElemei(pozId, kat)) { const v = elemKeszultseg(e.id); if (v < bv) { bv = v; best = e; } }
  return best;
}
/**
 * A hely jelölője a markerSvg-hez: { szin, mind, hiba, fajta, szegmensek? }. A színt a legkevésbé kész elem adja (kat: csak az
 * adott fajta elemei – a jelmagyarázat szűrője; a közös elemek is); több elemnél szegmensek: elemenként a lépésszín (vagy szürke).
 */
export function jelolo(pozId, kat = null) {
  const p = getPoz(pozId), elemek = helyElemei(pozId, kat);
  const szinOf = e => { const a = allapot(e.id); return a.lepes ? a.lepes.szin : SZIN_NINCS; };
  const be = helyElem(pozId, kat);
  return { szin: be ? szinOf(be) : SZIN_NINCS, mind: elemek.length > 0 && elemek.every(e => { const a = allapot(e.id); return a.flags.length && a.flags.every(Boolean); }),
    hiba: !!helyHiba(pozId), fajta: p ? p.fajta : 'pozicio', szegmensek: elemek.length > 1 ? elemek.map(szinOf) : null };
}
/** Állapot-kulcs egy helyre egy fajtában (szűrőkhöz / összesítőkhöz): '' = nincs elkezdve, lépés-id, vagy null (nincs ilyen fajtájú eleme). */
export function helyKulcs(pozId, kat) {
  const e = helyElem(pozId, kat);
  if (!e) return null;
  const a = allapot(e.id);
  return a.lepes ? a.lepes.id : '';
}

/* ---------- Elvégzett munka (Teljesítmény, Munkám) ----------
 * Csak az érvényes (azóta vissza nem vont) „kész” bejegyzések számítanak; a műveletsor-módosítás utáni pótlás nem
 * (az adminisztráció, nem munka). Mennyiségek – pénzügyi adat nincs.
 */
export const POTLAS = 'Pótlás';
/**
 * Az elvégzett lépések a projektben: [{ e (esemény), poz, elem, lepes, tipus, kategoria, epulet, szint }], időrendben.
 * Szűrés: tol / ig (Date, ig kizárólagos), email (a rögzítő), kat (termékfajta; null: mind).
 */
export function elvegzett({ tol = null, ig = null, email = null, kat = null } = {}, pid = aktiv) {
  const out = [];
  for (const el of elemek(pid, kat)) {
    const p = getPoz(el.poz);
    if (!p || !p.rajzId) continue;
    const r = getRajz(p.rajzId), a = allapot(el.id), lep = new Map(a.lep.map(l => [l.id, l]));
    for (const e of a.kesz.values()) {
      if (!lep.has(e.lepes) || String(e.megj || '').startsWith(POTLAS)) continue;
      const m = Date.parse(e.mikor);
      if ((tol && m < tol.getTime()) || (ig && m >= ig.getTime()) || (email && e.kiEmail !== email)) continue;
      out.push({ e, poz: p, elem: el, lepes: lep.get(e.lepes), tipus: el.tipus || '', kategoria: getKategoria(el.kategoriaId),
        epulet: (r && r.epulet) || p.epulet || '', szint: (r && r.szint) || p.szint || '' });
    }
  }
  return out.sort((a, b) => String(a.e.mikor).localeCompare(String(b.e.mikor)));
}

/* ---------- Hézagok: egy későbbi lépés kész, egy korábbi nem (pl. új lépés beszúrása után) ---------- */
/**
 * A projekt lerakott elemei (egy fajtában), ahol egy lépés hiányzik, de egy későbbi már kész: [{ elem, poz, hianyzo: [lépés], mikor }].
 * mikor: a hiányzó lépés utáni első kész lépés ideje (a pótlás ezzel az idővel kerül a naplóba, így az időrend nem borul).
 */
export function hezagok(pid = aktiv, kat = fajta(pid)) {
  const out = [];
  for (const el of elemek(pid, kat)) {
    const p = getPoz(el.poz);
    if (!p || !p.rajzId) continue;
    const a = allapot(el.id), lep = a.lep, ut = a.flags.lastIndexOf(true);
    const hianyzo = lep.filter((l, i) => i < ut && !a.flags[i]);
    if (!hianyzo.length) continue;
    const elso = lep.findIndex((l, i) => i > lep.indexOf(hianyzo[0]) && a.flags[i]);
    out.push({ elem: el, poz: p, hianyzo, mikor: a.kesz.get(lep[elso].id).mikor });
  }
  return out;
}
/** A hézagok pótlása: a hiányzó lépések késznek jelölése („Pótlás” megjegyzéssel). Visszaad: a bejegyzések száma. */
export function potolHezagok(list, megj = POTLAS + ' (a műveletsor módosítása után)') {
  return addEsemenyek(list.flatMap(h => h.hianyzo.map(l => ({ poz: h.poz.id, elem: h.elem.id, tipus: 'kesz', lepes: l.id, mikor: h.mikor, megj }))));
}

/* ---------- Tömeges műveletek ----------
 * A kijelölés pozíciókat (a rajzon) vagy elemeket (a listán) tartalmazhat: elemIdk() a választott fajta elemeire bontja.
 * Lépés csak a lerakott pozíciók elemein (ahogy az adatlapon is); a hiba / megjegyzés a helyre kerül.
 */
export function elemIdk(ids, kat = fajta()) {
  const out = new Set();
  for (const id of ids) {
    const el = getElem(id);
    if (el) { if (!kat || el.kategoriaId === kat) out.add(el.id); continue; }
    pozElemei(id, kat).forEach(e => out.add(e.id));
  }
  return [...out];
}
const lerakottElemek = ids => ids.map(getElem).filter(e => { const p = e && getPoz(e.poz); return p && p.rajzId; });
/** Előnézet / végrehajtás: a lépésig minden hiányzó lépés kész („Idáig kész”) – a lépés fajtájának elemein. */
export function tervKesz(ids, lepesId) {
  const l0 = getLepes(lepesId), list = [];
  const els = lerakottElemek(elemIdk(ids, l0 ? l0.kategoriaId : null));
  let kesz = 0;
  for (const el of els) {
    const a = allapot(el.id), ix = a.lep.findIndex(l => l.id === lepesId), hiany = a.lep.slice(0, ix + 1).filter((l, i) => !a.flags[i]);
    if (!hiany.length) kesz++;
    hiany.forEach(l => list.push({ poz: el.poz, elem: el.id, tipus: 'kesz', lepes: l.id }));
  }
  return { list, poz: new Set(list.map(x => x.elem)).size, mar: kesz, kihagyva: elemIdk(ids, l0 ? l0.kategoriaId : null).length - els.length };
}
/** A lépéstől kezdve minden kész lépés visszavonása (a legutolsótól visszafelé). */
export function tervVissza(ids, lepesId) {
  const l0 = getLepes(lepesId), list = [];
  const els = lerakottElemek(elemIdk(ids, l0 ? l0.kategoriaId : null));
  for (const el of els) {
    const a = allapot(el.id), ix = a.lep.findIndex(l => l.id === lepesId);
    for (let i = a.lep.length - 1; i >= ix; i--) if (a.flags[i]) list.push({ poz: el.poz, elem: el.id, tipus: 'visszavon', lepes: a.lep[i].id });
  }
  return { list, poz: new Set(list.map(x => x.elem)).size, kihagyva: 0 };
}
/** A kijelölés helyei (pozíciók – elemazonosítónál az elem helye). */
export function helyIdk(ids) {
  const out = new Set();
  for (const id of ids) { const el = getElem(id); out.add(el ? el.poz : id); }
  return [...out].filter(id => getPoz(id));
}
/** Hiba jelzése / megoldása / megjegyzés – a helyekre. hiba_vege csak ott, ahol van nyitott hiba. */
export function tervEsemeny(ids, tipus) {
  const ps = helyIdk(ids).map(getPoz).filter(p => p.rajzId && (tipus !== 'hiba_vege' || helyHiba(p.id)));
  return { list: ps.map(p => ({ poz: p.id, tipus })), poz: ps.length, kihagyva: helyIdk(ids).length - ps.length };
}
/**
 * Adat átírása (iroda). mezo: elem mező ('tipus'|'szel'|'mag'|'db'|'eadat:<oszlop>') – a kijelölés elemein (a választott fajtában);
 * hely mező ('epulet'|'szint'|'helyiseg'|'adat:<oszlop>') – a helyeken. Üres érték = törlés. Visszaad: a módosított sorok száma.
 */
export async function tomegesAdat(ids, mezo, ertek) {
  const v = String(ertek ?? '').trim(), ops = [];
  if (mezo.startsWith('eadat:') || ELEM_MEZOK.includes(mezo)) {
    const rows = elemIdk(ids).map(getElem).map(el => {
      if (mezo.startsWith('eadat:')) {
        const adatok = { ...el.adatok }, k = mezo.slice(6);
        if (v) adatok[k] = v; else delete adatok[k];
        return elemSor(el.id, { adatok });
      }
      return elemSor(el.id, { [mezo]: mezo === 'db' ? (v || 1) : v });
    });
    if (mezo.startsWith('eadat:') && v) await addOszlop('elem', mezo.slice(6));
    if (rows.length) ops.push(...darabol(rows, r => ({ type: 'elem_mentes', rows: r })));
    if (ops.length) await vegrehajt(ops);
    return rows.length;
  }
  const rows = helyIdk(ids).map(getPoz).filter(p => p.fajta === 'pozicio').map(p => {
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
  const ps = helyIdk(ids).map(getPoz).filter(p => p.rajzId);
  await vegrehajt(ps.map(p => (p.fajta === 'pozicio' ? lerakOp(p.id, null) : { type: 'poz_torles', poz_id: p.id })));
  return ps.length;
}

/* ---------- Kapcsolatok és csatornák (közös elem; a vezérlés felülete később) ---------- */
export const kapcsolatok = (pid = aktiv) => M().kapcsolatok.filter(k => k.projektId === pid);
export const elemKapcsolatai = elemId => M().kapcsolatok.filter(k => k.forras === elemId || k.cel === elemId);
export const csatornak = elemId => (csoport(M().csatornak, 'elem').get(elemId) || URES).slice();

/*
 * Közös elem (kapcsolat tipus 'kozos'): forras = a közös elem (pl. VT-3 védőtető), cel = egy másik pozíció eleme (a zsalúzia).
 * A közös elem a saját pozícióján kívül a cel elemek pozícióin is megjelenik (ott is rögzíthető – a bejegyzés a saját pozíciója
 * naplójába kerül), és ott is beleszámít a jelölő színébe. A készültség-összesítők egyszer számolják (a saját pozícióján).
 */
const kozosIdx = () => index(M().kapcsolatok, 'kozos', t => {
  const be = new Map(), ki = new Map(); // be: pozId → [közös elem]; ki: elemId → [kapcsolat]
  for (const k of t) {
    if (k.tipus !== 'kozos') continue;
    const f = getElem(k.forras), c = getElem(k.cel);
    if (!f || !c) continue;
    if (!ki.has(f.id)) ki.set(f.id, []);
    ki.get(f.id).push(k);
    if (c.poz === f.poz) continue;
    if (!be.has(c.poz)) be.set(c.poz, []);
    if (!be.get(c.poz).includes(f)) be.get(c.poz).push(f);
  }
  return { be, ki };
});
/** A más pozícióról ide „behozott” közös elemek (kat: csak ez a fajta). */
export const kozosElemek = (pozId, kat = null) => (kozosIdx().be.get(pozId) || URES).filter(e => !kat || e.kategoriaId === kat);
/** Egy hely összes eleme a jelölőhöz: a sajátjai és a közös elemek. */
export const helyElemei = (pozId, kat = null) => {
  const k = kozosElemek(pozId, kat);
  return k.length ? [...pozElemei(pozId, kat), ...k] : pozElemei(pozId, kat);
};
/** Egy (közös) elem kapcsolatai: [{ kapcsolat, elem: a cel elem, poz: a cel pozíciója }]. */
export const kozosCelok = elemId => (kozosIdx().ki.get(elemId) || URES).map(k => {
  const el = getElem(k.cel);
  return { kapcsolat: k, elem: el, poz: el && getPoz(el.poz) };
}).filter(x => x.poz);
/** A pozíciók, ahol a közös elem a sajátján kívül megjelenik (egyszer mindegyik). */
export function kozosHelyek(elemId) {
  const el = getElem(elemId), out = new Map();
  for (const x of kozosCelok(elemId)) if (!el || x.poz.id !== el.poz) out.set(x.poz.id, x.poz);
  return [...out.values()];
}
/** A pozíció eleme, amelyhez a közös elem kapcsolódik: az első (a közös elemen kívül), vagy null. */
const celElem = (pozId, forrasId) => pozElemei(pozId).find(e => e.id !== forrasId) || null;
/**
 * Közös elem pozíciói (iroda): a kapcsolatok a megadott pozíciókra állnak be (az újak létrejönnek, a kimaradók törlődnek).
 * Visszaad: { hiba } | { db, kihagyva: [elem nélküli pozíció jele] }.
 */
export function kozosMent(elemId, pozIds) {
  const el = getElem(elemId);
  if (!el) return Promise.resolve({ hiba: 'Ismeretlen elem' });
  const kell = new Set(pozIds.filter(id => id !== el.poz)), ops = [], kihagyva = [];
  const meglevo = new Set();
  for (const x of kozosCelok(elemId)) {
    if (x.poz.id === el.poz) continue; // a saját helyén belüli kapcsolat (pl. régi adatból) marad
    if (kell.has(x.poz.id) && !meglevo.has(x.poz.id)) meglevo.add(x.poz.id);
    else ops.push({ type: 'kapcsolat_torles', kapcsolat_id: x.kapcsolat.id });
  }
  for (const pid of kell) {
    if (meglevo.has(pid)) continue;
    const c = celElem(pid, elemId);
    if (!c) { kihagyva.push((getPoz(pid) || {}).jel || '?'); continue; }
    ops.push({ type: 'kapcsolat_mentes', kapcsolat: { kapcsolat_id: uid('kp'), tipus: 'kozos', forras_elem: elemId, cel_elem: c.id } });
  }
  if (!ops.length) return Promise.resolve({ db: kell.size - kihagyva.length, kihagyva });
  return muvelet(ops, () => ({ db: kozosHelyek(elemId).length, kihagyva }));
}
/**
 * A rajzon húzandó vonalak a közös elemekhez: [[pozId, pozId]] – a közös elem pozíciójából (ha nincs ezen a rajzon:
 * az első itt lévő kapcsolt pozícióból) a többi, ezen a rajzon lévő kapcsolt pozícióba.
 */
export function kozosVonalak(rajzId) {
  const out = [], latott = new Set();
  for (const [elemId, ks] of kozosIdx().ki) {
    const el = getElem(elemId);
    const helyek = [...new Set([el.poz, ...ks.map(k => (getElem(k.cel) || {}).poz)])].map(getPoz).filter(p => p && p.rajzId === rajzId);
    for (const p of helyek.slice(1)) {
      const par = [helyek[0].id, p.id].sort().join('|');
      if (!latott.has(par)) { latott.add(par); out.push([helyek[0].id, p.id]); }
    }
  }
  return out;
}
/** Kapcsolat mentése: { id?, tipus, forras, csatorna, cel, allapot, megj } → { hiba } | { kapcsolat }. */
export function mentKapcsolat(k) {
  const id = k.id || uid('kp');
  const row = { kapcsolat_id: id };
  if (k.tipus !== undefined) row.tipus = k.tipus;
  if (k.forras !== undefined) row.forras_elem = k.forras;
  if (k.cel !== undefined) row.cel_elem = k.cel;
  if (k.csatorna !== undefined) row.csatorna_id = k.csatorna;
  if (k.allapot !== undefined) row.allapot = k.allapot;
  if (k.megj !== undefined) row.megj = k.megj;
  return muvelet({ type: 'kapcsolat_mentes', kapcsolat: row }, () => ({ kapcsolat: azon(M().kapcsolatok).get(id) }));
}
export const delKapcsolat = id => vegrehajt({ type: 'kapcsolat_torles', kapcsolat_id: id });

/**
 * Projekt-összesítő egy termékfajtára (kat; alapból a kiválasztott): elem szinten –
 * { rajz, lerakva, lerakatlan, cnt: Map(állapot-kulcs → elem db), hiba (hibás helyek), keszultseg (0–1, a fajtában), keszultsegOssz
 * (0–1, minden elem), elemek, felmeres, hibajel } – vagy null, ha a projekt adata nincs a készüléken.
 * Állapot-kulcs: '' = nincs elkezdve, különben a legelőrébb tartó kész lépés id-je.
 */
export function projektStat(pid = aktiv, kat = fajta(pid)) {
  if (!betoltve(pid)) return null;
  const all = poziciok(pid);
  const cnt = new Map();
  let lerakva = 0, ertek = 0, ossz = 0, osszErtek = 0;
  const hibasHely = new Set();
  for (const el of elemek(pid)) {
    const p = getPoz(el.poz);
    if (!p || p.fajta !== 'pozicio') continue;
    const v = p.rajzId ? elemKeszultseg(el.id) : 0;
    ossz++; osszErtek += v;
    if (el.kategoriaId !== kat) continue;
    if (p.rajzId) {
      lerakva++;
      const a = allapot(el.id), k = a.lepes ? a.lepes.id : '';
      cnt.set(k, (cnt.get(k) || 0) + 1);
      ertek += v;
      if (helyHiba(p.id)) hibasHely.add(p.id);
    }
  }
  const nKat = elemek(pid, kat).filter(el => { const p = getPoz(el.poz); return p && p.fajta === 'pozicio'; }).length;
  return { rajz: rajzok(pid).length, lerakva, lerakatlan: nKat - lerakva, cnt, hiba: hibasHely.size, elemek: nKat,
    keszultseg: nKat ? ertek / nKat : 0, keszultsegOssz: ossz ? osszErtek / ossz : 0,
    felmeres: all.filter(p => p.fajta === 'felmeres').length, hibajel: all.filter(p => p.fajta === 'hiba').length };
}
