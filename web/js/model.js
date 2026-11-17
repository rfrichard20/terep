// Adatmodell: állandók és átalakítás a szerver táblái (Sheet-sorok, TerepLogic.SCHEMA) és a felület modellje között.
// Tiszta függvények (nincs tárolás) – a data.js, a backend.js és a store.js is ezt használja.
//
// Felület modellje (data.js) – v2: pozíció = hely, elem = ami oda kerül (ATALAKITAS_V2.md):
//   kategoriak – { id, nev, sorrend, szin, lepesek: [{ nev, szin, suly }] (sablon), oszlopok: [név…], vezerlo, aktiv }  (termékfajták)
//   projektek  – { id, nev, ugyfel, helyszin, allapot, oszlopok (hely), elemOszlopok, tipusOszlopok, letrehozva }
//   lepesek    – { id, projektId, kategoriaId, nev, szin, suly, sorrend }  (a projekt műveletsora fajtánként)
//   rajzok     – { id, projektId, nev, epulet, szint, homlokzat (homlokzati rajznál), kivagas: { x0, y0, x1, y1 } | null (oldalarány),
//                  forras (közös PDF: a forrás rajz id-je, vagy ''), fajlnev (a feltöltött PDF eredeti neve), W, H, verzio, meret, felveve, csere }
//   poziciok   – { id, projektId, fajta, jel, epulet, szint, helyiseg, homlokzat, adatok: {}, rajzId|null, x, y, letrehozva, letrehozta }  (hely)
//   elemek     – { id, projektId, poz, kategoriaId, tipus, szel, mag, db, adatok: {}, sorrend, letrehozta }
//   tipusok    – { id, projektId, kategoriaId, jel, szel, mag, adatok: {} }
//   esemenyek  – { id, poz, elem (''= a hely), projektId, tipus, lepes?, ki (név), kiEmail, mikor, rogzitve, megj? }  – időrendben
//   fotok      – { id, esemeny, poz, projektId, ki, kiEmail, mikor, fuggo }  (fuggo: még a készüléken, feltöltésre vár)
//   kapcsolatok – { id, projektId, tipus, forras, csatorna, cel, allapot, megj }   csatornak – { id, projektId, elem, sorszam, nev }
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
/** A pozíció (hely) rögzített mezői. */
export const HELY_MEZOK = ['jel', 'epulet', 'szint', 'helyiseg', 'homlokzat'];
/** Az elem rögzített mezői. */
export const ELEM_MEZOK = ['tipus', 'szel', 'mag', 'db'];
/** A beillesztéskor / szerkesztéskor használt összes rögzített mező (hely + elem). */
export const MEZOK = ['jel', 'tipus', 'szel', 'mag', 'epulet', 'szint', 'helyiseg', 'homlokzat', 'db'];
export const most = () => new Date().toISOString();
export const ures = v => !String(v ?? '').trim();
/** Összehasonlítási kulcs (jel, épület, szint): kis-/nagybetű és szóköz a szélén nem számít. */
export const kulcs = s => String(s ?? '').trim().toLowerCase();

/* ---------- Szerver → felület ---------- */
const json = (s, def) => (L() ? L().jsonOf(s, def) : def);
/** Kivágás: „x0,y0,x1,y1” → { x0, y0, x1, y1 } vagy null (hiányzó / hibás). */
export function kivagasOf(s) {
  const n = String(s || '').split(',').map(Number);
  if (n.length !== 4 || n.some(x => !isFinite(x) || x < 0 || x > 1) || n[2] - n[0] < 0.02 || n[3] - n[1] < 0.02) return null;
  return { x0: n[0], y0: n[1], x1: n[2], y1: n[3] };
}
/**
 * A szerver adatából (snapshot: Projektek, Lepesek, Felhasznalok + egy vagy több projekt Rajzok, Poziciok, Tipusok, Esemenyek)
 * a felület modellje. betoltve: azon projektek, amelyeknek a részletes adata megvan.
 */
export function fromServer(d) {
  d = d || {};
  // A szín stílusba kerül (style="background:…"): csak #rrggbb fogadható el, akkor is, ha a Sheetben kézzel írták át
  const joSzin = (s, def = SZIN_NINCS) => (/^#[0-9a-f]{6}$/i.test(s) ? s : def);
  const kategoriak = (d.Kategoriak || []).map(k => ({ id: k.kategoria_id, nev: k.nev, sorrend: Number(k.sorrend) || 0, szin: joSzin(k.szin, '#2f7fd8'),
    lepesek: json(k.lepesek, []).map(l => ({ nev: String(l.nev || ''), szin: joSzin(l.szin), suly: Number(l.suly) || 0 })).filter(l => l.nev),
    oszlopok: json(k.oszlopok, []), vezerlo: !!k.vezerlo && k.vezerlo !== 'false', aktiv: k.aktiv !== false && k.aktiv !== 'false' }))
    .sort((a, b) => a.sorrend - b.sorrend || a.nev.localeCompare(b.nev, 'hu'));
  const lepesek = (d.Lepesek || []).slice().sort((a, b) => a.sorrend - b.sorrend).map(l => ({ id: l.lepes_id, projektId: l.projekt_id,
    kategoriaId: l.kategoria_id || '', nev: l.nev, szin: joSzin(l.szin), suly: Number(l.suly) || 0, sorrend: Number(l.sorrend) || 0 }));
  const projektek = (d.Projektek || []).map(p => ({ id: p.projekt_id, nev: p.nev, ugyfel: p.ugyfel || '', helyszin: p.helyszin || '',
    allapot: p.allapot || 'aktiv', oszlopok: json(p.oszlopok, []), elemOszlopok: json(p.elem_oszlopok, []), tipusOszlopok: json(p.tipus_oszlopok, []),
    letrehozva: p.letrehozva }));
  const rajzok = (d.Rajzok || []).map(r => ({ id: r.rajz_id, projektId: r.projekt_id, nev: r.nev, epulet: r.epulet || '', szint: r.szint || '',
    homlokzat: r.homlokzat || '', kivagas: kivagasOf(r.kivagas), forras: r.forras || '', fajlnev: r.fajlnev || '',
    W: Number(r.W) || 0, H: Number(r.H) || 0, verzio: Number(r.verzio) || 1, meret: Number(r.meret) || 0, felveve: r.felveve, csere: r.csere || '' }));
  const poziciok = (d.Poziciok || []).filter(p => !p.torolve).map(p => ({ id: p.poz_id, projektId: p.projekt_id, fajta: p.fajta || 'pozicio',
    jel: p.jel || '', epulet: p.epulet || '', szint: p.szint || '', helyiseg: p.helyiseg || '', homlokzat: p.homlokzat || '',
    adatok: json(p.adatok, {}), rajzId: p.rajz_id || null, x: p.rajz_id ? Number(p.x) : null, y: p.rajz_id ? Number(p.y) : null,
    letrehozva: p.letrehozva, letrehozta: p.letrehozta || '' }));
  const elo = new Set(poziciok.map(p => p.id));
  // Lomtár: a törölt pozíciók (csak „pozíció” fajta; az iroda kapja meg) – a pozícióval együtt törölt elemeik nevével
  const toroltElemek = new Map();
  for (const e of d.Elemek || []) if (e.torolve) { const k = e.poz_id + '|' + e.torolve; if (!toroltElemek.has(k)) toroltElemek.set(k, []); toroltElemek.get(k).push(e); }
  const lomtar = (d.Poziciok || []).filter(p => p.torolve && (p.fajta || 'pozicio') === 'pozicio').map(p => ({
    id: p.poz_id, projektId: p.projekt_id, jel: p.jel || '', epulet: p.epulet || '', szint: p.szint || '', helyiseg: p.helyiseg || '',
    rajzId: p.rajz_id || null, torolve: p.torolve,
    elemek: (toroltElemek.get(p.poz_id + '|' + p.torolve) || []).map(e => ({ kategoriaId: e.kategoria_id, tipus: e.tipus || '', db: Number(e.db) || 1 })) }))
    .sort((a, b) => String(b.torolve).localeCompare(String(a.torolve)));
  const elemek = (d.Elemek || []).filter(e => !e.torolve && elo.has(e.poz_id)).map(e => ({ id: e.elem_id, projektId: e.projekt_id, poz: e.poz_id,
    kategoriaId: e.kategoria_id, tipus: e.tipus || '', szel: e.szel || '', mag: e.mag || '', db: Number(e.db) || 1, adatok: json(e.adatok, {}),
    sorrend: Number(e.sorrend) || 0, letrehozta: e.letrehozta || '' })).sort((a, b) => a.sorrend - b.sorrend);
  const tipusok = (d.Tipusok || []).map(t => ({ id: t.tipus_id, projektId: t.projekt_id, kategoriaId: t.kategoria_id || '', jel: t.jel,
    szel: t.szel || '', mag: t.mag || '', adatok: json(t.adatok, {}) }));
  const eloElem = new Set(elemek.map(e => e.id));
  const kapcsolatok = (d.Kapcsolatok || []).filter(k => !k.torolve && eloElem.has(k.forras_elem) && eloElem.has(k.cel_elem)).map(k => ({
    id: k.kapcsolat_id, projektId: k.projekt_id, tipus: k.tipus, forras: k.forras_elem, csatorna: k.csatorna_id || '', cel: k.cel_elem,
    allapot: k.allapot || 'tervezett', megj: k.megj || '' }));
  const csatornak = (d.Csatornak || []).filter(c => !c.torolve && eloElem.has(c.elem_id)).map(c => ({ id: c.csatorna_id, projektId: c.projekt_id,
    elem: c.elem_id, sorszam: Number(c.sorszam) || 0, nev: c.nev || '' })).sort((a, b) => a.sorszam - b.sorszam);
  // Időrend a terepi idő szerint (az offline rögzített bejegyzések később érkezhetnek a szerverre)
  const esemenyek = (d.Esemenyek || []).map((e, i) => ({ e, i })).sort((a, b) => (a.e.mikor < b.e.mikor ? -1 : a.e.mikor > b.e.mikor ? 1 : a.i - b.i))
    .map(({ e }) => {
      const o = { id: e.esemeny_id, poz: e.poz_id, elem: e.elem_id || '', projektId: e.projekt_id, tipus: e.tipus, ki: e.ki_nev || e.ki, kiEmail: e.ki,
        mikor: e.mikor, rogzitve: e.rogzitve };
      if (e.lepes_id) o.lepes = e.lepes_id;
      if (e.megj) o.megj = e.megj;
      return o;
    });
  const fotok = (d.Fotok || []).filter(f => !f.torolve).map(f => ({ id: f.foto_id, esemeny: f.esemeny_id, poz: f.poz_id, projektId: f.projekt_id,
    ki: f.ki_nev || f.ki, kiEmail: f.ki, mikor: f.mikor, fuggo: false }));
  const betoltve = new Set(d.mind ? projektek.map(p => p.id) : d.projekt_id && d.Poziciok ? [d.projekt_id] : []);
  // Felhasználók: adminnak minden adat, másnak csak e-mail és név (a szerver így küldi)
  const felhasznalok = (d.Felhasznalok || []).map(u => ({ email: u.email, nev: u.nev || '', szerepkor: u.szerepkor || '',
    aktiv: u.aktiv !== false && u.aktiv !== '', projektek: String(u.projektek || '').split(',').map(s => s.trim()).filter(Boolean),
    megjegyzes: u.megjegyzes || '' }));
  return { kategoriak, projektek, lepesek, rajzok, poziciok, elemek, tipusok, esemenyek, felhasznalok, fotok, kapcsolatok, csatornak, lomtar, betoltve };
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
