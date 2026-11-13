/*
 * Terep – közös üzleti logika (a Raktár Logic.gs mintájára).
 * Tiszta JavaScript (nincs benne Apps Script hívás): fut a Google Apps Scriptben, és böngészőben is (teszt, később a
 * kliens ellenőrzése / demo mód). Ha a web/js/logic.js-be is bekerül, a két fájl tartalma legyen azonos.
 *
 * Adatmodell (Sheet-lapok): Felhasznalok, Projektek, Lepesek, Rajzok, Poziciok, Tipusok, Esemenyek.
 * EGY POZÍCIÓ = EGY SOR: listaadatok + (ha le van rakva) rajz_id, x, y. fajta: pozicio | felmeres | hiba.
 */
var TerepLogic = (function () {
  'use strict';

  /* ---------- Szerepkörök és hozzáférés ---------- */
  // admin: minden + felhasználók · iroda: projektek, rajzok, pozíciók, típusok, műveletsor · szerelő: lépések, hiba,
  // megjegyzés, terepi felmérés / hibajelölés · külsős: mint a szerelő, de csak a hozzárendelt projektek
  var ROLES = { kulsos: 1, szerelo: 2, iroda: 3, admin: 4 };
  var ROLE_LABELS = { admin: 'Admin', iroda: 'Iroda', szerelo: 'Szerelő', kulsos: 'Külsős' };
  var FAJTAK = { pozicio: 'Pozíció', felmeres: 'Felmérés', hiba: 'Hibajelzés' };
  var ESEMENY_TIPUSOK = { kesz: 1, visszavon: 1, hiba: 1, hiba_vege: 1, megj: 1 };
  var PROJEKT_ALLAPOT = { aktiv: 'Aktív', lezart: 'Lezárt' };
  var SZERELO_VISSZAVON_ORA = 24; // a szerelő a saját lépését ennyi órán belül vonhatja vissza (iroda / admin bármikor)
  var VISSZA_NAP = 31;            // a szerelő / külsős bejegyzése legfeljebb ennyi nappal korábbi időpontú lehet (offline rögzítés)

  // Új lapnál ez az oszlopsorrend; a szerver a fejlécnevek alapján olvas és ír, így az oszlopok átrendezhetők.
  // Típusok: str (szöveg, max 2000), long (pl. JSON, max 40000), num, bool, date (ISO).
  var SCHEMA = {
    Felhasznalok: { key: 'email', cols: [
      // projektek: vesszővel elválasztott projekt-azonosítók; üres = minden projekt (külsősnél: egyik sem)
      ['email', 'str'], ['nev', 'str'], ['szerepkor', 'str'], ['aktiv', 'bool'], ['projektek', 'str'], ['megjegyzes', 'str']] },
    Projektek: { key: 'projekt_id', cols: [
      // oszlopok / tipus_oszlopok: a pozíciók további adatainak és a típusok tulajdonságainak oszlopnevei (JSON tömb)
      ['projekt_id', 'str'], ['nev', 'str'], ['ugyfel', 'str'], ['helyszin', 'str'], ['allapot', 'str'],
      ['oszlopok', 'long'], ['tipus_oszlopok', 'long'], ['letrehozva', 'date'], ['modositva', 'date']] },
    // suly: a lépés súlya a készültségben (arányszám, pl. 60 / 30 / 10); ha a projekt minden lépésénél 0, egyenlő arányban számít
    Lepesek: { key: 'lepes_id', cols: [
      ['lepes_id', 'str'], ['projekt_id', 'str'], ['sorrend', 'num'], ['nev', 'str'], ['szin', 'str'], ['suly', 'num']] },
    Rajzok: { key: 'rajz_id', cols: [
      // W, H: az oldal mérete pontban (rajzcserénél az összevetéshez); drive_id: a PDF a Drive-on (nem nyilvános)
      ['rajz_id', 'str'], ['projekt_id', 'str'], ['nev', 'str'], ['epulet', 'str'], ['szint', 'str'],
      ['W', 'num'], ['H', 'num'], ['verzio', 'num'], ['meret', 'num'], ['drive_id', 'str'],
      ['felveve', 'date'], ['csere', 'date'], ['modositva', 'date']] },
    Poziciok: { key: 'poz_id', cols: [
      ['poz_id', 'str'], ['projekt_id', 'str'], ['fajta', 'str'], ['jel', 'str'], ['tipus', 'str'], ['szel', 'str'], ['mag', 'str'],
      ['epulet', 'str'], ['szint', 'str'], ['adatok', 'long'], ['rajz_id', 'str'], ['x', 'num'], ['y', 'num'],
      ['letrehozva', 'date'], ['letrehozta', 'str'], ['modositva', 'date'], ['torolve', 'date']] },
    Tipusok: { key: 'tipus_id', cols: [
      ['tipus_id', 'str'], ['projekt_id', 'str'], ['jel', 'str'], ['szel', 'str'], ['mag', 'str'], ['adatok', 'long'], ['modositva', 'date']] },
    // mikor: amikor a terepen történt (a készülék ideje); rogzitve: amikor a szerver megkapta
    Esemenyek: { key: 'esemeny_id', cols: [
      ['esemeny_id', 'str'], ['poz_id', 'str'], ['projekt_id', 'str'], ['tipus', 'str'], ['lepes_id', 'str'],
      ['ki', 'str'], ['ki_nev', 'str'], ['mikor', 'date'], ['rogzitve', 'date'], ['megj', 'str']] },
    // Fotók a bejegyzésekhez (hiba, megjegyzés, lépés): a kép a Drive-on (drive_id: ~1600 px, kis_id: előnézet ~320 px)
    Fotok: { key: 'foto_id', cols: [
      ['foto_id', 'str'], ['esemeny_id', 'str'], ['poz_id', 'str'], ['projekt_id', 'str'], ['drive_id', 'str'], ['kis_id', 'str'],
      ['ki', 'str'], ['ki_nev', 'str'], ['mikor', 'date'], ['rogzitve', 'date'], ['meret', 'num'], ['torolve', 'date']] }
  };
  var MAX_FOTO_ESEMENYENKENT = 5;
  var TABLES = Object.keys(SCHEMA);

  /* ---------- Típuskonverzió ---------- */
  function toBool(v) {
    if (v === true || v === false) return v;
    if (typeof v === 'number') return v !== 0;
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return s === 'true' || s === 'igen' || s === 'i' || s === '1' || s === 'x' || s === 'yes' || s === 'igaz';
  }
  function toNum(v) {
    if (v === '' || v == null) return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  function toDate(v) {
    if (v === '' || v == null) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : v.toISOString();
    var d = new Date(v);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  function normalize(table, row) {
    var out = {};
    row = row || {};
    SCHEMA[table].cols.forEach(function (c) {
      var name = c[0], v = row[name];
      if (c[1] === 'num') out[name] = toNum(v);
      else if (c[1] === 'bool') out[name] = (name === 'aktiv' && (v === '' || v == null)) ? true : toBool(v);
      else if (c[1] === 'date') out[name] = toDate(v);
      else if (c[1] === 'long') out[name] = v == null ? '' : String(v).trim().slice(0, 40000);
      else out[name] = v == null ? '' : String(v).trim().slice(0, 2000); // hosszkorlát (cella-visszaélés ellen)
    });
    if (table === 'Felhasznalok') out.email = out.email.toLowerCase();
    return out;
  }
  /** JSON-mező (adatok, oszlopok) biztonságos olvasása. */
  function jsonOf(s, def) { try { var v = JSON.parse(s || ''); return v && typeof v === 'object' ? v : def; } catch (e) { return def; } }

  /* ---------- Memóriabeli adatbázis segédek (a Raktárból) ---------- */
  function index(db, table) {
    db._idx = db._idx || {};
    if (!db._idx[table]) {
      var m = {}, k = SCHEMA[table].key;
      (db[table] || []).forEach(function (r) { m[r[k]] = r; });
      db._idx[table] = m;
    }
    return db._idx[table];
  }
  function get(db, table, id) { return own(index(db, table), id) ? index(db, table)[id] : undefined; }
  function put(db, table, row, changes) {
    var k = SCHEMA[table].key, idx = index(db, table), ex = own(idx, row[k]) ? idx[row[k]] : null;
    if (ex) {
      for (var p in row) if (p !== '_row') ex[p] = row[p];
      changes.push({ table: table, row: ex });
      return ex;
    }
    db[table] = db[table] || [];
    db[table].push(row);
    idx[row[k]] = row;
    changes.push({ table: table, row: row });
    return row;
  }
  function remove(db, table, id, changes) {
    var idx = index(db, table), ex = own(idx, id) ? idx[id] : null;
    if (!ex) return;
    db[table] = db[table].filter(function (r) { return r !== ex; });
    delete idx[id];
    changes.push({ table: table, row: ex, deleted: true });
  }
  function exportRows(rows) {
    return (rows || []).map(function (r) { var o = {}; for (var p in r) if (p !== '_row') o[p] = r[p]; return o; });
  }

  /* ---------- Jogosultság ---------- */
  function fail(msg) { var e = new Error(msg); e.validation = true; throw e; }
  function own(obj, key) { return typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key); }
  function hasRole(user, role) { return !!user && own(ROLES, user.szerepkor) && ROLES[user.szerepkor] >= ROLES[role]; }
  function need(user, role) { if (!hasRole(user, role)) fail('Nincs jogosultságod ehhez a művelethez.'); }
  /** A felhasználó hozzárendelt projektjei (tömb), vagy null = mind. Külsősnél üres lista = egyik sem. */
  function projektLista(user) {
    var l = String(user && user.projektek || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (l.length) return l;
    return user && user.szerepkor === 'kulsos' ? [] : null;
  }
  /** Láthatja-e a felhasználó a projektet (a szerver csak ezek adatait adja ki). */
  function lathatja(user, projektId) {
    if (!user) return false;
    if (hasRole(user, 'admin')) return true;
    var l = projektLista(user);
    return l === null || l.indexOf(projektId) >= 0;
  }
  function needProjekt(db, user, projektId) {
    if (!get(db, 'Projektek', projektId)) fail('Ismeretlen projekt.');
    if (!lathatja(user, projektId)) fail('Ehhez a projekthez nincs hozzáférésed.');
  }

  /* ---------- Bemenet-korlátok ---------- */
  var MAX_ROWS = 5000;
  /** Új rekord azonosítója: csak betű, szám, pont, kötőjel, aláhúzás (képlet, HTML, szóköz nem lehet benne). */
  function checkId(id) { if (!/^[\w.\-]{1,60}$/.test(String(id))) fail('Érvénytelen azonosító.'); }
  function rowsOf(list, emptyMsg) {
    if (!Array.isArray(list) || !list.length) fail(emptyMsg);
    if (list.length > MAX_ROWS) fail('Túl sok sor egy műveletben (legfeljebb ' + MAX_ROWS + ').');
    list.forEach(function (r) { if (!r || typeof r !== 'object') fail('Hibás sor a műveletben.'); });
    return list;
  }
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 2000); }
  /** Adatok (oszlopnév → érték) tisztítása: csak szövegek, korlátozott méretben. */
  function tisztaAdatok(a) {
    var out = {}, n = 0;
    if (!a || typeof a !== 'object' || Array.isArray(a)) return out;
    Object.keys(a).forEach(function (k) {
      if (n >= 100) return;
      var kk = str(k, 100), v = str(a[k], 2000);
      if (kk && v) { out[kk] = v; n++; }
    });
    return out;
  }
  function nevLista(l) { return Array.isArray(l) ? l.map(function (s) { return str(s, 100); }).filter(Boolean).slice(0, 100) : []; }

  /* ---------- Adat a felhasználónak ---------- */
  /**
   * A felhasználónak elküldhető adat. Mindig: a látható projektek listája (projekt-összesítéshez a lépésekkel).
   * projektId esetén a projekt teljes adata (rajzok, pozíciók, típusok, események). Amihez nincs joga, az el sem jut a készülékre.
   */
  function snapshot(db, user, projektId) {
    var proj = (db.Projektek || []).filter(function (p) { return lathatja(user, p.projekt_id); });
    var ids = {};
    proj.forEach(function (p) { ids[p.projekt_id] = 1; });
    var out = {
      Projektek: exportRows(proj),
      Lepesek: exportRows((db.Lepesek || []).filter(function (l) { return ids[l.projekt_id]; })),
      // Felhasználók: csak az admin kapja a teljes listát (felhasználókezelés); másnak csak a saját sora jut le – a nevek a
      // bejegyzésekben (ki_nev) vannak, így a teljes névsor / e-mail-lista (pl. egy külsős cégnek) felesleges lenne
      Felhasznalok: hasRole(user, 'admin') ? exportRows(db.Felhasznalok || [])
        : (db.Felhasznalok || []).filter(function (u) { return u.email === user.email; }).map(function (u) { return { email: u.email, nev: u.nev }; })
    };
    if (projektId && ids[projektId]) {
      var mine = function (r) { return r.projekt_id === projektId; };
      out.projekt_id = projektId;
      out.Rajzok = exportRows((db.Rajzok || []).filter(mine));
      out.Poziciok = exportRows((db.Poziciok || []).filter(function (p) { return mine(p) && !p.torolve; }));
      out.Tipusok = exportRows((db.Tipusok || []).filter(mine));
      out.Esemenyek = exportRows((db.Esemenyek || []).filter(mine));
      out.Fotok = exportRows((db.Fotok || []).filter(function (f) { return mine(f) && !f.torolve; }));
    }
    return out;
  }

  /* ---------- Műveletek ---------- */
  /**
   * Egy művelet alkalmazása. Előbb mindent ellenőriz, csak utána módosít. Idempotens: ugyanaz a művelet (azonos
   * azonosítókkal) újraküldve nem okoz duplikációt. Visszatér a módosított rekordokkal ({table, row, deleted?}).
   */
  function applyOp(db, op, user, nowIso) {
    var changes = [];
    nowIso = nowIso || new Date().toISOString();
    switch (op && op.type) {
      case 'projekt_mentes': opProjekt(db, op, user, nowIso, changes); break;
      case 'projekt_torles': opProjektTorles(db, op, user, changes); break;
      case 'lepesek_mentes': opLepesek(db, op, user, changes); break;
      case 'rajz_mentes': opRajz(db, op, user, nowIso, changes); break;
      case 'rajz_torles': opRajzTorles(db, op, user, nowIso, changes); break;
      case 'poz_mentes': opPozMentes(db, op, user, nowIso, changes); break;
      case 'poz_lerakas': opPozLerakas(db, op, user, nowIso, changes); break;
      case 'poz_torles': opPozTorles(db, op, user, nowIso, changes); break;
      case 'tipus_mentes': opTipusMentes(db, op, user, nowIso, changes); break;
      case 'tipus_torles': opTipusTorles(db, op, user, changes); break;
      case 'esemeny': opEsemeny(db, op, user, nowIso, changes); break;
      case 'esemenyek': opEsemenyek(db, op, user, nowIso, changes); break;
      case 'felhasznalo_mentes': opFelhasznalo(db, op, user, changes); break;
      case 'foto_torles': opFotoTorles(db, op, user, nowIso, changes); break;
      default: fail('Ismeretlen művelet.');
    }
    return changes;
  }

  /** Projekt létrehozása / módosítása (iroda). Új projektnél a műveletsor az op.lepesek-ből. */
  function opProjekt(db, op, user, now, changes) {
    need(user, 'iroda');
    var p = op.projekt || {};
    checkId(p.projekt_id);
    var ex = get(db, 'Projektek', p.projekt_id);
    if (ex && !lathatja(user, ex.projekt_id)) fail('Ehhez a projekthez nincs hozzáférésed.');
    var nev = str(p.nev, 200);
    if (!nev) fail('Add meg a projekt nevét.');
    put(db, 'Projektek', { projekt_id: p.projekt_id, nev: nev, ugyfel: str(p.ugyfel, 200), helyszin: str(p.helyszin, 300),
      allapot: own(PROJEKT_ALLAPOT, p.allapot) ? p.allapot : 'aktiv',
      oszlopok: JSON.stringify(nevLista(p.oszlopok !== undefined ? p.oszlopok : jsonOf(ex && ex.oszlopok, []))),
      tipus_oszlopok: JSON.stringify(nevLista(p.tipus_oszlopok !== undefined ? p.tipus_oszlopok : jsonOf(ex && ex.tipus_oszlopok, []))),
      letrehozva: ex ? ex.letrehozva : now, modositva: now }, changes);
    if (!ex && Array.isArray(op.lepesek)) opLepesek(db, { projekt_id: p.projekt_id, lepesek: op.lepesek }, user, changes);
  }
  /** Projekt törlése mindenével (admin). A Drive-fájlokat a szerver külön kezeli (changes alapján). */
  function opProjektTorles(db, op, user, changes) {
    need(user, 'admin');
    var id = op.projekt_id;
    if (!get(db, 'Projektek', id)) return; // már törölve (idempotens)
    ['Lepesek', 'Rajzok', 'Poziciok', 'Tipusok', 'Esemenyek', 'Fotok'].forEach(function (t) {
      var k = SCHEMA[t].key;
      (db[t] || []).filter(function (r) { return r.projekt_id === id; }).map(function (r) { return r[k]; })
        .forEach(function (rid) { remove(db, t, rid, changes); });
    });
    remove(db, 'Projektek', id, changes);
  }
  /** A műveletsor teljes cseréje (iroda): a megadott sorrend; a kimaradt lépések törlődnek (a naplójuk megmarad). */
  function opLepesek(db, op, user, changes) {
    need(user, 'iroda');
    needProjekt(db, user, op.projekt_id);
    var list = rowsOf(op.lepesek, 'Legalább egy lépés kell.');
    if (list.length > 30) fail('Túl sok lépés (legfeljebb 30).');
    var ids = {};
    list.forEach(function (l) {
      checkId(l.lepes_id);
      if (!str(l.nev)) fail('Minden lépésnek legyen neve.');
      if (ids[l.lepes_id]) fail('Ismétlődő lépés.');
      var ex = get(db, 'Lepesek', l.lepes_id);
      if (ex && ex.projekt_id !== op.projekt_id) fail('Érvénytelen lépés.');
      ids[l.lepes_id] = 1;
    });
    (db.Lepesek || []).filter(function (l) { return l.projekt_id === op.projekt_id && !ids[l.lepes_id]; })
      .map(function (l) { return l.lepes_id; }).forEach(function (id) { remove(db, 'Lepesek', id, changes); });
    list.forEach(function (l, i) {
      put(db, 'Lepesek', { lepes_id: l.lepes_id, projekt_id: op.projekt_id, sorrend: i + 1, nev: str(l.nev, 100),
        szin: /^#[0-9a-f]{6}$/i.test(String(l.szin)) ? l.szin : '#9aa1aa',
        suly: Math.round(Math.max(0, Math.min(1000, toNum(l.suly))) * 10) / 10 }, changes);
    });
  }
  /** Rajz adatai (iroda): név, épület, szint. (Új rajz és PDF-csere a szerver rajz_feltoltes műveletével.) */
  function opRajz(db, op, user, now, changes) {
    need(user, 'iroda');
    var r = op.rajz || {}, ex = get(db, 'Rajzok', r.rajz_id);
    if (!ex) fail('Ismeretlen rajz.');
    needProjekt(db, user, ex.projekt_id);
    var nev = str(r.nev, 200);
    if (!nev) fail('Add meg a rajz megnevezését.');
    put(db, 'Rajzok', { rajz_id: ex.rajz_id, nev: nev, epulet: str(r.epulet, 50), szint: str(r.szint, 50), modositva: now }, changes);
  }
  /** Rajz törlése (iroda): a pozíciók lekerülnek (megmaradnak), a felmérés / hibajelölés törlődik. */
  function opRajzTorles(db, op, user, now, changes) {
    need(user, 'iroda');
    var ex = get(db, 'Rajzok', op.rajz_id);
    if (!ex) return;
    needProjekt(db, user, ex.projekt_id);
    (db.Poziciok || []).filter(function (p) { return p.rajz_id === ex.rajz_id && !p.torolve; }).forEach(function (p) {
      if (p.fajta === 'pozicio') put(db, 'Poziciok', { poz_id: p.poz_id, rajz_id: '', x: 0, y: 0, modositva: now }, changes);
      else put(db, 'Poziciok', { poz_id: p.poz_id, torolve: now, modositva: now }, changes);
    });
    remove(db, 'Rajzok', ex.rajz_id, changes);
  }

  /** A jel egyedi-e a projekt (nem törölt, „pozíció” fajtájú) pozíciói között. */
  function jelFoglalt(db, projektId, jel, kiveve) {
    var k = String(jel).trim().toLowerCase();
    return (db.Poziciok || []).some(function (p) {
      return p.projekt_id === projektId && !p.torolve && p.fajta === 'pozicio' && p.poz_id !== kiveve && String(p.jel).trim().toLowerCase() === k;
    });
  }
  /** Terepi (szerelő / külsős) jelölés-e: felmérés vagy hibajelzés – ezeket a szerelő is létrehozhatja, módosíthatja. */
  function terepi(fajta) { return fajta === 'felmeres' || fajta === 'hiba'; }
  /** Meglévő terepi jelölést a szerelő / külsős csak a sajátját módosíthatja / helyezheti át (mint a törlésnél); az iroda bármelyiket. */
  function sajatTerepi(ex, user) {
    if (terepi(ex.fajta) && !hasRole(user, 'iroda') && String(ex.letrehozta).toLowerCase() !== String(user.email).toLowerCase()) {
      fail('Csak a saját jelölésedet módosíthatod.');
    }
  }

  /**
   * Pozíciók mentése (új vagy meglévő; op.rows: több sor egyben, pl. beillesztéskor). Csak a megadott mezők íródnak
   * (részleges frissítés – így két ember különböző mezőket módosíthat). Pozíció: iroda; felmérés / hibajelzés: szerelő is.
   */
  function opPozMentes(db, op, user, now, changes) {
    var rows = rowsOf(op.rows, 'Nincs mentendő pozíció.');
    var mezok = ['jel', 'tipus', 'szel', 'mag', 'epulet', 'szint'];
    var tervek = rows.map(function (r) {
      checkId(r.poz_id);
      var ex = get(db, 'Poziciok', r.poz_id);
      var projektId = ex ? ex.projekt_id : r.projekt_id;
      needProjekt(db, user, projektId);
      var fajta = ex ? ex.fajta : (own(FAJTAK, r.fajta) ? r.fajta : 'pozicio');
      need(user, terepi(fajta) ? 'kulsos' : 'iroda');
      if (ex) sajatTerepi(ex, user);
      if (ex && ex.torolve) fail('A pozíció már törölve.');
      var row = { poz_id: r.poz_id, modositva: now };
      mezok.forEach(function (m) { if (r[m] !== undefined) row[m] = str(r[m], m === 'jel' ? 60 : 200); });
      if (r.adatok !== undefined) row.adatok = JSON.stringify(tisztaAdatok(r.adatok));
      var jel = row.jel !== undefined ? row.jel : ex ? ex.jel : '';
      if (fajta === 'pozicio' && !jel) fail('Minden pozíciónak legyen jele.');
      if (!ex) {
        row.projekt_id = projektId; row.fajta = fajta; row.letrehozva = now; row.letrehozta = user.email;
        row.rajz_id = ''; row.x = 0; row.y = 0; row.torolve = '';
        mezok.forEach(function (m) { if (row[m] === undefined) row[m] = ''; });
        if (row.adatok === undefined) row.adatok = '{}';
      }
      return { row: row, fajta: fajta, projektId: projektId, jel: jel };
    });
    // Jel-egyediség (a meglévők és a művelet saját sorai között is)
    var latott = {};
    tervek.forEach(function (t) {
      if (t.fajta !== 'pozicio') return;
      var k = t.projektId + '|' + t.jel.toLowerCase();
      if (latott[k] || jelFoglalt(db, t.projektId, t.jel, t.row.poz_id)) fail('A(z) „' + t.jel + '” jel már szerepel.');
      latott[k] = 1;
    });
    tervek.forEach(function (t) { put(db, 'Poziciok', t.row, changes); });
  }
  /** Lerakás / áthelyezés / levétel (rajz_id üres = levétel). Pozíció: iroda; terepi jelölés: szerelő is. */
  function opPozLerakas(db, op, user, now, changes) {
    var ex = get(db, 'Poziciok', op.poz_id);
    if (!ex || ex.torolve) fail('Ismeretlen pozíció.');
    needProjekt(db, user, ex.projekt_id);
    need(user, terepi(ex.fajta) ? 'kulsos' : 'iroda');
    sajatTerepi(ex, user);
    if (op.rajz_id) {
      var r = get(db, 'Rajzok', op.rajz_id);
      if (!r || r.projekt_id !== ex.projekt_id) fail('Ismeretlen rajz.');
      var x = toNum(op.x), y = toNum(op.y);
      if (x < 0 || x > 1 || y < 0 || y > 1) fail('Érvénytelen hely a rajzon.');
      put(db, 'Poziciok', { poz_id: ex.poz_id, rajz_id: r.rajz_id, x: x, y: y, modositva: now }, changes);
    } else {
      put(db, 'Poziciok', { poz_id: ex.poz_id, rajz_id: '', x: 0, y: 0, modositva: now }, changes);
    }
  }
  /** Törlés jelöléssel (a napló megmarad). Pozíció: iroda; terepi jelölés: szerelő is (a sajátját). */
  function opPozTorles(db, op, user, now, changes) {
    var ex = get(db, 'Poziciok', op.poz_id);
    if (!ex || ex.torolve) return;
    needProjekt(db, user, ex.projekt_id);
    if (terepi(ex.fajta) && !hasRole(user, 'iroda')) {
      if (String(ex.letrehozta).toLowerCase() !== String(user.email).toLowerCase()) fail('Csak a saját jelölésedet törölheted.');
    } else need(user, 'iroda');
    put(db, 'Poziciok', { poz_id: ex.poz_id, torolve: now, modositva: now }, changes);
  }
  /** Típusok mentése (iroda; op.rows). Átnevezéskor a projekt pozícióinak „tipus” mezője követi. */
  function opTipusMentes(db, op, user, now, changes) {
    need(user, 'iroda');
    var rows = rowsOf(op.rows, 'Nincs mentendő típus.');
    rows.forEach(function (r) {
      checkId(r.tipus_id);
      var ex = get(db, 'Tipusok', r.tipus_id), projektId = ex ? ex.projekt_id : r.projekt_id;
      needProjekt(db, user, projektId);
      var jel = str(r.jel !== undefined ? r.jel : ex && ex.jel, 60);
      if (!jel) fail('Minden típusnak legyen jele.');
      var k = jel.toLowerCase();
      if ((db.Tipusok || []).some(function (t) { return t.projekt_id === projektId && t.tipus_id !== r.tipus_id && String(t.jel).toLowerCase() === k; })) {
        fail('A(z) „' + jel + '” típus már szerepel.');
      }
      if (ex && String(ex.jel).toLowerCase() !== k) {
        (db.Poziciok || []).filter(function (p) { return p.projekt_id === projektId && String(p.tipus).toLowerCase() === String(ex.jel).toLowerCase(); })
          .forEach(function (p) { put(db, 'Poziciok', { poz_id: p.poz_id, tipus: jel, modositva: now }, changes); });
      }
      var row = { tipus_id: r.tipus_id, projekt_id: projektId, jel: jel, modositva: now };
      if (r.szel !== undefined) row.szel = str(r.szel, 50);
      if (r.mag !== undefined) row.mag = str(r.mag, 50);
      if (r.adatok !== undefined) row.adatok = JSON.stringify(tisztaAdatok(r.adatok));
      if (!ex) { if (row.szel === undefined) row.szel = ''; if (row.mag === undefined) row.mag = ''; if (row.adatok === undefined) row.adatok = '{}'; }
      put(db, 'Tipusok', row, changes);
    });
  }
  function opTipusTorles(db, op, user, changes) {
    need(user, 'iroda');
    var ex = get(db, 'Tipusok', op.tipus_id);
    if (!ex) return;
    needProjekt(db, user, ex.projekt_id);
    remove(db, 'Tipusok', ex.tipus_id, changes);
  }

  /**
   * Esemény a pozíción (lépés kész / visszavonás / hiba / megjegyzés). Bárki, aki látja a projektet. Idempotens (esemeny_id).
   * Ki: a bejelentkezésből (nem hamisítható). mikor: a készülék ideje (offline rögzítéshez), de nem lehet a jövőben;
   * rogzitve: a szerver ideje. Visszavonás: a szerelő csak a saját, SZERELO_VISSZAVON_ORA-n belüli lépését; iroda bármikor.
   */
  function opEsemeny(db, op, user, now, changes) {
    var row = esemenySor(db, op.esemeny || {}, user, now, null);
    if (row) put(db, 'Esemenyek', row, changes);
  }
  /**
   * Több bejegyzés egyben (tömeges művelet, műveletsor-pótlás; op.esemenyek, legfeljebb MAX_ROWS). Mindent vagy semmit:
   * előbb minden bejegyzés ellenőrződik (a köteg korábbi elemeit is figyelembe véve), csak utána íródik.
   */
  function opEsemenyek(db, op, user, now, changes) {
    var list = rowsOf(op.esemenyek, 'Nincs rögzítendő bejegyzés.');
    var rows = [], uj = {};
    list.forEach(function (e) {
      var row;
      try { row = esemenySor(db, e, user, now, rows); }
      catch (x) {
        // Melyik pozíciónál akadt el (a felhasználónak szóló üzenetben)
        var p = x.validation && get(db, 'Poziciok', e.poz_id);
        if (p && p.jel) fail('„' + p.jel + '”: ' + x.message);
        throw x;
      }
      if (row && !uj[row.esemeny_id]) { uj[row.esemeny_id] = 1; rows.push(row); }
    });
    rows.forEach(function (r) { put(db, 'Esemenyek', r, changes); });
  }
  /**
   * Egy bejegyzés ellenőrzése → a beírandó sor, vagy null, ha már megvan (idempotens). koteg: a még be nem írt, ugyanabban
   * a műveletben korábbi sorok (a visszavonás-ellenőrzéshez).
   */
  function esemenySor(db, e, user, now, koteg) {
    checkId(e.esemeny_id);
    if (get(db, 'Esemenyek', e.esemeny_id)) return null; // már feldolgozva
    var p = get(db, 'Poziciok', e.poz_id);
    if (!p || p.torolve) fail('Ismeretlen pozíció (közben törölték).');
    needProjekt(db, user, p.projekt_id);
    need(user, 'kulsos');
    if (!own(ESEMENY_TIPUSOK, e.tipus)) fail('Ismeretlen bejegyzéstípus.');
    var lepes = '';
    if (e.tipus === 'kesz' || e.tipus === 'visszavon') {
      var l = get(db, 'Lepesek', e.lepes_id);
      if (!l || l.projekt_id !== p.projekt_id) fail('Ismeretlen lépés.');
      lepes = l.lepes_id;
    }
    var mikor = toDate(e.mikor), nowMs = Date.parse(now);
    if (!mikor || Date.parse(mikor) > nowMs + 10 * 60000) mikor = now;
    // Visszadátumozás: a szerelő / külsős legfeljebb VISSZA_NAP napra (offline munka) – egy már elszámolt időszakba ne
    // kerülhessen utólag bejegyzés; az iroda (pl. pótlás) bármikorra
    if (!hasRole(user, 'iroda') && Date.parse(mikor) < nowMs - VISSZA_NAP * 86400000) {
      fail('A bejegyzés időpontja legfeljebb ' + VISSZA_NAP + ' nappal korábbi lehet.');
    }
    if (e.tipus === 'visszavon' && !hasRole(user, 'iroda')) {
      var utolso = null;
      (db.Esemenyek || []).concat(koteg || []).forEach(function (x) { if (x.poz_id === p.poz_id && x.lepes_id === lepes && x.tipus === 'kesz') utolso = x; });
      if (!utolso || String(utolso.ki).toLowerCase() !== String(user.email).toLowerCase() ||
        nowMs - Date.parse(utolso.rogzitve || utolso.mikor) > SZERELO_VISSZAVON_ORA * 3600000) {
        fail('Ezt a lépést csak az iroda vonhatja vissza (a saját lépésedet ' + SZERELO_VISSZAVON_ORA + ' órán belül vonhatod vissza).');
      }
    }
    return { esemeny_id: e.esemeny_id, poz_id: p.poz_id, projekt_id: p.projekt_id, tipus: e.tipus, lepes_id: lepes,
      ki: user.email, ki_nev: user.nev || user.email, mikor: mikor, rogzitve: now, megj: str(e.megj, 1000) };
  }
  /**
   * Új fotó sora (a feltöltéskor a szerver hívja, mielőtt a képet a Drive-ra írja). A fotó egy bejegyzéshez tartozik, amelynek
   * már a szerveren kell lennie; csak a bejegyzés rögzítője (vagy az iroda) csatolhat hozzá, bejegyzésenként legfeljebb
   * MAX_FOTO_ESEMENYENKENT. Visszaad: a sor (drive_id nélkül), vagy null, ha ez a fotó már megvan (idempotens).
   */
  function fotoSor(db, user, f, now) {
    f = f || {};
    checkId(f.foto_id);
    if (get(db, 'Fotok', f.foto_id)) return null;
    var e = get(db, 'Esemenyek', f.esemeny_id);
    if (!e) fail('A bejegyzés még nincs a szerveren.');
    needProjekt(db, user, e.projekt_id);
    need(user, 'kulsos');
    if (String(e.ki).toLowerCase() !== String(user.email).toLowerCase() && !hasRole(user, 'iroda')) fail('Csak a saját bejegyzésedhez csatolhatsz fotót.');
    var n = (db.Fotok || []).filter(function (x) { return x.esemeny_id === e.esemeny_id && !x.torolve; }).length;
    if (n >= MAX_FOTO_ESEMENYENKENT) fail('Egy bejegyzéshez legfeljebb ' + MAX_FOTO_ESEMENYENKENT + ' fotó tartozhat.');
    var mikor = toDate(f.mikor);
    if (!mikor || Date.parse(mikor) > Date.parse(now) + 10 * 60000) mikor = now;
    return { foto_id: f.foto_id, esemeny_id: e.esemeny_id, poz_id: e.poz_id, projekt_id: e.projekt_id, drive_id: '', kis_id: '',
      ki: user.email, ki_nev: user.nev || user.email, mikor: mikor, rogzitve: now, meret: 0, torolve: '' };
  }
  /** Fotó törlése (jelöléssel; a szerver a Drive-fájlt a kukába teszi): a sajátját bárki, másét az iroda. */
  function opFotoTorles(db, op, user, now, changes) {
    var ex = get(db, 'Fotok', op.foto_id);
    if (!ex || ex.torolve) return;
    needProjekt(db, user, ex.projekt_id);
    if (String(ex.ki).toLowerCase() !== String(user.email).toLowerCase()) need(user, 'iroda');
    put(db, 'Fotok', { foto_id: ex.foto_id, torolve: now }, changes);
  }

  /** Felhasználó felvétele / módosítása (admin). A saját admin szerepét nem veheti el (kizárás ellen). */
  function opFelhasznalo(db, op, user, changes) {
    need(user, 'admin');
    var u = op.felhasznalo || {};
    var email = str(u.email, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Érvénytelen e-mail-cím.');
    if (!own(ROLES, u.szerepkor)) fail('Érvénytelen szerepkör.');
    if (email === String(user.email).toLowerCase() && (u.szerepkor !== 'admin' || u.aktiv === false)) fail('A saját admin jogodat nem veheted el.');
    put(db, 'Felhasznalok', { email: email, nev: str(u.nev, 100), szerepkor: u.szerepkor, aktiv: u.aktiv !== false,
      projektek: (Array.isArray(u.projektek) ? u.projektek : String(u.projektek || '').split(','))
        .map(function (s) { return String(s).trim(); }).filter(function (s) { return /^[\w.\-]{1,60}$/.test(s); }).join(','),
      megjegyzes: str(u.megjegyzes, 500) }, changes);
  }

  return {
    ROLES: ROLES, ROLE_LABELS: ROLE_LABELS, FAJTAK: FAJTAK, PROJEKT_ALLAPOT: PROJEKT_ALLAPOT, SCHEMA: SCHEMA, TABLES: TABLES,
    normalize: normalize, jsonOf: jsonOf, hasRole: hasRole, lathatja: lathatja, snapshot: snapshot, applyOp: applyOp,
    get: get, exportRows: exportRows, checkId: checkId, fotoSor: fotoSor, MAX_FOTO_ESEMENYENKENT: MAX_FOTO_ESEMENYENKENT
  };
})();
