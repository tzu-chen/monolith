/**
 * Line diff against the last successful compile.
 *
 * The handoff's editor gutter carries 2px bars marking lines that changed since
 * the last compile: `ok` for added, `accent` for modified. The status bar
 * summarises the same data as `+N ~M since last compile`.
 *
 * A full LCS over a long document is quadratic, so this trims the common prefix
 * and suffix first — for the incremental edits this actually sees, that usually
 * leaves a handful of lines to align.
 */

export type LineChange = 'added' | 'modified';

/** 1-based line number → change kind. Unchanged lines are absent. */
export type DiffMap = Map<number, LineChange>;

export interface DiffSummary {
  added: number;
  modified: number;
}

/** Above this many differing lines, mark the whole run added rather than align it. */
const MAX_ALIGN = 400;

export function diffLines(before: string, after: string): DiffMap {
  const result: DiffMap = new Map();
  if (before === after) return result;

  const a = before.split('\n');
  const b = after.split('\n');

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);

  if (midB.length === 0) return result; // pure deletion — nothing to mark
  if (midA.length === 0) {
    for (let i = 0; i < midB.length; i++) result.set(start + i + 1, 'added');
    return result;
  }
  if (midA.length > MAX_ALIGN || midB.length > MAX_ALIGN) {
    for (let i = 0; i < midB.length; i++) result.set(start + i + 1, 'added');
    return result;
  }

  // Walk the LCS table, collecting lines of `b` the alignment did not pair with
  // an identical line of `a`, and counting the lines of `a` it dropped.
  const lcs = buildLcs(midA, midB);
  let i = 0;
  let j = 0;
  let removed = 0;
  const unmatched: number[] = [];
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      removed++;
      i++;
    } else {
      unmatched.push(j);
      j++;
    }
  }
  removed += midA.length - i;
  for (; j < midB.length; j++) unmatched.push(j);

  // A new line that displaced a removed one reads as a modification; one that
  // displaced nothing reads as an addition.
  let modifiedBudget = removed;
  for (const idx of unmatched) {
    const kind: LineChange = modifiedBudget > 0 ? 'modified' : 'added';
    if (modifiedBudget > 0) modifiedBudget--;
    result.set(start + idx + 1, kind);
  }

  return result;
}

function buildLcs(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

export function summarise(diff: DiffMap): DiffSummary {
  let added = 0;
  let modified = 0;
  for (const kind of diff.values()) {
    if (kind === 'added') added++;
    else modified++;
  }
  return { added, modified };
}
