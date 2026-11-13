// Alkalmazás állapot (a Raktár store.js mintájára): az utolsó szerver-pillanatkép + a helyi kimenő sor (outbox) + szinkron.
// A felület mindig a „pillanatkép + még fel nem töltött műveletek” eredményét mutatja (TerepLogic.applyOp a böngészőben is fut),
// így az offline rögzített adatok is azonnal látszanak, és a szerver ugyanazokkal a szabályokkal fogadja el őket.
//
// Projektenként: a szerver csak a kiválasztott projekt részletes adatát küldi (rajzok, pozíciók, típusok, napló); a projektlista
// mindig jön. A készüléken projektenként marad meg az utolsó letöltés ('srv:adat:<projekt>'; helyi módban 'helyi:…'),
// így offline is megnyílik.
// Rajzok: 'rajzpdf:<rajz>' = { verzio, bytes } – verziószám szerint frissül; a projekt megnyitásakor a háttérben letöltődnek.
import * as idb from './idb.js';
import { backend, isHelyi, networkError } from './backend.js';
import { CONFIG } from './config.js';
import { fromServer } from './model.js';
import { uid } from './ui.js';

const L = window.TerepLogic;
// Tárolási kulcsok előtagja: a helyi és a szerveres mód adatai nem keveredhetnek (localhost-on ?live-val mindkettő futhat)
const P = isHelyi ? 'helyi:' : 'srv:';

export const state = {
  user: null,          // { email, nev, szerepkor, projektek }
  token: null,
  pid: '',             // a kiválasztott projekt (ennek a részletes adata van a pillanatképben)
  data: null,          // utolsó szerver adat (snapshot) erre a projektre
  at: null,            // mikor jött
  version: null,       // a szerver adatverziója a pillanatképnél (változatlan adatot nem tölt le újra)
  outbox: [],          // feltöltésre váró műveletek
  rejected: [],        // a szerver által elutasított műveletek (hibaüzenettel)
  syncing: false,
  online: navigator.onLine,
  lastError: null,
  authError: null,
  db: null,            // pillanatkép + kimenő sor, szerver-táblákban
  model: fromServer({}), // ugyanez a felület modelljében (model.js)
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(kind = 'data') { listeners.forEach(fn => { try { fn(kind); } catch (e) { console.error(e); } }); }

export const can = role => L.hasRole(state.user, role);
export { isHelyi };

// Egy szinkron kérésben legfeljebb ennyi művelet / ekkora adat megy fel (a szerver korlátai: 200 művelet, 2 MB)
const SYNC_BATCH = 100;
const SYNC_BYTES = 900 * 1024;

/** A művelet a bejelentkezett felhasználóé-e: közös készüléken mindenki csak a saját rögzítéseit tölti fel. */
const isMine = op => !op.by || (state.user && op.by === state.user.email);
export const myOutbox = () => state.outbox.filter(isMine);

/** Szerver-táblák másolata (a sorok is: az applyOp helyben módosít). */
function cloneDb(d) {
  const out = { projekt_id: d.projekt_id, mind: d.mind };
  for (const t of L.TABLES) if (d[t]) out[t] = d[t].map(r => ({ ...r }));
  return out;
}
const ures = () => { const d = {}; L.TABLES.forEach(t => { d[t] = []; }); return d; };
/** Az op erre a projektre vonatkozik-e (más projekt függő műveletei itt nem alkalmazhatók – annak az adatai nincsenek meg). */
const ideTartozik = op => !op.pid || op.pid === state.pid || (state.data && state.data.mind);

function recompute() {
  const db = cloneDb(state.data || { projekt_id: state.pid, ...ures() });
  for (const t of L.TABLES) db[t] = db[t] || [];
  for (const op of state.outbox) {
    if (!isMine(op) || !ideTartozik(op)) continue;
    try { L.applyOp(db, op, state.user, op.created); op.localError = null; }
    catch (e) { op.localError = e.message; }
  }
  setDb(db);
}
function setDb(db) {
  delete db._idx;
  state.db = db;
  state.model = fromServer(db);
}

const persist = () => Promise.all([idb.set(P + 'outbox', state.outbox), idb.set(P + 'rejected', state.rejected)]);
const cacheKey = pid => P + 'adat:' + (pid || '');
async function loadCache(pid) {
  const c = await idb.get(cacheKey(pid));
  if (c) { state.data = c.data; state.at = c.at; state.version = c.version || null; return true; }
  // Nincs még letöltve: a projektlista az eddigi adatból, a részletek a szinkron után
  const prev = state.data || {};
  state.data = { projekt_id: pid, Projektek: prev.Projektek || [], Lepesek: prev.Lepesek || [], Felhasznalok: prev.Felhasznalok || [] };
  // A szerveren még nem létező (ezen a készüléken, offline létrehozott) projekt: nincs mit letölteni, üresen „betöltött”
  if (pid && !state.data.Projektek.some(p => p.projekt_id === pid)) Object.assign(state.data, { Rajzok: [], Poziciok: [], Tipusok: [], Esemenyek: [] });
  state.at = null; state.version = null;
  return false;
}
const saveCache = (pid, data, at, version) => idb.set(cacheKey(pid), { data, at, version });

export async function init(pid) {
  const [session, outbox, rejected] = await Promise.all([idb.get(P + 'session'), idb.get(P + 'outbox'), idb.get(P + 'rejected')]);
  if (session) { state.user = session.user; state.token = session.token; }
  state.outbox = outbox || [];
  state.rejected = rejected || [];
  state.pid = pid || '';
  await loadCache(state.pid);
  recompute();
  window.addEventListener('online', () => { state.online = true; emit('status'); sync(); });
  window.addEventListener('offline', () => { state.online = false; emit('status'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, CONFIG.SYNC_INTERVAL);
  // Helyi mód: nincs belépés, a helyi felhasználó azonnal „be van jelentkezve”
  if (isHelyi && !state.user) { const r = await backend.login(); await setSession(r.token, r.user); return; }
  if (state.user) await (state.version ? (sync(), null) : sync()); // első indulás: megvárjuk az adatot
}

export async function setSession(token, user) {
  // Másik felhasználó: a letöltött adatot eldobjuk (a kimenő sor marad, de mindenki csak a sajátját tölti fel)
  if (state.user && state.user.email !== user.email) await torolLetoltott();
  // Elutasított tételek: csak a saját (egy másik felhasználó ne lássa a korábbi rögzítéseit)
  state.rejected = state.rejected.filter(x => !x.op.by || x.op.by === user.email);
  state.token = token;
  state.user = user;
  state.authError = null;
  await idb.set(P + 'session', { token, user });
  recompute();
  emit();
  return sync();
}

/** A letöltött adatok és rajzok törlése a készülékről (kijelentkezés, lejárt hozzáférés). A kimenő sor megmarad. */
async function torolLetoltott() {
  const keys = await idb.keys();
  await Promise.all(keys.filter(k => typeof k === 'string' && (k.startsWith(P + 'adat:') || k.startsWith('rajzpdf:'))).map(k => idb.del(k)));
  state.data = null; state.at = null; state.version = null;
}

export async function logout() {
  state.user = null; state.token = null;
  await idb.del(P + 'session');
  await torolLetoltott();
  recompute();
  emit();
}

/** A helyi felhasználó nevének változása (helyi mód): a naplóba ez kerül. */
export function setUserNev(nev) {
  if (!state.user) return;
  state.user = { ...state.user, nev };
  idb.set(P + 'session', { token: state.token, user: state.user });
}

/**
 * Projektváltás: a projekt korábban letöltött adata azonnal (ha van), utána szinkron. Ha még nincs letöltve, megvárja.
 */
export async function setProjekt(pid) {
  pid = pid || '';
  if (pid === state.pid) return;
  state.pid = pid;
  const volt = await loadCache(pid);
  recompute();
  emit();
  if (!volt || (state.data && state.data.mind)) await sync(); else sync();
}

/**
 * Új műveletek a kimenő sorba (egy vagy több, egyben): azonnal látszanak, és szinkronizálódnak.
 * Előbb a helyi logika ellenőrzi őket egy másolaton – érvénytelen művelet nem kerül a sorba (hibát dob: e.validation).
 */
export async function enqueue(ops) {
  ops = Array.isArray(ops) ? ops : [ops];
  if (!ops.length) return;
  const next = cloneDb(state.db);
  const now = new Date().toISOString();
  for (const op of ops) {
    op.op_id = uid('op');
    op.created = now;
    op.by = state.user && state.user.email;
    if (op.pid === undefined) op.pid = state.pid;
    L.applyOp(next, op, state.user, now); // hibát dob, ha érvénytelen
  }
  state.outbox.push(...ops);
  setDb(next);
  await persist();
  emit();
  syncSoon();
}

// Kötegelés: a gyorsan egymás után rögzített műveletek rövid várakozás után egy kérésben mennek fel
const BATCH_DELAY = 800;
let batchTimer = null;
function syncSoon() {
  clearTimeout(batchTimer);
  batchTimer = setTimeout(sync, isHelyi ? 0 : BATCH_DELAY);
}

// Hiba után magától újrapróbál, egyre ritkábban: 15 mp, 30 mp … legfeljebb 3 perc
let retryTimer = null, retryDelay = 15000;
function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(sync, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 180000);
}

let syncPromise = null;
let syncAgain = false;
export function sync() {
  if (!state.token) return Promise.resolve();
  clearTimeout(batchTimer);
  if (syncPromise) { syncAgain = true; return syncPromise.then(() => syncPromise || undefined); }
  syncPromise = doSync().finally(() => {
    syncPromise = null;
    if (syncAgain) {
      syncAgain = false;
      if (state.token && !state.lastError) sync();
    }
  });
  return syncPromise;
}

/** A következő köteg: legfeljebb SYNC_BATCH művelet és kb. SYNC_BYTES méret. */
function batch(list) {
  const out = [];
  let size = 0;
  for (const op of list) {
    const n = JSON.stringify(op).length;
    if (out.length && (out.length >= SYNC_BATCH || size + n > SYNC_BYTES)) break;
    out.push(op); size += n;
  }
  return out;
}

async function doSync() {
  clearTimeout(retryTimer);
  state.syncing = true;
  emit('status');
  const pid = state.pid;
  const mine = myOutbox();
  const sent = batch(mine).map(({ localError, ...op }) => op);
  if (mine.length > sent.length) syncAgain = true;
  let unchanged = false, ujElutasitott = 0;
  try {
    const res = sent.length ? await backend.szinkron(state.token, sent, pid)
      : await backend.adatok(state.token, pid, state.data && state.data.Poziciok ? state.version : null);
    state.online = true; state.lastError = null; retryDelay = 15000;
    if (res.user) {
      state.user = res.user;
      await idb.set(P + 'session', { token: state.token, user: state.user });
    }
    if (sent.length) {
      const byId = new Map((res.results || []).map(r => [r.op_id, r]));
      const failed = [];
      for (const op of sent) {
        const r = byId.get(op.op_id);
        if (r && !r.ok) failed.push({ op, error: r.error, at: new Date().toISOString() });
      }
      const sentIds = new Set(sent.map(o => o.op_id));
      state.outbox = state.outbox.filter(o => !sentIds.has(o.op_id));
      if (failed.length) { state.rejected.push(...failed); ujElutasitott = failed.length; }
      await persist();
    }
    if (res.unchanged) { state.at = new Date().toISOString(); unchanged = true; return; }
    const at = new Date().toISOString();
    await saveCache(pid, res.data, at, res.version || null);
    if (pid === state.pid) { state.data = res.data; state.at = at; state.version = res.version || null; }
    else syncAgain = true; // közben projektet váltott: az új projekt adata a következő körben
  } catch (e) {
    if (!e.auth) scheduleRetry();
    if (e.network) { state.online = false; state.lastError = e.message; }
    else if (e.auth) {
      // Lejárt / visszavont hozzáférés: a letöltött adat azonnal törlődik a készülékről, újra be kell jelentkezni.
      // A még fel nem töltött rögzítések (kimenő sor) megmaradnak.
      state.authError = e.message; state.lastError = e.message;
      state.user = null; state.token = null;
      await idb.del(P + 'session');
      await torolLetoltott();
    } else state.lastError = e.message;
  } finally {
    state.syncing = false;
    if (!unchanged) recompute();
    emit(unchanged ? 'status' : 'data');
    if (ujElutasitott) emit('elutasitva');
    if (!unchanged && state.online && !state.lastError) elotolt();
  }
}

export async function dismissRejected(i) {
  state.rejected.splice(i, 1);
  await persist();
  emit('status');
}
export async function discardOutboxItem(opId) {
  state.outbox = state.outbox.filter(o => o.op_id !== opId);
  await persist();
  recompute();
  emit();
}

/* ---------- Rajzok (PDF) ---------- */
const letoltes = new Map(); // rajz-id → folyamatban lévő letöltés (ne induljon kétszer)
const pdfKey = id => 'rajzpdf:' + id;

/**
 * Egy rajz PDF-je. Helyi módban a készülékről; szerveres módban a gyorsítótárból, ha a verziója aktuális,
 * különben letölti (online). Offline a régebbi verzió is jobb a semminél (stale: true).
 * Visszaad: { bytes, stale }.
 */
export async function pdf(rajzId) {
  const r = state.model.rajzok.find(x => x.id === rajzId);
  if (isHelyi) return { bytes: (await backend.rajzPdf(state.token, rajzId)).bytes, stale: false };
  const c = await idb.get(pdfKey(rajzId));
  if (c && r && c.verzio >= r.verzio) return { bytes: c.bytes, stale: false };
  try {
    return { bytes: await letolt(rajzId), stale: false };
  } catch (e) {
    if (c) return { bytes: c.bytes, stale: true };
    if (e.network) throw networkError('A rajz még nincs letöltve erre a készülékre, és most nincs kapcsolat a szerverrel.');
    throw e;
  }
}
function letolt(rajzId) {
  if (!letoltes.has(rajzId)) {
    letoltes.set(rajzId, (async () => {
      try {
        const res = await backend.rajzPdf(state.token, rajzId);
        await idb.set(pdfKey(rajzId), { verzio: res.verzio, bytes: res.bytes });
        return res.bytes;
      } finally { letoltes.delete(rajzId); }
    })());
  }
  return letoltes.get(rajzId);
}
/** A kiválasztott projekt hiányzó / elavult rajzainak letöltése a háttérben (offline munkához). */
let elotoltFut = false;
async function elotolt() {
  if (isHelyi || elotoltFut || !state.token) return;
  elotoltFut = true;
  try {
    for (const r of state.model.rajzok.filter(x => x.projektId === state.pid)) {
      if (!state.online || !state.token) break;
      const c = await idb.get(pdfKey(r.id));
      if (c && c.verzio >= r.verzio) continue;
      try { await letolt(r.id); } catch (e) { console.warn('Rajz előtöltés', r.nev, e.message); if (e.network) break; }
    }
  } finally { elotoltFut = false; }
}
/** Mennyi rajz van letöltve a kiválasztott projektből (Fiók oldal): { db, ossz, meret }. */
export async function letoltottRajzok() {
  const list = state.model.rajzok.filter(x => x.projektId === state.pid);
  let db = 0, meret = 0;
  for (const r of list) {
    if (isHelyi) { db++; meret += r.meret || 0; continue; }
    const c = await idb.get(pdfKey(r.id));
    if (c && c.verzio >= r.verzio) { db++; meret += c.bytes.byteLength; }
  }
  return { db, ossz: list.length, meret };
}

/**
 * Rajz feltöltése (új rajz vagy PDF-csere) – csak online. Előbb a függő változások mennek fel (pl. az offline létrehozott
 * projekt), hogy a szerver ismerje a projektet. rajz: { rajz_id, projekt_id?, nev?, epulet?, szint?, W, H }.
 */
export async function feltolt(rajz, bytes) {
  if (!isHelyi && !navigator.onLine) throw networkError('A rajz feltöltéséhez internetkapcsolat kell.');
  await sync();
  if (!isHelyi && myOutbox().length) throw new Error('Előbb a függő változásoknak fel kell töltődniük (Fiók oldal) – utána próbáld újra.');
  const res = await backend.rajzFeltoltes(state.token, rajz, bytes);
  const row = res.rajz;
  if (!isHelyi) await idb.set(pdfKey(row.rajz_id), { verzio: Number(row.verzio) || 1, bytes });
  // A pillanatképbe azonnal bekerül; a következő szinkron úgyis frissít (a verzió nem egyezik)
  const d = state.data;
  d.Rajzok = (d.Rajzok || []).filter(x => x.rajz_id !== row.rajz_id).concat([row]);
  state.version = null;
  await saveCache(state.pid, d, state.at, null);
  recompute();
  emit();
  sync();
  return row.rajz_id;
}
