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

/** Kivágás rajzolása: r = képpont / pont; (x0, y0) a kivágás bal felső sarka pontban; pw × ph képpont. */
async function render({ r, x0, y0, pw, ph }) {
  const bmp = P.FPDFBitmap_Create(pw, ph, 0);
  try {
    P.FPDFBitmap_FillRect(bmp, 0, 0, pw, ph, 0xFFFFFFFF);
    M.HEAPF32.set([r, 0, 0, r, -x0 * r, -y0 * r], mat >> 2);
    M.HEAPF32.set([0, 0, pw, ph], clip >> 2);
    P.FPDF_RenderPageBitmapWithMatrix(bmp, page, mat, clip, FLAGS);
    const buf = P.FPDFBitmap_GetBuffer(bmp);
    // Másolat kell: a WASM-memória nem adható át, és a bitkép felszabadul
    const img = new ImageData(new Uint8ClampedArray(M.HEAPU8.buffer, buf, pw * ph * 4).slice(), pw, ph);
    return await createImageBitmap(img);
  } finally {
    P.FPDFBitmap_Destroy(bmp);
  }
}

self.onmessage = async ({ data }) => {
  const { id, op } = data;
  try {
    await ready;
    if (op === 'open') self.postMessage({ id, ...open(data.bytes) });
    else if (op === 'render') { const bitmap = await render(data); self.postMessage({ id, bitmap }, [bitmap]); }
    else if (op === 'mem') self.postMessage({ id, wasm: M.HEAPU8.buffer.byteLength }); // a WASM-memória mérete (bájt)
  } catch (e) {
    self.postMessage({ id, error: String(e && e.message || e) });
  }
};
