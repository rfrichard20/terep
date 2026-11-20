# Fejlesztői jegyzék – közös függvények, CSS osztályok, felületi elemek

Új függvény / osztály / elem írása előtt nézd meg, van-e már ilyen. Ha újat írsz, vedd fel ide ugyanabban a változtatásban.

## Fájlok

| Fájl | Szerep |
|---|---|
| `web/js/app.js` | Váz (Raktár mintájára): útvonalak (`ROUTES`, projektkörnyezettel; `parent`: menüben nincs, a szülő aktív; `nav: false`: menüben nincs; `beallitas`: a „Beállítások” szekcióban), menü szekciókkal (`navSzekciok()`: cím nélkül a Projektek, „Projekt” a projekt nevével, „Beállítások” az oldalsáv alján; mobilon a „Több” listában szekciócímekkel), felső sáv: szinkronjelző (`renderStatus`; helyi módban „Helyi mód” jelzés magyarázattal) és monogram-gomb (`#userbtn` → Fiók, ezért a Fiók nincs a menüben), oldalcím, keresőmezők |
| `web/js/views/projektek.js` | Projektek (kezdőlap): felül a kedvencek kártyái (állapotsáv, összesítő), alatta az összes projekt listája (keresés, állapot szűrő, rendezés); kedvenc csillag (`terep_kedvencek`), új projekt |
| `web/js/views/attekinto.js` | Projekt áttekintő (a projekt kezdőoldala): csempék → szűrt Pozíciók, készültség, épület/szint bontás, hibák, bejegyzések |
| `web/js/views/pozicio.js` | `showPozicio(pozId, { rajzId, onChange, onOpen })` – a pozíció (hely) adatlapja (Raktár tétel-adatlap mintájára): egy elemnél a régi kép, több elemnél elemkártyák saját lépéssorral (`stepper(el)`, `elemKartya`); `EV_TEXT`, `pozNev(p)`, `elemCimke(e, pozId?)` (bejegyzés előtagja: az elem neve, ha a helyen több elem van, vagy más pozícióról kapcsolt közös elemé) |
| `web/js/views/lomtar.js` | Lomtár (iroda; a Pozíciók oldal „Lomtár” gombjáról): a projekt törölt pozíciói kereshető listában, „Visszaállítás” (foglalt jelnél új jelet kér) |
| `web/js/views/kozos.js` | Közös elem: `kozosSzerkeszto(elem, { rajzId })` (kereshető pozíciólista jelölőnégyzettel; „Kijelölés a rajzon”), `kozosRajzon(elem, rajzId)` (a nyitott rajzon `terep:kozos` eseménnyel, különben `#/…/rajz/<id>?kozos=<elem>` – a rajz kijelölő módja „Mentés” sávval) |
| `web/js/views/tablak.js` | Pozíciólista és típusok közös felülete: `importTabla(kind)` (egy sor = egy elem; Termékfajta oszlop / alapértelmezett fajta), `editPoz(poz, { minta })` (hely + – egy elemnél vagy újnál – az elem), `editElem(poz, elem)` (elem szerkesztése / új elem), `editSor(kind, rec, { minta })` (típus; `lista` → `editPoz`) |
| `web/js/views/tipusok.js` | Típusok oldal (a kiválasztott termékfajtában): definiált + használt-de-nem-definiált típusok, elemszám, állapotsáv |
| `web/js/views/projekt.js` | A kiválasztott projekt: adatok, állapot, pozíciólista, műveletsor termékfajtánként (`editLepesek(onDone, kat)`, „+ Termékfajta”: `ujFajta`; `lepesSzerkeszto(regi, sablonok)` → `{ body, mount, ertek }` – a lépéssor-szerkesztő, a Termékfajták oldal is ezt használja), Hozzáférés kártya (admin: ki látja; `editHozzaferes` – a korlátozott felhasználók jelölőnégyzettel), törlés |
| `web/js/icons.js` | `ICONS` – vonalas SVG ikonok (a Raktár stílusában) |
| `web/js/views/common.js` | Közös: `enterSubmits`, `ensureNev` / `editNev`, `tetelBlokk`, `meretSzoveg`, `natCompare`, `pageHead`, `fajtaValaszto(pid, id)` + `bindFajta(root, ctx, id)` (termékfajta-választó, ha a projektben több fajta van) |
| `web/js/views/rajzok.js` | Rajzok oldal: épület szerint csoportosítva, az épületek összecsukhatók (`csoport`, `rajzAdat`, `allapotSav`; állapot: `terep_rajzok` projektenként; alapból több épületnél csak a `epuletMegnyitva(epulet)` – a rajz oldal hívja – szerinti legutóbbi nyitva), állapotsáv; PDF feltöltése (több fájl is: `feltoltes(fajlok)` folyamatjelzővel, utána `rajzokAdatai(ids)` – táblázat), mintarajz; `rajzAdatai(r, cím, { csere })` (név, épület, szint, PDF cseréje); `rajzCsere` (méret-összevetés) |
| `web/js/views/rajz.js` | Rajz oldal: néző, Szerkesztés mód, szűrő és jelmagyarázat, új pozíció (épület/szintre szűkítve), adatlap, ugrás pozícióra (`?poz=`) |
| `web/js/views/poziciok.js` | Pozíciók oldal: lista + jelölők egyben, állapot-csempék, szűrő (típus, épület, szint), rendezhető táblázat → ugrás a rajzra |
| `web/js/views/fiok.js` | Fiók: belépés adatai (helyi módban a név), szinkron, függő / elutasított műveletek, letöltött rajzok, kijelentkezés, téma |
| `web/js/views/kategoriak.js` | Termékfajták (admin, helyi módban is): cégszintű lista, `editKategoria(k)` (név, szín, vezérlő, aktív, alap műveletsor = sablon, javasolt elem-oszlopok) | Felhasználók (csak admin, szerveres módban): lista, `editFelhasznalo(u, { elore })` (szerepkör, aktív, projektek: „Minden projekt” / kijelöltek), `projektSzoveg(u)` |
| `web/js/views/teljesitmeny.js` | Teljesítmény (projekten belül): időszak (`idoszakHatar(kulcs, tol, ig)`, `setIdoszak`), felhasználó (iroda), összesítő, pivot (felhasználónként, típusonként × lépés), tételes lista, „Másolás Excelbe” (TSV); szerelő / külsős csak a sajátját |
| `web/js/views/munkam.js` | Munkám – a külsős kezdőoldala az Áttekintő helyett: saját elvégzett lépések (ma / hét / hónap), gyors gombok, nyitott hibák, saját bejegyzések |
| `web/js/views/tomeges.js` | `tomegesMuvelet(ids)` – tömeges művelet a kijelölt pozíciókon (lépés rögzítése / visszavonása, hiba, hiba megoldva, megjegyzés; iroda: adat átírása, levétel); a Pozíciók listáról és a rajzról is |
| `web/js/views/belepes.js` | `renderBelepes(view)` – Google-belépés (GIS, `auto_select`; a Raktár login.js-éből), csak szerveres módban |
| `web/js/config.js` | `CONFIG`: `API_URL` (üres → helyi mód; localhost-on mindig helyi, kivéve `?live`), `GOOGLE_CLIENT_ID`, `SYNC_INTERVAL` |
| `web/js/logic.js` | **Az `apps-script/Logic.gs` pontos másolata** (`window.TerepLogic`) – a műveletek a böngészőben is ugyanazzal a logikával futnak. Logic.gs módosítása után másold át! |
| `web/js/model.js` | Állandók (színek, sablonok, `FAJTAK`, `MEZOK`, `kulcs`) és leképezés: `fromServer(snapshot)` → felület modellje; `regiAdatbol(adat, user)` (a prototípus helyi adata → szerver táblák) |
| `web/js/backend.js` | `backend`: `RemoteBackend` (Apps Script, POST text/plain) vagy `HelyiBackend` (helyi mód: TerepLogic a böngészőben, `helyi:db`); `isHelyi`, `networkError`, `helyiNev` / `setHelyiNev` |
| `web/js/store.js` | Állapot (a Raktár store.js-éből): pillanatkép + kimenő sor, szinkron, projektváltás, rajz-gyorsítótár, munkamenet |
| `web/js/viewer.js` | `Viewer` – PDF oldal megjelenítése, nagyítás/mozgatás, éles részlet-újrarajzolás, jelölők; `openPdf()` |
| `web/js/pdf-worker.js` | Háttérszál: PDFium (WASM) – PDF megnyitása, kivágás rajzolása ImageBitmap-ba |
| `web/js/foto.js` | Fotók: `kepKeszit(file)` → `{ full (1600 px), kicsi (360 px) }` JPEG (a telefonon kicsinyít, EXIF-tájolással), `elonezetek(root)` (`img[data-foto]` betöltése), `fotoSor(fotok)` (előnézet-sor HTML), `fotoNezo(ids, i, onChange)` (teljes képernyős nézegető, lapozás, törlés) |
| `web/js/data.js` | Adatréteg a felületnek: olvasás a store modelljéből, írás műveletekkel (`store.enqueue`), állapot az eseménynaplóból |
| `web/js/marker.js` | `markerSvg({ szin, mind, hiba, fajta, szegmensek }, size)` – egyszínű állapotjelölő (pipa, ha minden kész; piros gyűrű + „!”, ha hiba; több elemnél ívek a kör körül elemenként) |
| `web/kozos/` | **KÖZÖS fájlok** (Raktárral közös; forrásuk a `..\Kozos_Claude` repó, itt nem szerkeszthetők – módosítás ott, majd `Kozos_Claude\szinkron.ps1`). Jegyzékük: `..\Kozos_Claude\FEJLESZTES.md`. `ui.js` (html sablon, modal, popover, toast, formázás, keresés), `idb.js` (`createStore`), `theme.js` (téma `terep_theme` + keretbe ágyazás elleni védelem; `window.AppTheme`), `kozos.css` (Poppins, színtokenek, alapelemek, segédosztályok), `fonts/` |
| `web/js/ui.js` | Újraexportálja a `kozos/ui.js`-t (a nézetek innen importálnak) + a Terep saját segédei: `folyamat`, `fmtMB`, `uid` |
| `web/js/idb.js` | A közös tár Terep-példánya: `createStore('terep', 'terep_')` (IndexedDB `terep`, tartalék: localStorage `terep_`) |
| `web/vendor/pdfium/` | PDFium WebAssembly (@embedpdf/pdfium 2.14.4; MIT + PDFium BSD-3) – nem módosítjuk |
| `eszkozok/mintarajz.ps1` | A szintetikus tesztrajz (`web/minta/minta_alaprajz.pdf`) előállítója |

## JS – `ui.js` (a közös `kozos/ui.js` + a Terep saját segédei; a közösek leírása: `..\Kozos_Claude\FEJLESZTES.md`)

- `html\`...\`` – escape-elő sablon; `raw(s)` – megbízható HTML beillesztése (pl. saját SVG); `esc(s)`
- `initNavToggle('terep:navMini')` – összecsukható (ikonos) oldalsáv, hamburger gomb a `.topbar` elején (`app.js` elejéről hívva); leírás: `..\Kozos_Claude\FEJLESZTES.md`. A Terep saját `.nav-proj` blokkja ikonos módban elválasztó vonallá válik (`app.css`)
- `modal({ title, body, actions, wide, onMount })` → `{ el, close, done }`; mobilon teljes képernyős.
  **A `data-act` attribútumot a modal a láblécgombokhoz használja** – a törzsben saját gombokhoz `data-do` kell.
  Az átírt `name` attribútumú mező után a bezárás megerősítést kér (ezért az azonnal mentő mezők `id`-t kapnak, nem `name`-et).
- `confirmDialog(title, text, okLabel, kind)` → Promise<bool>
- `folyamat(cím)` → `{ set(szöveg, arány 0–1 | null), close() }` – folyamatjelző ablak (forgó jel, sáv; mobilon is kicsi), pl. rajzfeltöltéskor:
  minden hosszabb, a felhasználót váratató műveletnél ezt használd, hogy látszódjon, hogy történik valami
- `toast(msg, kind = 'info'|'ok'|'warn'|'error', ms)`
- `fmtDate(iso, withTime)`, `fmtTime(d)`, `fmtNum(n)`, `fmtMB(bájt)` („4,2 MB”), `sortArrow(aktív, irány)`, `norm(s)`, `matcher(q)`
- `formValues(root)` – mezők kiolvasása `name` szerint
- `popover(anchor, content, opts)`, `sec(title, body)`, `suggestInput(...)`, `copyText(text)`
- `uid(prefix)` – állandó, véletlen azonosító (pozíció, lépés, esemény, rajz)

## JS – `app.js` (váz) és az oldalak (`views/`)

- Oldal: `export default { render(view, params, ctx), close?(), refresh?() }` (`refresh`: adatváltozáskor – szinkron, saját
  rögzítés – ez fut újrarajzolás helyett; rajz.js: csak a jelölők). Adatváltozáskor (`store` 'data' esemény) az oldal újrarajzolódik,
  kivéve ha egy szövegmezőjében gépelnek (akkor a mező elhagyásakor). Nem betöltött projekt: `nincsBetoltve` üzenet.
  Belépés nélkül (szerveres mód) a `belepes.js` oldal jelenik meg menü nélkül (`body.belepes`).
- Szinkronjelző (`#sync`, `syncSzoveg()`, `renderStatus()`; a Raktárból): ikon + függő darabszám, koppintásra állapot és „Szinkronizálás most”;
  helyi módban rejtett. Kezeletlen hibák (`unhandledrejection`, pl. a szabályok elutasítják a műveletet) → `toast`.
- Jogosultság a felületen: `D.jog('iroda')` stb. – az irodai gombok (új projekt, beillesztés, szerkesztés, rajz feltöltés, Szerkesztés mód)
  csak annak látszanak, akinek joga van; a szabályokat ettől függetlenül a TerepLogic ellenőrzi (helyben és a szerveren is).
  `ctx = { pid, rerender(), go('útvonal'), pgo('projekten belüli útvonal'), purl('…') → href, setTitle(cím) }`.
  Új oldal: fájl a `views/`-ban + sor a `ROUTES`-ban (`label`, `icon`, `proj`: projekten belüli, `bottom`: asztalon az oldalsáv alján; `parent`: menüben nincs;
  `admin`: csak adminnak, szerveres módban – `engedett(r)`, a címmel közvetlenül sem érhető el; `jog`: csak ennek a szerepkörnek (helyi módban is, pl. Termékfajták); `belso`: külsősnek nem jelenik meg;
  `kulsos: { view, label, icon }`: a külsős ezt kapja helyette – `ut(r)`, pl. Áttekintő → Munkám).
- Útvonal: `#/projektek`, `#/fiok`; projekten belül `#/p/<projektId>/név/azonosító?a=b` → `params = { id, a }`
  (pl. `#/p/<pid>/rajz/<rajzId>?poz=<pozId>`). A címben lévő projekt lesz a kiválasztott (`D.setAktiv`); régi (projekt nélküli) link a kiválasztottba visz.
- Felső sáv: `#pproj` (projekt neve, kicsi) + `#ptext` (oldalcím); asztalon az oldalsávban `.nav-proj` mutatja a projektet
- Oldalfejléc: `pageHead(cím, műveletek)` (common.js) – mobilon a h1 rejtett, a cím a felső sávban (`#ptitle`)
- Keresőmezők: minden `input[type=search]` automatikusan nagyító ikont és törlőgombot kap (`enhanceSearch`, Raktár)
- `enterSubmits(el)` – egysoros párbeszédablakban az Enter megnyomja az elsődleges gombot (modal `onMount`)
- `ensureNev()` / `editNev()` – a felhasználó nevének bekérése (csak helyi módban; szerveres módban a név a belépésből jön)
- `tetelBlokk(poz, kompakt)` – a pozíció adatai (típus nagyban, méret, „További adatok” lenyitva); lerakáskor előnézet;
  `meretSzoveg(t)`, `natCompare(a, b)` (A1A-9 < A1A-10)
- rajz.js: Szerkesztés mód (ceruza gomb az eszközoszlop alján; `body.edit`; nincs tárolva: rajz elhagyásakor kikapcsol; a szerkesztő eszközök – kivágás, később több – a `#edit-tools` csoportban, csak bekapcsolt módban); szűrő: `flt` (munkamenetre), `cimke` (`terep_cimke`: jel | tipus | mind | nincs),
  `drawMarkers()` = `drawPanel()` + `applyMarkers()` (szűrőváltáskor csak `applyMarkers()` → a keresőmező fókusza megmarad); `focusPoz(pid)`
- projekt.js: `editLepesek(onDone, kat)` – más oldalról is hívható (a kiválasztott projektre, termékfajtánként); mentés után `ajanlPotlas(kat)`:
  ha egy elemen egy későbbi lépés kész, de egy korábbi nem (új lépés beszúrása, átrendezés), felajánlja a pótlást (`D.hezagok`, `D.potolHezagok`)
- Kijelölő mód (tömeges művelet): poziciok.js – „Kijelölés” gomb, `st.jelol` / `st.sel` (a szűrőtől függetlenül megmarad), fejléc-jelölőnégyzet =
  a szűrt sorok, `.sel-bar` alul; rajz.js – a nagyító gombok alatti pipa gomb (`jel.on` / `jel.sel`): koppintás a jelölőre = ki/be,
  egy ujjal húzva téglalap (`Viewer` `canSelect` / `onSelectRect`; mozgatás ilyenkor két ujjal / középső gombbal), „Láthatók” (`visibleMarkerIds()`)
- Menü: `ROUTES[..].pin` – mobilon kint az alsó sávban, a többi a „Több” gomb felugró listájában (`popover`, Raktár)
- Adatlap: a rajzról (jelölő) és a Pozíciók / Áttekintő oldalról is `showPozicio(pozId, { rajzId, onChange, onOpen })`; `pozNev(p)`;
  a szerkesztő (`editPoz(poz)`, elemre `editElem(poz, elem)`) az adatlap fölött nyílik. Lépésgombok: `data-do="next|upto|undo"` + `data-elem`. „Levétel a rajzról” = a pozíció „nincs lerakva” lesz; „Törlés”
  (szerkesztőben) = a pozíció törlése (jelöléssel, a napló megmarad)
- Lerakás (rajz.js `newPoz`): meglévő, le nem rakott jel → az kerül ide (`lerakPoz`); új jel → új pozíció; máshol lerakott jel → hiba
- poziciok.js: `st` (szűrő, rendezés – munkamenetre; fajtaváltáskor az állapotszűrő és a kijelölés törlődik); egy sor = egy elem a kiválasztott
  fajtából (az elem nélküli pozíció is egy sor; `data-id` = elem / pozíció, `data-poz` = pozíció); `fill()` csak a csempéket és a táblázatot cseréli
- Termékfajta a nézetekben: Áttekintő, Pozíciók, Típusok, Teljesítmény, Rajzok sávja és a rajz jelmagyarázata a kiválasztott fajtát mutatja
  (`D.fajta()`, választó: `fajtaValaszto` / a rajzon `#flt-fajta`); a rajzon a csak más fajtájú helyek „Más termékfajta” (`MAS`) kulcsot kapnak

## JS – adatréteg: `store.js` → `data.js`

Adatfolyam: a szerver (vagy helyi módban a `HelyiBackend`) pillanatképe (szerver-táblák, `TerepLogic.SCHEMA`) + a kimenő sor
műveletei (`TerepLogic.applyOp` a böngészőben) → `store.state.db` → `model.fromServer()` → `store.state.model` (a felület modellje)
→ `data.js` olvasó függvényei. Írás: `data.js` → műveletek (`projekt_mentes`, `poz_mentes`, `esemeny` …) → `store.enqueue(ops)`
(előbb helyben ellenőrzi; érvénytelen → `e.validation` hiba, nem kerül a sorba) → szinkron.

- `store.js`: `state` (`user, token, pid, data, at, version, outbox, rejected, syncing, online, lastError, authError, db, model`),
  `subscribe(fn)` (események: `data`, `status`, `elutasitva`), `init(pid)`, `setSession(token, user)`, `logout()` (a letöltött adat és rajzok törlődnek,
  a kimenő sor marad), `setProjekt(pid)` (a projekt tárolt adata azonnal, ha nincs: megvárja a letöltést), `enqueue(ops)`, `sync()`
  (kötegelve: `SYNC_BATCH` 100 művelet / `SYNC_BYTES` ~900 KB; hibánál újrapróbál 15 mp → 3 perc), `myOutbox()` (a bejelentkezett
  felhasználó rögzítései – közös készüléken mindenki csak a sajátját tölti fel), `dismissRejected(i)`, `discardOutboxItem(opId)`, `can(role)`,
  `syncHaRegi(ms)` (oldalváltáskor: szinkron, ha az utolsó 30 mp-nél régebbi – más eszköz módosításai hamar látszanak),
  rajzok: `pdf(rajzId)` → `{ bytes, stale }` (verzió szerint gyorsítótárazva; offline a régebbi is), `feltolt(rajz, bytes)` (csak online,
  előtte a függő műveletek felmennek), `letoltottRajzok()`; a projekt rajzai szinkron után a háttérben letöltődnek (`elotolt`).
- A szerver csak a kiválasztott projekt részletes adatát küldi (`snapshot(db, user, projektId)`) – a többi projektnél csak a név és a
  műveletsor van meg (`D.betoltve(pid)`, `projektStat` → `null`). Helyi módban minden projekt teljes (`mind: true`).

### `data.js`

- Modell (`model.js` fejléce, v2 – `ATALAKITAS_V2.md`): `kategoriak` (termékfajták, cégszintű), `projektek`, `lepesek` (lapos lista:
  `{ id, projektId, kategoriaId, nev, szin, suly, sorrend }`), `rajzok`, `poziciok`, `elemek`, `tipusok` (+`kategoriaId`), `esemenyek`
  (időrendben a terepi idő szerint; `ki` = név, `kiEmail`; `elem` – a lépés eleme), `fotok`, `kapcsolatok`, `csatornak`, `felhasznalok`,
  `lomtar` (a törölt „pozíció” fajtájú helyek a velük együtt törölt elemek adataival – a szerver csak az irodának küldi a törölt sorokat).
  **A pozíció a HELY** (`poziciok`: `jel, epulet, szint, helyiseg, adatok: {}` + ha le van rakva `rajzId, x, y`; a hiba, a megjegyzés és a napló
  a helyé). `fajta`: `pozicio` | `felmeres` | `hiba` (`FAJTAK`). **Az ELEM az, ami a helyre kerül** (`elemek`: `poz, kategoriaId, tipus, szel, mag,
  db, adatok, sorrend`) – a lépések, a készültség és a teljesítmény elemenként. `HELY_MEZOK`, `ELEM_MEZOK`, `MEZOK`.
  A régi (v1) adat a `TerepLogic.atalakitV2` szerint alakul át (szerveren menüből; a kliens minden pillanatképen – store `recompute`, helyi `load`).
- **Indexek** (`index(tomb, név, épít)` – WeakMap a modell tömbjeihez): `getPoz` / `getElem` / `getRajz` / `getTipus` / `getProjekt` /
  `getKategoria` / `getLepes` / `getFoto` azonosító szerint, `naplo` / `utolso` / `fotok` / `rajzPoziciok` / `pozElemei` csoportosítva,
  `pozJel` jel szerint, `allapot` elemenként, `helyHiba` helyenként egyszer számolódik. A modell tömbjei minden adatváltozáskor újak (store → `fromServer`), ezért az index magától érvénytelenné válik.
  **A modell tömbjeit és az indexből kapott elemeket ne módosítsd helyben** (a listás függvények másolatot adnak).
- `load()` (indulás: `store.init`), `adat()` (a modell), `helyi` (helyi mód-e), `felhasznalo()`, `jog(role)`, `betoltve(pid)`
- Felhasználók (admin): `felhasznalok()` (modell: `{ email, nev, szerepkor, aktiv, projektek: [id], megjegyzes }`; nem adminnak csak e-mail + név),
  `getFelhasznalo(email)`, `mindentLat(u)` (admin, vagy üres projektlista és nem külsős), `mentFelhasznalo(u)` → `{ hiba } | {}`,
  `ROLE_LABELS`, `SZEREPKOROK`. **Üres projektlista = minden projekt** (külsősnél: egyik sem) – ezért nem külsősnél a „csak a kijelöltek”
  üresen nem menthető, és a Hozzáférés ablakban az utolsó projekt nem vehető el.
- **Az írások aszinkronok** (`await`); érvénytelen műveletnél hibát dobnak (`e.validation`, az üzenet a felhasználónak szól) –
  kivétel `mentPoz` / `mentElem` / `mentTipus` / `mentKategoria`, ezek `{ hiba }`-t adnak vissza.
- **A legtöbb függvény a kiválasztott projektre vonatkozik** (elhagyható paraméter: `pid`).
- Projekt: `projektek()`, `getProjekt(id)`, `aktivId()`, `projekt()`, `setAktiv(id)` (async; `terep_projekt`), `addProjekt({ nev, ugyfel, helyszin, kategoria })`
  (a fajta műveletsora a sablonból), `updateProjekt(id, fields)`, `delProjekt(id)` (admin), `PROJEKT_ALLAPOT`,
  `projektStat(pid, kat)` → `{ rajz, lerakva, lerakatlan, cnt, hiba, elemek, keszultseg, keszultsegOssz, felmeres, hibajel }` | `null`
  (elem szinten, a fajtában; `cnt`: állapot-kulcs → elemszám; `hiba`: hibás helyek; `keszultsegOssz`: minden fajta)
- Termékfajták: `kategoriak()`, `getKategoria(id)`, `aktivKategoriak()`, `mentKategoria(k)` (admin), `projektFajtak(pid)` (amelyeknek lépése
  vagy eleme van), **`fajta(pid)` / `setFajta(katId, pid)`** – a kiválasztott fajta (`terep_fajta`, eszközönként; a lépésekhez kötött nézetek ezt
  mutatják), `fajtaHozzaad(katId)` (műveletsor a sablonból)
- Fotók (bejegyzésenként, legfeljebb `MAX_FOTO`): `fotok(esemenyId)`, `getFoto(id)`, `addFotok(esemeny, kepek)`,
  `delFoto(id)`, `fotoUrl(id, kicsi)`. Adatlapon: a „Fotó” gombbal választott képek a KÖVETKEZŐ rögzített bejegyzéshez kerülnek (lépés, hiba,
  megjegyzés – fotóval szöveg nélkül is menthető). store.js: `fotoHozzaad` → sor (`fotosor`, a képek `fotovar:<id>`, offline is) → a bejegyzés
  szinkronja UTÁN `fotokFeltolt()` (`foto_feltoltes`); elutasításkor az elutasítottak közé; gyorsítótár `fotokep:<id>:k|f` (kijelentkezéskor törlődik).
- Elvégzett munka: `elvegzett({ tol, ig, email, kat }, pid)` → `[{ e, poz, elem, lepes, tipus, kategoria, epulet, szint }]` – csak az érvényes
  (vissza nem vont) „kész” bejegyzések, a pótlás (`POTLAS` kezdetű megjegyzés) nélkül; mennyiségek, pénzügyi adat nincs.
- Készültség (súlyozott): a lépés `suly` mezője (arányszám; ha mind 0 → egyenlő arány); `reszesedes(pid, kat)` → Map(lépés-id → 0–1),
  `elemKeszultseg(elemId)` (0–1), `projektStat().keszultseg` (a fajta lerakott elemein; le nem rakott: 0).
- Műveletsor (projektenként és termékfajtánként): `lepesek(pid, kat = fajta(pid))` (`{ id, nev, szin, suly, kategoriaId }`),
  `setLepesek(list, pid, kat)`, `getLepes(id)`, `lepesHasznalt(id)`; színek: `alapSzin(i, n)`, `SZIN_NINCS`, `SZIN_KESZ`
- Rajz: `rajzok(pid)`, `getRajz(id)`, `getPdf(id)` (bájtok; offline régebbi verziónál figyelmeztet), `addRajz(nev, bytes, { epulet, szint, W, H })`
  (szerveres módban csak online), `updateRajz(id, f)` (f.kivagas: `{ x0, y0, x1, y1 }` oldalarány vagy null), `csereRajz(id, bytes, { W, H })` (új revízió, `verzio`+1; csak online; közös PDF-nél a forrásé), `delRajz(id)` (a pozíciók lekerülnek, de megmaradnak; a felmérés / hibajelölés törlődik),
  **Kivágás és közös PDF:** `rajzMasolat(forrasId, { nev, epulet, szint, homlokzat, kivagas })` (új rajz ugyanabból a PDF-ből – a fájl nem
  másolódik, a rajz `forras` mezője a forrásra mutat; pl. két torony egy rajzon), `kozosPdf(id)` (az azonos PDF-ű rajzok), `pdfVerzio(id)`
  (a forrásé), `kivagasonKivul(rajzId, k)` (a kivágáson kívül eső jelölők), `atrakRajzra(ids, rajzId)` (jelölők átrakása közös PDF-ű
  rajzra – azonos oldal, a hely nem változik), `pdfNev(id)` (a feltöltött PDF eredeti fájlneve – `Rajzok.fajlnev`, feltöltéskor és
  cserekor; közös PDF-nél a forrásé; a régebben feltöltötteknél üres). A Rajzok listán és a rajz adatainál a fájlnév, a másolat
  (közös PDF-ű) rajz neve előtt `ICONS.copy` (`.masolat-ikon`). A jelölők helye mindig a TELJES oldalhoz viszonyított arány, ezért a kivágás módosítása nem
  mozdítja el őket. A forrás nem törölhető, amíg más rajz használja a PDF-jét (szerver is ellenőrzi). Kivágó felület: `#/…/rajz/<id>?kivagas=1`
  (views/rajz.js: `kiv`, `kivBar`, `kivKeret`, `kivMentes`; a néző teljes oldalt mutat, téglalappal jelölhető ki),
  `helySzoveg(epulet, szint, homlokzat?)` („A · 1B”, „A · Észak homlokzat”), `rajzHely(r)`; `helyMezo(p, m)` (a pozíció hely-mezője;
  a homlokzat régebbi beillesztésnél „Hely adat” oszlopból is), `RAJZ_HELY` (`epulet, szint, homlokzat` – a lerakáskori szűrés mezői).
  **Homlokzati rajz:** a rajzon `homlokzat` megadva (a szint üres) → lerakáskor az épület + homlokzat szerinti pozíciók, minden szintről.
  Egy pozíció egy rajzon lehet lerakva (alaprajzon vagy homlokzaton) – döntés 2026-11-16.
- Pozíció (hely): `poziciok(pid, fajta?)`, `rajzPoziciok(rajzId)`, `getPoz(id)`, `pozJel(jel)` (fajta: pozíció), `addPoz(f)` (`f.elem`: az első
  elem – elhagyva a kiválasztott fajtából; `null`: elem nélkül), `updatePoz(id, f)`, `mentPoz(id|null, { jel, epulet, szint, helyiseg, adatok, elem? })`
  → `{ hiba } | { poz }` (a jel egyedi), `lerakPoz(id, rajzId, x, y)`, `leveszPoz(id)` (pozíció: „nincs lerakva”; felmérés / hiba: törlés),
  `delPoz(id)` (jelöléssel, az elemeivel – a Lomtárba), `lomtar(pid)`, `visszaallit(id, jel?)` → `{ hiba } | { poz }`,
  `tomegesTorles(ids)`, `nextNev(rajzId)`, `lerakatlan(pid, { epulet, szint, homlokzat })`, `vanOszlop(mező)`, `listaErtekek(mező)`
  (hely mező: a pozíciókból, elem mező: az elemekből)
- Elem: `elemek(pid, kat?)`, `getElem(id)`, `pozElemei(pozId, kat?)`, `mentElem(id|null, { poz, kategoriaId, tipus, szel, mag, db, adatok })`
  → `{ hiba } | { elem }` (új fajtánál a projekt műveletsora a sablonból), `delElem(id)`, `elemNev(e)` („T04 zsalúzia (2 db)”)
- Típus: `tipusok(pid, kat?)`, `getTipus(id)`, `tipusJel(jel)`, `tipus(jel)` → `{ jel, szel, mag, kategoriaId, adatok }`, `mentTipus(id|null, f)`
  (átnevezéskor az elemek típusa követi), `delTipus(id)`. Adatoszlopok: `oszlopok(kind)`, `addOszlop(kind, név)` (kind: `lista` = hely | `elem` | `tipusok`)
- **`tetel(x)` összevon** (x: elem, vagy pozíció → az első eleme): amit az elem nem ad meg, az a típusból jön (`honnan.szel/mag = 'tipus'`);
  `adatok` = a hely adatai, a típus tulajdonságai, az elem saját adatai; + `helyiseg`, `db`, `kategoria`, `elem`.
- Beillesztés: `SZEREPEK` (`jel, kategoria, tipus, szel, mag, db, epulet, szint, helyiseg, adat` = hely adat, `eadat` = elem adat,
  `kozos` = közös elem jelei, `kihagy`),
  `SZEREPEK_TIPUS`, `TABLAK`, `vanTabla(kind)`, `elemezTabla(kind, uj)` → `{ uj, egyezo, arva, elemek }`,
  `importal(kind, uj, { mod: 'bovit'|'csere', frissit, kategoria })` – egy sor = egy elem, az azonos jelűek egy helyre; a fajta a „Termékfajta”
  oszlopból (név szerint), különben `kategoria`. Bővítés: egyező hely megmarad / nem üres cellákkal frissül, az elemek fajtánként sorrendben
  párosítva; csere: **csak a beillesztett fajtákban** (a lerakott, listán kívüli hely jele és helye és az elemek állapota marad, az adat törlődik;
  a le nem rakott törlődik). `parseTabla(text)`, `kulcs(s)`
- Tömeges (a kijelölés pozíció- vagy elem-azonosítókat tartalmazhat): `elemIdk(ids, kat)` (a fajta elemei), `helyIdk(ids)` (a helyek),
  `addEsemenyek([{ poz, elem, tipus, lepes, megj, mikor }])` (egy `esemenyek` művelet 500-anként, mindent vagy semmit),
  tervek: `tervKesz(ids, lepesId)`, `tervVissza(ids, lepesId)` (a lépés fajtájának lerakott elemein), `tervEsemeny(ids, tipus)` (a helyeken)
  → `{ list, poz, mar?, kihagyva }`; `tomegesAdat(ids, mezo, ertek)` (elem mező: `tipus|szel|mag|db|eadat:<oszlop>`; hely mező:
  `epulet|szint|helyiseg|adat:<oszlop>`), `tomegesLevetel(ids)`; hézagok: `hezagok(pid, kat)` → `[{ elem, poz, hianyzo, mikor }]`, `potolHezagok(list)`
- Esemény és állapot: `addEsemeny(poz, tipus, { elem, lepes, megj })` (lépésnél az elem kötelező), `naplo(poz)` (a hely és elemei), `utolso(poz)`,
  `allapot(elemId)` → `{ kesz, flags, lep, lepes }`, `elemKeszultseg(elemId)`, `helyHiba(pozId)`, `helyElem(pozId, kat)` (a legkevésbé kész),
  `jelolo(pozId, kat)` → `{ szin, mind, hiba, fajta, szegmensek }`, `helyKulcs(pozId, kat)` (állapot-kulcs, `null` = nincs ilyen fajtájú eleme);
  név: `getNev()` (szerveres módban a belépésből), `setNev(v)` (csak helyi módban)
- Kapcsolatok, csatornák (vezérlés – a felület később): `kapcsolatok(pid)`, `elemKapcsolatai(elemId)`, `csatornak(elemId)`,
  `mentKapcsolat(k)`, `delKapcsolat(id)`; `KAPCSOLAT_TIPUSOK`, `KAPCSOLAT_ALLAPOT`
- **Közös elem** (kapcsolat `kozos`: `forras` = a közös elem, pl. védőtető; `cel` = egy másik pozíció eleme): a közös elem a cel elemek
  pozícióin is megjelenik (elemkártya, ott is rögzíthető – a bejegyzés az elem **saját** pozíciójára kerül), és ott is beleszámít a jelölő
  színébe (`helyElem`, `jelolo`, `helyKulcs`); a készültség-összesítők egyszer számolják. `kozosElemek(pozId, kat)` (ide behozott közös elemek),
  `helyElemei(pozId, kat)` (saját + behozott – a jelölőhöz), `kozosCelok(elemId)` → `[{ kapcsolat, elem, poz }]`, `kozosHelyek(elemId)`,
  `kozosMent(elemId, pozIds)` → `{ hiba } | { db, kihagyva }` (a kapcsolatok erre állnak be; a cel a pozíció első eleme), `kozosVonalak(rajzId)`
  → `[[pozId, pozId]]` (szaggatott vonal a rajzon). Beillesztés: `kozos` szerep („Közös ezekkel”: jelek vesszővel) → `importal` eredményében
  `kozos` (új kapcsolatok), `kozosHiba` (ismeretlen / elem nélküli jelek); csere és frissítés a felsorolásra állítja a kapcsolatokat.

## JS – `viewer.js`

- `openPdf(bytes)` → `{ pages, W, H, render(r, x0, y0, pw, ph) → ImageBitmap, destroy() }` – rajzonként egy háttérszál
- `new Viewer(host, doc, { onTap, onMarkerTap, onMarkerMove, canDrag, canSelect, onSelectRect, onView, kivagas })`, `init()`, `destroy()`.
  `kivagas`: csak ez a rész látszik és rajzolódik (belső koordináta: a kivágás – `W`, `H`, eltolás `ox`, `oy`; `be(x, y)` / `ki(x, y)`
  átváltás a teljes oldalarány és a belső arány közt; `render()` az eltolással kér a háttérszáltól). A külső API (jelölők, onTap,
  onMarkerMove, focus) teljes oldalarányban; az onSelectRect és a `markers` belső arányban. `onView()`: minden nézetváltáskor (pl. kivágás kerete).
- `setMarkers([{ id, x, y, svg, label, cls }])`, `setLinks([[idA, idB]])` (vonal két látható jelölő közt, `.klayer` SVG, a jelölőkkel mozog), `zoomCenter(k)`, `resetView()`, `focus(x, y)` (pontra nagyít), `flash(id)` (`.mk.flash`)
- Méretkorlátok a fájl elején (`BASE_MAX_*`, `TILE_*`, `COARSE` = érintőképernyős készülék) – a mobil vászonkorlátok és a memória miatt.
  Memória (mérve, 1 MB-os CAD-PDF): üres PDFium ~18 MB, megnyitott rajz ~230 MB (a motor objektumai; a WASM-memória nem zsugorodik);
  vásznak: képpontonként 4 bájt. `doc.mem()` – a PDFium memóriája (méréshez).
- **Megszakítható rajzolás** (`pdf-worker.js`): a PDFium progresszív rajzolása (`FPDF_RenderPageBitmap_Start` / `_Continue`,
  20 ms-os szeletek), a háttérszál a szeletek közt fogadja az üzeneteket. Kérés-prioritás: sürgős (látható rész) > háttér (`render(…, true)`:
  alapkép, előtöltés) – a sürgős megszakítja a hátteret (eredmény `null`). `doc.cancel()`: a futó sürgős kérés megszakítása – a néző
  akkor hívja, ha a kérés `STALE_MS`-nál tovább fut és közben 1,5×-nél többet változott a nagyítás (elavult). Mérés (Dürer, 5414×2891 pt):
  a teljes oldal ~0,9 mp, az alapkép ~5–7 mp, nagyított részlet 15–70 ms – így nagyítás után ~0,4 mp alatt éles (korábban 5–6 mp,
  mert a nagyított kép az alapkép mögött várt). Az alapkép megszakítva nyugalomban újraindul (`settle`); addig az első, teljes oldalt
  mutató részletkép az ideiglenes alap (`baseFrom`).
- Menetvezérlés: egyszerre egy sürgős menet (`inflight`) és egy előtöltés (`pfFut`); nézetváltáskor `kick()` (ha fut, utána `again`), így gesztus közben is
  folyamatosan élesedik. A PDFium ideje a kivágásba eső elemek számától függ → előbb csak a látható rész,
  nyugalomban `PREFETCH_MS` után ráhagyásos előtöltés (`request(true)`, `TILE_MARGIN`). Kész képek: `tiles` / `TILE_CACHE`.
  `settle()`: gyorsítótár-találat, `SNAP` (≤2% nagyításigazítás a kész képhez), `align()` (képpontrács).
- **Koppintás utáni kattintás elnyelése** (`nyelKattintast`): koppintáskor (jelölő / üres terület) ~450 ms-ig minden kattintás elnyelődik –
  érintésnél a böngésző a felengedés után ugyanarra a pontra „click”-et küld, ami a közben megnyílt ablak gombjára esne (pl. lépés rögzítése).
  Ha a nézőből nyíló új ablakot írsz, erre nincs külön teendő.
- `busy(on)` → `.stage.rendering` („Élesítés…” jelzés). Egér: bal gomb koppintás/húzás, középső gomb mindig mozgatás.
- Élesség: a részlet (`.dlayer canvas`) minden nagyításon újrarajzolódik, képernyő-koordinátában, képpontrácsra
  igazítva (nyugalomban `scale(1)`). Az alapkép (`.base`) csak a mozgatás közbeni átmenet – kicsinyítve ne arra támaszkodjunk.

## CSS – `web/css/app.css`

A betűk, a színtokenek (sötét móddal), az alapelemek és a **közös komponensek** (keret: felső sáv, menü; kártya, `.stat`, gombok,
jelvények, mezők, `.fsec`, `.opt`, szűrősor, kereső, `.tbl` / `.tbl.cards` / `.jelol`, `.chip`, `.notice`, adatlap-fejléc, `.popover`,
`.modal`, toast, `.login`) a közös `web/kozos/kozos.css`-ben vannak (előbb töltődik be; itt nem szerkeszthetők – jegyzék:
`..\Kozos_Claude\FEJLESZTES.md`). Az `app.css` csak a Terep saját elemeit és eltéréseit tartalmazza (azonos szelektorral felülírva,
pl. `.topbar` a kijelzőkivágás miatt, a `.jelol` fejlécfelirata „A szűrtek kijelölése”). Az alábbi lista a régi felosztást is jelzi:

- Elrendezés (Raktár): `.topbar`, `.brand`/`.wordmark`, `.ptitle`, `.back-btn`, `.nav` (asztalon oldalsáv, ≤899 px alsó sáv;
  `.nav-bottom`), `.view`, `.narrow` (keskeny oldaltartalom), `.page-note`; `body.drawing` (teljes képernyős néző, mobilon menü nélkül), `body.edit`
- Raktár-komponensek: `.page-head` (+ `.actions`), `.card` / `.card-head` / `.card-pad`, `.stats` / `.stat` (`button.stat`, `.sel`, `.err`, `.muted-stat`),
  `.toolbar` / `.card-toolbar`, `.search-wrap` / `.search-ico` / `.search-clear`, `.table-wrap`, `.tbl` (`th.sortable`, `tr.click`, `tr.off`),
  `.tbl.cards` (mobilon kártyák: `c-main`, `c-meta`, `c-act`, `c-f1…c-f4`, `data-l` címke), `.tbl-foot`, `.empty`
- `.list`/`.list-item`/`.list-main`, `.btn-row`, `.chips` (számozott), `.kv`; Pozíciók: `.st-cell`, `.tipus-chip`; `.contents`; `td.m-hide` (mobilon rejtett cella)
- Projekt: `.proj-grid`, `.proj-card` (`.cur`, `.off`), `.proj-top`, `.proj-nev`, `.proj-num`, `.proj-bar` (állapotsáv lépésszínekkel; `.mini` a rajzsoron),
  `.hely-chip` (épület · szint), `.nav-proj` (projekt az oldalsávban); `.ptitle small` (projekt a felső sávban)
- Raktárból: adatlap `.detail-head` / `.detail-hero` (`--st` = állapotszín; a Terepben csak a csík színes, a szöveg mindig semleges – a lépésszín világos is lehet) / `.hero-label|value|status|levels` / `.facts` /
  `.detail-actions` / `.sec-h`; felugró `.popover` / `.pop-item` / `.nav-pop`; `.nav-more` / `.nav-extra` (mobil „Több”); `.chip` (`.on`)
- Áttekintő: `.proj-meta`, `.proj-bar.big`, `.att-grid`, `a.stat`, `.list-btn`; fejléc: asztalon `.topbar .brand` az oldalsáv szélességében
- Néző: `.stage` (`.rendering` → „Élesítés…”), `.world`, `.base`, `.dlayer`, `.mlayer`, `.kiv-keret` (kivágás kerete, kívül sötétítve), `.mk` / `.mk-ring` / `.mk-label`, `.zoom-ctl` (eszközoszlop: nagyítás, kijelölés; alul a ceruza = Szerkesztés mód `data-z="edit"`), `.edit-tools` (szerkesztő eszközök csoportja, csak szerkesztés módban), `.edit-tool` (enyhe borostyán kiemelés), `.zoom-sep` (elválasztó vonal a normál és a szerkesztő gombok között), `.edit-keret` (a rajz körüli keret: szerkesztés módban borostyán, kijelölő módban kék – `body.edit` / `body.selmod`), `.stage-hint`, `.stage-msg`
- `.legend` – szűrő és jelmagyarázat darabszámokkal (natív `<details>`, `.active` = szűrt), `.flt-body`, `.flt-row`, `.flt-sep`;
  `.mk-label:empty` rejtve („Címke: nincs”); `.dot` – lépés színpöttye
- Tétel: `.tetel`, `.tetel-fo`, `.tetel-tipus`, `.tetel-meret`, `.tetel-tobb` (natív `<details>` + `<dl>`), `.tetel-nincs`
- Lista-import: `.map-list`, `.map-row`, `.map-name`
- Adatlap: `.pos-sum`, `.opt-note`, `.log` (`.when`, `.note`, `.ev-<típus>`)
- Lépéssor: `.btn-lg` (nagy „következő lépés” gomb), `.all-done`, `.stepper` (`li.st-done|st-next|st-later`, `--c` = lépés színe),
  `.step-mark`, `.step-body`, `.step-act`. Adatlap-műveletek: `data-do="next|upto|undo|megj|hiba|del"`
- Műveletsor-szerkesztő: `.seq-row`, `.seq-n`, `.seq-tpl` (lépésszín: natív `<input type=color>`), `.seq-suly` / `.seq-pct` (súly és részesedés), `.seq-fej`;
  Projekt oldalon fajtánként: `.seq-fajta`, `.seq-fajta-fej`
- Elemkártyák (több elemes adatlap): `.elem-lista`, `.elem-kartya` (`--st` = az elem állapotszíne, bal szél; `.kozos` = más pozícióról
  kapcsolt közös elem, szaggatott keret), `.elem-fej`, `.elem-nev`, `.elem-allapot`, `.elem-kozos` (a kapcsolt pozíciók sora)
- Közös elem a rajzon: `.klayer` (vonalak), `.flt-vonal` (a jelmagyarázat vonal-mintája), `.mk.kz-forras` (kiválasztáskor a közös elem
  saját pozíciója, szaggatott gyűrű); adatlap-művelet `data-do="kozos|poz-nyit"`
- `.fajta-val` – termékfajta-választó a fejlécben (a jelmagyarázatban teljes szélességű)
- Fotók: `.foto-sor`, `.foto-kis` (`.fuggo` = feltöltésre vár), `.foto-ki`, `.foto-fuggo`, `.foto-jel` (fényképező + darab a listákon),
  `.foto-nezo`, `.foto-lap`, `.foto-info`
- Rajzok lista: `.csop` (összecsukható épületcsoport), `.csop-fej`, `.csop-nyil`, `.csop-cim`, `.csop-szam`, `.csop-gombok`
- Teljesítmény: `.telj-szuro-kartya`, `.telj-tbl` (pivot), `.telj-datum`, `.telj-tetel` (lenyitható tételes lista); Munkám: `.munkam-gyors` (nagy gyorsgombok)
- `.ico-inline` – ikon folyó szövegben (a betűmérethez igazodik; ikon méret nélkül szövegben az egész oldalt kitöltené)
- `--stage-bg` – a rajzlap körüli háttér
- Raktárból: `.userbtn` (monogram, `.active` a Fiók oldalon), `.nav-group` (oldalsáv-szekció címe; `.nav-bottom` = az alján), `.pop-title`
  (szekciócím a „Több” listában), `.sync-pill` (`.ok|.warn|.err|.busy`) + `.sync-n` (szinkronjelző), `@keyframes spin`, `.login` (belépés kártya; `body.belepes`:
  menü nélkül), `.notice` (`-warn|-err|-info`), `.pop-foot`; Fiók: `.op-list` (függő / elutasított műveletek)
- Felhasználók: `.u-proj-list` (projektek / felhasználók jelölőnégyzetei, görgethető), `.chips.plain` (számozás nélküli chipek);
  oldalsáv: több `.nav-bottom` egy csoportban (Felhasználók, Fiók)
- Állapotcsík a sor elején (Raktár): `.tbl.st-csik` (az első oszlop beljebb kezdődik) + `tr.st-row-hiba` (`--st`)
- Projektek: `.kedv` / `.kedv.on` (csillag), `.kedv-th` / `.kedv-td`, `.sec-cim` (szakaszcím ikonnal), `.proj-tbl`, `tr.cur`
- `.hely-chip` – épület · szint címke a `.tipus-chip` stílusában; `.rajz-adatok` (tömeges feltöltés utáni adattábla)
- Folyamatjelző: `.modal.folyamat`, `.fo-sor`, `.fo-szoveg`, `.fo-sav`, `.spinner`
- Oldalsáv: `100dvh` magas, maga görgethető, ha nem fér ki
- Kijelölés: `.tbl.cards.jelol` (jelölőnégyzet-oszlop `.c-chk`, mobilon „A szűrtek kijelölése” fejléc – a Raktár mintájára), `tr.sel`,
  `.sel-bar` (alsó sáv; a rajzon `.stage-selbar`), `.mk.sel` (kék gyűrű), `.sel-rect` (húzott téglalap), `.zoom-ctl button.on`

## Backend – `apps-script/`

- `Code.gs` (a Raktár Code.gs-éből): `doPost` műveletek `login`, `adatok` (projektenként, `version`-nel), `szinkron` (`ops`, zárolással),
  `rajz_pdf` (base64), `rajz_feltoltes` (új rajz / PDF-csere, új verzió; a régi fájl „(régi vN)” néven marad); munkamenet
  (`login`, `tokenEmail`, `sign`, `safeEqual`, `throttleLogin`, adatverzió, `json`, `authError` – a közös **`Kozos.gs`**-ben, forrása a
  Kozos_Claude; itt nem szerkeszthető), Sheet I/O (`readAll`, `readTable`, `writeChanges`, `toCell` –
  képletvédelem), Drive: `rajzMappa()` (`RAJZ_MAPPA_ID`) → `projektMappa(proj)` (projektenként, `MAPPA_<projekt_id>`, a neve követi a
  projekt nevét) → `regiMappa()` („Régi verziók”: a rajzcsere előtti fájlok); `rajzokRendezese()` (menü: a meglévő fájlok mappákba rendezése),
  `torolRajzFajlok` (törölt rajz → kuka; törölt projekt → a mappája is; törölt fotó → kuka), `setup()`, menü (`onOpen`).
  Fotók: `fotoFeltoltes` (jogosultság: `TerepLogic.fotoSor`; Drive: Projekt / Fotók, előnézet: Fotók / kicsi), `fotoLetoltes` (`foto` művelet).
- `Logic.gs` (`TerepLogic`): `SCHEMA` (lapok és oszlopok), `ROLES` (kulsos < szerelo < iroda < admin), `lathatja(user, projektId)`
  (Felhasznalok.projektek), `snapshot(db, user, projektId)`, `applyOp(db, op, user, now)` – műveletek: `projekt_mentes`,
  `projekt_torles`, `kategoria_mentes` (admin), `lepesek_mentes` (projekt + termékfajta), `rajz_mentes` (+ `kivagas` „x0,y0,x1,y1”), `rajz_masolat` (új rajz egy meglévő PDF-jéből: `forras`, `kivagas`; a fájl a forrásé – a
  `rajz_pdf` és a `rajz_feltoltes` a forrásra irányít), `rajz_torles` (a forrás nem törölhető, amíg másolata van), `poz_mentes` (rows; hely mezők,
  részleges frissítés; régi kliens tipus/szel/mag → az elemre), `poz_lerakas` (rajz_id üres = levétel), `poz_torles` (az elemeivel), `poz_visszaallitas` (iroda; a vele együtt – azonos időben –
  törölt elemek, csatornák és élő végű kapcsolatok is; `jel` = új jel, ha a régi foglalt; a rajzon a helyére, ha a rajz megvan), `elem_mentes` (rows;
  a fajta nem cserélhető, ha van lépése), `elem_torles` (a kapcsolataival), `tipus_mentes` (rows), `tipus_torles`, `kapcsolat_mentes` / `_torles`,
  `csatorna_mentes` / `_torles` (csak vezérlő fajtájú elemen), `esemeny` (idempotens; a lépés az elemé és a fajtájáé; ki = bejelentkezés;
  mikor = készülék, rogzitve = szerver), `esemenyek` (több bejegyzés egyben, előbb mind ellenőrződik – `esemenySor`), `felhasznalo_mentes`,
  `foto_torles` (a sajátját bárki, másét az iroda). `fotoSor(db, user, f, now)`: új fotó ellenőrzése (a bejegyzésnek a szerveren kell lennie,
  csak a saját bejegyzéshez, bejegyzésenként legfeljebb 5). Ellenőrzés: `checkId`, `rowsOf`, hosszkorlátok, `fail` (validation).
- A `Logic.gs` a kliensben is fut: `web/js/logic.js` **azonos tartalommal** (módosítás után: `Copy-Item apps-script\Logic.gs web\js\logic.js`).
- Szerver nélküli teszt: ideiglenes tesztoldal (`web/_teszt.html` = index.html + egy `fetch`-et felülíró szerverutánzat a TerepLogic-kal),
  és a `config.js`-ben ideiglenesen erre az oldalra beállított `API_URL` – utána mindkettőt töröld / állítsd vissza.

## Tárolási kulcsok (közös origin a Raktárral → előtag kötelező)

- localStorage: `terep_theme`, `terep_nev` (helyi mód: a naplóba kerülő név), `terep_legenda` (rajz jelmagyarázata nyitva / csukva), `terep_rajzok` (Rajzok lista: nyitott épületek projektenként), `terep_cimke`, `terep_projekt` (kiválasztott projekt),
  `terep_fajta` (`{ projekt-id: kategória-id }` – a kiválasztott termékfajta projektenként),
  `terep_kedvencek` (`{ email: [projekt-id…] }` – kedvenc projektek, eszközönként)
- IndexedDB `terep` / `kv`:
  - szerveres mód: `srv:session`, `srv:outbox`, `srv:rejected`, `srv:fotosor`, `srv:adat:<projekt>` (a projekt utolsó letöltése),
    `rajzpdf:<rajz>` = `{ verzio, bytes }`, `fotokep:<foto>:k|f` (letöltött fotók); `fotovar:<foto>` = `{ full, kicsi }` (feltöltésre váró fotó)
    (kijelentkezéskor / lejárt hozzáférésnél az `srv:adat:*`, `rajzpdf:*`, `fotokep:*` törlődik, a kimenő sor és a várakozó fotók maradnak);
  - helyi mód: `helyi:db` (a „szerver” táblái), `pdf:<rajzId>` (a PDF bájtjai), `helyifoto:<foto>` (a fotók), `helyi:session`, `helyi:outbox`,
    `helyi:rejected`, `helyi:fotosor`, `helyi:adat:<projekt>`;
  - a prototípus régi adata: `adat` (első helyi indításkor átkerül a `helyi:db`-be, maga érintetlen marad), `adat_mentes_v1`…`v4` – korábbi
    átalakítások előtti mentések a fejlesztő gépén. Törölhetők, ha minden rendben.
- Service worker gyorsítótár: `terep-v<N>`
