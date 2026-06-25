import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { safePath } from '../util/safePath.js';

interface ProjectCtx {
  projectName: string | null;
  projectRoot: string | null;
}

// Files we treat as importable plots when a session lists them. We accept
// anything Pyramid tagged as a plot, plus common image/figure extensions
// (Pyramid often auto-registers savefig output as plain 'source' files).
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'pdf', 'svg', 'gif', 'webp']);

// Pyramid session/file IDs are UUIDs. Validate before interpolating them into
// the upstream URL so a crafted value can't redirect the request to a
// different path/host (SSRF) or escape via path segments.
const ID_RE = /^[A-Za-z0-9_-]+$/;
function validId(s: unknown): s is string {
  return typeof s === 'string' && s.length <= 128 && ID_RE.test(s);
}

interface ManifestEntry {
  sessionId: string;
  sessionTitle: string;
  fileId: string;
  filename: string;
  importedAt: string;
}
type Manifest = Record<string, ManifestEntry>;

const MANIFEST_REL = path.join('.monolith', 'pyramid-plots.json');

export function createPyramidRouter(getCtx: () => ProjectCtx, pyramidUrl: string): Router {
  const router = Router();
  const api = (p: string) => `${pyramidUrl}/api${p}`;

  function manifestPath(projectRoot: string): string {
    return path.join(projectRoot, MANIFEST_REL);
  }

  async function readManifest(projectRoot: string): Promise<Manifest> {
    try {
      const raw = await fs.readFile(manifestPath(projectRoot), 'utf-8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Manifest) : {};
    } catch {
      return {};
    }
  }

  async function writeManifest(projectRoot: string, manifest: Manifest): Promise<void> {
    const file = manifestPath(projectRoot);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  // Fetch raw bytes for one Pyramid file. Returns null when the source no
  // longer exists (404), throws for transport errors.
  async function fetchPlotBytes(sessionId: string, fileId: string): Promise<Buffer | null> {
    if (!validId(sessionId) || !validId(fileId)) return null;
    const res = await fetch(api(`/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}/raw`));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Pyramid responded ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // GET /api/pyramid/health — is Pyramid reachable?
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch(api('/stats/overview'), { signal: ctrl.signal });
      clearTimeout(timer);
      res.json({ available: r.ok });
    } catch {
      res.json({ available: false });
    }
  });

  // GET /api/pyramid/sessions?search= — proxy session list, annotate links
  router.get('/sessions', async (req: Request, res: Response) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const url = api(`/sessions${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      const r = await fetch(url);
      if (!r.ok) { res.status(502).json({ error: `Pyramid responded ${r.status}` }); return; }
      const sessions = (await r.json()) as any[];
      const project = getCtx().projectName;
      const annotated = (Array.isArray(sessions) ? sessions : []).map((s) => ({
        ...s,
        linkedToCurrentProject:
          !!project &&
          Array.isArray(s.links) &&
          s.links.some(
            (l: any) => l && l.app === 'monolith' && l.ref_type === 'project' && l.ref_id === project
          ),
      }));
      res.json({ sessions: annotated });
    } catch (err) {
      res.status(502).json({ error: `Failed to reach Pyramid: ${err}` });
    }
  });

  // GET /api/pyramid/sessions/:id/plots — image-like files only
  router.get('/sessions/:id/plots', async (req: Request, res: Response) => {
    try {
      if (!validId(req.params.id)) { res.status(400).json({ error: 'Invalid session id' }); return; }
      const r = await fetch(api(`/sessions/${encodeURIComponent(req.params.id)}/files`));
      if (!r.ok) { res.status(502).json({ error: `Pyramid responded ${r.status}` }); return; }
      const files = (await r.json()) as any[];
      const plots = (Array.isArray(files) ? files : [])
        .filter((f) => {
          const ext = (f.filename?.split('.').pop() || '').toLowerCase();
          return f.file_type === 'plot' || IMAGE_EXTS.has(ext);
        })
        .map((f) => ({
          fileId: f.id,
          filename: f.filename,
          ext: (f.filename?.split('.').pop() || '').toLowerCase(),
        }));
      res.json({ plots });
    } catch (err) {
      res.status(502).json({ error: `Failed to reach Pyramid: ${err}` });
    }
  });

  // GET /api/pyramid/sessions/:id/files/:fileId/raw — proxy bytes for thumbnails
  router.get('/sessions/:id/files/:fileId/raw', async (req: Request, res: Response) => {
    try {
      if (!validId(req.params.id) || !validId(req.params.fileId)) { res.status(400).json({ error: 'Invalid id' }); return; }
      const r = await fetch(api(`/sessions/${encodeURIComponent(req.params.id)}/files/${encodeURIComponent(req.params.fileId)}/raw`));
      if (!r.ok) { res.status(r.status).end(); return; }
      const ct = r.headers.get('content-type');
      if (ct) res.type(ct);
      // This is served from the app's own origin and may carry active content
      // (e.g. SVG, which can embed scripts). `<img>` never executes those, but
      // a direct navigation could — so forbid sniffing and sandbox the response
      // (scripts disabled) in case it's ever loaded as a top-level document.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.send(Buffer.from(await r.arrayBuffer()));
    } catch (err) {
      res.status(502).json({ error: `Failed to reach Pyramid: ${err}` });
    }
  });

  // POST /api/pyramid/import — copy a plot into the project + record its origin
  // Body: { sessionId, fileId, filename, sessionTitle?, targetDir?, overwrite? }
  router.post('/import', async (req: Request, res: Response) => {
    try {
      const { projectRoot } = getCtx();
      if (!projectRoot) { res.status(400).json({ error: 'No project selected' }); return; }

      const { sessionId, fileId, filename, sessionTitle = '', targetDir = 'figures', overwrite = false } = req.body || {};
      if (!sessionId || !fileId || !filename) {
        res.status(400).json({ error: 'Body must include sessionId, fileId, and filename' });
        return;
      }
      if (!validId(sessionId) || !validId(fileId)) {
        res.status(400).json({ error: 'Invalid sessionId or fileId' });
        return;
      }

      const bytes = await fetchPlotBytes(sessionId, fileId);
      if (bytes === null) { res.status(404).json({ error: 'Plot no longer exists in Pyramid' }); return; }

      const base = path.basename(filename);
      let relPath = targetDir ? `${targetDir}/${base}` : base;
      let abs = safePath(relPath, projectRoot);
      if (!abs) { res.status(403).json({ error: 'Path traversal not allowed' }); return; }

      // Avoid clobbering an unrelated file: suffix until unique, unless caller
      // explicitly asked to overwrite (e.g. re-importing the same plot).
      if (!overwrite) {
        const ext = path.extname(relPath);
        const stem = relPath.slice(0, relPath.length - ext.length);
        let i = 1;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            await fs.access(abs);
            relPath = `${stem}-${i}${ext}`;
            const next = safePath(relPath, projectRoot);
            if (!next) { res.status(403).json({ error: 'Path traversal not allowed' }); return; }
            abs = next;
            i++;
          } catch {
            break;
          }
        }
      }

      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, bytes);

      const manifest = await readManifest(projectRoot);
      manifest[relPath] = { sessionId, sessionTitle, fileId, filename: base, importedAt: new Date().toISOString() };
      await writeManifest(projectRoot, manifest);

      res.status(201).json({ path: relPath });
    } catch (err) {
      res.status(500).json({ error: `Failed to import plot: ${err}` });
    }
  });

  // GET /api/pyramid/manifest — what's currently linked
  router.get('/manifest', async (_req: Request, res: Response) => {
    const { projectRoot } = getCtx();
    if (!projectRoot) { res.json({ entries: [] }); return; }
    const manifest = await readManifest(projectRoot);
    const entries = Object.entries(manifest).map(([p, e]) => ({ path: p, ...e }));
    res.json({ entries });
  });

  // PATCH /api/pyramid/manifest — rename/move a linked plot's local path
  // Body: { from, to }. Moves the file on disk (if present) and re-keys the
  // manifest entry; the link survives even if the file was already deleted.
  router.patch('/manifest', async (req: Request, res: Response) => {
    try {
      const { projectRoot } = getCtx();
      if (!projectRoot) { res.status(400).json({ error: 'No project selected' }); return; }
      const { from, to } = req.body || {};
      if (typeof from !== 'string' || typeof to !== 'string' || !from || !to) {
        res.status(400).json({ error: 'Body must include "from" and "to" paths' });
        return;
      }

      const manifest = await readManifest(projectRoot);
      if (!manifest[from]) { res.status(404).json({ error: 'No link for that path' }); return; }
      if (from === to) { res.json({ from, to }); return; }
      if (manifest[to]) { res.status(409).json({ error: 'A link already exists at the target path' }); return; }

      const fromAbs = safePath(from, projectRoot);
      const toAbs = safePath(to, projectRoot);
      if (!fromAbs || !toAbs) { res.status(403).json({ error: 'Path traversal not allowed' }); return; }

      // Don't clobber an unrelated existing file at the destination.
      try {
        await fs.access(toAbs);
        res.status(409).json({ error: 'A file already exists at the target path' });
        return;
      } catch { /* destination free — proceed */ }

      // Move the file if it's present; the link metadata persists regardless.
      try {
        await fs.mkdir(path.dirname(toAbs), { recursive: true });
        await fs.rename(fromAbs, toAbs);
      } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err;
      }

      manifest[to] = manifest[from];
      delete manifest[from];
      await writeManifest(projectRoot, manifest);
      res.json({ from, to });
    } catch (err) {
      res.status(500).json({ error: `Failed to rename link: ${err}` });
    }
  });

  // DELETE /api/pyramid/manifest — remove a link; optionally its file too
  // Body: { path, deleteFile? }
  router.delete('/manifest', async (req: Request, res: Response) => {
    try {
      const { projectRoot } = getCtx();
      if (!projectRoot) { res.status(400).json({ error: 'No project selected' }); return; }
      const { path: relPath, deleteFile = false } = req.body || {};
      if (typeof relPath !== 'string' || !relPath) {
        res.status(400).json({ error: 'Body must include "path"' });
        return;
      }

      const manifest = await readManifest(projectRoot);
      if (!manifest[relPath]) { res.status(404).json({ error: 'No link for that path' }); return; }

      let fileDeleted = false;
      if (deleteFile) {
        const abs = safePath(relPath, projectRoot);
        if (!abs) { res.status(403).json({ error: 'Path traversal not allowed' }); return; }
        try {
          await fs.rm(abs);
          fileDeleted = true;
        } catch (err: any) {
          if (err?.code !== 'ENOENT') throw err;
        }
      }

      delete manifest[relPath];
      await writeManifest(projectRoot, manifest);
      res.json({ path: relPath, deleted: true, fileDeleted });
    } catch (err) {
      res.status(500).json({ error: `Failed to delete link: ${err}` });
    }
  });

  // POST /api/pyramid/refresh — re-pull every linked plot
  router.post('/refresh', async (_req: Request, res: Response) => {
    try {
      const { projectRoot } = getCtx();
      if (!projectRoot) { res.status(400).json({ error: 'No project selected' }); return; }

      const manifest = await readManifest(projectRoot);
      let updated = 0, unchanged = 0, missing = 0;

      for (const [relPath, entry] of Object.entries(manifest)) {
        const abs = safePath(relPath, projectRoot);
        if (!abs) continue;
        let bytes: Buffer | null;
        try {
          bytes = await fetchPlotBytes(entry.sessionId, entry.fileId);
        } catch {
          missing++;
          continue;
        }
        if (bytes === null) { missing++; continue; }

        let same = false;
        try {
          const existing = await fs.readFile(abs);
          same = existing.equals(bytes);
        } catch {
          same = false;
        }
        if (same) { unchanged++; continue; }

        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, bytes);
        updated++;
      }

      res.json({ updated, unchanged, missing });
    } catch (err) {
      res.status(500).json({ error: `Failed to refresh plots: ${err}` });
    }
  });

  return router;
}
