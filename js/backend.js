// Backend réteg (a Raktár backend.js mintájára): valódi szerver (Apps Script) vagy helyi (a böngészőben futó) kiszolgáló.
// Mindkettő ugyanazt a felületet adja:
//   login(idToken) → { token, user }
//   adatok(token, projektId, version) → { user, data, version } vagy { unchanged: true }
//   szinkron(token, ops, projektId) → { results: [{ op_id, ok, error? }], user, data, version }
//   rajzPdf(token, rajzId) → { verzio, bytes: ArrayBuffer }
//   rajzFeltoltes(token, rajz, bytes) → { rajz }   (új rajz vagy PDF-csere; csak online)
import { CONFIG } from './config.js';
import * as idb from './idb.js';
import { regiAdatbol } from './model.js';

const L = window.TerepLogic;
export const isHelyi = !CONFIG.API_URL;

export function networkError(msg = 'Nincs kapcsolat a szerverrel.') {
  const e = new Error(msg); e.network = true; return e;
}

/* ---------- base64 (a rajzok így utaznak: az Apps Script csak szöveget fogad / küld) ---------- */
function toBase64(buf) {
  const b = new Uint8Array(buf), CH = 0x8000;
  let s = '';
  for (let i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, i + CH));
  return btoa(s);
}
function fromBase64(str) {
  const s = atob(str), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

/* ===================== Apps Script ===================== */
// Egy kérés legfeljebb ennyi ideig tarthat (rajzfeltöltésnél tovább): a „beragadt” kapcsolat ne akassza meg a szinkront.
// Megszakítás után az újraküldés biztonságos: a szerver a már feldolgozott műveleteket kihagyja (azonosító szerint).
const REQUEST_TIMEOUT = 60000;
const UPLOAD_TIMEOUT = 300000;

class RemoteBackend {
  async call(payload, timeout = REQUEST_TIMEOUT) {
    let res;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        // text/plain: így a böngésző nem küld CORS előkérést (az Apps Script nem kezeli)
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: ctrl.signal,
      });
    } catch {
      throw networkError(ctrl.signal.aborted ? 'A szerver nem válaszolt időben – újrapróbálás hamarosan.' : undefined);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw networkError('Szerverhiba (' + res.status + ').');
    let data;
    try {
      const text = await res.text();
      data = JSON.parse(text);
      data.bytes = text.length;
    } catch { throw networkError('Érvénytelen válasz a szervertől.'); }
    if (!data.ok) { const e = new Error(data.error || 'Ismeretlen hiba'); e.auth = !!data.auth; throw e; }
    return data;
  }
  login(idToken) { return this.call({ action: 'login', idToken }); }
  adatok(token, projektId, version) { return this.call({ action: 'adatok', token, projekt_id: projektId || '', version: version || null }); }
  szinkron(token, ops, projektId) { return this.call({ action: 'szinkron', token, ops, projekt_id: projektId || '' }); }
  async rajzPdf(token, rajzId) {
    const r = await this.call({ action: 'rajz_pdf', token, rajz_id: rajzId }, UPLOAD_TIMEOUT);
    return { verzio: Number(r.verzio) || 1, bytes: fromBase64(r.data) };
  }
  rajzFeltoltes(token, rajz, bytes) { return this.call({ action: 'rajz_feltoltes', token, rajz, data: toBase64(bytes) }, UPLOAD_TIMEOUT); }
}

/* ===================== Helyi mód ===================== */
// Ugyanazt a logikát (TerepLogic.applyOp) futtatja, mint a szerver, de minden a készüléken marad (IndexedDB: 'helyi:db',
// a PDF-ek 'pdf:<rajz-id>' kulcson). Belépés nincs: a helyi felhasználó admin, a neve a Fiók oldalon adható meg.
// Első induláskor a prototípus korábbi adata ('adat' kulcs) átkerül ide (az eredeti kulcs érintetlen marad).
export const HELYI_EMAIL = 'helyi@eszkoz';
const NEV_KEY = 'terep_nev';
export function helyiNev() { try { return localStorage.getItem(NEV_KEY) || ''; } catch { return ''; } }
export function setHelyiNev(v) { try { localStorage.setItem(NEV_KEY, v); } catch { /* */ } }
const helyiUser = () => ({ email: HELYI_EMAIL, nev: helyiNev() || 'Helyi felhasználó', szerepkor: 'admin', aktiv: true, projektek: '', megjegyzes: '' });

class HelyiBackend {
  constructor() { this.db = null; this.version = String(Date.now()); }
  async load() {
    if (this.db) return this.db;
    let t = await idb.get('helyi:db');
    if (!t) {
      const regi = await idb.get('adat');
      t = regi ? regiAdatbol(regi, helyiUser()) : {};
      L.TABLES.forEach(k => { t[k] = t[k] || []; });
      await idb.set('helyi:db', t);
    }
    this.db = t;
    return t;
  }
  async save() {
    const out = {};
    L.TABLES.forEach(k => { out[k] = L.exportRows(this.db[k]); });
    await idb.set('helyi:db', out);
  }
  user() {
    const u = helyiUser();
    return { email: u.email, nev: u.nev, szerepkor: u.szerepkor, projektek: '' };
  }
  /** Helyben minden projekt teljes adata jön (mind: true) – így a Projektek oldal összesítője is teljes. */
  data(projektId) {
    const out = { projekt_id: projektId || '', mind: true };
    L.TABLES.forEach(k => { out[k] = L.exportRows(this.db[k]); });
    out.Poziciok = out.Poziciok.filter(p => !p.torolve);
    return out;
  }
  async login() { await this.load(); return { ok: true, token: 'helyi', user: this.user() }; }
  async adatok(token, projektId, version) {
    await this.load();
    if (version && version === this.version) return { ok: true, user: this.user(), unchanged: true, version };
    return { ok: true, user: this.user(), data: this.data(projektId), version: this.version };
  }
  async szinkron(token, ops, projektId) {
    await this.load();
    const user = this.user(), now = new Date().toISOString(), results = [];
    let changed = 0;
    for (const op of ops) {
      try {
        const ch = L.applyOp(this.db, op, user, now);
        changed += ch.length;
        // A törölt rajzok PDF-je is törlődik (a szerveren: Drive-kuka)
        for (const c of ch) if (c.table === 'Rajzok' && c.deleted) await idb.del('pdf:' + c.row.rajz_id);
        results.push({ op_id: op.op_id, ok: true });
      } catch (e) {
        if (!e.validation) console.error(e);
        results.push({ op_id: op && op.op_id, ok: false, error: e.validation ? e.message : 'Feldolgozási hiba (hibás szerkezetű művelet).' });
      }
    }
    if (changed) { this.version = String(Date.now()); await this.save(); }
    return { ok: true, results, user, data: this.data(projektId), version: this.version };
  }
  async rajzPdf(token, rajzId) {
    await this.load();
    const r = L.get(this.db, 'Rajzok', rajzId);
    const bytes = await idb.get('pdf:' + rajzId);
    if (!r || !bytes) throw new Error('A rajz fájlja hiányzik.');
    return { verzio: Number(r.verzio) || 1, bytes };
  }
  /** Mint a szerver rajz_feltoltes művelete (Code.gs). */
  async rajzFeltoltes(token, rajz, bytes) {
    await this.load();
    L.checkId(rajz.rajz_id);
    const ex = L.get(this.db, 'Rajzok', rajz.rajz_id);
    const projektId = ex ? ex.projekt_id : rajz.projekt_id;
    if (!L.get(this.db, 'Projektek', projektId)) throw new Error('Ismeretlen projekt.');
    const now = new Date().toISOString(), num = v => (Number(v) > 0 ? Number(v) : 0);
    await idb.set('pdf:' + rajz.rajz_id, bytes);
    const row = ex
      ? { rajz_id: ex.rajz_id, W: num(rajz.W), H: num(rajz.H), verzio: (Number(ex.verzio) || 1) + 1, meret: bytes.byteLength, csere: now, modositva: now }
      : L.normalize('Rajzok', { rajz_id: rajz.rajz_id, projekt_id: projektId, nev: String(rajz.nev || 'Rajz').trim().slice(0, 200),
        epulet: rajz.epulet, szint: rajz.szint, W: num(rajz.W), H: num(rajz.H), verzio: 1, meret: bytes.byteLength, drive_id: '', felveve: now, csere: '', modositva: now });
    if (ex) Object.assign(ex, row); else { this.db.Rajzok.push(row); this.db._idx = null; }
    this.version = String(Date.now());
    await this.save();
    return { ok: true, rajz: L.exportRows([ex || row])[0], version: this.version };
  }
}

export const backend = isHelyi ? new HelyiBackend() : new RemoteBackend();
