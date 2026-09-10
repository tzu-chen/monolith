import { Router, Request, Response } from 'express';
import { safePath } from '../util/safePath.js';
import { broadcast } from '../ws.js';
import {
  createComment,
  deleteComment,
  listComments,
  moveComments,
  updateComment,
  type CommentMove,
} from '../services/comments.js';

/**
 * /api/comments — the current project's comments.
 *
 *   GET    /           every comment in the project
 *   POST   /           add one            { file, line|null, anchor?, text }
 *   PUT    /moves      the editor's report of where line comments ended up
 *                                         { moves: [{ id, line, anchor }] }
 *   PUT    /:id        edit / resolve     { text?, resolved? }
 *   DELETE /:id
 *
 * Every mutation but a move broadcasts `comments_changed`, so another tab
 * re-reads. Moves are the editor tracking its own lines while typing; they
 * are frequent and the tab that sent them already knows.
 */
export function createCommentsRouter(getProjectRoot: () => string | null): Router {
  const router = Router();
  const MAX_TEXT = 10_000;

  function root(res: Response): string | null {
    const projectRoot = getProjectRoot();
    if (!projectRoot) res.status(400).json({ error: 'No project selected' });
    return projectRoot;
  }

  function readRelPath(projectRoot: string, raw: unknown): string | null {
    if (typeof raw !== 'string' || !raw) return null;
    const cleaned = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    return safePath(cleaned, projectRoot) ? cleaned : null;
  }

  function readText(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!text) return null;
    return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
  }

  function readLine(raw: unknown): number | null | undefined {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) return undefined;
    return raw;
  }

  function readAnchor(raw: unknown): string | null {
    return typeof raw === 'string' ? raw.slice(0, 500) : null;
  }

  router.get('/', async (_req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    try {
      res.json({ comments: await listComments(projectRoot) });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to read comments: ${err.message}` });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const file = readRelPath(projectRoot, req.body?.file);
    const text = readText(req.body?.text);
    const line = readLine(req.body?.line);
    if (!file || !text || line === undefined) {
      res.status(400).json({ error: 'Body must include a project-relative "file", a "text", and a positive "line" or null' });
      return;
    }
    try {
      const comment = await createComment(projectRoot, { file, line, anchor: readAnchor(req.body?.anchor), text });
      broadcast({ type: 'comments_changed' });
      res.status(201).json({ comment });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to add comment: ${err.message}` });
    }
  });

  router.put('/moves', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const raw = req.body?.moves;
    if (!Array.isArray(raw)) {
      res.status(400).json({ error: 'Body must include a "moves" array' });
      return;
    }
    const moves: CommentMove[] = [];
    for (const m of raw) {
      const line = readLine(m?.line);
      if (typeof m?.id !== 'string' || !line) {
        res.status(400).json({ error: 'Each move needs an "id" and a positive "line"' });
        return;
      }
      moves.push({ id: m.id, line, anchor: readAnchor(m.anchor) });
    }
    try {
      res.json({ moved: await moveComments(projectRoot, moves) });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to move comments: ${err.message}` });
    }
  });

  router.put('/:id', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const patch: { text?: string; resolved?: boolean } = {};
    if (req.body?.text !== undefined) {
      const text = readText(req.body.text);
      if (!text) {
        res.status(400).json({ error: 'A comment cannot be empty' });
        return;
      }
      patch.text = text;
    }
    if (req.body?.resolved !== undefined) {
      if (typeof req.body.resolved !== 'boolean') {
        res.status(400).json({ error: '"resolved" must be a boolean' });
        return;
      }
      patch.resolved = req.body.resolved;
    }
    try {
      const comment = await updateComment(projectRoot, req.params.id, patch);
      if (!comment) {
        res.status(404).json({ error: 'Comment not found' });
        return;
      }
      broadcast({ type: 'comments_changed' });
      res.json({ comment });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to update comment: ${err.message}` });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    try {
      if (!(await deleteComment(projectRoot, req.params.id))) {
        res.status(404).json({ error: 'Comment not found' });
        return;
      }
      broadcast({ type: 'comments_changed' });
      res.json({ deleted: true });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to delete comment: ${err.message}` });
    }
  });

  return router;
}
