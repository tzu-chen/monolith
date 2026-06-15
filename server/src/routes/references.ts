import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { mergeBib, attachmentToBib, extractKeys } from '../services/bibtex.js';

const NAVIGATE_BASE = (process.env.NAVIGATE_URL || 'http://localhost:3001') + '/api';
const SCRIBE_BASE = (process.env.SCRIBE_URL || 'http://localhost:3003') + '/api';

const DEFAULT_BIB = 'references.bib';

/** Restrict the import target to a plain .bib file at the project root. */
function safeBibName(file: unknown): string {
  if (typeof file !== 'string' || !file) return DEFAULT_BIB;
  const base = path.basename(file);
  if (base !== file || !base.endsWith('.bib')) return DEFAULT_BIB;
  return base;
}

async function readBib(projectRoot: string, file: string): Promise<string> {
  try {
    return await fs.readFile(path.join(projectRoot, file), 'utf-8');
  } catch {
    return '';
  }
}

/** Parse the first entry of an arXiv Atom feed into a BibTeX @misc entry. */
function arxivAtomToBib(xml: string): { bibtex: string; key: string; title: string } | null {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entry) return null;
  const body = entry[1];
  const pick = (re: RegExp) => (body.match(re)?.[1] ?? '').replace(/\s+/g, ' ').trim();

  const title = pick(/<title>([\s\S]*?)<\/title>/);
  const idUrl = pick(/<id>([\s\S]*?)<\/id>/);
  const id = idUrl.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '');
  const published = pick(/<published>([\s\S]*?)<\/published>/);
  const year = published.slice(0, 4);
  const primary = body.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1] ?? '';
  const authors = [...body.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim()
  );
  if (!id || !title) return null;

  const key = `arxiv_${id.replace(/[^a-zA-Z0-9]/g, '')}`;
  let bibtex = `@misc{${key},\n`;
  bibtex += `  title = {${title}},\n`;
  if (authors.length) bibtex += `  author = {${authors.join(' and ')}},\n`;
  if (year) bibtex += `  year = {${year}},\n`;
  bibtex += `  eprint = {${id}},\n`;
  bibtex += `  archivePrefix = {arXiv},\n`;
  if (primary) bibtex += `  primaryClass = {${primary}},\n`;
  bibtex += `}\n`;
  return { bibtex, key, title };
}

export function createReferencesRouter(getProjectRoot: () => string | null): Router {
  const router = Router();

  // Proxy: list papers from Navigate
  router.get('/papers', async (_req: Request, res: Response) => {
    try {
      const resp = await fetch(`${NAVIGATE_BASE}/papers`);
      if (!resp.ok) {
        res.status(resp.status).json({ error: `Navigate returned ${resp.status}` });
        return;
      }
      res.json(await resp.json());
    } catch (err: any) {
      if (err.cause?.code === 'ECONNREFUSED') {
        res.status(502).json({ error: 'Navigate is not available' });
      } else {
        res.status(502).json({ error: `Failed to reach Navigate: ${err.message}` });
      }
    }
  });

  // Proxy: list attachments from Scribe
  router.get('/attachments', async (_req: Request, res: Response) => {
    try {
      const resp = await fetch(`${SCRIBE_BASE}/attachments`);
      if (!resp.ok) {
        res.status(resp.status).json({ error: `Scribe returned ${resp.status}` });
        return;
      }
      res.json(await resp.json());
    } catch (err: any) {
      if (err.cause?.code === 'ECONNREFUSED') {
        res.status(502).json({ error: 'Scribe is not available' });
      } else {
        res.status(502).json({ error: `Failed to reach Scribe: ${err.message}` });
      }
    }
  });

  // Cite keys already present in the project's target .bib (to flag "already imported")
  router.get('/library', async (req: Request, res: Response) => {
    const projectRoot = getProjectRoot();
    if (!projectRoot) {
      res.status(400).json({ error: 'No project selected' });
      return;
    }
    const file = safeBibName(req.query.file);
    const keys = extractKeys(await readBib(projectRoot, file));
    res.json({ file, keys });
  });

  // Fetch BibTeX for a DOI or arXiv ID
  router.post('/lookup', async (req: Request, res: Response) => {
    const raw = String(req.body?.query ?? '').trim();
    if (!raw) {
      res.status(400).json({ error: 'Provide a DOI or arXiv ID' });
      return;
    }
    try {
      const arxivMatch = raw.match(/^(?:arxiv:)?\s*(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7})$/i);
      if (arxivMatch) {
        const id = arxivMatch[1];
        const resp = await fetch(`http://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`);
        if (!resp.ok) {
          res.status(502).json({ error: `arXiv returned ${resp.status}` });
          return;
        }
        const parsed = arxivAtomToBib(await resp.text());
        if (!parsed) {
          res.status(404).json({ error: `No arXiv entry found for "${id}"` });
          return;
        }
        res.json(parsed);
        return;
      }

      // Treat anything else as a DOI (strip a URL prefix if present).
      const doi = raw.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
      const resp = await fetch(`https://doi.org/${encodeURIComponent(doi)}`, {
        headers: { Accept: 'application/x-bibtex' },
      });
      if (!resp.ok) {
        res.status(resp.status === 404 ? 404 : 502).json({
          error: resp.status === 404 ? `No record found for "${doi}"` : `DOI lookup returned ${resp.status}`,
        });
        return;
      }
      const bibtex = (await resp.text()).trim();
      const key = bibtex.match(/@\w+\s*\{\s*([^,\s]+)/)?.[1] ?? doi;
      const title = bibtex.match(/title\s*=\s*[{"]([^}"]+)/i)?.[1]?.trim() ?? '';
      res.json({ bibtex, key, title });
    } catch (err: any) {
      res.status(502).json({ error: `Lookup failed: ${err.message}` });
    }
  });

  // Merge selected references into the project's .bib (non-destructive, dedup by key)
  router.post('/import', async (req: Request, res: Response) => {
    try {
      const projectRoot = getProjectRoot();
      if (!projectRoot) {
        res.status(400).json({ error: 'No project selected' });
        return;
      }

      const { paperIds, attachmentIds, bibtex: rawBibtex } = req.body as {
        paperIds?: number[];
        attachmentIds?: string[];
        bibtex?: string;
      };
      const file = safeBibName(req.body?.file);

      const hasInput =
        (paperIds && paperIds.length > 0) ||
        (attachmentIds && attachmentIds.length > 0) ||
        (typeof rawBibtex === 'string' && rawBibtex.trim().length > 0);
      if (!hasInput) {
        res.status(400).json({ error: 'No references to import' });
        return;
      }

      let incoming = '';
      const errors: string[] = [];

      // Papers from Navigate (already valid BibTeX).
      if (paperIds && paperIds.length > 0) {
        try {
          const resp = await fetch(`${NAVIGATE_BASE}/export/bibtex?ids=${paperIds.join(',')}`);
          if (resp.ok) incoming += (await resp.text()) + '\n';
          else errors.push(`Navigate export failed: ${resp.status}`);
        } catch {
          errors.push('Navigate is not available');
        }
      }

      // Attachments from Scribe (generated @misc entries).
      if (attachmentIds && attachmentIds.length > 0) {
        try {
          const resp = await fetch(`${SCRIBE_BASE}/attachments`);
          if (resp.ok) {
            const all: any[] = await resp.json();
            for (const att of all.filter((a) => attachmentIds.includes(a.id))) {
              incoming += attachmentToBib(att) + '\n';
            }
          } else {
            errors.push(`Scribe returned ${resp.status}`);
          }
        } catch {
          errors.push('Scribe is not available');
        }
      }

      // Raw BibTeX (paste / DOI / arXiv lookup) — trusted as-is.
      if (typeof rawBibtex === 'string' && rawBibtex.trim().length > 0) {
        incoming += rawBibtex + '\n';
      }

      if (incoming.trim().length === 0) {
        res.status(502).json({ error: 'Failed to gather any references', details: errors });
        return;
      }

      const bibPath = path.join(projectRoot, file);
      const existing = await readBib(projectRoot, file);
      const { merged, added, skipped } = mergeBib(existing, incoming);
      await fs.writeFile(bibPath, merged, 'utf-8');

      res.json({
        file,
        added: added.length,
        skipped: skipped.length,
        keys: added,
        skippedKeys: skipped,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (err: any) {
      res.status(500).json({ error: `Import failed: ${err.message}` });
    }
  });

  return router;
}
