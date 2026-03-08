import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

export interface SyncTexForwardResult {
  page: number;
  x: number;
  y: number;
  h: number;
  w: number;
}

export interface SyncTexInverseResult {
  file: string;
  line: number;
  col: number;
}

interface SyncTexInput {
  tag: number;
  name: string;
}

interface SyncTexRecord {
  type: 'h' | 'v' | 'k' | 'g' | 'x' | '$';
  link: number; // input file tag
  line: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
  d: number; // depth
  page: number;
}

interface SyncTexData {
  inputs: SyncTexInput[];
  records: SyncTexRecord[];
}

/**
 * Parse a decompressed SyncTeX file content.
 *
 * The SyncTeX format is a line-based text format:
 * - "Input:<tag>:<path>" — declares input files
 * - "{<page>" / "}" — page boundaries
 * - "[<link>,<line>,<col>" — begin hbox
 * - "]" — end hbox
 * - "(<link>,<line>,<col>" — begin vbox
 * - ")" — end vbox
 * - "h<link>,<line>,<col>:<x>,<y>:<w>,<h>,<d>" — horizontal content
 * - "v<link>,<line>,<col>:<x>,<y>:<w>,<h>,<d>" — vertical content
 * - "x<link>,<line>,<col>:<x>,<y>" — current position (ref point)
 * - "k<link>,<line>,<col>:<x>,<y>:<w>" — kern
 * - "g<link>,<line>,<col>:<x>,<y>" — glue
 * - "$<link>,<line>,<col>:<x>,<y>" — math mode
 */
function parseSyncTex(content: string): SyncTexData {
  const inputs: SyncTexInput[] = [];
  const records: SyncTexRecord[] = [];
  let currentPage = 0;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    // Input file declaration
    if (line.startsWith('Input:')) {
      const rest = line.slice(6);
      const colonIdx = rest.indexOf(':');
      if (colonIdx >= 0) {
        const tag = parseInt(rest.slice(0, colonIdx), 10);
        const name = rest.slice(colonIdx + 1);
        if (!isNaN(tag)) {
          inputs.push({ tag, name });
        }
      }
      continue;
    }

    // Page start
    if (line.startsWith('{')) {
      currentPage = parseInt(line.slice(1), 10) || 0;
      continue;
    }

    // Page end
    if (line === '}') {
      continue;
    }

    // Hbox/vbox start: [link,line,col or (link,line,col
    if (line.startsWith('[') || line.startsWith('(')) {
      const parts = line.slice(1).split(',');
      if (parts.length >= 3) {
        records.push({
          type: 'h',
          link: parseInt(parts[0], 10) || 0,
          line: parseInt(parts[1], 10) || 0,
          col: parseInt(parts[2], 10) || 0,
          x: 0, y: 0, w: 0, h: 0, d: 0,
          page: currentPage,
        });
      }
      continue;
    }

    // Content records: h, v, x, k, g, $
    const typeChar = line[0];
    if ('hvxkg$'.includes(typeChar) && line.length > 1) {
      const rest = line.slice(1);
      // Parse "link,line,col:x,y:w,h,d" or "link,line,col:x,y" or "link,line,col:x,y:w"
      const colonParts = rest.split(':');
      if (colonParts.length >= 2) {
        const idParts = colonParts[0].split(',');
        const posParts = colonParts[1].split(',');
        const sizeParts = colonParts.length >= 3 ? colonParts[2].split(',') : [];

        const record: SyncTexRecord = {
          type: typeChar as SyncTexRecord['type'],
          link: parseInt(idParts[0], 10) || 0,
          line: parseInt(idParts[1], 10) || 0,
          col: parseInt(idParts[2], 10) || 0,
          x: parseFloat(posParts[0]) || 0,
          y: parseFloat(posParts[1]) || 0,
          w: parseFloat(sizeParts[0]) || 0,
          h: parseFloat(sizeParts[1]) || 0,
          d: parseFloat(sizeParts[2]) || 0,
          page: currentPage,
        };
        records.push(record);
      }
    }
  }

  return { inputs, records };
}

/**
 * Find the .synctex.gz file for a given project build.
 */
async function findSyncTexFile(projectRoot: string, mainFile: string): Promise<string | null> {
  const baseName = path.basename(mainFile, path.extname(mainFile));
  const buildDir = path.join(projectRoot, 'build');

  // Try .synctex.gz first, then .synctex
  const gzPath = path.join(buildDir, `${baseName}.synctex.gz`);
  const plainPath = path.join(buildDir, `${baseName}.synctex`);

  try {
    await fs.access(gzPath);
    return gzPath;
  } catch {}

  try {
    await fs.access(plainPath);
    return plainPath;
  } catch {}

  return null;
}

async function loadSyncTexData(projectRoot: string, mainFile: string): Promise<SyncTexData | null> {
  const filePath = await findSyncTexFile(projectRoot, mainFile);
  if (!filePath) return null;

  const raw = await fs.readFile(filePath);
  let content: string;

  if (filePath.endsWith('.gz')) {
    const decompressed = await gunzip(raw);
    content = decompressed.toString('utf-8');
  } else {
    content = raw.toString('utf-8');
  }

  return parseSyncTex(content);
}

/**
 * Convert SyncTeX internal units to PDF points.
 * SyncTeX uses "scaled points" — 1 bp = 65536 sp.
 * Most SyncTeX files use a unit value in the preamble.
 * We approximate: coordinates are typically in bp (big points = 1/72 inch).
 */
const UNIT = 65781.76; // approximate conversion factor

function toPoints(val: number): number {
  return val / UNIT;
}

/**
 * Resolve an input tag to a relative file path.
 */
function resolveInputPath(inputs: SyncTexInput[], tag: number, projectRoot: string): string {
  const input = inputs.find((i) => i.tag === tag);
  if (!input) return '';
  // Make path relative to project root
  const absPath = path.isAbsolute(input.name) ? input.name : path.join(projectRoot, input.name);
  return path.relative(projectRoot, absPath);
}

/**
 * Find the input tag for a given relative file path.
 */
function findInputTag(inputs: SyncTexInput[], filePath: string, projectRoot: string): number | null {
  for (const input of inputs) {
    const absInput = path.isAbsolute(input.name) ? input.name : path.join(projectRoot, input.name);
    const relInput = path.relative(projectRoot, absInput);
    if (relInput === filePath || input.name.endsWith(filePath)) {
      return input.tag;
    }
  }
  return null;
}

/**
 * Forward sync: source position → PDF position.
 */
export async function forwardSync(
  projectRoot: string,
  mainFile: string,
  file: string,
  line: number,
  col: number
): Promise<SyncTexForwardResult | null> {
  const data = await loadSyncTexData(projectRoot, mainFile);
  if (!data) return null;

  const tag = findInputTag(data.inputs, file, projectRoot);
  if (tag == null) return null;

  // Find the best matching record for this file and line
  let best: SyncTexRecord | null = null;
  let bestDist = Infinity;

  for (const rec of data.records) {
    if (rec.link !== tag) continue;
    if (rec.line === 0) continue;

    const dist = Math.abs(rec.line - line);
    if (dist < bestDist || (dist === bestDist && rec.type === 'h')) {
      bestDist = dist;
      best = rec;
    }
  }

  if (!best) return null;

  return {
    page: best.page,
    x: toPoints(best.x),
    y: toPoints(best.y),
    h: best.h ? toPoints(best.h) : 12,
    w: best.w ? toPoints(best.w) : 300,
  };
}

/**
 * Inverse sync: PDF position → source position.
 */
export async function inverseSync(
  projectRoot: string,
  mainFile: string,
  page: number,
  x: number,
  y: number
): Promise<SyncTexInverseResult | null> {
  const data = await loadSyncTexData(projectRoot, mainFile);
  if (!data) return null;

  // Convert PDF points back to SyncTeX units for comparison
  const targetX = x * UNIT;
  const targetY = y * UNIT;

  // Find records on the given page, closest to the click position
  let best: SyncTexRecord | null = null;
  let bestDist = Infinity;

  for (const rec of data.records) {
    if (rec.page !== page) continue;
    if (rec.line === 0) continue;

    // Distance metric: primarily vertical (y), secondarily horizontal (x)
    const dy = Math.abs(rec.y - targetY);
    const dx = Math.abs(rec.x - targetX);
    const dist = dy * 10 + dx; // weight y-distance more heavily

    if (dist < bestDist) {
      bestDist = dist;
      best = rec;
    }
  }

  if (!best) return null;

  const file = resolveInputPath(data.inputs, best.link, projectRoot);
  return {
    file,
    line: best.line,
    col: best.col,
  };
}

/**
 * Detect the main .tex file from the build directory.
 * Falls back to 'main.tex'.
 */
export async function detectMainFile(projectRoot: string): Promise<string> {
  const buildDir = path.join(projectRoot, 'build');
  try {
    const files = await fs.readdir(buildDir);
    const synctexFile = files.find((f) => f.endsWith('.synctex.gz') || f.endsWith('.synctex'));
    if (synctexFile) {
      const baseName = synctexFile.replace(/\.synctex(\.gz)?$/, '');
      return `${baseName}.tex`;
    }
  } catch {}
  return 'main.tex';
}
