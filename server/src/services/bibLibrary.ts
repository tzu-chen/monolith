import fs from 'fs/promises';
import path from 'path';
import { parseEntries, parseFields, type BibField } from './bibtex.js';
import { listProjectFiles } from './scope.js';

/**
 * The project's reference library: every entry in every `.bib` file, joined to
 * where each key is cited in the `.tex` sources.
 *
 * This backs the reference manager's list and entry editor. It runs server-side
 * for the same reason scope resolution does — it reads an unbounded set of files
 * and the client only wants the answer.
 */

/** One `\cite` of a key, as a place you can jump to. */
export interface CiteUse {
  file: string;
  /** 1-based, matching the editor's gutter. */
  line: number;
}

export interface LibraryEntry {
  key: string;
  type: string;
  /** The `.bib` file this entry lives in, project-relative. */
  file: string;
  fields: BibField[];
  raw: string;
  uses: CiteUse[];
  /** Human-readable defects, e.g. `missing pages`. Empty when the entry is clean. */
  issues: string[];
}

export interface Library {
  /** Every `.bib` file found in the project, project-relative. */
  files: string[];
  entries: LibraryEntry[];
  /** Keys cited in the sources that no `.bib` file defines. */
  missing: { key: string; uses: CiteUse[] }[];
}

/**
 * Fields an entry of each type is expected to carry. Anything absent is
 * reported as an issue — this is a triage list for a physics manuscript, so
 * `article` includes volume and pages rather than only BibTeX's bare minimum.
 */
const REQUIRED: Record<string, string[]> = {
  article: ['author', 'title', 'journal', 'year', 'volume', 'pages'],
  book: ['author', 'title', 'publisher', 'year'],
  booklet: ['title'],
  inbook: ['author', 'title', 'publisher', 'year'],
  incollection: ['author', 'title', 'booktitle', 'publisher', 'year'],
  inproceedings: ['author', 'title', 'booktitle', 'year'],
  conference: ['author', 'title', 'booktitle', 'year'],
  mastersthesis: ['author', 'title', 'school', 'year'],
  phdthesis: ['author', 'title', 'school', 'year'],
  techreport: ['author', 'title', 'institution', 'year'],
  unpublished: ['author', 'title', 'note'],
  misc: ['title'],
};
const REQUIRED_DEFAULT = ['title', 'year'];

/** `author` may stand in for `editor` and vice versa on the book-like types. */
const EITHER_OR: Record<string, string> = { author: 'editor', editor: 'author' };

/**
 * Any `\cite`-family command: `\cite`, `\citep`, `\parencite`, `\nocite`,
 * `\autocite*`, … followed by optional `[…]` options and a `{key,key}` group.
 */
const CITE_RE = /\\[a-zA-Z]*[Cc]ite[a-zA-Z]*\*?\s*(?:\[[^\]]*\]\s*)*\{([^}]*)\}/g;

/**
 * Blank out `%` comments while preserving every offset, so a match index still
 * maps to the right line. An escaped `\%` is a literal percent, not a comment.
 */
function blankComments(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '%' && (i === 0 || line[i - 1] !== '\\')) {
          return line.slice(0, i) + ' '.repeat(line.length - i);
        }
      }
      return line;
    })
    .join('\n');
}

/** Offsets at which each line starts, for turning a match index into a line number. */
function lineStarts(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineAt(starts: number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

async function readIfFile(abs: string): Promise<string | null> {
  try {
    return await fs.readFile(abs, 'utf-8');
  } catch {
    return null;
  }
}

/** Every `\cite`d key in the project, with the file and line of each use. */
async function collectCites(projectRoot: string): Promise<Map<string, CiteUse[]>> {
  const uses = new Map<string, CiteUse[]>();
  const texFiles = await listProjectFiles(projectRoot, ['.tex']);

  for (const file of texFiles) {
    const content = await readIfFile(path.join(projectRoot, file));
    if (content === null) continue;
    const source = blankComments(content);
    const starts = lineStarts(source);

    CITE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CITE_RE.exec(source)) !== null) {
      const line = lineAt(starts, match.index);
      for (const raw of match[1].split(',')) {
        const key = raw.trim();
        if (!key) continue;
        const list = uses.get(key);
        if (list) list.push({ file, line });
        else uses.set(key, [{ file, line }]);
      }
    }
  }

  return uses;
}

function findIssues(type: string, fields: BibField[]): string[] {
  const present = new Set(fields.filter((f) => f.value.trim().length > 0).map((f) => f.name));
  const required = REQUIRED[type] ?? REQUIRED_DEFAULT;
  const issues: string[] = [];
  for (const name of required) {
    if (present.has(name)) continue;
    const alt = EITHER_OR[name];
    if (alt && present.has(alt)) continue;
    issues.push(`missing ${name}`);
  }
  return issues;
}

/** Read every `.bib` in the project and join it to the `\cite`s in the sources. */
export async function readLibrary(projectRoot: string): Promise<Library> {
  const files = (await listProjectFiles(projectRoot, ['.bib'])).sort();
  const uses = await collectCites(projectRoot);

  const entries: LibraryEntry[] = [];
  const seen = new Map<string, LibraryEntry>();

  for (const file of files) {
    const content = await readIfFile(path.join(projectRoot, file));
    if (content === null) continue;
    for (const entry of parseEntries(content)) {
      const fields = parseFields(entry.raw);
      const record: LibraryEntry = {
        key: entry.key,
        type: entry.type,
        file,
        fields,
        raw: entry.raw,
        uses: uses.get(entry.key) ?? [],
        issues: findIssues(entry.type, fields),
      };
      const duplicate = seen.get(entry.key);
      if (duplicate) {
        // Both copies are flagged: whichever the user opens, the clash is visible.
        if (!duplicate.issues.includes('duplicate key')) duplicate.issues.push('duplicate key');
        record.issues.push('duplicate key');
      } else {
        seen.set(entry.key, record);
      }
      entries.push(record);
    }
  }

  const missing = [...uses.entries()]
    .filter(([key]) => !seen.has(key))
    .map(([key, list]) => ({ key, uses: list }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return { files, entries, missing };
}

/**
 * Rewrite one entry in place.
 *
 * `updates` maps a field name to its new value; an empty value removes the
 * field. Fields absent from `updates` keep the text and delimiter they were
 * written with, so editing the year never reflows the abstract.
 */
export function applyFieldUpdates(fields: BibField[], updates: Record<string, string>): BibField[] {
  const next = fields.map((f) => ({ ...f }));
  for (const [rawName, value] of Object.entries(updates)) {
    const name = rawName.toLowerCase();
    const existing = next.find((f) => f.name === name);
    if (existing) {
      existing.value = value;
      // A value that no longer looks like a number or macro needs delimiters.
      if (existing.kind === 'bare' && !/^[A-Za-z0-9_:.-]*$/.test(value)) existing.kind = 'brace';
    } else if (value.trim().length > 0) {
      next.push({ name, value, kind: 'brace' });
    }
  }
  return next.filter((f) => f.value.trim().length > 0);
}
