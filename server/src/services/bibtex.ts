/**
 * Minimal BibTeX utilities: entry parsing, field parsing, non-destructive merge,
 * value escaping, and generation of entries for Scribe attachments. Deliberately
 * dependency-free — it models entries as `type`, `key` and an ordered field list,
 * which is all the reference manager's entry editor needs to round-trip one entry.
 */

export interface BibEntry {
  key: string;
  /** Entry type, lowercased and without the `@` (`article`, `book`, …). */
  type: string;
  raw: string;
  /** Offsets of `raw` within the source string, for splicing an edit back in. */
  start: number;
  end: number;
}

/** One `name = value` pair, with the delimiter it was written with. */
export interface BibField {
  name: string;
  value: string;
  /** `brace` for `{…}`, `quote` for `"…"`, `bare` for a number or @string macro. */
  kind: 'brace' | 'quote' | 'bare';
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
      entries.push({ key, type, raw, start: at, end: k });
    }
    i = k;
  }
  return entries;
}

/**
 * Split one entry's body into its `name = value` fields.
 *
 * Values keep their delimiter so an untouched field round-trips exactly as
 * written — `year = 1982` stays bare, a `@string` reference is not braced.
 */
export function parseFields(raw: string): BibField[] {
  const open = raw.indexOf('{');
  if (open === -1) return [];

  // Body runs from after the cite key's comma to the entry's closing brace.
  const bodyStart = raw.indexOf(',', open);
  if (bodyStart === -1) return [];
  const body = raw.slice(bodyStart + 1, raw.lastIndexOf('}'));

  const fields: BibField[] = [];
  let i = 0;
  const n = body.length;

  while (i < n) {
    while (i < n && /[\s,]/.test(body[i])) i++;
    const nameStart = i;
    while (i < n && /[A-Za-z0-9_:.-]/.test(body[i])) i++;
    const name = body.slice(nameStart, i).trim();
    if (!name) break;

    while (i < n && /\s/.test(body[i])) i++;
    if (body[i] !== '=') {
      // Not a field after all — skip to the next comma and resync.
      while (i < n && body[i] !== ',') i++;
      continue;
    }
    i++;
    while (i < n && /\s/.test(body[i])) i++;

    let value = '';
    let kind: BibField['kind'] = 'bare';
    if (body[i] === '{') {
      let depth = 1;
      const start = ++i;
      while (i < n && depth > 0) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}') depth--;
        if (depth > 0) i++;
      }
      value = body.slice(start, i);
      kind = 'brace';
      i++;
    } else if (body[i] === '"') {
      let depth = 0;
      const start = ++i;
      while (i < n && !(body[i] === '"' && depth === 0)) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}') depth--;
        i++;
      }
      value = body.slice(start, i);
      kind = 'quote';
      i++;
    } else {
      const start = i;
      while (i < n && body[i] !== ',') i++;
      value = body.slice(start, i).trim();
      kind = 'bare';
    }

    fields.push({ name: name.toLowerCase(), value: value.replace(/\s+/g, ' ').trim(), kind });
  }

  return fields;
}

/** Braces in a field value must balance, or the rewritten entry would not parse. */
export function bracesBalanced(value: string): boolean {
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    if (i > 0 && value[i - 1] === '\\') continue;
    if (value[i] === '{') depth++;
    else if (value[i] === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

/** Render an entry back to BibTeX. Empty values are dropped, not written blank. */
export function formatEntry(type: string, key: string, fields: BibField[]): string {
  const body = fields
    .filter((f) => f.value.trim().length > 0)
    .map((f) => {
      const v = f.value.trim();
      if (f.kind === 'bare') return `  ${f.name} = ${v}`;
      if (f.kind === 'quote') return `  ${f.name} = "${v}"`;
      return `  ${f.name} = {${v}}`;
    })
    .join(',\n');
  return `@${type}{${key},\n${body},\n}`;
}

/** Replace one entry in a `.bib` source, leaving every other byte untouched. */
export function replaceEntry(source: string, entry: BibEntry, replacement: string): string {
  return source.slice(0, entry.start) + replacement + source.slice(entry.end);
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
