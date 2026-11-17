# Terep – üzembe helyezés (szerver)

A Raktár mintájára: **saját Google Sheet + Apps Script** (külön a Raktártól), ugyanazzal a céges fiókkal.
A Google-belépéshez a **Raktár OAuth kliense** használható (közös Google-belépés, de külön felhasználólista és munkamenet).

> Amíg a `web/js/config.js`-ben nincs megadva a szerver címe (`API_URL`), az app **helyi módban** fut: belépés nélkül,
> minden adat csak az adott böngészőben. A szerver üzembe helyezése után a 4. lépés köti össze a kettőt.

## 1. Google Sheet + Apps Script

1. A céges fiókkal új táblázat: https://sheets.new – név: „Terep – adatbázis”.
2. **Bővítmények → Apps Script**, a projekt neve: „Terep backend”.
3. Fájlok:
   - a `Kód.gs` / `Code.gs` tartalmát cseréld le az `apps-script/Code.gs` tartalmára;
   - **+ → Szkript**: `Logic` nevű fájl, tartalma az `apps-script/Logic.gs`;
   - **Projektbeállítások** (fogaskerék) → „Az appsscript.json jegyzékfájl megjelenítése” bekapcsolva, majd az
     `appsscript.json` tartalmát cseréld le a repó `apps-script/appsscript.json` tartalmára. Mentés.
4. Első futtatás: függvényválasztó → `setup` → **Futtatás**. Engedélyt kér (Sheet, külső kérés, **Drive**, e-mail);
   „A Google nem ellenőrizte ezt az alkalmazást” → Speciális → Ugrás ide → Engedélyezés (a saját szkripted).
   - Létrejönnek a lapok: `Felhasznalok`, `Projektek`, `Lepesek`, `Rajzok`, `Poziciok`, `Tipusok`, `Esemenyek`;
   - a `Felhasznalok` lapon te leszel az admin;
   - a Drive-on létrejön a **„Terep – rajzok (NE oszd meg)”** mappa – ide kerülnek a PDF-ek. Ne oszd meg senkivel:
     a készülékek csak a szerveren keresztül, jogosultság-ellenőrzés után kapják meg a rajzokat.

> A Drive-engedély miatt a szkript a tulajdonos teljes Drive-ját elérhetné, de csak a saját mappájában dolgozik
> (létrehoz, olvas, és rajztörléskor a kukába tesz). A felhasználók ezt az engedélyt nem kapják meg: a szkript a
> tulajdonos nevében fut.

## 2. Google-belépés (a Raktár OAuth kliense)

1. https://console.cloud.google.com → a Raktárhoz létrehozott projekt → **Hitelesítő adatok** → a „Raktár web” OAuth kliens.
2. **Engedélyezett JavaScript-források** közé vedd fel: `http://localhost:8081` (helyi teszt). A GitHub Pages
   domain (`https://FELHASZNALONEV.github.io`) már szerepel – ugyanaz a domain, a Terep is ott fut majd.
3. Az **Ügyfélazonosítót** (`….apps.googleusercontent.com`) írd be a `Code.gs` elején:
   ```js
   var GOOGLE_CLIENT_ID = '….apps.googleusercontent.com';
   ```
   (A repóban üres marad.)

## 3. A szerver közzététele

1. Apps Script → **Telepítés → Új telepítés** → típus: **Webalkalmazás**; Futtatás mint: **Én**; Hozzáférés: **Bárki**.
2. Másold ki a **Webalkalmazás URL-jét** (`https://script.google.com/macros/s/…/exec`).
3. Ellenőrzés: böngészőben megnyitva ezt kell látnod: `{"ok":true,"app":"terep",…}`.

> A „Bárki” csak azt jelenti, hogy a böngésző elérheti a végpontot. Minden kérésnél a szerver ellenőrzi a
> Google-belépést és a `Felhasznalok` lapot; aki nincs a listán (vagy inaktív), annak semmit nem ad ki.

**Rajzok és fotók a Drive-on:** a „Terep – rajzok (NE oszd meg)” mappában projektenként egy almappa (a projekt nevével); a rajzcsere előtti
fájlok a projekt „Régi verziók” almappájába, a fotók a projekt „Fotók” almappájába kerülnek (az előnézetek a „Fotók / kicsi” mappába).
A fotók adatai a Sheet `Fotok` lapján (az első feltöltéskor jön létre, vagy a Terep → Táblák létrehozása menüvel). A korábban feltöltött fájlokat a Sheet **Terep → Rajzok mappákba rendezése**
menüpontja egyszer rendezi el (többször is futtatható).

**A `Code.gs` / `Logic.gs` minden későbbi módosítása után:** Telepítés → Telepítések kezelése → ceruza →
Verzió: **Új verzió** → Telepítés. Az URL nem változik.

## 4. A webes felület összekötése a szerverrel

A `web/js/config.js`-ben:

```js
API_URL: LOCAL ? '' : 'https://script.google.com/macros/s/…/exec',   // a 3. lépés URL-je
GOOGLE_CLIENT_ID: '….apps.googleusercontent.com',                   // ugyanaz, mint a Code.gs-ben
```

- A `LOCAL ? '' :` rész marad: a saját gépen (localhost) az app így továbbra is helyi módban indul, az éles adatokhoz nem nyúl.
  **Helyi próba az éles szerverrel:** `http://localhost:8081/?live` (ehhez kell a 2. lépésben felvett `http://localhost:8081` forrás).
- Első belépés: a Google-gomb → a `Felhasznalok` lapon szereplő, aktív fiókkal. Utána a készülék 30 napig bejelentkezve marad.
- **Offline működés:** a megnyitott projekt adatai és rajzai a készüléken is megmaradnak; a lépések, hibák, megjegyzések, lerakások
  internet nélkül is rögzíthetők, és a kapcsolat helyreálltakor feltöltődnek (a szinkronjelző a jobb felső sarokban mutatja, mennyi vár).
  Internet kell: belépéshez, új rajz feltöltéséhez / rajzcseréhez, és egy projekt első megnyitásához az adott készüléken.
- Ha a szerver egy offline rögzítést nem fogad el (pl. közben valaki törölte a rajzot), a Fiók oldalon „Elutasított változtatások” alatt látszik.
- A korábban helyi módban rögzített adatok **nem kerülnek fel** automatikusan a szerverre (a szerver tiszta lappal indul).

## 5. Közzététel (GitHub Pages)

A Raktárhoz hasonlóan: külön, nyilvános repó (`rfrichard20/terep`), benne a teljes projekt (a belső jegyzeteket és a PDF-eket
a `.gitignore` kizárja). **Settings → Pages → Source: GitHub Actions**: a `.github/workflows/pages.yml` a `web/` mappát teszi ki.
Kiadás: GitHub Desktopban Commit → **Push origin** (csak a `web/` változása élesít). Cím: `https://rfrichard20.github.io/terep/`.

- Ugyanaz a domain, mint a Raktáré → a Google-belépés engedélyezett forrása (`https://rfrichard20.github.io`) már megvan.
- A két app tárolója nem ütközik (Terep: `terep_` / `terep` / `terep-` előtagok). A Raktár `sw.js`-e a `raktar-v61` óta csak a saját
  gyorsítótárait törli – **a Raktárt ezzel a verzióval töltsd fel**, különben egy Raktár-frissítés törölheti a Terep offline fájljait.
- Valódi ügyfélrajz ne kerüljön a repóba (a rajzok a Drive-on vannak).
- Frissítéskor a `web/sw.js` `VERSION` értéke mindig nő – a telefonok így kapják meg az új változatot.

## 6. Frissítés a v2 adatmodellre (pozíció = hely, elemek, termékfajták)

A v2 (`ATALAKITAS_V2.md`) új lapokat és oszlopokat használ (Kategoriak, Elemek, Kapcsolatok, Csatornak; Lepesek.kategoria_id,
Esemenyek.elem_id…). A régi adat megmarad, egy menüponttal alakul át. Sorrend:

1. **Biztonsági másolat**: a Google Sheetről Fájl → Másolat készítése (ha bármi gond lenne, ez visszaállítható).
2. Az Apps Script projektben a `Code.gs` és a `Logic.gs` cseréje az új változatra → Telepítés → Telepítések kezelése → szerkesztés →
   **Új verzió** (a cím marad).
3. A Sheet újratöltése után: **Terep → Adatbázis átalakítása (v2)**. A hiányzó lapok / oszlopok létrejönnek, minden pozíció kap egy elemet
   (a típusa, mérete vele megy), a lépések és a bejegyzések az „Árnyékoló” termékfajtához kerülnek. Többször is futtatható (a már
   átalakított adatot nem változtatja). A végén összesítést ír ki.
4. A `web` mappa élesítése: Commit → Push origin (`sw.js` VERSION nőtt) – a telefonok a következő megnyitáskor frissülnek.

Ha a 2. és 3. lépés közt egy régi kliens rögzít, az sem vész el: a szerver a régi műveleteket is elfogadja és az új modellre írja,
a kliens pedig minden letöltött adatot magától v2-re alakít. A termékfajták (Árnyékoló, Vezérlő + a sajátok) a **Termékfajták** oldalon
(admin) kezelhetők; egy projektbe új fajta a Projekt oldal „+ Termékfajta” gombjával kerül.

## Felhasználók és szerepkörök

Az app **Felhasználók** oldalán (admin; oldalsáv alján / mobilon a „Több” alatt), vagy egy projekt **Projekt** oldalán a
„Hozzáférés” kártyán (ki látja a projektet, külsős partner felvétele ehhez a projekthez). Az első admint a `setup` veszi fel;
utána a `Felhasznalok` lapot nem kell kézzel szerkeszteni.

| szerepkor | Mit tehet |
|---|---|
| `admin` | mindent, felhasználókat kezel |
| `iroda` | projektek, rajzok, pozíciók, típusok, műveletsor, jelölők lerakása |
| `szerelo` | lépések rögzítése, hiba, megjegyzés, fotó; terepi felmérés- és hibajelölés (a sajátját módosíthatja / törölheti); a saját lépését 24 órán belül visszavonhatja; bejegyzés legfeljebb 31 nappal visszadátumozva (offline rögzítés) |
| `kulsos` | mint a szerelő, de csak a `projektek` oszlopban felsorolt projekteket látja; kezdőoldala a „Munkám” (a projekt teljes állapota helyett) |

Projektek: „Minden projekt” (a később létrehozottak is) vagy „Csak a kijelölt projektek” (a lapon: vesszővel elválasztott
projekt-azonosítók; üresen = minden projekt, külsősnél egyik sem). Felhasználót törölni nem lehet: a kitiltás az **Aktív**
kivétele – a következő szinkronnál kijelentkezik, és a letöltött adatok törlődnek a készülékéről.

## Adatbiztonság (a Raktáréval azonos megoldások)

- Belépés: Google ID token → a szerver a Google-nál ellenőrzi → 30 napos, aláírt (HMAC) munkamenet.
  Kitiltás: az `aktiv` jelölő kivétele (a következő kérésnél érvényes). **Terep → Mindenki kijelentkeztetése** a Sheet menüjében.
- A szerver csak a látható projektek adatait küldi le; minden módosítást szerepkörhöz és projekthez köt.
- A naplóba a szerver írja be, ki rögzítette (nem hamisítható); a terepi időpont mellett a szerver fogadási ideje is tárolódik.
- Képlet-befecskendezés ellen: a `=`, `+`, `-`, `@` kezdetű szöveg szövegként kerül a cellába.
- A Sheetet **ne oszd meg szerkesztésre** (a jogosultságokat megkerülhetné); a rajzok mappáját se.
