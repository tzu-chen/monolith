import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';

const NAVIGATE_BASE = 'http://localhost:3001/api';
const SCRIBE_BASE = 'http://localhost:3003/api';

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
      const data = await resp.json();
      res.json(data);
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
      const data = await resp.json();
      res.json(data);
    } catch (err: any) {
      if (err.cause?.code === 'ECONNREFUSED') {
        res.status(502).json({ error: 'Scribe is not available' });
      } else {
        res.status(502).json({ error: `Failed to reach Scribe: ${err.message}` });
      }
    }
  });

  // Export selected references as .bib to project
  router.post('/export', async (req: Request, res: Response) => {
    try {
      const projectRoot = getProjectRoot();
      if (!projectRoot) {
        res.status(400).json({ error: 'No project selected' });
        return;
      }

      const { paperIds, attachmentIds } = req.body as {
        paperIds?: number[];
        attachmentIds?: string[];
      };

      if ((!paperIds || paperIds.length === 0) && (!attachmentIds || attachmentIds.length === 0)) {
        res.status(400).json({ error: 'No references selected' });
        return;
      }

      let bibtex = '';
      let count = 0;
      const errors: string[] = [];

      // Fetch BibTeX from Navigate for papers
      if (paperIds && paperIds.length > 0) {
        try {
          const ids = paperIds.join(',');
          const resp = await fetch(`${NAVIGATE_BASE}/export/bibtex?ids=${ids}`);
          if (resp.ok) {
            const text = await resp.text();
            bibtex += text;
            count += paperIds.length;
          } else {
            errors.push(`Navigate export failed: ${resp.status}`);
          }
        } catch (err: any) {
          errors.push('Navigate is not available');
        }
      }

      // Generate BibTeX for Scribe attachments
      if (attachmentIds && attachmentIds.length > 0) {
        try {
          const resp = await fetch(`${SCRIBE_BASE}/attachments`);
          if (resp.ok) {
            const allAttachments: any[] = await resp.json();
            const selected = allAttachments.filter((a: any) => attachmentIds.includes(a.id));
            for (const att of selected) {
              const key = `scribe_${att.id.slice(0, 8)}`;
              const title = att.filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
              if (bibtex.length > 0) bibtex += '\n';
              bibtex += `@misc{${key},\n`;
              bibtex += `  title = {${title}},\n`;
              if (att.subject) {
                bibtex += `  note = {${att.subject}},\n`;
              }
              bibtex += `  howpublished = {Personal library},\n`;
              bibtex += `}\n`;
              count++;
            }
          } else {
            errors.push(`Scribe returned ${resp.status}`);
          }
        } catch (err: any) {
          errors.push('Scribe is not available');
        }
      }

      if (count === 0) {
        res.status(502).json({ error: 'Failed to export any references', details: errors });
        return;
      }

      // Escape special LaTeX characters in BibTeX values
      bibtex = bibtex.replace(/(?<!\\)&/g, '\\&');

      // Write to project
      const bibPath = path.join(projectRoot, 'references.bib');
      await fs.writeFile(bibPath, bibtex, 'utf-8');

      res.json({ success: true, filename: 'references.bib', count, errors: errors.length > 0 ? errors : undefined });
    } catch (err: any) {
      res.status(500).json({ error: `Export failed: ${err.message}` });
    }
  });

  return router;
}
