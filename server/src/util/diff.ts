/**
 * Line diff for the version history.
 *
 * Myers' O(ND) algorithm in its linear-space form (the divide-and-conquer
 * "middle snake" variant from the 1986 paper), so a long document with a long
 * edit does not allocate a trace the size of the edit squared. Lines are
 * interned to integers first, so the inner loop compares numbers, not strings.
 *
 * The output is unified-diff shaped: hunks of context, added and removed lines,
 * each line carrying its old and new line number so a viewer can draw two
 * gutters without re-deriving them.
 */

export type DiffLineType = 'context' | 'add' | 'del';

export interface DiffLine {
  type: DiffLineType;
  text: string;
  /** 1-based line number in the old text; absent on added lines. */
  oldNo?: number;
  /** 1-based line number in the new text; absent on removed lines. */
  newNo?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface LineDiff {
  hunks: DiffHunk[];
  added: number;
  removed: number;
}

/** One step of the edit script: keep, delete (from a) or insert (from b). */
export type EditOp =
  | { type: 'eq'; aIndex: number; bIndex: number }
  | { type: 'del'; aIndex: number }
  | { type: 'add'; bIndex: number };

/** Intern each line so the search compares integers. */
function intern(a: string[], b: string[]): { ia: Int32Array; ib: Int32Array } {
  const ids = new Map<string, number>();
  const id = (s: string): number => {
    let v = ids.get(s);
    if (v === undefined) {
      v = ids.size;
      ids.set(s, v);
    }
    return v;
  };
  const ia = new Int32Array(a.length);
  const ib = new Int32Array(b.length);
  for (let i = 0; i < a.length; i++) ia[i] = id(a[i]);
  for (let i = 0; i < b.length; i++) ib[i] = id(b[i]);
  return { ia, ib };
}

interface Snake {
  /** Start of the snake, in the coordinates of the sub-problem. */
  x: number;
  y: number;
  /** End of the snake (exclusive). */
  u: number;
  v: number;
}

/**
 * Find the middle snake of the shortest edit script between a[aLo, aHi) and
 * b[bLo, bHi), running the forward and reverse searches in lockstep until they
 * overlap. Both sequences must be non-empty.
 */
function middleSnake(
  a: Int32Array, aLo: number, aHi: number,
  b: Int32Array, bLo: number, bHi: number,
  vf: Int32Array, vb: Int32Array
): Snake {
  const n = aHi - aLo;
  const m = bHi - bLo;
  const delta = n - m;
  const odd = (delta & 1) !== 0;
  const max = Math.ceil((n + m) / 2) + 1;
  const off = max + 1;

  // vf[k]: furthest x reached on diagonal k (x - y = k) by the forward search.
  // vb[kr]: furthest reversed-x reached on reversed diagonal kr by the reverse
  // search, which is a forward search over the reversed sequences: xr = n - x,
  // yr = m - y, kr = xr - yr = delta - k.
  vf[off + 1] = 0;
  vb[off + 1] = 0;

  for (let d = 0; d <= max; d++) {
    // Forward search.
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && vf[off + k - 1] < vf[off + k + 1])) {
        x = vf[off + k + 1];
      } else {
        x = vf[off + k - 1] + 1;
      }
      let y = x - k;
      const xStart = x;
      const yStart = y;
      while (x < n && y < m && a[aLo + x] === b[bLo + y]) {
        x++;
        y++;
      }
      vf[off + k] = x;
      if (odd) {
        const kr = delta - k;
        if (kr >= -(d - 1) && kr <= d - 1 && x + vb[off + kr] >= n) {
          return { x: xStart, y: yStart, u: x, v: y };
        }
      }
    }

    // Reverse search.
    for (let kr = -d; kr <= d; kr += 2) {
      let xr: number;
      if (kr === -d || (kr !== d && vb[off + kr - 1] < vb[off + kr + 1])) {
        xr = vb[off + kr + 1];
      } else {
        xr = vb[off + kr - 1] + 1;
      }
      let yr = xr - kr;
      const xrStart = xr;
      const yrStart = yr;
      while (xr < n && yr < m && a[aHi - 1 - xr] === b[bHi - 1 - yr]) {
        xr++;
        yr++;
      }
      vb[off + kr] = xr;
      if (!odd) {
        const k = delta - kr;
        if (k >= -d && k <= d && xr + vf[off + k] >= n) {
          return { x: n - xr, y: m - yr, u: n - xrStart, v: m - yrStart };
        }
      }
    }
  }

  // Unreachable for non-empty inputs: the searches always meet by d = max.
  return { x: 0, y: 0, u: 0, v: 0 };
}

/** The shortest edit script turning `a` into `b`, as ordered ops. */
export function diffSequences(a: string[], b: string[]): EditOp[] {
  const { ia, ib } = intern(a, b);
  const ops: EditOp[] = [];
  const size = 2 * (Math.ceil((a.length + b.length) / 2) + 1) + 3;
  const vf = new Int32Array(size);
  const vb = new Int32Array(size);

  const rec = (aLo: number, aHi: number, bLo: number, bHi: number): void => {
    // Common prefix.
    while (aLo < aHi && bLo < bHi && ia[aLo] === ib[bLo]) {
      ops.push({ type: 'eq', aIndex: aLo, bIndex: bLo });
      aLo++;
      bLo++;
    }
    // Common suffix, emitted after the middle.
    let suffix = 0;
    while (aLo < aHi - suffix && bLo < bHi - suffix && ia[aHi - 1 - suffix] === ib[bHi - 1 - suffix]) {
      suffix++;
    }
    const aEnd = aHi - suffix;
    const bEnd = bHi - suffix;

    const n = aEnd - aLo;
    const m = bEnd - bLo;
    if (n === 0) {
      for (let j = bLo; j < bEnd; j++) ops.push({ type: 'add', bIndex: j });
    } else if (m === 0) {
      for (let i = aLo; i < aEnd; i++) ops.push({ type: 'del', aIndex: i });
    } else {
      const s = middleSnake(ia, aLo, aEnd, ib, bLo, bEnd, vf, vb);
      const progress = (s.x > 0 || s.y > 0) && (s.u < n || s.v < m) || (s.u > s.x);
      if (!progress) {
        // Cannot happen after prefix/suffix trimming (D ≥ 2 splits into two
        // strictly smaller halves), but never loop forever on a bad snake.
        for (let i = aLo; i < aEnd; i++) ops.push({ type: 'del', aIndex: i });
        for (let j = bLo; j < bEnd; j++) ops.push({ type: 'add', bIndex: j });
      } else {
        rec(aLo, aLo + s.x, bLo, bLo + s.y);
        for (let i = 0; i < s.u - s.x; i++) {
          ops.push({ type: 'eq', aIndex: aLo + s.x + i, bIndex: bLo + s.y + i });
        }
        rec(aLo + s.u, aEnd, bLo + s.v, bEnd);
      }
    }

    for (let i = 0; i < suffix; i++) {
      ops.push({ type: 'eq', aIndex: aEnd + i, bIndex: bEnd + i });
    }
  };

  rec(0, a.length, 0, b.length);
  return ops;
}

/** Split text into lines the way a diff viewer counts them. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  // A trailing newline does not add an empty last line.
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Unified-style hunks with `context` lines of surrounding context, from the
 * edit script. Hunks closer than `2 * context` lines merge.
 */
export function diffText(before: string, after: string, context = 3): LineDiff {
  const a = splitLines(before);
  const b = splitLines(after);
  const ops = diffSequences(a, b);

  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === 'add') added++;
    else if (op.type === 'del') removed++;
  }

  const hunks: DiffHunk[] = [];
  if (added === 0 && removed === 0) return { hunks, added, removed };

  // Indices of ops that are changes; group them into hunks by proximity.
  const changeIdx: number[] = [];
  for (let i = 0; i < ops.length; i++) if (ops[i].type !== 'eq') changeIdx.push(i);

  let groupStart = 0;
  while (groupStart < changeIdx.length) {
    let groupEnd = groupStart;
    while (
      groupEnd + 1 < changeIdx.length &&
      changeIdx[groupEnd + 1] - changeIdx[groupEnd] - 1 <= 2 * context
    ) {
      groupEnd++;
    }
    const from = Math.max(0, changeIdx[groupStart] - context);
    const to = Math.min(ops.length - 1, changeIdx[groupEnd] + context);

    const lines: DiffLine[] = [];
    let oldStart = 0;
    let newStart = 0;
    let oldLines = 0;
    let newLines = 0;
    for (let i = from; i <= to; i++) {
      const op = ops[i];
      if (op.type === 'eq') {
        if (lines.length === 0) {
          oldStart = op.aIndex + 1;
          newStart = op.bIndex + 1;
        }
        lines.push({ type: 'context', text: a[op.aIndex], oldNo: op.aIndex + 1, newNo: op.bIndex + 1 });
        oldLines++;
        newLines++;
      } else if (op.type === 'del') {
        if (lines.length === 0) {
          oldStart = op.aIndex + 1;
          newStart = nextNewNo(ops, i);
        }
        lines.push({ type: 'del', text: a[op.aIndex], oldNo: op.aIndex + 1 });
        oldLines++;
      } else {
        if (lines.length === 0) {
          oldStart = nextOldNo(ops, i);
          newStart = op.bIndex + 1;
        }
        lines.push({ type: 'add', text: b[op.bIndex], newNo: op.bIndex + 1 });
        newLines++;
      }
    }
    hunks.push({ oldStart, oldLines, newStart, newLines, lines });
    groupStart = groupEnd + 1;
  }

  return { hunks, added, removed };
}

/** New-side line number a hunk starting at a deletion would be at. */
function nextNewNo(ops: EditOp[], i: number): number {
  for (let j = i; j < ops.length; j++) {
    const op = ops[j];
    if (op.type === 'eq' || op.type === 'add') return op.bIndex + 1;
  }
  // Pure trailing deletion: the position after the last new line.
  for (let j = i - 1; j >= 0; j--) {
    const op = ops[j];
    if (op.type === 'eq' || op.type === 'add') return op.bIndex + 2;
  }
  return 1;
}

/** Old-side line number a hunk starting at an insertion would be at. */
function nextOldNo(ops: EditOp[], i: number): number {
  for (let j = i; j < ops.length; j++) {
    const op = ops[j];
    if (op.type === 'eq' || op.type === 'del') return op.aIndex + 1;
  }
  for (let j = i - 1; j >= 0; j--) {
    const op = ops[j];
    if (op.type === 'eq' || op.type === 'del') return op.aIndex + 2;
  }
  return 1;
}
