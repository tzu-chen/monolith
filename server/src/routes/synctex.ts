import { Router, Request, Response } from 'express';
import { forwardSync, inverseSync, detectMainFile } from '../services/synctex.js';

export function createSyncTeXRouter(getProjectRoot: () => string | null): Router {
  const router = Router();

  router.post('/forward', async (req: Request, res: Response) => {
    const projectRoot = getProjectRoot();
    if (!projectRoot) {
      res.status(400).json({ error: 'No project selected' });
      return;
    }

    const { file, line, col = 1 } = req.body;
    if (!file || !line) {
      res.status(400).json({ error: 'Missing file or line parameter' });
      return;
    }

    try {
      const mainFile = await detectMainFile(projectRoot);
      const result = await forwardSync(projectRoot, mainFile, file, line, col);
      if (result) {
        res.json(result);
      } else {
        res.status(404).json({ error: 'No SyncTeX data found for this position' });
      }
    } catch (err) {
      res.status(500).json({ error: `SyncTeX forward failed: ${err}` });
    }
  });

  router.post('/inverse', async (req: Request, res: Response) => {
    const projectRoot = getProjectRoot();
    if (!projectRoot) {
      res.status(400).json({ error: 'No project selected' });
      return;
    }

    const { page, x, y } = req.body;
    if (page == null || x == null || y == null) {
      res.status(400).json({ error: 'Missing page, x, or y parameter' });
      return;
    }

    try {
      const mainFile = await detectMainFile(projectRoot);
      const result = await inverseSync(projectRoot, mainFile, page, x, y);
      if (result) {
        res.json(result);
      } else {
        res.status(404).json({ error: 'No SyncTeX data found for this position' });
      }
    } catch (err) {
      res.status(500).json({ error: `SyncTeX inverse failed: ${err}` });
    }
  });

  return router;
}
