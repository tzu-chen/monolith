import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Automatic margin detection ("trim margins") for the PDF preview, ported from
 * scribe's viewer and modelled on Okular's Trim Margins: each page is rendered
 * small, the bounding box of its non-background pixels is measured, and the
 * surrounding margin becomes the page's crop.
 *
 * Two hardening passes sit on top of the plain bounding box:
 *   1. A speck must have an ink neighbour to count (1-pass erosion).
 *   2. A row/column must carry a minimum number of ink pixels to be "content".
 * They matter less for Tectonic output than for scans, but a stray rule or a
 * page-number-only page would otherwise pin the box to the full sheet.
 */

export interface CropBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_CROP: CropBox = { top: 0, right: 0, bottom: 0, left: 0 };

export function hasCrop(crop: CropBox): boolean {
  return crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;
}

/**
 * One box per page parity — twoside documents alternate their gutter — plus
 * each measured page's own box, keyed by page number, for its top and bottom.
 */
export interface DocumentCrop {
  odd: CropBox;
  even: CropBox;
  pages: Record<number, CropBox>;
}

export const NO_DOCUMENT_CROP: DocumentCrop = { odd: NO_CROP, even: NO_CROP, pages: {} };

/**
 * The box one page is shown through: the parity's uniform left/right (so pages
 * line up while scrolling) with the page's own top/bottom where it was
 * measured. Heights may differ page to page without anything shifting
 * horizontally, and this is what takes the extra paper off a title page and
 * the empty tail of a short last page.
 */
export function pageCropBox(crop: DocumentCrop, pageNumber: number): CropBox {
  const parity = pageNumber % 2 === 1 ? crop.odd : crop.even;
  const own = crop.pages[pageNumber];
  return own ? { ...parity, top: own.top, bottom: own.bottom } : parity;
}

/** Width pages are sampled at. A block is then well under a screen pixel at any fitted width. */
const SAMPLE_WIDTH = 640;

/** Pages measured to derive one document-wide box, spread through the document. */
const UNIFORM_SAMPLES = 24;

export interface AutoTrimOptions {
  /** Luminance distance (0-255) from the page background that counts as ink. */
  threshold?: number;
  /** Margin kept around the detected content, as a fraction of the page size. Negative shaves into it. */
  padding?: number;
  /** Hard cap on what may be trimmed from any single side. */
  maxCrop?: number;
}

const DEFAULT_OPTIONS: Required<AutoTrimOptions> = {
  threshold: 26,
  // A sliver of paper around the content so the text does not touch the
  // sheet's edge: ~7pt on a letter page, about the gap between two words.
  padding: 0.012,
  maxCrop: 0.45,
};

/** Content smaller than this fraction of the page means the detection is not
 *  trustworthy (blank page, a lone page number). */
const MIN_CONTENT_FRACTION = 0.15;

interface SampledPage {
  min: Uint8Array;
  max: Uint8Array;
  width: number;
  height: number;
}

/**
 * Reduce RGBA pixels to a small two-channel (darkest/brightest) luminance grid.
 * Keeping both extremes per block makes the detection polarity-agnostic and
 * stops hairlines from being averaged away into the background.
 */
function samplePage(data: Uint8ClampedArray, width: number, height: number): SampledPage {
  const stride = Math.max(1, Math.floor(width / SAMPLE_WIDTH));
  const outW = Math.ceil(width / stride);
  const outH = Math.ceil(height / stride);
  const min = new Uint8Array(outW * outH).fill(255);
  const max = new Uint8Array(outW * outH);

  for (let y = 0; y < height; y++) {
    const oy = (y / stride) | 0;
    const rowBase = y * width * 4;
    const outRow = oy * outW;
    for (let x = 0; x < width; x++) {
      const i = rowBase + x * 4;
      const a = data[i + 3];
      // Composite over white: an un-painted PDF region is transparent, and
      // treating it as rgb(0,0,0) would read as ink covering the whole page.
      let lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      if (a !== 255) lum = ((lum * a) + 255 * (255 - a)) / 255 | 0;
      const o = outRow + ((x / stride) | 0);
      if (lum < min[o]) min[o] = lum;
      if (lum > max[o]) max[o] = lum;
    }
  }

  return { min, max, width: outW, height: outH };
}

/** Median luminance of the outermost 2-block ring — the page's background. */
function estimateBackground(page: SampledPage): number {
  const { min, max, width, height } = page;
  const ring: number[] = [];
  const depth = Math.min(2, Math.floor(Math.min(width, height) / 4)) || 1;
  const push = (o: number) => {
    ring.push(min[o]);
    ring.push(max[o]);
  };
  for (let d = 0; d < depth; d++) {
    for (let x = 0; x < width; x++) {
      push(d * width + x);
      push((height - 1 - d) * width + x);
    }
    for (let y = 0; y < height; y++) {
      push(y * width + d);
      push(y * width + (width - 1 - d));
    }
  }
  if (ring.length === 0) return 255;
  ring.sort((a, b) => a - b);
  return ring[ring.length >> 1];
}

/**
 * Measure the content bounding box of one rendered page and return it as a
 * CropBox of per-side margins. Returns null when the result is not trustworthy
 * so the caller can fall back to the document-wide estimate.
 */
export function detectContentCrop(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: AutoTrimOptions = {},
): CropBox | null {
  if (width <= 0 || height <= 0) return null;
  const { threshold, padding, maxCrop } = { ...DEFAULT_OPTIONS, ...options };

  const page = samplePage(data, width, height);
  const w = page.width;
  const h = page.height;
  const bg = estimateBackground(page);

  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) {
    const dev = Math.max(Math.abs(page.min[i] - bg), Math.abs(page.max[i] - bg));
    ink[i] = dev > threshold ? 1 : 0;
  }

  // Erode: an ink block with no ink neighbour is dust, not content.
  const rowInk = new Uint32Array(h);
  const colInk = new Uint32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!ink[i]) continue;
      const connected =
        (x > 0 && ink[i - 1]) ||
        (x < w - 1 && ink[i + 1]) ||
        (y > 0 && ink[i - w]) ||
        (y < h - 1 && ink[i + w]);
      if (!connected) continue;
      rowInk[y]++;
      colInk[x]++;
    }
  }

  // A row or column counts once two connected blocks of ink sit in it. That is
  // a lone page number or a one-word running head; single specks were already
  // eroded above. The gate must not scale with the sampling width, or a page
  // number thinner than the gate is trimmed off with the margin.
  const rowGate = 2;
  const colGate = 2;

  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    if (rowInk[y] >= rowGate) {
      if (top === -1) top = y;
      bottom = y;
    }
  }
  let left = -1;
  let right = -1;
  for (let x = 0; x < w; x++) {
    if (colInk[x] >= colGate) {
      if (left === -1) left = x;
      right = x;
    }
  }

  if (top === -1 || left === -1) return null;

  const contentW = (right - left + 1) / w;
  const contentH = (bottom - top + 1) / h;
  if (contentW < MIN_CONTENT_FRACTION || contentH < MIN_CONTENT_FRACTION) return null;

  // The crop stops at the outer face of the outermost ink block, then backs
  // off by the padding, so no glyph is ever shaved.
  const clamp = (v: number) => Math.max(0, Math.min(maxCrop, Math.round(v * 1e4) / 1e4));

  return {
    top: clamp(top / h - padding),
    bottom: clamp((h - 1 - bottom) / h - padding),
    left: clamp(left / w - padding),
    right: clamp((w - 1 - right) / w - padding),
  };
}

/** Render a PDF page at sampling resolution and measure its content box. */
export async function detectPdfPageCrop(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options?: AutoTrimOptions,
): Promise<CropBox | null> {
  const page = await pdfDoc.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(1, SAMPLE_WIDTH / base.width) });
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return detectContentCrop(img.data, img.width, img.height, options);
  } finally {
    // Drop the operator list / font state this measurement primed.
    page.cleanup();
  }
}

/**
 * Smallest margin among the *typical* pages. A plain minimum is fragile: one
 * full-bleed figure measures a margin of ~0 and would open the crop back up
 * for the whole document. Anything under half the median is discarded as
 * atypical and the smallest survivor wins, so no ordinary page gets clipped.
 */
function typicalMin(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const floor = sorted[sorted.length >> 1] * 0.5;
  for (const v of sorted) {
    if (v >= floor) return v;
  }
  return sorted[0];
}

/** Collapse several measured pages into one document-wide box. */
export function aggregateCrops(boxes: CropBox[]): CropBox {
  if (boxes.length === 0) return NO_CROP;
  return {
    top: typicalMin(boxes.map((b) => b.top)),
    right: typicalMin(boxes.map((b) => b.right)),
    bottom: typicalMin(boxes.map((b) => b.bottom)),
    left: typicalMin(boxes.map((b) => b.left)),
  };
}

/**
 * Collapse measured pages into one box per parity, trimmed to identical
 * dimensions. Each parity keeps its own left/right (the gutter alternates in
 * twoside documents); top/bottom and the horizontal extent are made uniform,
 * so every page renders at exactly the same size and nothing shifts while
 * scrolling.
 */
export function unifyCrops(odd: CropBox[], even: CropBox[]): DocumentCrop {
  if (odd.length === 0 && even.length === 0) return NO_DOCUMENT_CROP;

  const overall = aggregateCrops([...odd, ...even]);
  // One page of a parity isn't enough to tell a real gutter from an outlier.
  const o = odd.length >= 2 ? aggregateCrops(odd) : overall;
  const e = even.length >= 2 ? aggregateCrops(even) : overall;

  const top = Math.min(o.top, e.top);
  const bottom = Math.min(o.bottom, e.bottom);
  const span = Math.max(1 - o.left - o.right, 1 - e.left - e.right);

  const widen = (c: CropBox): CropBox => {
    let give = span - (1 - c.left - c.right);
    if (give <= 1e-6) return { ...c, top, bottom };
    // Hand the difference back on the wider (gutter) side first, spilling onto
    // the other if that side runs out.
    const out = { ...c, top, bottom };
    for (const side of c.left >= c.right ? (['left', 'right'] as const) : (['right', 'left'] as const)) {
      const take = Math.min(give, out[side]);
      out[side] -= take;
      give -= take;
      if (give <= 1e-6) break;
    }
    return out;
  };

  return { odd: widen(o), even: widen(e), pages: {} };
}

/** `count` page numbers spread evenly across the document. */
function spreadSample(numPages: number, count: number): number[] {
  const n = Math.min(count, numPages);
  const pages: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = Math.max(1, Math.round(((i + 0.5) / n) * numPages));
    if (!pages.includes(p)) pages.push(p);
  }
  return pages;
}

/** Fraction of the page width that survives the crop, for the tighter parity. */
export function croppedWidthFactor(crop: DocumentCrop): number {
  return Math.min(1 - crop.odd.left - crop.odd.right, 1 - crop.even.left - crop.even.right);
}

/**
 * Measure a document once and return its uniform per-parity crop, along with
 * each measured page's own box (see `pageCropBox`). Short documents (the
 * common case for a paper) are measured in full; longer ones from an evenly
 * spread sample, and the pages in between use the parity box alone.
 * Untrustworthy pages are skipped.
 */
export async function measureDocumentCrop(
  pdfDoc: PDFDocumentProxy,
  options?: AutoTrimOptions,
): Promise<DocumentCrop> {
  const canvas = document.createElement('canvas');
  const odd: CropBox[] = [];
  const even: CropBox[] = [];
  const pages: Record<number, CropBox> = {};
  for (const page of spreadSample(pdfDoc.numPages, UNIFORM_SAMPLES)) {
    let box: CropBox | null = null;
    try {
      box = await detectPdfPageCrop(pdfDoc, page, canvas, options);
    } catch (err) {
      console.error(`Auto-trim failed to measure page ${page}:`, err);
    }
    if (!box) continue;
    (page % 2 === 1 ? odd : even).push(box);
    pages[page] = box;
  }
  canvas.width = 0;
  canvas.height = 0;
  return { ...unifyCrops(odd, even), pages };
}
