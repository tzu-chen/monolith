import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { renderHtml, type SplitLevel } from '../services/latexml.js';

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
