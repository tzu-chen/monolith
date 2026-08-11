export interface NavigatePaper {
  id: number;
  arxiv_id: string;
  title: string;
  authors: string;
  published: string;
  categories: string;
  status: string;
  summary: string;
}

export interface ScribeAttachment {
  id: string;
  subject: string;
  filename: string;
  type: string;
  size: number;
  createdAt: string;
}

export async function fetchPapers(): Promise<{ papers: NavigatePaper[]; error?: string }> {
  try {
    const res = await fetch('/api/references/papers');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { papers: [], error: data.error || `Failed: ${res.status}` };
    }
    const papers = await res.json();
    return { papers: Array.isArray(papers) ? papers : [] };
  } catch {
    return { papers: [], error: 'Failed to fetch papers' };
  }
}

export async function fetchAttachments(): Promise<{ attachments: ScribeAttachment[]; error?: string }> {
  try {
    const res = await fetch('/api/references/attachments');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { attachments: [], error: data.error || `Failed: ${res.status}` };
    }
    const attachments = await res.json();
    return { attachments: Array.isArray(attachments) ? attachments : [] };
  } catch {
    return { attachments: [], error: 'Failed to fetch attachments' };
  }
}

/** Cite keys already present in the project's target .bib (to flag "already imported"). */
export async function fetchLibraryKeys(file?: string): Promise<string[]> {
  try {
    const qs = file ? `?file=${encodeURIComponent(file)}` : '';
    const res = await fetch(`/api/references/library${qs}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.keys) ? data.keys : [];
  } catch {
    return [];
  }
}

// The project's own reference library — the .bib entries the manager edits.

/** One `name = value` pair as it is written in the .bib. */
export interface BibField {
  name: string;
  value: string;
  kind: 'brace' | 'quote' | 'bare';
}

/** A place a key is cited, as a jump target. */
export interface CiteUse {
  file: string;
  /** 1-based, matching the editor's gutter. */
  line: number;
}

export interface LibraryEntry {
  key: string;
  type: string;
  file: string;
  fields: BibField[];
  raw: string;
  uses: CiteUse[];
  /** Human-readable defects, e.g. `missing pages`. */
  issues: string[];
}

export interface Library {
  files: string[];
  entries: LibraryEntry[];
  /** Keys cited in the sources that no .bib defines. */
  missing: { key: string; uses: CiteUse[] }[];
}

const EMPTY_LIBRARY: Library = { files: [], entries: [], missing: [] };

/** Read every .bib entry in the project, joined to its `\cite` uses. */
export async function fetchLibrary(): Promise<Library & { error?: string }> {
  try {
    const res = await fetch('/api/references/entries');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ...EMPTY_LIBRARY, error: data.error || `Failed: ${res.status}` };
    return { ...EMPTY_LIBRARY, ...data };
  } catch {
    return { ...EMPTY_LIBRARY, error: 'Failed to read the reference library' };
  }
}

/**
 * Edit one entry in place. Pass `fields` to update named fields (an empty value
 * removes one) or `raw` to replace the whole entry; the cite key never moves.
 */
export async function updateLibraryEntry(input: {
  key: string;
  file: string;
  fields?: Record<string, string>;
  raw?: string;
}): Promise<{ error?: string }> {
  try {
    const res = await fetch('/api/references/entries', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `Failed: ${res.status}` };
    return {};
  } catch {
    return { error: 'Update request failed' };
  }
}

/** The value of one field, or `''` when the entry does not carry it. */
export function fieldValue(entry: LibraryEntry, name: string): string {
  return entry.fields.find((f) => f.name === name)?.value ?? '';
}

/** `Thouless, Kohmoto, …` — the author list, trimmed to a row's width. */
export function shortAuthors(entry: LibraryEntry): string {
  const raw = fieldValue(entry, 'author') || fieldValue(entry, 'editor');
  if (!raw) return '';
  const names = raw.split(/\s+and\s+/).map((name) => {
    const trimmed = name.trim().replace(/[{}]/g, '');
    // "Thouless, D. J." is already surname-first; "D. J. Thouless" is not.
    const surname = trimmed.includes(',') ? trimmed.split(',')[0] : trimmed.split(/\s+/).pop();
    return (surname ?? trimmed).trim();
  });
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} et al.`;
}

/** `Phys. Rev. Lett. 1982` — the publication line under a title. */
export function sourceLine(entry: LibraryEntry): string {
  const venue =
    fieldValue(entry, 'journal') ||
    fieldValue(entry, 'booktitle') ||
    fieldValue(entry, 'publisher') ||
    fieldValue(entry, 'school') ||
    fieldValue(entry, 'institution') ||
    fieldValue(entry, 'archiveprefix');
  const year = fieldValue(entry, 'year');
  return [venue, year].filter(Boolean).join(' ');
}

export interface LookupResult {
  bibtex?: string;
  key?: string;
  title?: string;
  error?: string;
}

/** Resolve a DOI or arXiv ID to BibTeX via the server. */
export async function lookupReference(query: string): Promise<LookupResult> {
  try {
    const res = await fetch('/api/references/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `Lookup failed: ${res.status}` };
    return data;
  } catch {
    return { error: 'Lookup request failed' };
  }
}

export interface ImportInput {
  paperIds?: number[];
  attachmentIds?: string[];
  bibtex?: string;
  file?: string;
}

export interface ImportResult {
  file: string;
  added: number;
  skipped: number;
  /** Cite keys newly added to the .bib. */
  keys: string[];
  /** Cite keys that were already present (skipped as duplicates). */
  skippedKeys: string[];
  errors?: string[];
  error?: string;
}

/** Merge selected references into the project's .bib (non-destructive, dedup by key). */
export async function importReferences(input: ImportInput): Promise<ImportResult> {
  try {
    const res = await fetch('/api/references/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { file: '', added: 0, skipped: 0, keys: [], skippedKeys: [], error: data.error || `Failed: ${res.status}` };
    }
    return { skippedKeys: [], ...data };
  } catch {
    return { file: '', added: 0, skipped: 0, keys: [], skippedKeys: [], error: 'Import request failed' };
  }
}
