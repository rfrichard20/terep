# Terep

Szerelők munkájának követése alaprajzra helyezett pozíciójelölőkkel.

Két működési mód (`web/js/config.js`):
- **Szerveres** (a Raktár mintájára): Google Sheet + Apps Script (`apps-script/`), Google-belépés, szerepkörök (admin, iroda, szerelő,
  külsős), rajzok a Drive-on. Offline is működik: a megnyitott projekt adatai és rajzai a készüléken maradnak, a rögzítések a kapcsolat
  helyreálltakor töltődnek fel. Üzembe helyezés: `UZEMBE_HELYEZES.md`.
- **Helyi** (nincs megadva szerver; a saját gépen, localhost-on mindig ez, kivéve `?live`): belépés nélkül, minden adat a böngészőben.
  Ugyanaz a logika fut (TerepLogic), mint a szerveren.

## Indítás helyben

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Majd: http://localhost:8081 (a Raktár 8080-as portja mellett is fut). A helyi gépen a service worker nem regisztrál,
így nincs gyorsítótár-gond fejlesztés közben.

## Mit tud

- Projektek: a kezdőlapon felül a kedvenc (csillagos) projektek kártyái állapotsávval, alatta az összes projekt kereshető,
  szűrhető, rendezhető listája; a projekten belül Rajzok (épület szerint csoportosítva), Pozíciók,
  Projekt (adatok, állapot, pozíciólista, saját műveletsor). A rajzhoz épület és szint (szöveg, pl. „1B”) adható meg;
  ha a pozíciólistában is van épület/szint oszlop, lerakáskor csak az ott lévő pozíciókat kínálja fel.
- **Pozíció = hely, elem = ami oda kerül** (v2, `ATALAKITAS_V2.md`): egy pozíción (jelölő a rajzon) több elem is lehet (pl. zsalúzia +
  szúnyogháló, távirányító), mindegyik a saját termékfajtájának lépéseivel. A termékfajták cégszintű listája a **Termékfajták** oldalon (admin):
  név, szín, alap műveletsor (sablon), vezérlő-e; a projekt műveletsora fajtánként módosítható (Projekt oldal, „+ Termékfajta”).
  A jelölő színe a legkevésbé kész elemé, több elemnél a kör körüli ívek elemenként mutatják az állapotot. Több fajtánál a lépésekhez kötött
  nézetek (Áttekintő, Pozíciók, Típusok, Teljesítmény, jelmagyarázat) fejlécében fajtaválasztó van. A hiba, a megjegyzés és a napló a helyé.
- **Kivágás** (iroda): a rajzon a kivágás gombbal (vagy a rajz adatainál) téglalappal kijelölhető a lényeges rész – utána csak az
  látszik (nagy rajznál gyorsabb is). „Új rajzként…”: a PDF egy másik része külön rajz lesz (pl. két torony egy rajzon), a fájl nem
  töltődik fel újra; az ott lévő jelölők átkerülhetnek. A kivágás bármikor módosítható, a jelölők a helyükön maradnak.
  A Rajzok listán és a rajz adatainál látszik a feltöltött PDF eredeti fájlneve; a közös PDF-ű (másolat) rajz neve előtt másolat ikon.
- **Homlokzati rajz:** a rajz adatainál a „Homlokzat” (pl. Észak) megadásával; lerakáskor az adott épület és homlokzat pozícióit
  kínálja fel, minden szintről (a pozíciólistában „Homlokzat” oszlop kell). Egy pozíció egy rajzon van lerakva (alaprajzon vagy homlokzaton).
- **Törlés és Lomtár** (iroda): a pozíció adatlapján „Törlés”, vagy tömegesen a kijelölésből. A törölt pozíció az elemeivel a
  **Lomtárba** kerül (a Pozíciók oldal „Lomtár” gombja): máshol sehol nem jelenik meg, onnan visszaállítható (az elemeivel, a rajzon a
  helyére; ha a jelét közben más kapta meg, új jellel). A napló megmarad.
- **Közös elem** (pl. egy védőtető két ablak fölött): az elem a saját pozícióján kívül a kapcsolt pozíciókon is megjelenik, ott is
  rögzíthetők a lépései (a bejegyzés a saját pozíciója naplójába kerül, a kapcsoltakon is látszik), és a kapcsolt jelölők színébe is
  beleszámít; a készültségben egyszer számít. Felvétel (iroda): az elemkártyán / adatlapon a „Közös…” gombbal (kereshető lista vagy
  „Kijelölés a rajzon” koppintással), vagy Excel-beillesztéskor a „Közös ezekkel” oszloppal (jelek vesszővel). A rajzon szaggatott
  vonal köti össze a kapcsolt jelölőket (a jelmagyarázatban kikapcsolható).
- Projekt áttekintő: állapot-összesítő (kattintásra szűrt Pozíciók), készültség, épület/szint bontás, nyitott hibák, legutóbbi bejegyzések.
- Pozíció adatlap (a Raktár tétel-adatlapjának mintájára) a rajzról és a listákból: típus, állapot, méret, hely, adatok;
  Szerkesztés, Megnyitás a rajzon, Levétel a rajzról, Törlés; lépések, megjegyzés, napló.
- Típusok tábla: a pozíció a típusától örökli a méretet és a tulajdonságokat (amit a pozíciónál külön megadsz, az érvényes);
  felvehető egyenként vagy Excelből; a használt, de nem definiált típusok is látszanak.
- Felület a Raktár mintájára: asztalon oldalsáv, mobilon alsó sáv (Áttekintő, Rajzok, Pozíciók, Több).
- Pozíciók oldal: a pozíciólista és a rajzokon lévő jelölők egyben – állapotonkénti összesítő (kattintásra szűr), keresés,
  típus- és rajzszűrő, rendezhető táblázat (mobilon kártyák). Sorra koppintva a rajz a pozícióra nagyít, a jelölő felvillan.

- Egyoldalas PDF-ek feltöltése (egyszerre több is, folyamatjelzővel; utána az adataik egy táblázatban), vagy a beépített szintetikus mintarajz.
- Nagyítás/mozgatás ujjal (csípés), egérgörgővel, +/− gombokkal, középső egérgombbal; a látható rész a kijelző
  tényleges felbontásán rajzolódik (éles feliratok), mozgatás közben is. Rajzolómotor: PDFium (a Chrome PDF-motorja,
  WebAssembly, háttérszálon) – CAD-rajzon nagyítva ~10–70 ms.
- **Szerkesztés** mód (iroda): koppintás a rajzra → új pozíció névvel; a jelölő húzással áthelyezhető; törlés az adatlapon.
- Színes jelölő: minden lépésnek saját színe van (a Műveletsorban állítható); a jelölő a legelőrébb tartó kész lépés
  színét veszi fel, szürke = nincs elkezdve, fehér pipa = minden lépés kész, piros gyűrű + „!” = hiba.
  Szűrő és jelmagyarázat a rajz bal felső sarkában: állapotonként ki-be kapcsolható (darabszámmal), csak hibásak,
  típus, keresés jelre/típusra; a címke tartalma választható (jel / típus / mindkettő / nincs).
- Koppintásra adatlap, kötött lépéssorrenddel: nagy „<következő lépés> – kész” gomb; „Idáig kész” a kihagyott
  rögzítés pótlására (a köztes lépéseket is rögzíti, megerősítéssel); csak az utolsó kész lépés vonható vissza.
  Hibajelzés, megjegyzés, napló (eseménynapló – a visszavonás is bejegyzés).
- Rajz frissítése (új revízió): a rajz adatainál „PDF cseréje…”; azonos méretnél a jelölők a helyükön maradnak, eltérő méretnél / aránynál
  előtte figyelmeztet.
- Beillesztés Excelből (Pozíciók / Típusok oldal): alapból bővít – az új jelek a végére kerülnek, az egyezőket kiírja (megtartja vagy frissíti);
  a teljes csere külön választható, előtte jelzi, mely lerakott jelölők maradnának adat nélkül.
- Pozíciólista beillesztése Excelből (jel, termékfajta, típus, szélesség, magasság, darab, épület, szint, helyiség + tetszőleges további
  oszlopok – hely adat vagy elem adat). Egy sor = egy elem; az azonos jelű sorok egy pozícióba kerülnek. A jelölő a jele
  (neve) alapján kapcsolódik a sorhoz: a címkén „A1A-114 · T02”, az adatlapon nagyban a típus és a méret, a többi
  lenyitható. Lerakáskor a még le nem rakott jeleket ajánlja fel, a tétel előnézetével. Típus nélküli listánál minden sor egyedi.
- Projektenként és termékfajtánként szerkeszthető műveletsor (a fajta sablonjából), lépésenként súllyal: a készültség a kész lépések súlya
  szerint számol (pl. szerelés 60%, programozás 30%, átadás 10%); súly nélkül a lépések egyenlő arányban számítanak. Ha új lépés kerül egy már kész lépés elé, mentéskor
  felajánlja a hiányzó lépések pótlását a pozíciókon.
- Fotók: a pozíció adatlapján a „Fotó” gombbal (kamera vagy galéria) bejegyzésenként legfeljebb 5 fotó csatolható a hibához,
  megjegyzéshez vagy lépéshez. A telefon kicsinyíti (kb. 1600 px), offline is rögzíthető (a bejegyzés után töltődik fel);
  a Drive-on a projekt „Fotók” mappájába kerülnek. Előnézet a naplóban és a hibánál, koppintásra nagyban.
- Teljesítmény: ki mennyit végzett el egy időszakban (lépésenként, típusonként, tételesen), másolható Excelbe – elszámoláshoz,
  saját teljesítmény követéséhez. Szerelő és külsős csak a sajátját látja.
- Külsős szerelő: az Áttekintő helyett „Munkám” kezdőoldal (saját munka, nyitott hibák, gyors gombok); a Típusok és a Projekt menü rejtett.
- Tömeges művelet: a Pozíciók listán („Kijelölés”, a szűrtek egyben is) vagy a rajzon (pipa gomb: koppintás, téglalap, „Láthatók”)
  kijelölt pozíciókon lépés rögzítése / visszavonása, hiba, megjegyzés; az irodának adat átírása és levétel a rajzról is.
- Szerveres módban: belépés oldal, szinkronjelző a felső sávban (függő rögzítések száma, offline), Fiók oldal (szinkron, függő és
  elutasított változtatások, letöltött rajzok, kijelentkezés). Az irodai funkciók csak az iroda / admin szerepkörnek látszanak.

## Telefonos teszt

A `serve.ps1` csak a saját gépről érhető el. Telefonon a legegyszerűbb a GitHub Pages-re feltöltött `web/` mappa
(https, így a service worker és az offline mód is kipróbálható). **Valódi ügyfélrajz ne kerüljön a `web/` mappába** –
a telefonon a „PDF megnyitása…” gombbal a saját fájlokból nyitható meg, az nem kerül fel sehova.

Siker mércéje: a legnagyobb/legsűrűbb rajz feliratai nagyítva olvashatók Androidon és iPhone-on, a mozgatás folyamatos.

## Mintarajz újragenerálása

```
powershell -ExecutionPolicy Bypass -File eszkozok\mintarajz.ps1
```
