/**
 * Intrinsic size of a figure, read from its own bytes.
 *
 * The plot manager's preview header states what you are about to
 * `\includegraphics` — "216 KB · 6.4 × 4.2 in" — and the honest source for that
 * is the file itself, not a database column. Vector formats carry a physical
 * size (PDF points, SVG lengths) and are reported in inches, the unit LaTeX
 * lays them out in; raster formats only know pixels and are reported as such.
 *
 * Every probe reads a header and gives up quietly on anything it does not
 * recognise — a missing dimension line is not worth an error.
 */

export interface ImageMeta {
  /** File size in bytes. */
  bytes: number;
  width?: number;
  height?: number;
  unit?: 'in' | 'px';
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PDF lengths are in points; TeX and the rest of the world want inches. */
const POINTS_PER_INCH = 72;

/** Absolute CSS/SVG units per inch, for an SVG that gives `width="6.4in"`. */
const SVG_UNITS_PER_INCH: Record<string, number> = {
  in: 1,
  pt: 72,
  pc: 6,
  mm: 25.4,
  cm: 2.54,
  px: 96,
  '': 96, // unitless SVG lengths are user units, i.e. px
};

function png(buf: Buffer): ImageMeta | null {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  return { bytes: buf.length, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), unit: 'px' };
}

function jpeg(buf: Buffer): ImageMeta | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // SOF0–SOF15, excluding the non-frame markers DHT (c4), JPG (c8) and DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { bytes: buf.length, height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), unit: 'px' };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { bytes: buf.length };
}

function gif(buf: Buffer): ImageMeta | null {
  if (buf.length < 10 || buf.subarray(0, 3).toString('latin1') !== 'GIF') return null;
  return { bytes: buf.length, width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), unit: 'px' };
}

function pdf(buf: Buffer): ImageMeta | null {
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return null;
  // The first MediaBox is the first page's, which is the one being included.
  const head = buf.subarray(0, Math.min(buf.length, 512 * 1024)).toString('latin1');
  const box = head.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
  if (!box) return { bytes: buf.length };
  const [x0, y0, x1, y1] = box.slice(1, 5).map(Number);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return { bytes: buf.length };
  return {
    bytes: buf.length,
    width: Math.abs(x1 - x0) / POINTS_PER_INCH,
    height: Math.abs(y1 - y0) / POINTS_PER_INCH,
    unit: 'in',
  };
}

/** `6.4in`, `460.8pt`, `640` → inches. */
function svgLength(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^([-\d.]+)\s*([a-z%]*)$/i);
  if (!m) return null;
  const value = Number(m[1]);
  const perInch = SVG_UNITS_PER_INCH[m[2].toLowerCase()];
  if (!Number.isFinite(value) || perInch === undefined) return null;
  return value / perInch;
}

function svg(buf: Buffer): ImageMeta | null {
  const head = buf.subarray(0, Math.min(buf.length, 64 * 1024)).toString('utf-8');
  const tag = head.match(/<svg\b[^>]*>/i);
  if (!tag) return null;
  const attr = (name: string) => tag[0].match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];

  const width = svgLength(attr('width'));
  const height = svgLength(attr('height'));
  if (width !== null && height !== null) return { bytes: buf.length, width, height, unit: 'in' };

  // No explicit size: fall back to the viewBox, whose user units are px.
  const viewBox = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (viewBox && viewBox.length === 4 && viewBox.every(Number.isFinite)) {
    return { bytes: buf.length, width: Math.abs(viewBox[2]), height: Math.abs(viewBox[3]), unit: 'px' };
  }
  return { bytes: buf.length };
}

/** Probe a figure's bytes for its intrinsic size. Size is always reported. */
export function readImageMeta(buf: Buffer): ImageMeta {
  return png(buf) ?? jpeg(buf) ?? gif(buf) ?? pdf(buf) ?? svg(buf) ?? { bytes: buf.length };
}
