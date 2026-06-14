import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { compileTex } from '../services/tectonic.js';

export function createCompileRouter(getProjectRoot: () => string | null): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const projectRoot = getProjectRoot();
    if (!projectRoot) {
      res.status(400).json({ success: false, log: '', errors: ['No project selected'], warnings: [] });
      return;
    }
    const { mainFile = 'main.tex', content } = req.body;

    // Validate mainFile unconditionally — it's passed to tectonic as the file to
    // compile, so a crafted path is a risk even without `content`. Reject
    // absolute paths and parent-dir traversal, then confirm the resolved path
    // stays within the project root (separator appended so sibling dirs like
    // "<root>-evil" can't slip through).
    if (
      typeof mainFile !== 'string' ||
      path.isAbsolute(mainFile) ||
      mainFile.split(/[\\/]/).includes('..')
    ) {
      res.status(403).json({ success: false, log: '', errors: ['Invalid mainFile path'], warnings: [] });
      return;
    }
    const resolvedMain = path.resolve(projectRoot, mainFile);
    const rootWithSep = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
    if (resolvedMain !== projectRoot && !resolvedMain.startsWith(rootWithSep)) {
      res.status(403).json({ success: false, log: '', errors: ['Path traversal not allowed'], warnings: [] });
      return;
    }

    try {
      // If content is provided, save the file before compiling (path validated).
      if (typeof content === 'string') {
        await fs.mkdir(path.dirname(resolvedMain), { recursive: true });
        await fs.writeFile(resolvedMain, content, 'utf-8');
      }

      console.log(`[compile] Compiling ${mainFile} in ${projectRoot}`);
      const startTime = Date.now();

      const result = await compileTex(projectRoot, mainFile);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[compile] Done in ${elapsed}s — success=${result.success}, errors=${result.errors.length}`);

      res.json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        log: '',
        errors: [`Server error: ${err}`],
        warnings: [],
      });
    }
  });

  return router;
}
