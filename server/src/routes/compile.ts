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

    try {
      // If content is provided, save the file before compiling
      if (typeof content === 'string') {
        const filePath = path.join(projectRoot, mainFile);
        if (!filePath.startsWith(projectRoot)) {
          res.status(403).json({ error: 'Path traversal not allowed' });
          return;
        }
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
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
