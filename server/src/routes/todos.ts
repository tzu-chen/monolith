import { Router, Request, Response } from 'express';
import { broadcast } from '../ws.js';
import {
  clearDone,
  createTag,
  createTodo,
  deleteTag,
  deleteTodo,
  getTodos,
  isDeadline,
  isTagColor,
  updateTag,
  updateTodo,
  type TagColor,
} from '../services/todos.js';

/**
 * /api/todos — the current project's to-do list.
 *
 *   GET    /             { tags, items }
 *   POST   /             add an item      { text, deadline?, tags? }
 *   PUT    /:id          edit an item     { text?, done?, deadline?, tags? }
 *   DELETE /:id
 *   POST   /clear-done   drop every completed item
 *   POST   /tags         add a tag        { name, color }
 *   PUT    /tags/:id     rename / recolour
 *   DELETE /tags/:id     also removes it from every item
 *
 * Every mutation broadcasts `todos_changed`.
 */
export function createTodosRouter(getProjectRoot: () => string | null): Router {
  const router = Router();
  const MAX_TEXT = 2000;
  const MAX_TAG = 40;

  function root(res: Response): string | null {
    const projectRoot = getProjectRoot();
    if (!projectRoot) res.status(400).json({ error: 'No project selected' });
    return projectRoot;
  }

  function readText(raw: unknown, max: number): string | null {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!text) return null;
    return text.length > max ? text.slice(0, max) : text;
  }

  /** null = no deadline, undefined = invalid. */
  function readDeadline(raw: unknown): string | null | undefined {
    if (raw === null || raw === undefined || raw === '') return null;
    return isDeadline(raw) ? raw : undefined;
  }

  function readTags(raw: unknown): string[] | undefined {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || !raw.every((t) => typeof t === 'string')) return undefined;
    return raw as string[];
  }

  function fail(res: Response, what: string, err: any) {
    res.status(500).json({ error: `Failed to ${what}: ${err.message}` });
  }

  router.get('/', async (_req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    try {
      const store = await getTodos(projectRoot);
      res.json({ tags: store.tags, items: store.items });
    } catch (err: any) {
      fail(res, 'read the to-do list', err);
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const text = readText(req.body?.text, MAX_TEXT);
    const deadline = readDeadline(req.body?.deadline);
    const tags = readTags(req.body?.tags);
    if (!text || deadline === undefined || !tags) {
      res.status(400).json({ error: 'Body must include "text"; "deadline" is YYYY-MM-DD or null; "tags" is a list of tag ids' });
      return;
    }
    try {
      const todo = await createTodo(projectRoot, { text, deadline, tags });
      broadcast({ type: 'todos_changed' });
      res.status(201).json({ todo });
    } catch (err: any) {
      fail(res, 'add the item', err);
    }
  });

  router.post('/clear-done', async (_req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    try {
      const removed = await clearDone(projectRoot);
      if (removed) broadcast({ type: 'todos_changed' });
      res.json({ removed });
    } catch (err: any) {
      fail(res, 'clear completed items', err);
    }
  });

  router.post('/tags', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const name = readText(req.body?.name, MAX_TAG);
    const color = req.body?.color;
    if (!name || !isTagColor(color)) {
      res.status(400).json({ error: 'Body must include a "name" and a known "color"' });
      return;
    }
    try {
      const tag = await createTag(projectRoot, { name, color });
      broadcast({ type: 'todos_changed' });
      res.status(201).json({ tag });
    } catch (err: any) {
      fail(res, 'add the tag', err);
    }
  });

  router.put('/tags/:id', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const patch: { name?: string; color?: TagColor } = {};
    if (req.body?.name !== undefined) {
      const name = readText(req.body.name, MAX_TAG);
      if (!name) {
        res.status(400).json({ error: 'A tag needs a name' });
        return;
      }
      patch.name = name;
    }
    if (req.body?.color !== undefined) {
      if (!isTagColor(req.body.color)) {
        res.status(400).json({ error: 'Unknown tag colour' });
        return;
      }
      patch.color = req.body.color;
    }
    try {
      const tag = await updateTag(projectRoot, req.params.id, patch);
      if (!tag) {
        res.status(404).json({ error: 'Tag not found' });
        return;
      }
      broadcast({ type: 'todos_changed' });
      res.json({ tag });
    } catch (err: any) {
      fail(res, 'update the tag', err);
    }
  });

  router.delete('/tags/:id', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    try {
      if (!(await deleteTag(projectRoot, req.params.id))) {
        res.status(404).json({ error: 'Tag not found' });
        return;
      }
      broadcast({ type: 'todos_changed' });
      res.json({ deleted: true });
    } catch (err: any) {
      fail(res, 'delete the tag', err);
    }
  });

  router.put('/:id', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const patch: { text?: string; done?: boolean; deadline?: string | null; tags?: string[] } = {};
    const body = req.body ?? {};
    if (body.text !== undefined) {
      const text = readText(body.text, MAX_TEXT);
      if (!text) {
        res.status(400).json({ error: 'An item cannot be empty' });
        return;
      }
      patch.text = text;
    }
    if (body.done !== undefined) {
      if (typeof body.done !== 'boolean') {
        res.status(400).json({ error: '"done" must be a boolean' });
        return;
      }
      patch.done = body.done;
    }
    if (body.deadline !== undefined) {
      const deadline = readDeadline(body.deadline);
      if (deadline === undefined) {
        res.status(400).json({ error: '"deadline" must be YYYY-MM-DD or null' });
        return;
      }
      patch.deadline = deadline;
    }
    if (body.tags !== undefined) {
      const tags = readTags(body.tags);
      if (!tags) {
        res.status(400).json({ error: '"tags" must be a list of tag ids' });
        return;
      }
      patch.tags = tags;
    }
    try {
      const todo = await updateTodo(projectRoot, req.params.id, patch);
      if (!todo) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }
      broadcast({ type: 'todos_changed' });
      res.json({ todo });
    } catch (err: any) {
      fail(res, 'update the item', err);
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    try {
      if (!(await deleteTodo(projectRoot, req.params.id))) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }
      broadcast({ type: 'todos_changed' });
      res.json({ deleted: true });
    } catch (err: any) {
      fail(res, 'delete the item', err);
    }
  });

  return router;
}
