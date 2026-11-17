# Adatmodell v2 – pozíció (hely) + elem, termékfajták, kapcsolatok

Állapot: **terv, jóváhagyásra vár** (2026-11-14). Döntések: kétszintű modell; cégszintű termékfajta-lista, projektenként
felülírható műveletsorral; a jelölő színét a legkevésbé kész elem adja; a kapcsolatok (közös elem, vezérlés) adatszerkezete most
készül, a vezérlés felülete később.

## 1. Fogalmak

| Fogalom | Jelentés | Példa |
|---|---|---|
| **Pozíció (hely)** | Egy pont a rajzon: hol van valami. Ez a jelölő. | A1A-114 (2. szint, nappali, DK homlokzat) |
| **Termékfajta** | Cégszintű kategória saját műveletsorral, súlyokkal, adatoszlopokkal. | Zsalúzia, Redőny, Szúnyogháló, Védőtető, Vezérlő |
| **Típus** | Egy termékfajtán belüli kiviteli típus (méret, tulajdonságok). | T04: zsalúzia 1750 × 2805, ZIP, motoros |
| **Elem** | Ami egy pozícióba kerül: egy termékfajta egy példánya, darabszámmal. Az **állapot (lépések) elemenként** van. | A1A-114 → 1 db T04 zsalúzia + 1 db szúnyogháló |
| **Kapcsolat** | Elem ↔ elem viszony. | „közös”: VT-3 védőtető ↔ két zsalúzia; „vezérli”: távirányító 2. csatorna → 3 motor |
| **Csatorna** | Egy vezérlő elem csatornája (névvel). | „1. szoba – mind” |

Hierarchia: Projekt → Pozíció → Elem; Termékfajta → Típus → Elem. A kapcsolatok keresztben kötnek.

## 2. Adatbázis (Sheet-lapok)

### Új lapok
- **Kategoriak** (termékfajták, cégszintű): `kategoria_id`, `nev`, `sorrend`, `szin` (a jelmagyarázatban), `lepesek` (JSON sablon:
  `[{nev, szin, suly}]`), `oszlopok` (JSON: az elem adatoszlopai), `vezerlo` (bool – a vezérlő fajták), `aktiv`, `modositva`.
- **Elemek**: `elem_id`, `projekt_id`, `poz_id`, `kategoria_id`, `tipus`, `szel`, `mag`, `db` (mennyiség, alap 1), `adatok` (JSON),
  `sorrend`, `letrehozva`, `letrehozta`, `modositva`, `torolve`.
- **Kapcsolatok**: `kapcsolat_id`, `projekt_id`, `tipus` (`kozos` | `vezerli`), `forras_elem`, `csatorna_id` (vezérlésnél),
  `cel_elem`, `allapot` (`tervezett` | `betanitva` | `ellenorizve`), `megj`, `letrehozta`, `modositva`, `torolve`.
- **Csatornak**: `csatorna_id`, `projekt_id`, `elem_id` (a vezérlő), `sorszam`, `nev`, `torolve`.

### Változó lapok
- **Poziciok** (hely): marad `poz_id`, `projekt_id`, `fajta` (jelölés fajtája: pozíció / felmérés / hibajelölés), `jel`, `epulet`, `szint`,
  `adatok` (a **hely** adatai: lakás, helyiség, homlokzat…), `rajz_id`, `x`, `y`, `letrehozva`, `letrehozta`, `modositva`, `torolve`;
  **új:** `helyiseg` (önálló mező – a vezérlés helyiség szerint csoportosít). A `tipus`, `szel`, `mag` az Elemekbe költözik.
- **Lepesek**: **új** `kategoria_id` – a műveletsor projektenként **és** termékfajtánként (a cégszintű sablonból másolódik, amikor a
  fajtát a projektben először használják; utána projektenként átírható).
- **Tipusok**: **új** `kategoria_id`.
- **Esemenyek**: **új** `elem_id` – a lépés (kész / visszavonás) mindig egy elemhez tartozik; a hiba és a megjegyzés az elemhez vagy
  az egész helyhez. A `poz_id` marad (a hely naplójához).
- **Projektek**: **új** `elem_oszlopok` (JSON) – a projektben használt elem-adatoszlopok sorrendje (a fajta oszlopai mellett).
- **Fotok**: nem változik (a bejegyzéshez tartozik).

## 3. Szabályok (TerepLogic – szerver és kliens)
- Termékfajták kezelése: **admin** (cégszintű lista). A projekt műveletsora fajtánként: **iroda**.
- Elem felvétele / módosítása / törlése: **iroda** (a felmérés / hibajelölés elemeit a szerelő is, a sajátját).
- Lépés rögzítése: az elem fajtájának lépései közül; a kötött sorrend, a visszavonási szabály, a visszadátumozási korlát elemenként
  ugyanaz, mint most.
- Kapcsolat, csatorna: **iroda**; a vezérlés állapotát (`betanitva`, `ellenorizve`) a szerelő is állíthatja (a felülete később).
- Azonos jel: a pozíció jele projekten belül egyedi (mint most); egy pozícióban egy fajtából több elem is lehet (pl. 2 zsalúzia).

## 4. Állapot, készültség, jelölő
- **Elem állapota:** mint most a pozícióé – a fajta műveletsora szerint, a legelőrébb tartó kész lépés.
- **Elem készültsége:** a kész lépések súlya a fajta súlyai szerint (0–100%).
- **Pozíció (hely) állapota a rajzon:** a **legkevésbé kész eleme** adja a színt (a fajtájának lépésszínével). Ha a helyen több elem
  van, a jelölő körül kis szegmensek mutatják őket. A jelmagyarázatban fajtára szűrve („Csak zsalúziák”) az adott fajta eleme adja a
  színt, a többi fajta nélküli hely halványan látszik.
- **Projekt készültsége:** az elemek készültségének átlaga, fajtánként is (Áttekintő: összesen + fajtánként).
- **Teljesítmény:** elemenként számol (mint most a pozíciónként), fajtánként és típusonként bontva.

## 5. Felület – változások
- **Pozíció adatlap:** fejrész = a hely (jel, épület, szint, helyiség, rajz, hely adatai); alatta **elemkártyák** – mindegyik saját
  típussal, mérettel, darabszámmal és lépéssorral (egyelemes helynél pontosan olyan, mint most). „+ Elem” (iroda).
  Kapcsolatok (közös elem, vezérlés) az elemkártyán – a felület később.
- **Pozíciók lista:** soronként **egy elem** (a hely oszlopaival), szűrő: termékfajta. Egyelemes helynél ugyanaz, mint most.
- **Rajz:** jelölő a helyhez (szegmensekkel); jelmagyarázat: fajta-választó + a fajta lépései.
- **Beillesztés Excelből:** egy sor = egy elem; az azonos pozíciójelű sorok egy helyre kerülnek. Új oszlopszerepek: *Termékfajta*,
  *Darab*, *Helyiség*, *Hely adat* / *Elem adat*. Ha nincs fajta oszlop, a beillesztéskor választott fajta.
- **Típusok:** fajtánként (szűrő), a típus fajtához kötött.
- **Áttekintő, Projekt, Teljesítmény, Tömeges művelet, Munkám:** elem-alapú számolás, fajtaválasztóval. Tömeges műveletnél a rajzon
  kijelölt helyek elemei közül fajta szerint lehet szűrni.
- **Új oldal – Termékfajták** (admin): név, szín, alap műveletsor súlyokkal, adatoszlopok, „vezérlő” jelölő.
- **Projekt oldal:** a műveletsor fajtánként (a mostani szerkesztő fajtaválasztóval); „hiányzó lépések pótlása” fajtánként.

## 6. Átalakítás (migráció) – adatvesztés nélkül
1. **Szerveren menüpont: „Terep → Adatbázis átalakítása (v2)”** (előtte: Fájl → Másolat készítése a Sheetről):
   - létrehoz egy „Árnyékoló” termékfajtát (a 6 lépéses sablonnal, súly nélkül);
   - minden projekt minden **pozíció** fajtájú pozíciójából egy **elem** lesz (`elem_id` = `<poz_id>-1`): `tipus`, `szel`, `mag` átkerül,
     `db` = 1; a hely `adatok`-a a helyen marad (megjelenítéskor az elem adataival együtt látszik, mint most);
   - a projekt meglévő lépései megkapják az „Árnyékoló” `kategoria_id`-t; a típusok is;
   - a lépés-bejegyzések (`kesz`, `visszavon`) megkapják a pozíció elemének `elem_id`-jét; a hiba / megjegyzés a helyen marad;
   - többször futtatható (a már átalakított sorokat kihagyja); a végén összesítést ír ki.
2. **Helyi mód:** ugyanez induláskor magától (a helyi adatbázison).
3. **Régi kliens / offline sor:** átmenetileg a szerver elfogadja a régi alakú műveleteket is – a `poz_mentes` termékmezőit a pozíció
   egyetlen elemére írja, a régi `esemeny` (elem nélkül) a pozíció megfelelő fajtájú egyetlen eleméhez kerül. Így a telefonokon
   offline várakozó rögzítések sem vesznek el. (Egy későbbi verzióban kivezethető.)
4. Sorrend élesítéskor: Sheet-másolat → új `Code.gs` + `Logic.gs` (új telepítési verzió) → menüpont futtatása → `web` feltöltése.

## 7. Megvalósítás lépései
1. **Logic:** séma (új lapok, oszlopok), műveletek (`elem_mentes`, `elem_torles`, `kategoria_mentes`, `lepesek_mentes` fajtával,
   `kapcsolat_mentes`, `kapcsolat_torles`, `csatorna_mentes`), esemény elemhez, régi alakú műveletek fogadása, átalakító függvény
   (tiszta JS – a szerver és a helyi mód is ezt hívja). Böngészős tesztek.
2. **Code.gs:** menüpont, `setup` (új lapok), snapshot.
3. **Kliens adatréteg:** modell (`elemek`, `kategoriak`, `kapcsolatok`, `csatornak`), `data.js` API (elem- és hely-szintű állapot,
   készültség, elem-tétel), indexek.
4. **Felület:** adatlap, Pozíciók lista, rajz (jelölő, jelmagyarázat), beillesztés, Típusok, Áttekintő, Projekt, Teljesítmény,
   Tömeges, Munkám, Termékfajták oldal.
5. **Teszt:** szerverutánzat + helyi mód, átalakítás a meglévő (helyi) adaton, régi alakú műveletek; asztal + mobil.
6. **Dokumentáció**, `sw.js` VERSION, üzembe helyezési lépések.

Becslés: ez az eddigi legnagyobb lépés (több munkamenet). A felület az átalakítás után egyelemes helyeknél ugyanúgy néz ki és működik.

## 8. Ami ezután jön (nem része ennek a lépésnek)
- ~~**Közös elem felülete**~~ – kész (2026-11-15): elemkártya / adatlap „Közös…” (lista vagy kijelölés a rajzon), Excel „Közös ezekkel”
  oszlop, szaggatott vonal a rajzon; a kapcsolt pozíciókon is rögzíthető, és a jelölőszínbe is beleszámít (a készültségben egyszer).
  A vezérlés vonalai a `Viewer.setLinks`-re épülhetnek.
- **Vezérlés felülete:** vezérlők és csatornák, „vezérli” kapcsolatok, vezérlési táblázat helyiségenként, rajzréteg vonalakkal,
  ellenőrzés (vezérlő nélküli árnyékoló, 5-nél több motor egy csatornán, vegyes protokoll, betanítatlan kapcsolat).
- Felmérés / hibajelölés felülete (terepi jelölések) – az elemmodellre épül.
