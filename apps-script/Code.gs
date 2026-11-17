/**
 * Terep – Google Apps Script backend (a Raktár backendjének mintájára, külön példányban: saját Sheet, saját telepítés).
 * A Google Sheethez kötött scriptként fut (Bővítmények → Apps Script). Az üzleti logika a Logic.gs-ben (TerepLogic).
 *
 * Műveletek (POST, JSON):
 *   login          { idToken }                         → { token, user }
 *   adatok         { token, projekt_id?, version? }    → { user, data, version } (vagy unchanged)
 *   szinkron       { token, ops: [...], projekt_id? }  → { results, user, data, version }
 *   rajz_pdf       { token, rajz_id }                  → { data (base64), verzio }
 *   rajz_feltoltes { token, rajz: {...}, data (base64) } → új rajz vagy PDF-csere (új verzió) → { rajz, version }
 *   foto_feltoltes { token, foto: { foto_id, esemeny_id, mikor }, data, kicsi (base64 JPEG) } → { foto, version }
 *   foto           { token, foto_id, kicsi }           → { data (base64 JPEG) }
 *
 * A Kozos.gs KÖZÖS fájl (bejelentkezés, munkamenet, adatverzió, hibák, json): forrása a Kozos_Claude repó,
 * ne itt szerkeszd. Ehhez itt kell: GOOGLE_CLIENT_ID, SESSION_DAYS, readTable(), publicUser().
 *
 * Telepítés: lásd UZEMBE_HELYEZES.md.
 */

// A Google Cloud Console-ban létrehozott OAuth kliens azonosító (Web application típus). Nem titkos adat.
// Ugyanaz lehet, mint a Raktáré (közös Google-belépés, de külön felhasználólista és munkamenet).
var GOOGLE_CLIENT_ID = '';

var SESSION_DAYS = 30;
var MAX_OPS_PER_REQUEST = 200;              // egy szinkronban legfeljebb ennyi művelet
var MAX_REQUEST_BYTES = 2 * 1024 * 1024;    // általános kérés
var MAX_UPLOAD_BYTES = 40 * 1024 * 1024;    // rajzfeltöltés (base64-ben, kb. 30 MB-os PDF-ig)
var RAJZ_MAPPA_NEV = 'Terep – rajzok (NE oszd meg)';

/* ===================== Menü a Sheetben ===================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Terep')
    .addItem('Táblák létrehozása / ellenőrzése', 'setup')
    .addItem('Rajzok mappákba rendezése', 'rajzokRendezese')
    .addItem('Adatbázis átalakítása (v2)', 'atalakitasV2')
    .addSeparator()
    .addItem('Mindenki kijelentkeztetése', 'logoutEveryoneConfirm')
    .addToUi();
}

/* ===================== Web App belépési pontok ===================== */
function doGet() {
  return json({ ok: true, app: 'terep', time: new Date().toISOString() });
}

function doPost(e) {
  var req;
  try {
    if (!e || !e.postData || e.postData.contents.length > MAX_UPLOAD_BYTES) throw new Error('size');
    req = JSON.parse(e.postData.contents);
    if (!req || typeof req !== 'object') throw new Error('type');
    // A nagy kérés csak rajzfeltöltés lehet
    if (req.action !== 'rajz_feltoltes' && req.action !== 'foto_feltoltes' && e.postData.contents.length > MAX_REQUEST_BYTES) throw new Error('size');
  } catch (x) {
    return json({ ok: false, error: 'Hibás kérés.' });
  }
  try {
    if (req.token != null && typeof req.token !== 'string') throw authError('Érvénytelen munkamenet.');
    if (req.action === 'login') return json(login(req.idToken));
    var sw = stopwatch();
    var email = tokenEmail(req.token);
    var projektId = typeof req.projekt_id === 'string' ? req.projekt_id : '';
    if (req.action === 'adatok') {
      // Ha a készülék adata még aktuális (ugyanarra a projektre), nem olvassuk be és küldjük le újra az egészet
      var ver = dataVersion();
      if (req.version && req.version === ver) {
        var same = activeUser(email, readTable('Felhasznalok'));
        return json({ ok: true, user: publicUser(same), unchanged: true, version: ver, timing: sw.done() });
      }
      var db = readAll();
      sw.lap('read');
      var user = activeUser(email, db.Felhasznalok);
      return json({ ok: true, user: publicUser(user), data: TerepLogic.snapshot(db, user, projektId), version: ver, timing: sw.done() });
    }
    if (req.action === 'szinkron') {
      var ops = Array.isArray(req.ops) ? req.ops : [];
      if (ops.length > MAX_OPS_PER_REQUEST) return json({ ok: false, error: 'Túl sok művelet egy kérésben.' });
      return json(sync(email, ops, projektId, sw));
    }
    if (req.action === 'rajz_pdf') return json(rajzPdf(email, req));
    if (req.action === 'rajz_feltoltes') return json(rajzFeltoltes(email, req));
    if (req.action === 'foto_feltoltes') return json(fotoFeltoltes(email, req));
    if (req.action === 'foto') return json(fotoLetoltes(email, req));
    return json({ ok: false, error: 'Ismeretlen művelet.' });
  } catch (err) {
    // Csak a szándékosan a felhasználónak szánt üzenet megy ki; a nem várt hiba részlete a szerver naplójába kerül
    if (err && (err.auth || err.pub || err.validation)) return json({ ok: false, error: err.message, auth: !!err.auth });
    console.error('Terep – váratlan hiba (' + req.action + '): ' + (err && err.stack || err));
    return json({ ok: false, error: 'Szerverhiba – próbáld újra később.' });
  }
}

function publicUser(u) { return { email: u.email, nev: u.nev, szerepkor: u.szerepkor, projektek: u.projektek }; }

/* ===================== Szinkron ===================== */
function sync(email, ops, projektId, sw) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw publicError('A szerver most foglalt, a feltöltés hamarosan újra próbálkozik.');
  sw.lap('lock');
  try {
    var db = readAll();
    sw.lap('read');
    var user = activeUser(email, db.Felhasznalok);
    var now = new Date().toISOString();
    var results = [], changes = [];
    ops.forEach(function (op) {
      var opId = op && typeof op === 'object' ? op.op_id : null;
      try {
        changes = changes.concat(TerepLogic.applyOp(db, op, user, now));
        results.push({ op_id: opId, ok: true });
      } catch (err) {
        // Egy hibás művelet csak önmagát utasítsa el, ne akassza meg a készülék többi feltöltését
        if (!err.validation) console.error('Terep – művelet feldolgozási hiba: ' + (err && err.stack || err));
        results.push({ op_id: opId, ok: false, error: err.validation ? err.message : 'Feldolgozási hiba (hibás szerkezetű művelet).' });
      }
    });
    sw.lap('apply');
    writeChanges(changes);
    torolRajzFajlok(changes);
    SpreadsheetApp.flush();
    sw.lap('write');
    var me = activeUser(email, db.Felhasznalok);
    return { ok: true, results: results, user: publicUser(me), data: TerepLogic.snapshot(db, me, projektId), version: dataVersion(), timing: sw.done() };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== Rajzok a Drive-on ===================== */
// A PDF-ek a Sheet tulajdonosának Drive-ján, egy külön mappában vannak, megosztás nélkül. A készülék csak az Apps Scripten
// keresztül éri el őket, jogosultság-ellenőrzés után (a projekthez hozzáférése kell legyen).
function rajzMappa() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('RAJZ_MAPPA_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (x) { /* törölték: újat hozunk létre */ } }
  var f = DriveApp.createFolder(RAJZ_MAPPA_NEV);
  props.setProperty('RAJZ_MAPPA_ID', f.getId());
  return f;
}

/**
 * A projekt mappája a rajzok mappáján belül (projektenként egy; azonosító a scripttulajdonságokban: MAPPA_<projekt_id>).
 * A mappa neve a projekt neve – átnevezéskor a következő feltöltésnél követi.
 */
var REGI_MAPPA_NEV = 'Régi verziók';
function projektMappa(proj) {
  var props = PropertiesService.getScriptProperties(), kulcs = 'MAPPA_' + proj.projekt_id;
  var nev = String(proj.nev || proj.projekt_id).replace(/[\\/]/g, '-').slice(0, 120);
  var id = props.getProperty(kulcs), f = null;
  if (id) { try { f = DriveApp.getFolderById(id); if (f.isTrashed()) f = null; } catch (x) { f = null; } }
  if (!f) { f = rajzMappa().createFolder(nev); props.setProperty(kulcs, f.getId()); }
  else if (f.getName() !== nev) f.setName(nev);
  return f;
}
/** A projekt mappáján belüli „Régi verziók” almappa (rajzcsere előtti fájlok). */
function regiMappa(projMappa) {
  var it = projMappa.getFoldersByName(REGI_MAPPA_NEV);
  return it.hasNext() ? it.next() : projMappa.createFolder(REGI_MAPPA_NEV);
}

/**
 * Menüből: a meglévő rajzfájlok mappákba rendezése (a projekt mappájába; a régi verziók a „Régi verziók” almappába).
 * A régi verziók a fájlnév elejéről („<projekt neve> – …”) azonosíthatók. Többször is futtatható.
 */
function rajzokRendezese() {
  var root = rajzMappa(), db = readAll(), n = 0, regi = 0;
  var projById = {};
  db.Projektek.forEach(function (p) { projById[p.projekt_id] = p; });
  db.Rajzok.forEach(function (r) {
    var p = projById[r.projekt_id];
    if (!p || !r.drive_id) return;
    try {
      var file = DriveApp.getFileById(r.drive_id), cel = projektMappa(p);
      var parents = file.getParents(), mar = false;
      while (parents.hasNext()) if (parents.next().getId() === cel.getId()) mar = true;
      if (!mar) { file.moveTo(cel); n++; }
    } catch (x) { console.error('Terep – rendezés: ' + r.rajz_id + ': ' + x); }
  });
  // A gyökérben maradt fájlok: régi verziók (név alapján a projekthez)
  var files = root.getFiles();
  while (files.hasNext()) {
    var f = files.next(), nev = f.getName();
    var p = db.Projektek.filter(function (x) { return nev.indexOf(x.nev + ' – ') === 0; })
      .sort(function (a, b) { return b.nev.length - a.nev.length; })[0];
    if (!p) continue;
    f.moveTo(/\(régi v\d+\)/.test(nev) ? regiMappa(projektMappa(p)) : projektMappa(p));
    regi++;
  }
  var msg = 'Kész: ' + n + ' rajz a projektje mappájába, további ' + regi + ' fájl (régi verziók) áthelyezve.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (x) { console.log(msg); }
}

/** Egy rajz PDF-je (base64), ha a felhasználó látja a projektet. */
function rajzPdf(email, req) {
  var users = readTable('Felhasznalok');
  var user = activeUser(email, users);
  var rajzok = readTable('Rajzok');
  var r = rajzok.filter(function (x) { return x.rajz_id === String(req.rajz_id || ''); })[0];
  // Ugyanabból a PDF-ből készült rajz (más kivágás): a forrás fájlja
  if (r && r.forras) r = rajzok.filter(function (x) { return x.rajz_id === r.forras; })[0];
  if (!r || !TerepLogic.lathatja(user, r.projekt_id)) throw publicError('A rajz nem található.');
  if (!r.drive_id) throw publicError('A rajz fájlja hiányzik.');
  var bytes;
  try { bytes = DriveApp.getFileById(r.drive_id).getBlob().getBytes(); }
  catch (x) { console.error('Terep – rajz olvasási hiba: ' + x); throw publicError('A rajz fájlja nem olvasható.'); }
  return { ok: true, rajz_id: String(req.rajz_id || ''), verzio: r.verzio, data: Utilities.base64Encode(bytes) };
}

/**
 * Rajzfeltöltés (iroda): új rajz (rajz.projekt_id, nev, epulet, szint, homlokzat) vagy meglévő PDF-jének cseréje (új verzió;
 * a jelölők az oldalhoz viszonyított helyükön maradnak – a méret-összevetést és a figyelmeztetést a kliens végzi).
 * A régi fájl a mappában marad („(régi vN)” névvel), így egy hibás csere visszakereshető.
 */
function rajzFeltoltes(email, req) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw publicError('A szerver most foglalt, próbáld újra.');
  try {
    var db = readAll();
    var user = activeUser(email, db.Felhasznalok);
    if (!TerepLogic.hasRole(user, 'iroda')) throw publicError('Nincs jogosultságod ehhez a művelethez.');
    var r = req.rajz || {};
    TerepLogic.checkId(r.rajz_id);
    var ex = TerepLogic.get(db, 'Rajzok', r.rajz_id);
    // Közös PDF-ű rajz cseréje: a forrás fájlja cserélődik (így mindegyik rajzon)
    if (ex && ex.forras) ex = TerepLogic.get(db, 'Rajzok', ex.forras);
    var projektId = ex ? ex.projekt_id : String(r.projekt_id || '');
    var proj = TerepLogic.get(db, 'Projektek', projektId);
    if (!proj || !TerepLogic.lathatja(user, projektId)) throw publicError('Ismeretlen projekt.');
    var bytes;
    try { bytes = Utilities.base64Decode(String(req.data || '')); } catch (x) { throw publicError('Hibás fájl.'); }
    if (bytes.length < 5 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) !== '%PDF-') throw publicError('Ez nem PDF fájl.');
    var nev = String(r.nev || (ex && ex.nev) || 'Rajz').trim().slice(0, 200);
    var verzio = ex ? (Number(ex.verzio) || 1) + 1 : 1;
    var now = new Date().toISOString();
    var pm = projektMappa(proj);
    var file = pm.createFile(Utilities.newBlob(bytes, 'application/pdf', proj.nev + ' – ' + nev + ' (v' + verzio + ').pdf'));
    if (ex && ex.drive_id) {
      // A régi fájl a projekt „Régi verziók” almappájába kerül (így egy hibás csere visszakereshető)
      try {
        var old = DriveApp.getFileById(ex.drive_id);
        old.setName(old.getName().replace(/\.pdf$/i, '') + ' (régi v' + (verzio - 1) + ').pdf');
        old.moveTo(regiMappa(pm));
      } catch (x) { /* a régi fájl már nincs meg */ }
    }
    var num = function (v) { var n = Number(v); return isFinite(n) && n > 0 ? n : 0; };
    var fajlnev = String(r.fajlnev || '').trim().slice(0, 200); // a feltöltött fájl eredeti neve
    var row = ex
      ? { rajz_id: ex.rajz_id, W: num(r.W), H: num(r.H), verzio: verzio, meret: bytes.length, drive_id: file.getId(), csere: now, modositva: now,
          fajlnev: fajlnev || ex.fajlnev || '' }
      : { rajz_id: r.rajz_id, projekt_id: projektId, nev: nev, epulet: String(r.epulet || '').trim().slice(0, 50), szint: String(r.szint || '').trim().slice(0, 50),
          homlokzat: String(r.homlokzat || '').trim().slice(0, 50), fajlnev: fajlnev, W: num(r.W), H: num(r.H), verzio: 1, meret: bytes.length, drive_id: file.getId(), felveve: now, csere: '', modositva: now };
    var changes = [];
    if (ex) { for (var p in row) ex[p] = row[p]; changes.push({ table: 'Rajzok', row: ex }); }
    else { db.Rajzok.push(row); changes.push({ table: 'Rajzok', row: row }); }
    writeChanges(changes);
    SpreadsheetApp.flush();
    return { ok: true, rajz: TerepLogic.exportRows([ex || row])[0], version: dataVersion() };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== Fotók ===================== */
var MAX_FOTO_BYTES = 8 * 1024 * 1024; // egy fotó (a kliens kb. 1600 px-re kicsinyít, ez bőven elég)
/** A projekt mappáján belüli „Fotók” almappa (az előnézetek benne a „kicsi” almappában). */
function fotoMappa(projMappa, kicsi) {
  var it = projMappa.getFoldersByName('Fotók'), f = it.hasNext() ? it.next() : projMappa.createFolder('Fotók');
  if (!kicsi) return f;
  var k = f.getFoldersByName('kicsi');
  return k.hasNext() ? k.next() : f.createFolder('kicsi');
}
function jpegBlob(b64, nev) {
  var bytes;
  try { bytes = Utilities.base64Decode(String(b64 || '')); } catch (x) { throw publicError('Hibás kép.'); }
  if (bytes.length < 3 || (bytes[0] & 255) !== 0xFF || (bytes[1] & 255) !== 0xD8) throw publicError('A kép nem JPEG.');
  if (bytes.length > MAX_FOTO_BYTES) throw publicError('A kép túl nagy.');
  return Utilities.newBlob(bytes, 'image/jpeg', nev);
}
/** Fotó feltöltése egy (már a szerveren lévő) bejegyzéshez – a jogosultságot a TerepLogic.fotoSor ellenőrzi. Idempotens. */
function fotoFeltoltes(email, req) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw publicError('A szerver most foglalt, a feltöltés hamarosan újra próbálkozik.');
  try {
    var db = readAll();
    var user = activeUser(email, db.Felhasznalok);
    var now = new Date().toISOString();
    var row = TerepLogic.fotoSor(db, user, req.foto, now);
    if (!row) return { ok: true, foto: TerepLogic.exportRows([TerepLogic.get(db, 'Fotok', req.foto.foto_id)])[0], version: dataVersion() };
    var proj = TerepLogic.get(db, 'Projektek', row.projekt_id), poz = TerepLogic.get(db, 'Poziciok', row.poz_id) || {};
    var pm = projektMappa(proj);
    var nev = String(poz.jel || 'pozíció').replace(/[\\/]/g, '-') + ' – ' +
      Utilities.formatDate(new Date(row.mikor), 'Europe/Budapest', 'yyyy-MM-dd HH.mm') + ' – ' + row.ki_nev + ' (' + row.foto_id + ')';
    var nagy = jpegBlob(req.data, nev + '.jpg'), kis = jpegBlob(req.kicsi || req.data, nev + ' (kicsi).jpg');
    row.drive_id = fotoMappa(pm, false).createFile(nagy).getId();
    row.kis_id = fotoMappa(pm, true).createFile(kis).getId();
    row.meret = nagy.getBytes().length;
    writeChanges([{ table: 'Fotok', row: row }]);
    SpreadsheetApp.flush();
    return { ok: true, foto: TerepLogic.exportRows([row])[0], version: dataVersion() };
  } finally {
    lock.releaseLock();
  }
}
/** Egy fotó (vagy az előnézete), ha a felhasználó látja a projektet. */
function fotoLetoltes(email, req) {
  var user = activeUser(email, readTable('Felhasznalok'));
  var f = readTable('Fotok').filter(function (x) { return x.foto_id === String(req.foto_id || ''); })[0];
  if (!f || f.torolve || !TerepLogic.lathatja(user, f.projekt_id)) throw publicError('A fotó nem található.');
  var id = req.kicsi && f.kis_id ? f.kis_id : f.drive_id;
  try { return { ok: true, foto_id: f.foto_id, data: Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()) }; }
  catch (x) { console.error('Terep – fotó olvasási hiba: ' + x); throw publicError('A fotó fájlja nem olvasható.'); }
}

/** A törölt rajzok PDF-jei a kukába kerülnek (onnan 30 napig visszaállítható); törölt projektnél a projekt mappája is. */
function torolRajzFajlok(changes) {
  var props = PropertiesService.getScriptProperties();
  changes.forEach(function (c) {
    // Törölt (jelölt) fotó: a kép és az előnézete a kukába
    if (c.table === 'Fotok' && c.row.torolve) {
      [c.row.drive_id, c.row.kis_id].forEach(function (id) { if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (x) { /* */ } } });
    }
    if (!c.deleted) return;
    if (c.table === 'Rajzok' && c.row.drive_id) {
      try { DriveApp.getFileById(c.row.drive_id).setTrashed(true); } catch (x) { /* már nincs meg */ }
    }
    if (c.table === 'Projektek') {
      var id = props.getProperty('MAPPA_' + c.row.projekt_id);
      if (id) { try { DriveApp.getFolderById(id).setTrashed(true); } catch (x) { /* */ } props.deleteProperty('MAPPA_' + c.row.projekt_id); }
    }
  });
}

/* ===================== Sheet olvasás / írás (a Raktárból) ===================== */
/** A tábla munkalapja; ha még nincs (pl. egy új verzió új lapja), fejléccel létrehozza – így a telepítés után sem áll le semmi. */
function sheetOf(table) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(table);
  if (!sh) {
    if (!TerepLogic.SCHEMA[table]) throw publicError('Hiányzó munkalap: ' + table + '.');
    sh = ss.insertSheet(table);
    var cols = TerepLogic.SCHEMA[table].cols.map(function (c) { return c[0]; });
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#e8eef5');
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Menüből: az adatbázis átalakítása a v2 modellre (ATALAKITAS_V2.md) – pozíció = hely, elemek, termékfajták.
 * Előtte készíts másolatot a táblázatról (Fájl → Másolat készítése). Többször is futtatható (a kész részeket kihagyja).
 */
function atalakitasV2() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (x) { /* szkriptszerkesztőből */ }
  if (ui && ui.alert('Adatbázis átalakítása (v2)', 'Készítettél másolatot a táblázatról (Fájl → Másolat készítése)? Az átalakítás minden pozícióból ' +
    'helyet és elemet készít; adat nem vész el, és többször is futtatható. Folytatod?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) throw new Error('A szerver most foglalt, próbáld újra.');
  try {
    var db = readAll();
    var r = TerepLogic.atalakitV2(db, new Date().toISOString());
    writeChanges(r.changes);
    SpreadsheetApp.flush();
    var s = r.stat;
    var msg = 'Kész. Új termékfajta: ' + s.kategoria + ', fajtát kapott lépés: ' + s.lepes + ', típus: ' + s.tipus +
      ', új elem: ' + s.elem + ', elemhez kötött bejegyzés: ' + s.esemeny + ', kitöltött helyiség: ' + s.helyiseg + '.';
    if (ui) ui.alert(msg); else console.log(msg);
  } finally {
    lock.releaseLock();
  }
}

function readAll() {
  var db = {};
  TerepLogic.TABLES.forEach(function (t) { db[t] = readTable(t); });
  return db;
}

/** A fejléc nevei alapján olvas, így a kézzel átrendezett / bővített oszlopok sem zavarnak. */
function readTable(table) {
  var sh = sheetOf(table);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0].map(function (h) { return String(h).trim(); });
  var key = TerepLogic.SCHEMA[table].key;
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var raw = {};
    header.forEach(function (h, c) { if (h) raw[h] = values[i][c]; });
    var r = TerepLogic.normalize(table, raw);
    if (!r[key]) continue;
    // Az írásnál a képlet-védelemhez tett vezető aposztrófot (ha a cellában bent maradt) levesszük
    TerepLogic.SCHEMA[table].cols.forEach(function (c) {
      if ((c[1] === 'str' || c[1] === 'long') && /^'[=+\-@]/.test(r[c[0]])) r[c[0]] = r[c[0]].slice(1);
    });
    r._row = i + 1;
    rows.push(r);
  }
  return rows;
}

function toCell(type, v) {
  if (type === 'date') return v ? new Date(v) : '';
  if (type === 'bool') return !!v;
  if (type === 'num') return (v === '' || v == null) ? '' : Number(v);
  var s = v == null ? '' : String(v);
  // Képlet-befecskendezés ellen: „=”, „+”, „-”, „@” kezdetű szöveg ne fusson le képletként a Sheetben
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

/** Az utolsó sor, amelyben a kulcsoszlop ki van töltve; 1, ha csak fejléc van. */
function lastDataRow(sh, header, table) {
  var keyCol = header.indexOf(TerepLogic.SCHEMA[table].key) + 1;
  var last = sh.getLastRow();
  if (keyCol < 1 || last < 2) return 1;
  var vals = sh.getRange(2, keyCol, last - 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]).trim() !== '') return i + 2;
  return 1;
}

/** A munkalap fejléce; ha egy újabb verzióban bevezetett oszlop még hiányzik, a végére felveszi. */
function ensureColumns(sh, table) {
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = TerepLogic.SCHEMA[table].cols.map(function (c) { return c[0]; }).filter(function (n) { return header.indexOf(n) < 0; });
  if (missing.length) {
    sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#e8eef5');
    header = header.concat(missing);
  }
  return header;
}

function writeChanges(changes) {
  var byTable = {};
  changes.forEach(function (c) {
    var key = c.row[TerepLogic.SCHEMA[c.table].key];
    var t = byTable[c.table] = byTable[c.table] || { order: [], map: {} };
    if (!t.map[key]) t.order.push(key);
    t.map[key] = c; // a rekord objektum maga a végső állapot
  });
  Object.keys(byTable).forEach(function (table) {
    var sh = sheetOf(table);
    var header = ensureColumns(sh, table);
    var types = {};
    TerepLogic.SCHEMA[table].cols.forEach(function (c) { types[c[0]] = c[1]; });
    var inserts = [], deletes = [], updates = [];
    byTable[table].order.forEach(function (key) {
      var c = byTable[table].map[key];
      if (c.deleted) { if (c.row._row) deletes.push(c.row._row); return; }
      if (c.row._row) updates.push(c.row);
      else inserts.push(header.map(function (h) { return types[h] ? toCell(types[h], c.row[h]) : ''; }));
    });
    if (updates.length) {
      // Módosítások tömbösen: az egymás melletti sorok egy írással, és csak a séma oszlopaiba
      var segs = [];
      header.forEach(function (h, i) {
        if (!types[h]) return;
        var last = segs[segs.length - 1];
        if (last && last[0] + last[1] === i) last[1]++; else segs.push([i, 1]);
      });
      updates.sort(function (a, b) { return a._row - b._row; });
      var run = [];
      var flush = function () {
        if (!run.length) return;
        segs.forEach(function (seg) {
          sh.getRange(run[0]._row, seg[0] + 1, run.length, seg[1]).setValues(run.map(function (r) {
            return header.slice(seg[0], seg[0] + seg[1]).map(function (h) { return toCell(types[h], r[h]); });
          }));
        });
        run = [];
      };
      updates.forEach(function (r) {
        if (run.length && r._row !== run[run.length - 1]._row + 1) flush();
        run.push(r);
      });
      flush();
    }
    if (inserts.length) {
      var start = lastDataRow(sh, header, table) + 1;
      var need = start + inserts.length - 1 - sh.getMaxRows();
      if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
      sh.getRange(start, 1, inserts.length, header.length).setValues(inserts);
      // A beszúrt sorok a sorszámukat is megkapják (egy kérésen belüli további módosításhoz)
      var k = 0;
      byTable[table].order.forEach(function (key) {
        var c = byTable[table].map[key];
        if (!c.deleted && !c.row._row) c.row._row = start + k++;
      });
    }
    // Törlés alulról felfelé, az egymás melletti sorok egyben
    deletes.sort(function (a, b) { return b - a; });
    for (var i = 0; i < deletes.length;) {
      var j = i;
      while (j + 1 < deletes.length && deletes[j + 1] === deletes[j] - 1) j++;
      sh.deleteRows(deletes[j], i === j ? 1 : j - i + 1);
      i = j + 1;
    }
  });
  if (changes.length) bumpVersion();
}

/* ===================== Telepítés ===================== */
var HEADER_NOTES = {
  Felhasznalok: 'szerepkor: admin | iroda | szerelo | kulsos. projektek: vesszővel elválasztott projekt-azonosítók (üres = minden projekt; külsősnél üres = egyik sem).',
  Poziciok: 'Pozíció = HELY (a jelölő a rajzon). fajta: pozicio | felmeres | hiba. Lerakva, ha a rajz_id ki van töltve (x, y: 0–1 arány a rajzlapon). adatok: a hely adatai (JSON). A tipus / szel / mag a v1 adatból maradt (az Elemek lapon vannak).',
  Elemek: 'Ami a helyre kerül: termékfajta (Kategoriak), típus, méret, darab. Az állapot (lépések) elemenként.',
  Kategoriak: 'Termékfajták (cégszintű). lepesek: alap műveletsor (JSON), oszlopok: az elemek adatoszlopai, vezerlo: vezérlő eszköz.',
  Esemenyek: 'Eseménynapló (az elemek állapota ebből számolódik – ne töröld, ne írd át). mikor: a terepen, rogzitve: a szerveren. elem_id: üres = az egész helyre vonatkozik.',
  Kapcsolatok: 'Elem ↔ elem: kozos (közös elem, pl. védőtető) | vezerli (vezérlő csatornája → árnyékoló). allapot: tervezett | betanitva | ellenorizve.'
};

function setup() {
  var ss = SpreadsheetApp.getActive();
  TerepLogic.TABLES.forEach(function (table) {
    var sh = ss.getSheetByName(table) || ss.insertSheet(table);
    var cols = TerepLogic.SCHEMA[table].cols;
    if (sh.getLastColumn() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols.map(function (c) { return c[0]; })]);
    } else {
      var existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      cols.forEach(function (c) { if (existing.indexOf(c[0]) < 0) sh.getRange(1, sh.getLastColumn() + 1).setValue(c[0]); });
    }
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#e8eef5');
    if (HEADER_NOTES[table]) sh.getRange(1, 1).setNote(HEADER_NOTES[table]);
    var maxRows = Math.max(sh.getMaxRows() - 1, 1);
    cols.forEach(function (c) {
      var rng = sh.getRange(2, header.indexOf(c[0]) + 1, maxRows, 1);
      if (c[1] === 'str' || c[1] === 'long') rng.setNumberFormat('@');
      if (c[1] === 'date') rng.setNumberFormat('yyyy.mm.dd hh:mm');
      if (c[1] === 'bool') rng.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    });
    if (table === 'Felhasznalok') {
      sh.getRange(2, header.indexOf('szerepkor') + 1, maxRows, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(TerepLogic.ROLES), true).build());
    }
    if (table === 'Poziciok') {
      sh.getRange(2, header.indexOf('fajta') + 1, maxRows, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(TerepLogic.FAJTAK), true).build());
    }
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Munkalap1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  bumpVersion();

  // Első admin: a script tulajdonosa
  var me = Session.getEffectiveUser().getEmail().toLowerCase();
  if (me && !findUser(me)) {
    writeChanges([{ table: 'Felhasznalok', row: { email: me, nev: 'Admin', szerepkor: 'admin', aktiv: true, projektek: '', megjegyzes: 'Telepítéskor létrehozva' } }]);
  }
  secret();
  rajzMappa();
  try { SpreadsheetApp.getUi().alert('Kész. A táblák és a rajzok mappája („' + RAJZ_MAPPA_NEV + '”) rendben vannak.'); }
  catch (x) { /* a szkriptszerkesztőből futtatva nincs felugró ablak */ }
}
