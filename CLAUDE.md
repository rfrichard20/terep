# Terep app – munkaszabályok

- Háttér és döntések: `privat/TEREP_APP_EGYEZTETES.md` (a Raktár munkamenetében készült átadó; csak helyben, a repóban nincs). A Raktár app
  (a szomszédos `..\Raktar_Claude` mappa) minta és kódforrás, de **a két app külön marad**.
- A felhasználó magyarul kommunikál; a felület, a kódbeli megjegyzések és a dokumentáció is magyar.
  Nagyobb tervezési döntések előtt egyeztetni kell vele.
- **Mielőtt új függvényt, CSS osztályt vagy felületi elemet írsz, nézd meg a `FEJLESZTES.md` jegyzéket**, és ami ott van,
  azt használd. Ha mégis újat kell írni, vedd fel a jegyzékbe ugyanabban a változtatásban.
- Fejlesztés a helyi szerveren (`.claude/launch.json` → „terep”, http://localhost:8081); az élesítést a felhasználó végzi.
  Minden változtatást asztali és mobil (375 px) nézetben is ellenőrizni kell.
- `web/` változásakor `web/sw.js` `VERSION` +1.
- Közös origin a Raktárral (GitHub Pages): minden localStorage-kulcs `terep_` előtagú, az IndexedDB neve `terep`,
  a service worker gyorsítótára `terep-` előtagú, és csak a saját (előtagú) gyorsítótárait törölheti.
- **Valódi ügyfélrajz nem kerülhet a `web/` mappába** (az nyilvános lesz). Helyi teszthez a `rajzok/` mappa való
  (`.gitignore`-ban), a telefonon a fájlválasztó. A `web/minta/` csak szintetikus rajzot tartalmazhat
  (`eszkozok/mintarajz.ps1` állítja elő).
- PDF-megjelenítés: PDFium (WebAssembly, @embedpdf/pdfium 2.14.4) helyi másolata a `web/vendor/pdfium/` mappában,
  háttérszálon (`web/js/pdf-worker.js`). A PDF.js-t lecseréltük: CAD-rajzon (>1 M művelet) egy menet ~1 mp volt,
  PDFium-mal 10–70 ms. Ne módosítsd a vendor fájlokat; verzióváltáskor az egész mappát cseréld.
  A CSP-ben a `'wasm-unsafe-eval'` ehhez kell (Safari 16+).
- Backend: `apps-script/Code.gs` (belépés, Sheet I/O, Drive, telepítés) + `apps-script/Logic.gs` (`TerepLogic`: séma, jogosultság,
  műveletek – tiszta JS, böngészőben is tesztelhető). A `GOOGLE_CLIENT_ID` a repóban üres marad (a felhasználó tölti ki).
  Üzembe helyezés: `UZEMBE_HELYEZES.md`. A felhasználó élesít; a backend módosítása után új telepítési verzió kell.
  **A `Logic.gs` a kliensben is fut: `web/js/logic.js` azonos tartalmú másolat** – a Logic.gs módosítása után másold át
  (`Copy-Item apps-script\Logic.gs web\js\logic.js`).
- Kliens: `config.js` (üres `API_URL` → helyi mód, localhost-on mindig, kivéve `?live`) → `backend.js` → `store.js` (pillanatkép +
  kimenő sor + szinkron, offline) → `data.js` (a felület ezt használja; írás = művelet). Részletek: `FEJLESZTES.md`.
- Biztonsági audit és javításai: `privat/BIZTONSAGI_AUDIT.md` (csak helyben; a Raktáréval azonos módszer). A szerver minden műveletet maga ellenőriz
  (`TerepLogic`) – a felületen elrejtett gomb nem védelem. Minden szöveg a `html` sablonon át kerüljön az oldalra (`raw` csak saját,
  állandó tartalomra).
- **Git / GitHub:** a mappa Git-repó (`rfrichard20/terep`, **nyilvános**), a `main` ágra feltöltött `web/` mappát a GitHub Actions
  teszi ki a Pages-re → **a push élesítés, csak a felhasználó kifejezett kérésére**. Commitolni lehet (rövid, magyar üzenet).
  A `.gitignore` **alapból mindent tilt**, csak a név szerint engedélyezett gyökérfájlok / mappák kerülnek fel; új nyilvános fájlt
  szándékosan kell felvenni a listára. Belső anyag (jegyzet, audit, export) helye a **`privat/`** mappa, valódi ügyfélrajzé a `rajzok/`
  (egyik sem kerül fel). A `web/` maga a nyilvános oldal: oda belső fájl soha ne kerüljön.
  Git: a GitHub Desktop beépített példánya (`$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe`), nincs a PATH-on.
- PowerShell 5.1: fájlírásnál BOM nélküli UTF-8 (`[IO.File]::WriteAllText(..., (New-Object Text.UTF8Encoding $false))`).
- PowerShell: a magyar „ ” idézőjeleket a PowerShell saját idézőjelnek veszi, ezért ilyen szöveget tartalmazó cserét
  az Edit eszközzel kell végezni.
