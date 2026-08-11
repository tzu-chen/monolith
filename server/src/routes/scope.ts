import { Router, Request, Response } from 'express';
import { resolveScope } from '../services/scope.js';
import { safePath } from '../util/safePath.js';

/**
 * `GET /api/scope?file=main.tex`
 *
 * Resolves the packages, macros and environments in scope for one file. The
 * client re-requests this on save and on any watcher event touching a file in
 * the returned `chain`.
 */
export function createScopeRouter(getProjectRoot: () => string | null): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const projectRoot = getProjectRoot();
    if (!projectRoot) {
      res.status(400).json({ error: 'No project selected' });
      return;
    }

    const file = typeof req.query.file === 'string' ? req.query.file : '';
    if (!file) {
      res.status(400).json({ error: 'Missing file parameter' });
      return;
    }
    if (!safePath(file, projectRoot)) {
      res.status(403).json({ error: 'Path traversal not allowed' });
      return;
    }

    try {
      res.json(await resolveScope(projectRoot, file));
    } catch (err) {
      res.status(500).json({ error: `Failed to resolve scope: ${err}` });
    }
  });

  return router;
}
