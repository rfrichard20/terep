// PDF-rajzoló háttérszál (Web Worker): PDFium (WebAssembly) – a Chrome PDF-motorja.
// Miért: a CAD-rajzok >1 millió rajzolási műveletből állnak; a PDFium a látható részen kívül esőket kihagyja,
// így egy nagyított kivágás néhány tíz ms (a PDF.js-nél ~1 mp volt). Háttérszálon fut, a felület nem akad.
//
// Üzenetek (a fő száltól):
//   { id, op: 'open', bytes }                         → { id, pages, W, H }   (W, H: az 1. oldal mérete pontban, forgatással)
//   { id, op: 'render', r, x0, y0, pw, ph }           → { id, bitmap }        (ImageBitmap, átadva; x0, y0 pontban)
//   hiba esetén                                       → { id, error }
// Rajzonként egy háttérszál; bezáráskor a fő szál leállítja (terminate), így minden memória felszabadul.

// A csomag a háttérszálat az importScripts megléte alapján ismeri fel, ami modul-workerben nincs → helykitöltő.
// (A WASM-et mi töltjük be, így a csomag sosem hívja.)
if (typeof self.importScripts !== 'function') self.importScripts = () => { throw new Error('importScripts nem támogatott'); };

const FLAGS = 0x01 | 0x10 | 0x800; // FPDF_ANNOT | FPDF_NO_NATIVETEXT | FPDF_REVERSE_BYTE_ORDER (RGBA kimenet)
let P = null, M = null, doc = 0, page = 0, dataPtr = 0, mat = 0, clip = 0;

async function boot() {
  const { init } = await import('../vendor/pdfium/index.browser.js');
  const wasmBinary = await (await fetch(new URL('../vendor/pdfium/pdfium.wasm', import.meta.url))).arrayBuffer();
  P = await init({ wasmBinary });
  P.PDFiumExt_Init();
  M = P.pdfium;
  mat = M.wasmExports.malloc(24);  // FS_MATRIX: 6 float
  clip = M.wasmExports.malloc(16); // FS_RECTF: 4 float
}
const ready = boot();

function open(bytes) {
  const u8 = new Uint8Array(bytes);
  // A PDFium a dokumentum nyitva tartása alatt a memóriából olvas → a puffer a bezárásig él
  dataPtr = M.wasmExports.malloc(u8.length);
  M.HEAPU8.set(u8, dataPtr);
  doc = P.FPDF_LoadMemDocument(dataPtr, u8.length, '');
  if (!doc) throw new Error('A PDF nem nyitható meg (hibakód: ' + P.FPDF_GetLastError() + ')');
  page = P.FPDF_LoadPage(doc, 0);
  if (!page) throw new Error('Az első oldal nem tölthető be');
  return { pages: P.FPDF_GetPageCount(doc), W: P.FPDF_GetPageWidthF(page), H: P.FPDF_GetPageHeightF(page) };
}

/*
 * Megszakítható rajzolás (PDFium „progresszív” rajzolása): a motor SZELET_MS-onként visszaadja a vezérlést, ilyenkor a háttérszál
 * feldolgozza a közben érkezett üzeneteket. Egy sürgős kérés (prio 2: a látható rész) a futó háttérkérést (prio 1: alapkép,
 * előtöltés) megszakítja – így egy nagy rajzon a nagyítás utáni éles kép nem vár másodperceket egy lassú háttérkép mögött.
 * A megszakított kérés válasza { id, aborted: true }.
 */
const SZELET_MS = 20;
let pause = 0, szeletKezd = 0;
function pauseInit() {
  if (pause) return true;
  try {
    const fn = M.addFunction(() => (performance.now() - szeletKezd > SZELET_MS ? 1 : 0), 'ii'); // NeedToPauseNow(IFSDK_PAUSE*)
    pause = M.wasmExports.malloc(12); // IFSDK_PAUSE: { int version; NeedToPauseNow; void* user }
    M.HEAP32.set([1, fn, 0], pause >> 2);
    return true;
  } catch { return false; } // (ha a motor nem engedi: egyben rajzol, mint régen)
}
const sor = [];      // várakozó kérések
let fut = null;      // a futó kérés
const tovabb = () => new Promise(res => setTimeout(res, 0));

/** Kivágás rajzolása: r = képpont / pont; (x0, y0) a kivágás bal felső sarka pontban; pw × ph képpont. null: megszakítva. */
async function render(job) {
  const { r, x0, y0, pw, ph } = job;
  const bmp = P.FPDFBitmap_Create(pw, ph, 0);
  try {
    P.FPDFBitmap_FillRect(bmp, 0, 0, pw, ph, 0xFFFFFFFF);
    if (pauseInit()) {
      // Az oldal (W·r × H·r) eltolva a bitképbe: a kivágáson kívüli rajzelemeket a motor kihagyja (a hívó x0·r-t egészre igazítja)
      szeletKezd = performance.now();
      let st = P.FPDF_RenderPageBitmap_Start(bmp, page, Math.round(-x0 * r), Math.round(-y0 * r),
        Math.round(job.W * r), Math.round(job.H * r), 0, FLAGS, pause);
      while (st === 1) { // FPDF_RENDER_TOBECONTINUED
        await tovabb();
        if (job.abort) { P.FPDF_RenderPage_Close(page); return null; }
        szeletKezd = performance.now();
        st = P.FPDF_RenderPage_Continue(page, pause);
      }
      P.FPDF_RenderPage_Close(page);
    } else {
      M.HEAPF32.set([r, 0, 0, r, -x0 * r, -y0 * r], mat >> 2);
      M.HEAPF32.set([0, 0, pw, ph], clip >> 2);
      P.FPDF_RenderPageBitmapWithMatrix(bmp, page, mat, clip, FLAGS);
    }
    const buf = P.FPDFBitmap_GetBuffer(bmp);
    // Másolat kell: a WASM-memória nem adható át, és a bitkép felszabadul
    const img = new ImageData(new Uint8ClampedArray(M.HEAPU8.buffer, buf, pw * ph * 4).slice(), pw, ph);
    return await createImageBitmap(img);
  } finally {
    P.FPDFBitmap_Destroy(bmp);
  }
}
/** A sor feldolgozása: mindig a legsürgősebb (azon belül a legrégebbi) kérés. */
async function kovetkezo() {
  if (fut || !sor.length) return;
  let i = 0;
  for (let k = 1; k < sor.length; k++) if (sor[k].prio > sor[i].prio) i = k;
  fut = sor.splice(i, 1)[0];
  try {
    const bitmap = await render(fut);
    if (bitmap) self.postMessage({ id: fut.id, bitmap }, [bitmap]); else self.postMessage({ id: fut.id, aborted: true });
  } catch (e) {
    self.postMessage({ id: fut.id, error: String(e && e.message || e) });
  } finally {
    fut = null;
    kovetkezo();
  }
}

self.onmessage = async ({ data }) => {
  const { id, op } = data;
  try {
    await ready;
    if (op === 'open') { const info = open(data.bytes); self.postMessage({ id, ...info }); return; }
    if (op === 'render') {
      const job = { ...data, prio: data.prio || 2, W: P.FPDF_GetPageWidthF(page), H: P.FPDF_GetPageHeightF(page) };
      // Sürgős kérés: a futó és a várakozó háttérkérések megszakadnak
      if (job.prio > 1) {
        if (fut && fut.prio < job.prio) fut.abort = true;
        for (let k = sor.length - 1; k >= 0; k--) if (sor[k].prio < job.prio) self.postMessage({ id: sor.splice(k, 1)[0].id, aborted: true });
      }
      sor.push(job);
      kovetkezo();
    } else if (op === 'cancel') {
      // A futó / várakozó sürgős kérés elavult (közben sokat változott a nézet): megszakítás
      if (fut && fut.prio > 1) fut.abort = true;
      for (let k = sor.length - 1; k >= 0; k--) if (sor[k].prio > 1) self.postMessage({ id: sor.splice(k, 1)[0].id, aborted: true });
    } else if (op === 'mem') self.postMessage({ id, wasm: M.HEAPU8.buffer.byteLength }); // a WASM-memória mérete (bájt)
  } catch (e) {
    self.postMessage({ id, error: String(e && e.message || e) });
  }
};
