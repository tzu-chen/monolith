import { Router, Request, Response } from 'express';
import { compileTex } from '../services/tectonic.js';

export function createCompileRouter(projectRoot: string): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const { mainFile = 'main.tex' } = req.body;

    console.log(`[compile] Compiling ${mainFile} in ${projectRoot}`);
    const startTime = Date.now();

    const result = await compileTex(projectRoot, mainFile);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[compile] Done in ${elapsed}s — success=${result.success}, errors=${result.errors.length}`);

    res.json(result);
  });

  return router;
}
