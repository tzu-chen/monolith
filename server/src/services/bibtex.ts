/**
 * Minimal BibTeX utilities: entry parsing, non-destructive merge, value escaping,
 * and generation of entries for Scribe attachments. Deliberately dependency-free —
 * it only needs to split entries by cite key and dedup, not fully model BibTeX.
 */

export interface BibEntry {
  key: string;
  raw: string;
}

/**
 * Split a BibTeX string into top-level entries via brace matching. Only `{`-delimited
 * entries are recognized (the universal form emitted by doi.org, arXiv, and Navigate).
 * `@string`/`@comment`/`@preamble` and keyless blocks are skipped.
 */
export function parseEntries(bibtex: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const n = bibtex.length;
  let i = 0;
  while (i < n) {
    const at = bibtex.indexOf('@', i);
    if (at === -1) break;

    // Entry type: letters following '@'.
    let j = at + 1;
    while (j < n && /[a-zA-Z]/.test(bibtex[j])) j++;
    const type = bibtex.slice(at + 1, j).toLowerCase();

    while (j < n && /\s/.test(bibtex[j])) j++;
    if (bibtex[j] !== '{') {
      i = at + 1;
      continue;
    }

    // Match braces to find the end of the entry; the cite key runs up to the first
    // top-level comma.
    let depth = 1;
    let k = j + 1;
    let keyEnd = -1;
    for (; k < n && depth > 0; k++) {
      const c = bibtex[k];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === ',' && depth === 1 && keyEnd === -1) keyEnd = k;
    }

    const raw = bibtex.slice(at, k);
    const key = (keyEnd !== -1 ? bibtex.slice(j + 1, keyEnd) : bibtex.slice(j + 1, k - 1)).trim();

    if (key && type !== 'string' && type !== 'comment' && type !== 'preamble') {
      entries.push({ key, raw });
    }
    i = k;
  }
  return entries;
}

/** Cite keys present in a BibTeX string. */
export function extractKeys(bibtex: string): string[] {
  return parseEntries(bibtex).map((e) => e.key);
}

/**
 * Append entries from `incoming` to `existing`, skipping any whose key already exists
 * (and deduping within `incoming` itself). Existing entries are never rewritten.
 */
export function mergeBib(
  existing: string,
  incoming: string
): { merged: string; added: string[]; skipped: string[] } {
  const seen = new Set(extractKeys(existing));
  const added: string[] = [];
  const skipped: string[] = [];
  const blocks: string[] = [];

  for (const entry of parseEntries(incoming)) {
    if (seen.has(entry.key)) {
      skipped.push(entry.key);
      continue;
    }
    seen.add(entry.key);
    added.push(entry.key);
    blocks.push(entry.raw.trim());
  }

  let merged = existing;
  if (blocks.length > 0) {
    const block = blocks.join('\n\n');
    merged = existing.trim().length === 0 ? `${block}\n` : `${existing.replace(/\s*$/, '')}\n\n${block}\n`;
  }
  return { merged, added, skipped };
}

/** Escape LaTeX specials in a generated field value (not used on trusted raw BibTeX). */
export function escapeBibValue(s: string): string {
  return s
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

/** Build a `@misc` entry for a Scribe attachment (no structured citation metadata). */
export function attachmentToBib(att: { id: string; filename: string; subject?: string }): string {
  const key = `scribe_${att.id.slice(0, 8)}`;
  const title = att.filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
  let bib = `@misc{${key},\n`;
  bib += `  title = {${escapeBibValue(title)}},\n`;
  if (att.subject) bib += `  note = {${escapeBibValue(att.subject)}},\n`;
  bib += `  howpublished = {Personal library},\n`;
  bib += `}\n`;
  return bib;
}
