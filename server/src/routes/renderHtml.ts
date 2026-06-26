import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { ZipArchive } from 'archiver';
import { renderHtml, htmlOutputDir, type SplitLevel } from '../services/latexml.js';

const VALID_SPLITS: SplitLevel[] = ['none', 'part', 'chapter', 'section', 'subsection'];

/**
 * POST /api/render-html — render the active .tex to HTML5 via LaTeXML.
 *
 * Mirrors the compile route: optionally persists `content` first, then runs the
 * converter and returns the diagnostics. The generated files are served
 * separately by the `/html/:project/*` static route; this endpoint only reports
 * status so the client can reload the iframe.
 */
export function createRenderHtmlRouter(
  getProjectRoot: () => string | null,
  themeDir: string
): Router {
  const router = Router();

  /**
   * GET /api/render-html/download — stream the current project's rendered HTML
   * output (`.monolith/html/`) as a single .zip so the user gets a self-contained,
   * fully-styled bundle (index.html + theme CSS/JS + LaTeXML assets). 404s when
   * nothing has been rendered yet.
   */
  router.get('/download', async (_req: Request, res: Response) => {
    const projectRoot = getProjectRoot();
    if (!projectRoot) {
      res.status(400).json({ error: 'No project selected' });
      return;
    }

    const outDir = htmlOutputDir(projectRoot);
    try {
      await fs.access(path.join(outDir, 'index.html'));
    } catch {
      res.status(404).json({ error: 'No rendered HTML found. Render the HTML preview first.' });
      return;
    }

    // Strip anything that could break the Content-Disposition header or escape
    // the filename; fall back to a generic name if the project name is empty.
    const safeName = path.basename(projectRoot).replace(/[^A-Za-z0-9._-]/g, '_') || 'html';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[render-html] zip error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to build archive' });
      else res.destroy(err);
    });
    archive.pipe(res);
    // Flatten the output dir to the zip root so index.html sits at the top level.
    archive.directory(outDir, false);
    await archive.finalize();
  });

  router.post('/', async (req: Request, res: Response) => {
    const projectRoot = getProjectRoot();
    if (!projectRoot) {
      res.status(400).json({
        ok: false,
        available: true,
        log: '',
        errors: ['No project selected'],
        warnings: [],
      });
      return;
    }

    const { mainFile = 'main.tex', content, splitAt } = req.body ?? {};
    const split: SplitLevel = VALID_SPLITS.includes(splitAt) ? splitAt : 'none';

    // Validate mainFile unconditionally — it's passed to latexmlc as the file to
    // render, so a crafted path is an arbitrary-file-read risk even without
    // `content`. Reject absolute paths and any parent-dir traversal, then
    // confirm the resolved path stays within the project root (separator
    // appended so sibling dirs like "<root>-evil" can't slip through).
    if (
      typeof mainFile !== 'string' ||
      path.isAbsolute(mainFile) ||
      mainFile.split(/[\\/]/).includes('..')
    ) {
      res.status(403).json({
        ok: false, available: true, log: '', warnings: [],
        errors: ['Invalid mainFile path'],
      });
      return;
    }
    const resolvedMain = path.resolve(projectRoot, mainFile);
    const rootWithSep = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
    if (resolvedMain !== projectRoot && !resolvedMain.startsWith(rootWithSep)) {
      res.status(403).json({
        ok: false, available: true, log: '', warnings: [],
        errors: ['Path traversal not allowed'],
      });
      return;
    }

    try {
      // If content is provided, save it before rendering (path already validated).
      if (typeof content === 'string') {
        await fs.mkdir(path.dirname(resolvedMain), { recursive: true });
        await fs.writeFile(resolvedMain, content, 'utf-8');
      }

      console.log(`[render-html] Rendering ${mainFile} in ${projectRoot} (split=${split})`);
      const startTime = Date.now();

      const result = await renderHtml(projectRoot, mainFile, themeDir, { splitAt: split });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[render-html] Done in ${elapsed}s — ok=${result.ok}, available=${result.available}, ` +
          `errors=${result.errors.length}, warnings=${result.warnings.length}`
      );

      // Don't leak absolute server paths to the client.
      const { indexPath, ...payload } = result;
      void indexPath;
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        ok: false,
        available: true,
        log: '',
        errors: [`Server error: ${err}`],
        warnings: [],
      });
    }
  });

  return router;
}
