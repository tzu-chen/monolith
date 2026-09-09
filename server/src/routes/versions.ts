import { Router, Request, Response } from 'express';
import path from 'path';
import { ZipArchive } from 'archiver';
import { safePath } from '../util/safePath.js';
import { broadcast } from '../ws.js';
import {
  EMPTY,
  WORKING,
  NoChangesError,
  createVersion,
  diffFile,
  getVersion,
  isVersionId,
  listVersions,
  looksBinary,
  readVersionFile,
  restore,
  setMessage,
  status,
  versionBlobPaths,
  versionFiles,
} from '../services/versions.js';

/**
 * /api/versions — the current project's version history.
 *
 *   GET    /                      versions, newest first
 *   GET    /status                what changed in the working tree since HEAD
 *   GET    /diff?path&from&to     one file between two revisions
 *   POST   /                      save a version  { message, paths? }
 *   GET    /:id                   one version with its file list
 *   PUT    /:id                   relabel         { message }
 *   GET    /:id/file?path         a file's content at that version
 *   GET    /:id/download          the version as a .zip
 *   POST   /:id/restore           write it back   { paths? }
 *
 * A revision is a version id, the literal `working` (the working tree) or
 * `empty` (no files — what the first version is diffed against). Every mutation
 * broadcasts `versions_changed` so other clients refresh their history.
 */
export function createVersionsRouter(getProjectRoot: () => string | null): Router {
  const router = Router();

  const MAX_MESSAGE = 500;

  function root(res: Response): string | null {
    const projectRoot = getProjectRoot();
    if (!projectRoot) res.status(400).json({ error: 'No project selected' });
    return projectRoot;
  }

  /** A body/query `paths` value as a validated list of project-relative paths. */
  function readPaths(projectRoot: string, raw: unknown): string[] | undefined | null {
    if (raw === undefined || raw === null) return undefined;
    if (!Array.isArray(raw) || !raw.every((p) => typeof p === 'string')) return null;
    const cleaned = (raw as string[]).map((p) => p.replace(/\\/g, '/').replace(/^\.\//, ''));
    if (cleaned.some((p) => !p || !safePath(p, projectRoot))) return null;
    return cleaned;
  }

  function readMessage(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const msg = raw.trim();
    return msg.length > MAX_MESSAGE ? msg.slice(0, MAX_MESSAGE) : msg;
  }

  function readRelPath(projectRoot: string, raw: unknown): string | null {
    if (typeof raw !== 'string' || !raw) return null;
    const cleaned = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    return safePath(cleaned, projectRoot) ? cleaned : null;
  }

  function isRevision(raw: unknown): raw is string {
    return raw === WORKING || raw === EMPTY || isVersionId(raw);
  }

  router.get('/', async (_req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    try {
      const versions = await listVersions(projectRoot);
      res.json({ head: versions[0]?.id ?? null, versions });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to list versions: ${err.message}` });
    }
  });

  router.get('/status', async (_req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    try {
      res.json(await status(projectRoot));
    } catch (err: any) {
      res.status(500).json({ error: `Failed to read status: ${err.message}` });
    }
  });

  router.get('/diff', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const relPath = readRelPath(projectRoot, req.query.path);
    if (!relPath) {
      res.status(400).json({ error: 'Query must include a project-relative "path"' });
      return;
    }
    const { from, to } = req.query;
    if (!isRevision(from) || !isRevision(to)) {
      res.status(400).json({ error: '"from" and "to" must each be a version id, "working" or "empty"' });
      return;
    }
    try {
      res.json(await diffFile(projectRoot, relPath, from, to));
    } catch (err: any) {
      const code = err.message.includes('does not exist') ? 404 : 500;
      res.status(code).json({ error: err.message });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const message = readMessage(req.body?.message ?? '');
    if (message === null) {
      res.status(400).json({ error: '"message" must be a string' });
      return;
    }
    const paths = readPaths(projectRoot, req.body?.paths);
    if (paths === null) {
      res.status(400).json({ error: '"paths" must be a list of project-relative paths' });
      return;
    }
    try {
      const version = await createVersion(projectRoot, message, paths);
      broadcast({ type: 'versions_changed' });
      res.status(201).json({ version });
    } catch (err: any) {
      if (err instanceof NoChangesError) {
        res.status(409).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: `Failed to save version: ${err.message}` });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const version = isVersionId(req.params.id) ? await getVersion(projectRoot, req.params.id) : null;
    if (!version) {
      res.status(404).json({ error: 'Version does not exist' });
      return;
    }
    try {
      const { files: _files, ...summary } = version;
      const files = await versionFiles(projectRoot, version);
      res.json({ version: { ...summary, fileCount: Object.keys(version.files).length }, files });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to read version: ${err.message}` });
    }
  });

  router.put('/:id', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const message = readMessage(req.body?.message);
    if (message === null) {
      res.status(400).json({ error: 'Body must include a "message" string' });
      return;
    }
    if (!isVersionId(req.params.id)) {
      res.status(404).json({ error: 'Version does not exist' });
      return;
    }
    try {
      const version = await setMessage(projectRoot, req.params.id, message);
      broadcast({ type: 'versions_changed' });
      const { files, ...summary } = version;
      res.json({ version: { ...summary, fileCount: Object.keys(files).length } });
    } catch (err: any) {
      const code = err.message.includes('does not exist') ? 404 : 500;
      res.status(code).json({ error: err.message });
    }
  });

  router.get('/:id/file', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const relPath = readRelPath(projectRoot, req.query.path);
    if (!relPath) {
      res.status(400).json({ error: 'Query must include a project-relative "path"' });
      return;
    }
    const version = isVersionId(req.params.id) ? await getVersion(projectRoot, req.params.id) : null;
    if (!version) {
      res.status(404).json({ error: 'Version does not exist' });
      return;
    }
    const bytes = await readVersionFile(projectRoot, version, relPath);
    if (!bytes) {
      res.status(404).json({ error: 'File is not in this version' });
      return;
    }
    if (looksBinary(bytes)) {
      res.json({ path: relPath, binary: true, size: bytes.length });
      return;
    }
    res.json({ path: relPath, binary: false, size: bytes.length, content: bytes.toString('utf-8') });
  });

  router.get('/:id/download', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const version = isVersionId(req.params.id) ? await getVersion(projectRoot, req.params.id) : null;
    if (!version) {
      res.status(404).json({ error: 'Version does not exist' });
      return;
    }
    const projectName = path.basename(projectRoot).replace(/[^A-Za-z0-9._-]/g, '_') || 'project';
    const safeName = `${projectName}-v${version.number}`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[versions] zip error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to build archive' });
      else res.destroy(err);
    });
    archive.pipe(res);
    for (const { path: rel, abs } of versionBlobPaths(projectRoot, version)) {
      archive.file(abs, { name: rel });
    }
    await archive.finalize();
  });

  router.post('/:id/restore', async (req: Request, res: Response) => {
    const projectRoot = root(res);
    if (!projectRoot) return;
    const version = isVersionId(req.params.id) ? await getVersion(projectRoot, req.params.id) : null;
    if (!version) {
      res.status(404).json({ error: 'Version does not exist' });
      return;
    }
    const paths = readPaths(projectRoot, req.body?.paths);
    if (paths === null) {
      res.status(400).json({ error: '"paths" must be a list of project-relative paths' });
      return;
    }
    try {
      const result = await restore(projectRoot, version, paths);
      broadcast({ type: 'versions_changed' });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: `Failed to restore: ${err.message}` });
    }
  });

  return router;
}
