// Adatmodell: állandók és átalakítás a szerver táblái (Sheet-sorok, TerepLogic.SCHEMA) és a felület modellje között.
// Tiszta függvények (nincs tárolás) – a data.js, a backend.js és a store.js is ezt használja.
//
// Felület modellje (data.js):
//   projektek  – { id, nev, ugyfel, helyszin, allapot, lepesek: [{ id, nev, szin }], oszlopok: [név…], tipusOszlopok: [név…], letrehozva }
//   rajzok     – { id, projektId, nev, epulet, szint, W, H, verzio, meret, felveve, csere }
//   poziciok   – { id, projektId, fajta, jel, tipus, szel, mag, epulet, szint, adatok: {}, rajzId|null, x, y, letrehozva, letrehozta, torolve }
//   tipusok    – { id, projektId, jel, szel, mag, adatok: {} }
//   esemenyek  – { id, poz, projektId, tipus, lepes?, ki (név), kiEmail, mikor, rogzitve, megj? }  – időrendben (mikor)
import { uid, norm } from './ui.js';

const L = () => window.TerepLogic;

/** A „nincs elkezdve” állapot színe (nem lépés, ezért nem szerkeszthető). */
export const SZIN_NINCS = '#9aa1aa';
/** Alapértelmezett lépésszín: az utolsó lépés (pl. Átadva) zöld, előtte sárga, kék, lila, narancs, türkiz… */
const PALETTA = ['#f2c200', '#2f7fd8', '#8e44c9', '#f07f1d', '#13a3a3', '#c2185b'];
export const SZIN_KESZ = '#1e9e4a';
export const alapSzin = (i, n) => (i === n - 1 ? SZIN_KESZ : PALETTA[i % PALETTA.length]);

export const SABLONOK = [
  { nev: '3 lépéses', lepesek: ['Felszerelve', 'Programozva', 'Átadva'] },
  { nev: '6 lépéses', lepesek: ['Konzolozva', 'Védőtető felszerelve', 'Beakasztva', 'Lefutózva', 'Programozva', 'Átadva'] },
];
export const sablonLepesek = i => { const s = SABLONOK[i] || SABLONOK[0]; return s.lepesek.map((nev, j) => ({ id: uid('l'), nev, szin: alapSzin(j, s.lepesek.length) })); };
export const PROJEKT_ALLAPOT = { aktiv: 'Aktív', lezart: 'Lezárt' };
export const FAJTAK = { pozicio: 'Pozíció', felmeres: 'Felmérés', hiba: 'Hibajelzés' };
/** A pozíció rögzített mezői (a beillesztésnél ezek a „szerepek”; minden más oszlop az adatok közé kerül). */
export const MEZOK = ['jel', 'tipus', 'szel', 'mag', 'epulet', 'szint'];
export const most = () => new Date().toISOString();
export const ures = v => !String(v ?? '').trim();
/** Összehasonlítási kulcs (jel, épület, szint): kis-/nagybetű és szóköz a szélén nem számít. */
export const kulcs = s => String(s ?? '').trim().toLowerCase();

/* ---------- Szerver → felület ---------- */
const json = (s, def) => (L() ? L().jsonOf(s, def) : def);
/**
 * A szerver adatából (snapshot: Projektek, Lepesek, Felhasznalok + egy vagy több projekt Rajzok, Poziciok, Tipusok, Esemenyek)
 * a felület modellje. betoltve: azon projektek, amelyeknek a részletes adata megvan.
 */
export function fromServer(d) {
  d = d || {};
  const lep = new Map();
  for (const l of (d.Lepesek || []).slice().sort((a, b) => a.sorrend - b.sorrend)) {
    if (!lep.has(l.projekt_id)) lep.set(l.projekt_id, []);
    lep.get(l.projekt_id).push({ id: l.lepes_id, nev: l.nev, szin: l.szin });
  }
  const projektek = (d.Projektek || []).map(p => ({ id: p.projekt_id, nev: p.nev, ugyfel: p.ugyfel || '', helyszin: p.helyszin || '',
    allapot: p.allapot || 'aktiv', lepesek: lep.get(p.projekt_id) || [], oszlopok: json(p.oszlopok, []), tipusOszlopok: json(p.tipus_oszlopok, []),
    letrehozva: p.letrehozva }));
  const rajzok = (d.Rajzok || []).map(r => ({ id: r.rajz_id, projektId: r.projekt_id, nev: r.nev, epulet: r.epulet || '', szint: r.szint || '',
    W: Number(r.W) || 0, H: Number(r.H) || 0, verzio: Number(r.verzio) || 1, meret: Number(r.meret) || 0, felveve: r.felveve, csere: r.csere || '' }));
  const poziciok = (d.Poziciok || []).filter(p => !p.torolve).map(p => ({ id: p.poz_id, projektId: p.projekt_id, fajta: p.fajta || 'pozicio',
    jel: p.jel || '', tipus: p.tipus || '', szel: p.szel || '', mag: p.mag || '', epulet: p.epulet || '', szint: p.szint || '',
    adatok: json(p.adatok, {}), rajzId: p.rajz_id || null, x: p.rajz_id ? Number(p.x) : null, y: p.rajz_id ? Number(p.y) : null,
    letrehozva: p.letrehozva, letrehozta: p.letrehozta || '' }));
  const tipusok = (d.Tipusok || []).map(t => ({ id: t.tipus_id, projektId: t.projekt_id, jel: t.jel, szel: t.szel || '', mag: t.mag || '', adatok: json(t.adatok, {}) }));
  // Időrend a terepi idő szerint (az offline rögzített bejegyzések később érkezhetnek a szerverre)
  const esemenyek = (d.Esemenyek || []).map((e, i) => ({ e, i })).sort((a, b) => (a.e.mikor < b.e.mikor ? -1 : a.e.mikor > b.e.mikor ? 1 : a.i - b.i))
    .map(({ e }) => {
      const o = { id: e.esemeny_id, poz: e.poz_id, projektId: e.projekt_id, tipus: e.tipus, ki: e.ki_nev || e.ki, kiEmail: e.ki, mikor: e.mikor, rogzitve: e.rogzitve };
      if (e.lepes_id) o.lepes = e.lepes_id;
      if (e.megj) o.megj = e.megj;
      return o;
    });
  const betoltve = new Set(d.mind ? projektek.map(p => p.id) : d.projekt_id && d.Poziciok ? [d.projekt_id] : []);
  // Felhasználók: adminnak minden adat, másnak csak e-mail és név (a szerver így küldi)
  const felhasznalok = (d.Felhasznalok || []).map(u => ({ email: u.email, nev: u.nev || '', szerepkor: u.szerepkor || '',
    aktiv: u.aktiv !== false && u.aktiv !== '', projektek: String(u.projektek || '').split(',').map(s => s.trim()).filter(Boolean),
    megjegyzes: u.megjegyzes || '' }));
  return { projektek, rajzok, poziciok, tipusok, esemenyek, felhasznalok, betoltve };
}

/* ---------- Korábbi, csak a készüléken tárolt adat → szerver táblák (helyi mód első indulásakor) ---------- */
/**
 * A prototípus adatának (IndexedDB 'adat' kulcs) átalakítása a szerver tábláira. Előbb a régi szerkezetek átalakítása
 * (migralas), utána a leképezés. user: a helyi felhasználó (a naplóban ő a rögzítő, a régi név megmarad: ki_nev).
 */
export function regiAdatbol(db, user) {
  migralas(db);
  const n = (t, rows) => rows.map(r => L().normalize(t, r));
  const pozProj = new Map(db.poziciok.map(p => [p.id, p.projektId]));
  return {
    Felhasznalok: n('Felhasznalok', [user]),
    Projektek: n('Projektek', db.projektek.map(p => ({ projekt_id: p.id, nev: p.nev, ugyfel: p.ugyfel, helyszin: p.helyszin, allapot: p.allapot,
      oszlopok: JSON.stringify(p.oszlopok || []), tipus_oszlopok: JSON.stringify(p.tipusOszlopok || []), letrehozva: p.letrehozva, modositva: p.letrehozva }))),
    Lepesek: n('Lepesek', db.projektek.flatMap(p => p.lepesek.map((l, i) => ({ lepes_id: l.id, projekt_id: p.id, sorrend: i + 1, nev: l.nev, szin: l.szin })))),
    Rajzok: n('Rajzok', db.rajzok.map(r => ({ rajz_id: r.id, projekt_id: r.projektId, nev: r.nev, epulet: r.epulet, szint: r.szint, W: r.W, H: r.H,
      verzio: r.verzio || 1, meret: r.meret, drive_id: '', felveve: r.felveve, csere: r.csere || '', modositva: r.csere || r.felveve }))),
    Poziciok: n('Poziciok', db.poziciok.map(p => ({ poz_id: p.id, projekt_id: p.projektId, fajta: p.fajta, jel: p.jel, tipus: p.tipus, szel: p.szel,
      mag: p.mag, epulet: p.epulet, szint: p.szint, adatok: JSON.stringify(p.adatok || {}), rajz_id: p.rajzId || '', x: p.rajzId ? p.x : 0,
      y: p.rajzId ? p.y : 0, letrehozva: p.letrehozva, letrehozta: user.email, modositva: '', torolve: p.torolve || '' }))),
    Tipusok: n('Tipusok', db.tipusok.map(t => ({ tipus_id: t.id, projekt_id: t.projektId, jel: t.jel, szel: t.szel, mag: t.mag, adatok: JSON.stringify(t.adatok || {}) }))),
    Esemenyek: n('Esemenyek', db.esemenyek.filter(e => pozProj.has(e.poz)).map(e => ({ esemeny_id: e.id, poz_id: e.poz, projekt_id: pozProj.get(e.poz),
      tipus: e.tipus, lepes_id: e.lepes || '', ki: user.email, ki_nev: e.ki || user.nev, mikor: e.mikor, rogzitve: e.mikor, megj: e.megj || '' }))),
  };
}

/** Korábbi adatszerkezetek átalakítása (a régi adat elvesztése nélkül) – a prototípus helyi adatán. */
function migralas(db) {
  db.projektek = db.projektek || []; db.rajzok = db.rajzok || []; db.poziciok = db.poziciok || []; db.esemenyek = db.esemenyek || [];
  // 1) Projekt szint előtti adat (egy közös műveletsor és lista) → „Első projekt”
  if (!db.projektek.length && (db.rajzok.length || db.lista)) {
    const p = { id: uid('j'), nev: 'Első projekt', ugyfel: '', helyszin: '', allapot: 'aktiv',
      lepesek: db.lepesek || sablonLepesek(0), lista: db.lista || null, letrehozva: most() };
    db.projektek = [p];
    db.rajzok.forEach(r => { r.projektId = p.id; });
    delete db.lepesek; delete db.lista;
    if (p.lista) for (const [sz, re] of [['epulet', /^epulet/], ['szint', /^szint/]]) {
      const o = !p.lista.oszlopok.some(x => x.szerep === sz) && p.lista.oszlopok.find(x => x.szerep === 'adat' && re.test(norm(x.nev)));
      if (o) o.szerep = sz;
    }
  }
  for (const p of db.projektek) p.lepesek.forEach((l, i) => { if (!l.szin) l.szin = alapSzin(i, p.lepesek.length); });
  // 2) Külön pozíciólista + jelölők (a jel kötötte össze) → egy pozíció = egy sor. A jelölő azonosítója megmarad
  //    (a napló arra hivatkozik); a listasor adatai a jelölőre kerülnek, a le nem rakott sorokból új pozíció lesz.
  if (!db.tipusok) db.tipusok = [];
  const regi = db.poziciok.some(p => !('projektId' in p)) || db.projektek.some(p => p.lista || (p.tipusok && !Array.isArray(p.tipusok)));
  if (!regi) return;
  const rajzProj = new Map(db.rajzok.map(r => [r.id, r.projektId]));
  for (const p of db.poziciok) {
    if ('projektId' in p) continue;
    Object.assign(p, { projektId: rajzProj.get(p.rajzId) || null, fajta: 'pozicio', jel: p.nev || '', tipus: '', szel: '', mag: '', epulet: '', szint: '', adatok: {} });
    delete p.nev;
  }
  db.poziciok = db.poziciok.filter(p => p.projektId);
  const sorAdat = (oszlopok, s) => {
    const rec = { adatok: {} };
    for (const o of oszlopok) {
      const v = String(s[o.nev] ?? '').trim();
      if (o.szerep === 'adat') { if (v) rec.adatok[o.nev] = v; } else if (MEZOK.includes(o.szerep)) rec[o.szerep] = v;
    }
    return rec;
  };
  for (const pr of db.projektek) {
    const l = pr.lista;
    pr.oszlopok = l ? l.oszlopok.filter(o => o.szerep === 'adat').map(o => o.nev) : (pr.oszlopok || []);
    if (l) {
      const jelolok = db.poziciok.filter(p => p.projektId === pr.id);
      const hasznalt = new Set();
      for (const s of l.sorok) {
        const rec = sorAdat(l.oszlopok, s);
        if (ures(rec.jel) || hasznalt.has(kulcs(rec.jel))) continue;
        hasznalt.add(kulcs(rec.jel));
        const j = jelolok.find(p => !p.torolve && kulcs(p.jel) === kulcs(rec.jel));
        if (j) Object.assign(j, { tipus: '', szel: '', mag: '', epulet: '', szint: '', ...rec, jel: j.jel });
        else db.poziciok.push({ id: uid('p'), projektId: pr.id, fajta: 'pozicio', jel: '', tipus: '', szel: '', mag: '', epulet: '', szint: '',
          adatok: {}, ...rec, rajzId: null, x: null, y: null, letrehozva: most() });
      }
    }
    delete pr.lista;
    const t = pr.tipusok;
    pr.tipusOszlopok = t && !Array.isArray(t) ? t.oszlopok.filter(o => o.szerep === 'adat').map(o => o.nev) : (pr.tipusOszlopok || []);
    if (t && !Array.isArray(t)) {
      for (const s of t.sorok) {
        const rec = sorAdat(t.oszlopok, s);
        if (!ures(rec.jel)) db.tipusok.push({ id: uid('t'), projektId: pr.id, jel: rec.jel, szel: rec.szel || '', mag: rec.mag || '', adatok: rec.adatok });
      }
    }
    delete pr.tipusok;
  }
}
