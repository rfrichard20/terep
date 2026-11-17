/*
 * Terep – közös üzleti logika (a Raktár Logic.gs mintájára).
 * Tiszta JavaScript (nincs benne Apps Script hívás): fut a Google Apps Scriptben, és a böngészőben is (web/js/logic.js – a két
 * fájl tartalma azonos).
 *
 * Adatmodell v2 (ATALAKITAS_V2.md):
 *   Pozíció (Poziciok) = HELY: egy pont a rajzon (jel, épület, szint, helyiség, hely adatai, rajz_id + x, y).
 *   Elem (Elemek)      = ami a helyre kerül: termékfajta (Kategoriak), típus, méret, darab, adatok. Az állapot elemenként.
 *   Termékfajta        = cégszintű lista (Kategoriak) alap műveletsorral; a projekt műveletsora fajtánként (Lepesek.kategoria_id).
 *   Kapcsolat          = elem ↔ elem („közös” elem, „vezérli” – vezérlő csatornája → árnyékoló); Csatornak: a vezérlők csatornái.
 *   Pozíció fajtája (Poziciok.fajta): pozicio | felmeres | hiba (a terepi jelölések).
 */
var TerepLogic = (function () {
  'use strict';

  /* ---------- Szerepkörök és hozzáférés ---------- */
  // admin: minden + felhasználók + termékfajták · iroda: projektek, rajzok, pozíciók, elemek, típusok, műveletsor, kapcsolatok ·
  // szerelő: lépések, hiba, megjegyzés, fotó, terepi felmérés / hibajelölés · külsős: mint a szerelő, de csak a hozzárendelt projektek
  var ROLES = { kulsos: 1, szerelo: 2, iroda: 3, admin: 4 };
  var ROLE_LABELS = { admin: 'Admin', iroda: 'Iroda', szerelo: 'Szerelő', kulsos: 'Külsős' };
  var FAJTAK = { pozicio: 'Pozíció', felmeres: 'Felmérés', hiba: 'Hibajelzés' };
  var ESEMENY_TIPUSOK = { kesz: 1, visszavon: 1, hiba: 1, hiba_vege: 1, megj: 1 };
  var PROJEKT_ALLAPOT = { aktiv: 'Aktív', lezart: 'Lezárt' };
  var KAPCSOLAT_TIPUSOK = { kozos: 'Közös elem', vezerli: 'Vezérli' };
  var KAPCSOLAT_ALLAPOT = { tervezett: 'Tervezett', betanitva: 'Betanítva', ellenorizve: 'Ellenőrizve' };
  var SZERELO_VISSZAVON_ORA = 24; // a szerelő a saját lépését ennyi órán belül vonhatja vissza (iroda / admin bármikor)
  var VISSZA_NAP = 31;            // a szerelő / külsős bejegyzése legfeljebb ennyi nappal korábbi időpontú lehet (offline rögzítés)
  var MAX_FOTO_ESEMENYENKENT = 5;
  // Az átalakításkor (v2) és a régi alakú műveleteknél használt alap termékfajta
  var ALAP_KATEGORIA = 'k-arnyekolo';

  // Új lapnál ez az oszlopsorrend; a szerver a fejlécnevek alapján olvas és ír, így az oszlopok átrendezhetők.
  // Típusok: str (szöveg, max 2000), long (pl. JSON, max 40000), num, bool, date (ISO).
  var SCHEMA = {
    Felhasznalok: { key: 'email', cols: [
      // projektek: vesszővel elválasztott projekt-azonosítók; üres = minden projekt (külsősnél: egyik sem)
      ['email', 'str'], ['nev', 'str'], ['szerepkor', 'str'], ['aktiv', 'bool'], ['projektek', 'str'], ['megjegyzes', 'str']] },
    // Termékfajták (cégszintű): lepesek = alap műveletsor (JSON: [{nev, szin, suly}]); oszlopok = az elemek adatoszlopai (JSON);
    // vezerlo = vezérlő eszköz (távirányító, kapcsoló…) – csatornái lehetnek
    Kategoriak: { key: 'kategoria_id', cols: [
      ['kategoria_id', 'str'], ['nev', 'str'], ['sorrend', 'num'], ['szin', 'str'], ['lepesek', 'long'], ['oszlopok', 'long'],
      ['vezerlo', 'bool'], ['aktiv', 'bool'], ['modositva', 'date']] },
    Projektek: { key: 'projekt_id', cols: [
      // oszlopok: a pozíciók (helyek) adatoszlopai; elem_oszlopok: az elemek további adatoszlopai; tipus_oszlopok: a típusok tulajdonságai
      ['projekt_id', 'str'], ['nev', 'str'], ['ugyfel', 'str'], ['helyszin', 'str'], ['allapot', 'str'],
      ['oszlopok', 'long'], ['elem_oszlopok', 'long'], ['tipus_oszlopok', 'long'], ['letrehozva', 'date'], ['modositva', 'date']] },
    // A projekt műveletsora termékfajtánként. suly: a lépés súlya a készültségben (ha a fajta minden lépésénél 0: egyenlő arány)
    Lepesek: { key: 'lepes_id', cols: [
      ['lepes_id', 'str'], ['projekt_id', 'str'], ['kategoria_id', 'str'], ['sorrend', 'num'], ['nev', 'str'], ['szin', 'str'], ['suly', 'num']] },
    Rajzok: { key: 'rajz_id', cols: [
      // W, H: az oldal mérete pontban (rajzcserénél az összevetéshez); drive_id: a PDF a Drive-on (nem nyilvános)
      // homlokzat: homlokzati rajznál a homlokzat neve (pl. „Észak”) – lerakáskor az ilyen homlokzatú pozíciókat ajánlja
      // kivagas: „x0,y0,x1,y1” (oldalarány) – csak ez a rész látszik; forras: a PDF-et ennek a rajznak a fájljából veszi
      // (ugyanabból a PDF-ből több rajz, más-más kivágással – a fájl egyszer van meg; ilyenkor drive_id üres)
      ['rajz_id', 'str'], ['projekt_id', 'str'], ['nev', 'str'], ['epulet', 'str'], ['szint', 'str'], ['homlokzat', 'str'],
      // fajlnev: a feltöltött PDF eredeti fájlneve (a megnevezés szabadon átírható; csereként az új fájlé)
      ['kivagas', 'str'], ['forras', 'str'], ['fajlnev', 'str'], ['W', 'num'], ['H', 'num'], ['verzio', 'num'], ['meret', 'num'], ['drive_id', 'str'],
      ['felveve', 'date'], ['csere', 'date'], ['modositva', 'date']] },
    // Pozíció = hely. A tipus, szel, mag oszlop csak a v1 adatból maradt (az átalakítás az elemekbe teszi, utána üres).
    Poziciok: { key: 'poz_id', cols: [
      ['poz_id', 'str'], ['projekt_id', 'str'], ['fajta', 'str'], ['jel', 'str'], ['epulet', 'str'], ['szint', 'str'], ['helyiseg', 'str'],
      ['homlokzat', 'str'], ['adatok', 'long'], ['rajz_id', 'str'], ['x', 'num'], ['y', 'num'],
      ['letrehozva', 'date'], ['letrehozta', 'str'], ['modositva', 'date'], ['torolve', 'date'],
      ['tipus', 'str'], ['szel', 'str'], ['mag', 'str']] },
    Elemek: { key: 'elem_id', cols: [
      ['elem_id', 'str'], ['projekt_id', 'str'], ['poz_id', 'str'], ['kategoria_id', 'str'], ['tipus', 'str'], ['szel', 'str'], ['mag', 'str'],
      ['db', 'num'], ['adatok', 'long'], ['sorrend', 'num'], ['letrehozva', 'date'], ['letrehozta', 'str'], ['modositva', 'date'], ['torolve', 'date']] },
    Tipusok: { key: 'tipus_id', cols: [
      ['tipus_id', 'str'], ['projekt_id', 'str'], ['kategoria_id', 'str'], ['jel', 'str'], ['szel', 'str'], ['mag', 'str'], ['adatok', 'long'], ['modositva', 'date']] },
    // mikor: amikor a terepen történt (a készülék ideje); rogzitve: amikor a szerver megkapta. elem_id: a lépés mindig elemhez tartozik,
    // a hiba / megjegyzés az elemhez vagy (üres elem_id) az egész helyhez
    Esemenyek: { key: 'esemeny_id', cols: [
      ['esemeny_id', 'str'], ['poz_id', 'str'], ['elem_id', 'str'], ['projekt_id', 'str'], ['tipus', 'str'], ['lepes_id', 'str'],
      ['ki', 'str'], ['ki_nev', 'str'], ['mikor', 'date'], ['rogzitve', 'date'], ['megj', 'str']] },
    // Fotók a bejegyzésekhez: a kép a Drive-on (drive_id: ~1600 px, kis_id: előnézet ~360 px)
    Fotok: { key: 'foto_id', cols: [
      ['foto_id', 'str'], ['esemeny_id', 'str'], ['poz_id', 'str'], ['projekt_id', 'str'], ['drive_id', 'str'], ['kis_id', 'str'],
      ['ki', 'str'], ['ki_nev', 'str'], ['mikor', 'date'], ['rogzitve', 'date'], ['meret', 'num'], ['torolve', 'date']] },
    // Elem ↔ elem kapcsolat. vezerli: forras = vezérlő elem (csatorna_id: melyik csatornája), cel = a vezérelt elem;
    // kozos: két elem közös eleme (pl. forras = védőtető, cel = zsalúzia). allapot: tervezett → betanítva → ellenőrizve
    Kapcsolatok: { key: 'kapcsolat_id', cols: [
      ['kapcsolat_id', 'str'], ['projekt_id', 'str'], ['tipus', 'str'], ['forras_elem', 'str'], ['csatorna_id', 'str'], ['cel_elem', 'str'],
      ['allapot', 'str'], ['megj', 'str'], ['letrehozta', 'str'], ['modositva', 'date'], ['torolve', 'date']] },
    Csatornak: { key: 'csatorna_id', cols: [
      ['csatorna_id', 'str'], ['projekt_id', 'str'], ['elem_id', 'str'], ['sorszam', 'num'], ['nev', 'str'], ['modositva', 'date'], ['torolve', 'date']] }
  };
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
    if (table === 'Elemek' && !(out.db > 0)) out.db = 1;
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
  function sajat(ex, user, mezo) { return String(ex[mezo || 'letrehozta']).toLowerCase() === String(user.email).toLowerCase(); }

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
  function szin(v, def) { return /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : def; }
  function suly(v) { return Math.round(Math.max(0, Math.min(1000, toNum(v))) * 10) / 10; }
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

  /* ---------- Termékfajták, elemek – segédek ---------- */
  /** Az alap termékfajta (a régi alakú műveletekhez): az „Árnyékoló”, különben az első aktív nem vezérlő fajta. */
  function alapKategoria(db) {
    if (get(db, 'Kategoriak', ALAP_KATEGORIA)) return ALAP_KATEGORIA;
    var k = (db.Kategoriak || []).filter(function (x) { return x.aktiv && !x.vezerlo; })
      .sort(function (a, b) { return a.sorrend - b.sorrend; })[0];
    if (!k) fail('Nincs termékfajta (Termékfajták oldal / adatbázis-átalakítás).');
    return k.kategoria_id;
  }
  /** Egy pozíció élő (nem törölt) elemei. */
  function pozElemei(db, pozId) {
    return (db.Elemek || []).filter(function (e) { return e.poz_id === pozId && !e.torolve; });
  }
  /** Elem jogosultság: a pozíció fajtája szerint (pozíció: iroda; terepi jelölés: a szerelő is, a sajátját). */
  function needElemJog(db, user, poz) {
    need(user, terepi(poz.fajta) ? 'kulsos' : 'iroda');
    sajatTerepi(poz, user);
  }

  /* ---------- Adat a felhasználónak ---------- */
  /**
   * A felhasználónak elküldhető adat. Mindig: a látható projektek listája (projekt-összesítéshez a lépésekkel) és a
   * termékfajták. projektId esetén a projekt teljes adata. Amihez nincs joga, az el sem jut a készülékre.
   */
  function snapshot(db, user, projektId) {
    var proj = (db.Projektek || []).filter(function (p) { return lathatja(user, p.projekt_id); });
    var ids = {};
    proj.forEach(function (p) { ids[p.projekt_id] = 1; });
    var out = {
      Projektek: exportRows(proj),
      Kategoriak: exportRows(db.Kategoriak || []),
      Lepesek: exportRows((db.Lepesek || []).filter(function (l) { return ids[l.projekt_id]; })),
      // Felhasználók: csak az admin kapja a teljes listát (felhasználókezelés); másnak csak a saját sora jut le – a nevek a
      // bejegyzésekben (ki_nev) vannak, így a teljes névsor / e-mail-lista (pl. egy külsős cégnek) felesleges lenne
      Felhasznalok: hasRole(user, 'admin') ? exportRows(db.Felhasznalok || [])
        : (db.Felhasznalok || []).filter(function (u) { return u.email === user.email; }).map(function (u) { return { email: u.email, nev: u.nev }; })
    };
    if (projektId && ids[projektId]) {
      var mine = function (r) { return r.projekt_id === projektId; };
      var elo = function (r) { return mine(r) && !r.torolve; };
      // Az iroda a törölt pozíciókat, elemeket és kapcsolatokat is megkapja (Lomtár, visszaállítás – a kliens külön kezeli őket)
      var lomtarral = hasRole(user, 'iroda') ? mine : elo;
      out.projekt_id = projektId;
      out.Rajzok = exportRows((db.Rajzok || []).filter(mine));
      out.Poziciok = exportRows((db.Poziciok || []).filter(lomtarral));
      out.Elemek = exportRows((db.Elemek || []).filter(lomtarral));
      out.Tipusok = exportRows((db.Tipusok || []).filter(mine));
      out.Esemenyek = exportRows((db.Esemenyek || []).filter(mine));
      out.Fotok = exportRows((db.Fotok || []).filter(elo));
      out.Kapcsolatok = exportRows((db.Kapcsolatok || []).filter(lomtarral));
      out.Csatornak = exportRows((db.Csatornak || []).filter(elo));
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
      case 'kategoria_mentes': opKategoria(db, op, user, nowIso, changes); break;
      case 'projekt_mentes': opProjekt(db, op, user, nowIso, changes); break;
      case 'projekt_torles': opProjektTorles(db, op, user, changes); break;
      case 'lepesek_mentes': opLepesek(db, op, user, changes); break;
      case 'rajz_mentes': opRajz(db, op, user, nowIso, changes); break;
      case 'rajz_torles': opRajzTorles(db, op, user, nowIso, changes); break;
      case 'rajz_masolat': opRajzMasolat(db, op, user, nowIso, changes); break;
      case 'poz_mentes': opPozMentes(db, op, user, nowIso, changes); break;
      case 'poz_lerakas': opPozLerakas(db, op, user, nowIso, changes); break;
      case 'poz_torles': opPozTorles(db, op, user, nowIso, changes); break;
      case 'poz_visszaallitas': opPozVisszaallitas(db, op, user, nowIso, changes); break;
      case 'elem_mentes': opElemMentes(db, op, user, nowIso, changes); break;
      case 'elem_torles': opElemTorles(db, op, user, nowIso, changes); break;
      case 'tipus_mentes': opTipusMentes(db, op, user, nowIso, changes); break;
      case 'tipus_torles': opTipusTorles(db, op, user, changes); break;
      case 'esemeny': opEsemeny(db, op, user, nowIso, changes); break;
      case 'esemenyek': opEsemenyek(db, op, user, nowIso, changes); break;
      case 'kapcsolat_mentes': opKapcsolat(db, op, user, nowIso, changes); break;
      case 'kapcsolat_torles': opKapcsolatTorles(db, op, user, nowIso, changes); break;
      case 'csatorna_mentes': opCsatornak(db, op, user, nowIso, changes); break;
      case 'csatorna_torles': opCsatornaTorles(db, op, user, nowIso, changes); break;
      case 'felhasznalo_mentes': opFelhasznalo(db, op, user, changes); break;
      case 'foto_torles': opFotoTorles(db, op, user, nowIso, changes); break;
      default: fail('Ismeretlen művelet.');
    }
    return changes;
  }

  /** Termékfajta felvétele / módosítása (admin; cégszintű). Törlés nincs – az „aktív” kivétele elrejti az új elemek elől. */
  function opKategoria(db, op, user, now, changes) {
    need(user, 'admin');
    var k = op.kategoria || {};
    checkId(k.kategoria_id);
    var ex = get(db, 'Kategoriak', k.kategoria_id);
    var nev = str(k.nev, 100);
    if (!nev) fail('Add meg a termékfajta nevét.');
    var lep = (Array.isArray(k.lepesek) ? k.lepesek : jsonOf(ex && ex.lepesek, [])).slice(0, 30)
      .map(function (l) { return { nev: str(l && l.nev, 100), szin: szin(l && l.szin, '#9aa1aa'), suly: suly(l && l.suly) }; })
      .filter(function (l) { return l.nev; });
    if (!lep.length) fail('A termékfajtának legalább egy lépése legyen.');
    put(db, 'Kategoriak', { kategoria_id: k.kategoria_id, nev: nev, sorrend: toNum(k.sorrend !== undefined ? k.sorrend : ex && ex.sorrend),
      szin: szin(k.szin !== undefined ? k.szin : ex && ex.szin, '#2f7fd8'), lepesek: JSON.stringify(lep),
      oszlopok: JSON.stringify(nevLista(k.oszlopok !== undefined ? k.oszlopok : jsonOf(ex && ex.oszlopok, []))),
      vezerlo: k.vezerlo !== undefined ? !!k.vezerlo : !!(ex && ex.vezerlo), aktiv: k.aktiv !== undefined ? k.aktiv !== false : !ex || ex.aktiv,
      modositva: now }, changes);
  }

  /** Projekt létrehozása / módosítása (iroda). Régi alakú új projektnél (op.lepesek) a műveletsor az alap termékfajtáé. */
  function opProjekt(db, op, user, now, changes) {
    need(user, 'iroda');
    var p = op.projekt || {};
    checkId(p.projekt_id);
    var ex = get(db, 'Projektek', p.projekt_id);
    if (ex && !lathatja(user, ex.projekt_id)) fail('Ehhez a projekthez nincs hozzáférésed.');
    var nev = str(p.nev, 200);
    if (!nev) fail('Add meg a projekt nevét.');
    var lista = function (m) { return JSON.stringify(nevLista(p[m] !== undefined ? p[m] : jsonOf(ex && ex[m], []))); };
    put(db, 'Projektek', { projekt_id: p.projekt_id, nev: nev, ugyfel: str(p.ugyfel, 200), helyszin: str(p.helyszin, 300),
      allapot: own(PROJEKT_ALLAPOT, p.allapot) ? p.allapot : 'aktiv',
      oszlopok: lista('oszlopok'), elem_oszlopok: lista('elem_oszlopok'), tipus_oszlopok: lista('tipus_oszlopok'),
      letrehozva: ex ? ex.letrehozva : now, modositva: now }, changes);
    if (!ex && Array.isArray(op.lepesek)) {
      opLepesek(db, { projekt_id: p.projekt_id, kategoria_id: op.kategoria_id || alapKategoria(db), lepesek: op.lepesek }, user, changes);
    }
  }
  /** Projekt törlése mindenével (admin). A Drive-fájlokat a szerver külön kezeli (changes alapján). */
  function opProjektTorles(db, op, user, changes) {
    need(user, 'admin');
    var id = op.projekt_id;
    if (!get(db, 'Projektek', id)) return; // már törölve (idempotens)
    ['Lepesek', 'Rajzok', 'Poziciok', 'Elemek', 'Tipusok', 'Esemenyek', 'Fotok', 'Kapcsolatok', 'Csatornak'].forEach(function (t) {
      var k = SCHEMA[t].key;
      (db[t] || []).filter(function (r) { return r.projekt_id === id; }).map(function (r) { return r[k]; })
        .forEach(function (rid) { remove(db, t, rid, changes); });
    });
    remove(db, 'Projektek', id, changes);
  }
  /**
   * Egy termékfajta műveletsorának teljes cseréje a projektben (iroda): a megadott sorrend; a kimaradt lépések törlődnek
   * (a naplójuk megmarad). kategoria_id nélkül (régi kliens): a projekt meglévő lépéseinek fajtája, különben az alap.
   */
  function opLepesek(db, op, user, changes) {
    need(user, 'iroda');
    needProjekt(db, user, op.projekt_id);
    var katId = op.kategoria_id;
    if (!katId) {
      var regi = (db.Lepesek || []).filter(function (l) { return l.projekt_id === op.projekt_id; });
      katId = regi.length ? regi[0].kategoria_id || alapKategoria(db) : alapKategoria(db);
    }
    if (!get(db, 'Kategoriak', katId)) fail('Ismeretlen termékfajta.');
    var list = rowsOf(op.lepesek, 'Legalább egy lépés kell.');
    if (list.length > 30) fail('Túl sok lépés (legfeljebb 30).');
    var ids = {};
    list.forEach(function (l) {
      checkId(l.lepes_id);
      if (!str(l.nev)) fail('Minden lépésnek legyen neve.');
      if (ids[l.lepes_id]) fail('Ismétlődő lépés.');
      var ex = get(db, 'Lepesek', l.lepes_id);
      if (ex && (ex.projekt_id !== op.projekt_id || (ex.kategoria_id && ex.kategoria_id !== katId))) fail('Érvénytelen lépés.');
      ids[l.lepes_id] = 1;
    });
    (db.Lepesek || []).filter(function (l) { return l.projekt_id === op.projekt_id && (l.kategoria_id || katId) === katId && !ids[l.lepes_id]; })
      .map(function (l) { return l.lepes_id; }).forEach(function (id) { remove(db, 'Lepesek', id, changes); });
    list.forEach(function (l, i) {
      put(db, 'Lepesek', { lepes_id: l.lepes_id, projekt_id: op.projekt_id, kategoria_id: katId, sorrend: i + 1, nev: str(l.nev, 100),
        szin: szin(l.szin, '#9aa1aa'), suly: suly(l.suly) }, changes);
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
    put(db, 'Rajzok', { rajz_id: ex.rajz_id, nev: nev, epulet: str(r.epulet, 50), szint: str(r.szint, 50),
      homlokzat: str(r.homlokzat !== undefined ? r.homlokzat : ex.homlokzat, 50),
      kivagas: r.kivagas !== undefined ? kivagas(r.kivagas) : ex.kivagas || '', modositva: now }, changes);
  }
  /** Kivágás ellenőrzése: '' (nincs) vagy „x0,y0,x1,y1” (0–1, legalább 2% széles / magas). */
  function kivagas(v) {
    if (!v) return '';
    var n = String(v).split(',').map(Number);
    if (n.length !== 4 || n.some(function (x) { return !isFinite(x) || x < 0 || x > 1; }) || n[2] - n[0] < 0.02 || n[3] - n[1] < 0.02) fail('Érvénytelen kivágás.');
    return n.map(function (x) { return Math.round(x * 1e5) / 1e5; }).join(',');
  }
  /**
   * Új rajz egy meglévő PDF-jéből (iroda): op.rajz = { rajz_id, forras, nev, epulet, szint, homlokzat, kivagas }. A fájl nem
   * másolódik: a forrás (az eredeti feltöltött) rajzé; a PDF cseréje így mindegyikre érvényes.
   */
  function opRajzMasolat(db, op, user, now, changes) {
    need(user, 'iroda');
    var r = op.rajz || {};
    checkId(r.rajz_id);
    if (get(db, 'Rajzok', r.rajz_id)) return; // már létrehozva (idempotens)
    var src = get(db, 'Rajzok', r.forras);
    if (src && src.forras) src = get(db, 'Rajzok', src.forras);
    if (!src) fail('Ismeretlen rajz.');
    needProjekt(db, user, src.projekt_id);
    var nev = str(r.nev, 200);
    if (!nev) fail('Add meg a rajz megnevezését.');
    put(db, 'Rajzok', { rajz_id: r.rajz_id, projekt_id: src.projekt_id, nev: nev, epulet: str(r.epulet, 50), szint: str(r.szint, 50),
      homlokzat: str(r.homlokzat, 50), kivagas: kivagas(r.kivagas), forras: src.rajz_id, W: src.W, H: src.H, verzio: 1, meret: 0,
      drive_id: '', felveve: now, csere: '', modositva: now }, changes);
  }
  /** Rajz törlése (iroda): a pozíciók lekerülnek (megmaradnak), a felmérés / hibajelölés (és elemei) törlődik. */
  function opRajzTorles(db, op, user, now, changes) {
    need(user, 'iroda');
    var ex = get(db, 'Rajzok', op.rajz_id);
    if (!ex) return;
    needProjekt(db, user, ex.projekt_id);
    // A belőle készült (azonos PDF-et használó) rajzok előbb törlendők – különben a fájljuk elveszne
    var masolatok = (db.Rajzok || []).filter(function (x) { return x.forras === ex.rajz_id; });
    if (masolatok.length) fail('Ennek a rajznak a PDF-jét más rajzok is használják (' + masolatok.map(function (x) { return x.nev; }).join(', ') + ') – előbb azokat töröld.');
    (db.Poziciok || []).filter(function (p) { return p.rajz_id === ex.rajz_id && !p.torolve; }).forEach(function (p) {
      if (p.fajta === 'pozicio') put(db, 'Poziciok', { poz_id: p.poz_id, rajz_id: '', x: 0, y: 0, modositva: now }, changes);
      else torolPoz(db, p, now, changes);
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
    if (terepi(ex.fajta) && !hasRole(user, 'iroda') && !sajat(ex, user)) fail('Csak a saját jelölésedet módosíthatod.');
  }

  /**
   * Pozíciók (helyek) mentése (új vagy meglévő; op.rows: több sor egyben, pl. beillesztéskor). Csak a megadott mezők íródnak
   * (részleges frissítés). Pozíció: iroda; felmérés / hibajelzés: szerelő is.
   * Régi kliens (v1): a sorban tipus / szel / mag is lehet – ezek a pozíció egyetlen eleméhez kerülnek (ha nincs eleme: új elem az
   * alap termékfajtából), így az offline várakozó régi rögzítések sem vesznek el.
   */
  function opPozMentes(db, op, user, now, changes) {
    var rows = rowsOf(op.rows, 'Nincs mentendő pozíció.');
    var mezok = ['jel', 'epulet', 'szint', 'helyiseg', 'homlokzat'], regiMezok = ['tipus', 'szel', 'mag'];
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
        regiMezok.forEach(function (m) { row[m] = ''; });
      }
      var regi = regiMezok.some(function (m) { return r[m] !== undefined; }) ? r : null;
      return { row: row, fajta: fajta, projektId: projektId, jel: jel, regi: regi };
    });
    // Jel-egyediség (a meglévők és a művelet saját sorai között is)
    var latott = {};
    tervek.forEach(function (t) {
      if (t.fajta !== 'pozicio') return;
      var k = t.projektId + '|' + t.jel.toLowerCase();
      if (latott[k] || jelFoglalt(db, t.projektId, t.jel, t.row.poz_id)) fail('A(z) „' + t.jel + '” jel már szerepel.');
      latott[k] = 1;
    });
    tervek.forEach(function (t) {
      put(db, 'Poziciok', t.row, changes);
      if (t.regi && t.fajta === 'pozicio') regiElemMezok(db, user, t.row.poz_id, t.projektId, t.regi, now, changes);
    });
  }
  /** v1 kompatibilitás: a pozíció termékmezői (tipus, szel, mag, adatok nélkül) a pozíció egyetlen elemére. */
  function regiElemMezok(db, user, pozId, projektId, r, now, changes) {
    var elemek = pozElemei(db, pozId);
    if (elemek.length > 1) return; // több elemnél nem egyértelmű – a régi kliens ezt úgysem tudja kezelni
    var row = elemek.length ? { elem_id: elemek[0].elem_id, modositva: now }
      : { elem_id: pozId + '-1', projekt_id: projektId, poz_id: pozId, kategoria_id: alapKategoria(db), tipus: '', szel: '', mag: '', db: 1,
        adatok: '{}', sorrend: 1, letrehozva: now, letrehozta: user.email, torolve: '' };
    ['tipus', 'szel', 'mag'].forEach(function (m) { if (r[m] !== undefined) row[m] = str(r[m], 200); });
    put(db, 'Elemek', row, changes);
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
  /** Pozíció törlése jelöléssel, az elemeivel és azok kapcsolataival együtt (a napló megmarad). */
  function torolPoz(db, p, now, changes) {
    put(db, 'Poziciok', { poz_id: p.poz_id, torolve: now, modositva: now }, changes);
    pozElemei(db, p.poz_id).forEach(function (e) { torolElem(db, e, now, changes); });
  }
  /** Törlés jelöléssel (a napló megmarad). Pozíció: iroda; terepi jelölés: szerelő is (a sajátját). */
  function opPozTorles(db, op, user, now, changes) {
    var ex = get(db, 'Poziciok', op.poz_id);
    if (!ex || ex.torolve) return;
    needProjekt(db, user, ex.projekt_id);
    if (terepi(ex.fajta) && !hasRole(user, 'iroda')) {
      if (!sajat(ex, user)) fail('Csak a saját jelölésedet törölheted.');
    } else need(user, 'iroda');
    torolPoz(db, ex, now, changes);
  }
  /**
   * Törölt pozíció visszaállítása a Lomtárból (iroda): a pozícióval együtt törölt elemek (azonos törlési idő), azok kapcsolatai
   * és csatornái is visszajönnek; a rajzon a helyére kerül, ha a rajz még megvan. Ha a jelet közben más pozíció kapta meg,
   * op.jel = új jel. A külön (korábban) törölt elemek törölve maradnak.
   */
  function opPozVisszaallitas(db, op, user, now, changes) {
    need(user, 'iroda');
    var ex = get(db, 'Poziciok', op.poz_id);
    if (!ex) fail('Ismeretlen pozíció.');
    needProjekt(db, user, ex.projekt_id);
    if (!ex.torolve) return; // már visszaállítva (idempotens)
    var jel = op.jel !== undefined ? str(op.jel, 60) : ex.jel;
    if (ex.fajta === 'pozicio') {
      if (!jel) fail('Minden pozíciónak legyen jele.');
      if (jelFoglalt(db, ex.projekt_id, jel, ex.poz_id)) fail('A(z) „' + jel + '” jel már szerepel – adj meg új jelet.');
    }
    var ts = ex.torolve, row = { poz_id: ex.poz_id, jel: jel, torolve: '', modositva: now };
    var r = ex.rajz_id && get(db, 'Rajzok', ex.rajz_id);
    if (ex.rajz_id && (!r || r.projekt_id !== ex.projekt_id)) { row.rajz_id = ''; row.x = 0; row.y = 0; }
    put(db, 'Poziciok', row, changes);
    var vissza = {};
    (db.Elemek || []).filter(function (e) { return e.poz_id === ex.poz_id && e.torolve === ts; }).forEach(function (e) {
      vissza[e.elem_id] = 1;
      put(db, 'Elemek', { elem_id: e.elem_id, torolve: '', modositva: now }, changes);
    });
    (db.Csatornak || []).filter(function (c) { return c.torolve === ts && vissza[c.elem_id]; })
      .forEach(function (c) { put(db, 'Csatornak', { csatorna_id: c.csatorna_id, torolve: '', modositva: now }, changes); });
    // Kapcsolatok: ha mindkét végük él (a másik vég egy élő, más pozíció eleme is lehet)
    var el = function (id) { var e = get(db, 'Elemek', id); return e && !e.torolve; };
    (db.Kapcsolatok || []).filter(function (k) {
      return k.torolve === ts && (vissza[k.forras_elem] || vissza[k.cel_elem]) && el(k.forras_elem) && el(k.cel_elem);
    }).forEach(function (k) { put(db, 'Kapcsolatok', { kapcsolat_id: k.kapcsolat_id, torolve: '', modositva: now }, changes); });
  }

  /**
   * Elemek mentése (új vagy meglévő; op.rows). Új elem: poz_id + kategoria_id kötelező. A termékfajta csak addig cserélhető,
   * amíg az elemhez nincs lépés-bejegyzés. Jog: a pozíció fajtája szerint (pozíció: iroda; terepi jelölés: szerelő is).
   */
  function opElemMentes(db, op, user, now, changes) {
    var rows = rowsOf(op.rows, 'Nincs mentendő elem.');
    var tervek = rows.map(function (r) {
      checkId(r.elem_id);
      var ex = get(db, 'Elemek', r.elem_id);
      if (ex && ex.torolve) fail('Az elem már törölve.');
      var poz = get(db, 'Poziciok', ex ? ex.poz_id : r.poz_id);
      if (!poz || poz.torolve) fail('Ismeretlen pozíció.');
      needProjekt(db, user, poz.projekt_id);
      needElemJog(db, user, poz);
      var row = { elem_id: r.elem_id, modositva: now };
      if (r.kategoria_id !== undefined || !ex) {
        var kat = get(db, 'Kategoriak', r.kategoria_id);
        if (!kat) fail('Ismeretlen termékfajta.');
        if (ex && ex.kategoria_id !== kat.kategoria_id) {
          var vanLepes = (db.Esemenyek || []).some(function (e) { return e.elem_id === ex.elem_id && (e.tipus === 'kesz' || e.tipus === 'visszavon'); });
          if (vanLepes) fail('Az elem termékfajtája nem cserélhető, mert már van rögzített lépése.');
        }
        row.kategoria_id = kat.kategoria_id;
      }
      ['tipus', 'szel', 'mag'].forEach(function (m) { if (r[m] !== undefined) row[m] = str(r[m], m === 'tipus' ? 60 : 50); });
      if (r.db !== undefined) { row.db = toNum(r.db); if (!(row.db > 0) || row.db > 100000) fail('Érvénytelen darabszám.'); }
      if (r.sorrend !== undefined) row.sorrend = toNum(r.sorrend);
      if (r.adatok !== undefined) row.adatok = JSON.stringify(tisztaAdatok(r.adatok));
      if (!ex) {
        row.projekt_id = poz.projekt_id; row.poz_id = poz.poz_id; row.letrehozva = now; row.letrehozta = user.email; row.torolve = '';
        ['tipus', 'szel', 'mag'].forEach(function (m) { if (row[m] === undefined) row[m] = ''; });
        if (row.db === undefined) row.db = 1;
        if (row.adatok === undefined) row.adatok = '{}';
        if (row.sorrend === undefined) row.sorrend = pozElemei(db, poz.poz_id).length + 1;
      }
      return row;
    });
    tervek.forEach(function (row) { put(db, 'Elemek', row, changes); });
  }
  /** Elem törlése jelöléssel (a napló megmarad); a kapcsolatai és (vezérlőnél) a csatornái is törlődnek. */
  function torolElem(db, e, now, changes) {
    put(db, 'Elemek', { elem_id: e.elem_id, torolve: now, modositva: now }, changes);
    (db.Kapcsolatok || []).filter(function (k) { return !k.torolve && (k.forras_elem === e.elem_id || k.cel_elem === e.elem_id); })
      .forEach(function (k) { put(db, 'Kapcsolatok', { kapcsolat_id: k.kapcsolat_id, torolve: now, modositva: now }, changes); });
    (db.Csatornak || []).filter(function (c) { return !c.torolve && c.elem_id === e.elem_id; })
      .forEach(function (c) { put(db, 'Csatornak', { csatorna_id: c.csatorna_id, torolve: now, modositva: now }, changes); });
  }
  function opElemTorles(db, op, user, now, changes) {
    var ex = get(db, 'Elemek', op.elem_id);
    if (!ex || ex.torolve) return;
    var poz = get(db, 'Poziciok', ex.poz_id);
    if (!poz) fail('Ismeretlen pozíció.');
    needProjekt(db, user, ex.projekt_id);
    needElemJog(db, user, poz);
    torolElem(db, ex, now, changes);
  }

  /** Típusok mentése (iroda; op.rows). Átnevezéskor a projekt elemeinek „tipus” mezője követi. */
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
        (db.Elemek || []).filter(function (e) { return e.projekt_id === projektId && String(e.tipus).toLowerCase() === String(ex.jel).toLowerCase(); })
          .forEach(function (e) { put(db, 'Elemek', { elem_id: e.elem_id, tipus: jel, modositva: now }, changes); });
      }
      var row = { tipus_id: r.tipus_id, projekt_id: projektId, jel: jel, modositva: now };
      if (r.kategoria_id !== undefined || !ex) {
        var katId = r.kategoria_id || (ex && ex.kategoria_id) || alapKategoria(db);
        if (!get(db, 'Kategoriak', katId)) fail('Ismeretlen termékfajta.');
        row.kategoria_id = katId;
      }
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
   * Esemény (lépés kész / visszavonás / hiba / megjegyzés). Bárki, aki látja a projektet. Idempotens (esemeny_id).
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
   * A lépés (kész / visszavonás) mindig egy elemhez tartozik, és a lépés az elem termékfajtájáé. Régi kliens (elem nélkül):
   * a pozíció azon egyetlen eleme, amelynek a fajtájához a lépés tartozik.
   */
  function esemenySor(db, e, user, now, koteg) {
    checkId(e.esemeny_id);
    if (get(db, 'Esemenyek', e.esemeny_id)) return null; // már feldolgozva
    var p = get(db, 'Poziciok', e.poz_id);
    if (!p || p.torolve) fail('Ismeretlen pozíció (közben törölték).');
    needProjekt(db, user, p.projekt_id);
    need(user, 'kulsos');
    if (!own(ESEMENY_TIPUSOK, e.tipus)) fail('Ismeretlen bejegyzéstípus.');
    var elem = null;
    if (e.elem_id) {
      elem = get(db, 'Elemek', e.elem_id);
      if (!elem || elem.torolve || elem.poz_id !== p.poz_id) fail('Ismeretlen elem (közben törölték).');
    }
    var lepes = '';
    if (e.tipus === 'kesz' || e.tipus === 'visszavon') {
      var l = get(db, 'Lepesek', e.lepes_id);
      if (!l || l.projekt_id !== p.projekt_id) fail('Ismeretlen lépés.');
      if (!elem) {
        var jo = pozElemei(db, p.poz_id).filter(function (x) { return x.kategoria_id === l.kategoria_id; });
        if (jo.length !== 1) fail('A lépéshez meg kell adni az elemet.');
        elem = jo[0];
      }
      if (l.kategoria_id && elem.kategoria_id !== l.kategoria_id) fail('A lépés nem ehhez a termékfajtához tartozik.');
      lepes = l.lepes_id;
    }
    var mikor = toDate(e.mikor), nowMs = Date.parse(now);
    if (!mikor || Date.parse(mikor) > nowMs + 10 * 60000) mikor = now;
    // Visszadátumozás: a szerelő / külsős legfeljebb VISSZA_NAP napra (offline munka) – egy már elszámolt időszakba ne
    // kerülhessen utólag bejegyzés; az iroda (pl. pótlás) bármikorra
    if (!hasRole(user, 'iroda') && Date.parse(mikor) < nowMs - VISSZA_NAP * 86400000) {
      fail('A bejegyzés időpontja legfeljebb ' + VISSZA_NAP + ' nappal korábbi lehet.');
    }
    var elemId = elem ? elem.elem_id : '';
    if (e.tipus === 'visszavon' && !hasRole(user, 'iroda')) {
      var utolso = null;
      (db.Esemenyek || []).concat(koteg || []).forEach(function (x) {
        if (x.poz_id === p.poz_id && (x.elem_id || elemId) === elemId && x.lepes_id === lepes && x.tipus === 'kesz') utolso = x;
      });
      if (!utolso || !sajat(utolso, user, 'ki') || nowMs - Date.parse(utolso.rogzitve || utolso.mikor) > SZERELO_VISSZAVON_ORA * 3600000) {
        fail('Ezt a lépést csak az iroda vonhatja vissza (a saját lépésedet ' + SZERELO_VISSZAVON_ORA + ' órán belül vonhatod vissza).');
      }
    }
    return { esemeny_id: e.esemeny_id, poz_id: p.poz_id, elem_id: elemId, projekt_id: p.projekt_id, tipus: e.tipus, lepes_id: lepes,
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
    if (!sajat(e, user, 'ki') && !hasRole(user, 'iroda')) fail('Csak a saját bejegyzésedhez csatolhatsz fotót.');
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
    if (!sajat(ex, user, 'ki')) need(user, 'iroda');
    put(db, 'Fotok', { foto_id: ex.foto_id, torolve: now }, changes);
  }

  /**
   * Kapcsolat mentése (op.kapcsolat). Új kapcsolat, a végpontok / típus módosítása: iroda. A szerelő / külsős csak a meglévő
   * kapcsolat állapotát és megjegyzését állíthatja (pl. „betanítva” a helyszínen).
   * vezerli: a forrás vezérlő fajtájú elem, a csatorna (ha van) az övé; kozos: két különböző elem.
   */
  function opKapcsolat(db, op, user, now, changes) {
    var k = op.kapcsolat || {};
    checkId(k.kapcsolat_id);
    var ex = get(db, 'Kapcsolatok', k.kapcsolat_id);
    if (ex && ex.torolve) fail('A kapcsolat már törölve.');
    var projektId = ex ? ex.projekt_id : null;
    var vegpontValtozik = !ex || ['tipus', 'forras_elem', 'cel_elem', 'csatorna_id'].some(function (m) { return k[m] !== undefined && k[m] !== ex[m]; });
    var row = { kapcsolat_id: k.kapcsolat_id, modositva: now };
    if (vegpontValtozik) {
      need(user, 'iroda');
      var tipus = k.tipus !== undefined ? k.tipus : ex.tipus;
      if (!own(KAPCSOLAT_TIPUSOK, tipus)) fail('Ismeretlen kapcsolattípus.');
      var f = get(db, 'Elemek', k.forras_elem !== undefined ? k.forras_elem : ex.forras_elem);
      var c = get(db, 'Elemek', k.cel_elem !== undefined ? k.cel_elem : ex.cel_elem);
      if (!f || f.torolve || !c || c.torolve) fail('Ismeretlen elem.');
      if (f.elem_id === c.elem_id) fail('Egy elem nem kapcsolódhat önmagához.');
      if (f.projekt_id !== c.projekt_id) fail('A két elem nem ugyanabban a projektben van.');
      projektId = f.projekt_id;
      var csat = k.csatorna_id !== undefined ? k.csatorna_id : ex ? ex.csatorna_id : '';
      if (tipus === 'vezerli') {
        var kat = get(db, 'Kategoriak', f.kategoria_id);
        if (!kat || !kat.vezerlo) fail('A vezérlés forrása vezérlő fajtájú elem legyen.');
        if (csat) { var cs = get(db, 'Csatornak', csat); if (!cs || cs.torolve || cs.elem_id !== f.elem_id) fail('Ismeretlen csatorna.'); }
      } else csat = '';
      row.tipus = tipus; row.forras_elem = f.elem_id; row.cel_elem = c.elem_id; row.csatorna_id = csat;
    }
    needProjekt(db, user, projektId);
    need(user, 'kulsos');
    if (k.allapot !== undefined) { if (!own(KAPCSOLAT_ALLAPOT, k.allapot)) fail('Ismeretlen állapot.'); row.allapot = k.allapot; }
    if (k.megj !== undefined) row.megj = str(k.megj, 500);
    if (!ex) {
      row.projekt_id = projektId; row.letrehozta = user.email; row.torolve = '';
      if (row.allapot === undefined) row.allapot = 'tervezett';
      if (row.megj === undefined) row.megj = '';
    }
    put(db, 'Kapcsolatok', row, changes);
  }
  function opKapcsolatTorles(db, op, user, now, changes) {
    var ex = get(db, 'Kapcsolatok', op.kapcsolat_id);
    if (!ex || ex.torolve) return;
    need(user, 'iroda');
    needProjekt(db, user, ex.projekt_id);
    put(db, 'Kapcsolatok', { kapcsolat_id: ex.kapcsolat_id, torolve: now, modositva: now }, changes);
  }
  /** Csatornák mentése (iroda; op.rows): { csatorna_id, elem_id (a vezérlő – új csatornánál), sorszam, nev }. */
  function opCsatornak(db, op, user, now, changes) {
    need(user, 'iroda');
    rowsOf(op.rows, 'Nincs mentendő csatorna.').forEach(function (r) {
      checkId(r.csatorna_id);
      var ex = get(db, 'Csatornak', r.csatorna_id);
      if (ex && ex.torolve) fail('A csatorna már törölve.');
      var el = get(db, 'Elemek', ex ? ex.elem_id : r.elem_id);
      if (!el || el.torolve) fail('Ismeretlen vezérlő.');
      var kat = get(db, 'Kategoriak', el.kategoria_id);
      if (!kat || !kat.vezerlo) fail('Csatornája csak vezérlő fajtájú elemnek lehet.');
      needProjekt(db, user, el.projekt_id);
      var row = { csatorna_id: r.csatorna_id, modositva: now };
      if (r.sorszam !== undefined) row.sorszam = toNum(r.sorszam);
      if (r.nev !== undefined) row.nev = str(r.nev, 100);
      if (!ex) {
        row.projekt_id = el.projekt_id; row.elem_id = el.elem_id; row.torolve = '';
        if (row.sorszam === undefined) row.sorszam = 1;
        if (row.nev === undefined) row.nev = '';
      }
      put(db, 'Csatornak', row, changes);
    });
  }
  function opCsatornaTorles(db, op, user, now, changes) {
    need(user, 'iroda');
    var ex = get(db, 'Csatornak', op.csatorna_id);
    if (!ex || ex.torolve) return;
    needProjekt(db, user, ex.projekt_id);
    put(db, 'Csatornak', { csatorna_id: ex.csatorna_id, torolve: now, modositva: now }, changes);
    (db.Kapcsolatok || []).filter(function (k) { return !k.torolve && k.csatorna_id === ex.csatorna_id; })
      .forEach(function (k) { put(db, 'Kapcsolatok', { kapcsolat_id: k.kapcsolat_id, torolve: now, modositva: now }, changes); });
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

  /* ---------- Átalakítás v1 → v2 (ATALAKITAS_V2.md 6. pont) ---------- */
  var ALAP_KATEGORIAK = [
    { kategoria_id: ALAP_KATEGORIA, nev: 'Árnyékoló', sorrend: 1, szin: '#2f7fd8', vezerlo: false,
      lepesek: ['Konzolozva', 'Védőtető felszerelve', 'Beakasztva', 'Lefutózva', 'Programozva', 'Átadva'] },
    { kategoria_id: 'k-vezerlo', nev: 'Vezérlő', sorrend: 90, szin: '#8e44c9', vezerlo: true, lepesek: ['Felszerelve', 'Betanítva', 'Átadva'] }
  ];
  var PALETTA = ['#f2c200', '#2f7fd8', '#8e44c9', '#f07f1d', '#13a3a3', '#c2185b'];
  /** A hely adatai közül a helyiség (ha van ilyen oszlop): „Helyiség név”, „Helyiség”, „Helyiség neve”. */
  function helyisegAdatbol(a) {
    var kulcsok = Object.keys(a || {});
    for (var i = 0; i < kulcsok.length; i++) {
      if (/^helyis[eé]g( n[eé]ve?)?$/i.test(kulcsok[i].trim())) return str(a[kulcsok[i]], 200);
    }
    return '';
  }
  /**
   * Az adatbázis átalakítása (idempotens – többször futtatható): alap termékfajták; a lépések és típusok fajtát kapnak; minden
   * „pozíció” fajtájú, elem nélküli pozícióból egy elem lesz (<poz_id>-1) a pozíció típusával, méretével; a lépés-bejegyzések
   * az elemhez kerülnek. Visszaad: { changes, stat }.
   */
  function atalakitV2(db, now) {
    var changes = [], stat = { kategoria: 0, lepes: 0, tipus: 0, elem: 0, esemeny: 0, helyiseg: 0 };
    now = now || new Date().toISOString();
    ALAP_KATEGORIAK.forEach(function (k) {
      if (get(db, 'Kategoriak', k.kategoria_id)) return;
      var n = k.lepesek.length;
      put(db, 'Kategoriak', { kategoria_id: k.kategoria_id, nev: k.nev, sorrend: k.sorrend, szin: k.szin, vezerlo: k.vezerlo, aktiv: true,
        lepesek: JSON.stringify(k.lepesek.map(function (nev, i) { return { nev: nev, szin: i === n - 1 ? '#1e9e4a' : PALETTA[i % PALETTA.length], suly: 0 }; })),
        oszlopok: '[]', modositva: now }, changes);
      stat.kategoria++;
    });
    (db.Lepesek || []).forEach(function (l) {
      if (!l.kategoria_id) { put(db, 'Lepesek', { lepes_id: l.lepes_id, kategoria_id: ALAP_KATEGORIA }, changes); stat.lepes++; }
    });
    (db.Tipusok || []).forEach(function (t) {
      if (!t.kategoria_id) { put(db, 'Tipusok', { tipus_id: t.tipus_id, kategoria_id: ALAP_KATEGORIA }, changes); stat.tipus++; }
    });
    var vanElem = {};
    (db.Elemek || []).forEach(function (e) { vanElem[e.poz_id] = e; });
    (db.Poziciok || []).forEach(function (p) {
      var hely = {};
      if (!p.helyiseg) { var h = helyisegAdatbol(jsonOf(p.adatok, {})); if (h) { hely.helyiseg = h; stat.helyiseg++; } }
      if (p.fajta === 'pozicio' && !p.torolve && !vanElem[p.poz_id]) {
        var e = put(db, 'Elemek', { elem_id: p.poz_id + '-1', projekt_id: p.projekt_id, poz_id: p.poz_id, kategoria_id: ALAP_KATEGORIA,
          tipus: p.tipus || '', szel: p.szel || '', mag: p.mag || '', db: 1, adatok: '{}', sorrend: 1,
          letrehozva: p.letrehozva || now, letrehozta: p.letrehozta || '', modositva: now, torolve: '' }, changes);
        vanElem[p.poz_id] = e;
        stat.elem++;
      }
      if (p.tipus || p.szel || p.mag) { hely.tipus = ''; hely.szel = ''; hely.mag = ''; }
      if (Object.keys(hely).length) { hely.poz_id = p.poz_id; put(db, 'Poziciok', hely, changes); }
    });
    (db.Esemenyek || []).forEach(function (e) {
      if (e.elem_id || (e.tipus !== 'kesz' && e.tipus !== 'visszavon')) return;
      var el = vanElem[e.poz_id];
      if (el) { put(db, 'Esemenyek', { esemeny_id: e.esemeny_id, elem_id: el.elem_id }, changes); stat.esemeny++; }
    });
    return { changes: changes, stat: stat };
  }

  return {
    ROLES: ROLES, ROLE_LABELS: ROLE_LABELS, FAJTAK: FAJTAK, PROJEKT_ALLAPOT: PROJEKT_ALLAPOT, KAPCSOLAT_TIPUSOK: KAPCSOLAT_TIPUSOK,
    KAPCSOLAT_ALLAPOT: KAPCSOLAT_ALLAPOT, ALAP_KATEGORIA: ALAP_KATEGORIA, SCHEMA: SCHEMA, TABLES: TABLES,
    normalize: normalize, jsonOf: jsonOf, hasRole: hasRole, lathatja: lathatja, snapshot: snapshot, applyOp: applyOp,
    get: get, exportRows: exportRows, checkId: checkId, fotoSor: fotoSor, MAX_FOTO_ESEMENYENKENT: MAX_FOTO_ESEMENYENKENT,
    atalakitV2: atalakitV2
  };
})();
