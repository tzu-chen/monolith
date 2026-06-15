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
