import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { getProjectsRoot } from '../projectContext.js';

export function createFilesRouter(getProjectRoot: () => string | null): Router {
  const router = Router();

  function safePath(relPath: string, projectRoot: string): string | null {
    // Reject absolute paths and any parent-dir traversal, then confirm the
    // resolved path stays within the project root. The separator is appended so
    // a sibling dir like "<root>-evil" can't satisfy the prefix check.
    if (typeof relPath !== 'string' || path.isAbsolute(relPath) || relPath.split(/[\\/]/).includes('..')) {
      return null;
    }
    const resolved = path.resolve(projectRoot, relPath);
    const rootWithSep = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
    if (resolved !== projectRoot && !resolved.startsWith(rootWithSep)) return null;
    return resolved;
  }

  // File upload via multipart form data
  const upload = multer({ storage: multer.memoryStorage() });

  router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const projectRoot = getProjectRoot();
      if (!projectRoot) { res.status(400).json({ error: 'No project selected' }); return; }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      const targetDir = req.body.directory || '';
      const fileName = file.originalname;
      const relPath = targetDir ? `${targetDir}/${fileName}` : fileName;

      const filePath = safePath(relPath, projectRoot);
      if (!filePath) {
        res.status(403).json({ error: 'Path traversal not allowed' });
        return;
      }

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.buffer);
      res.status(201).json({ path: relPath, created: true });
    } catch (err) {
      res.status(500).json({ error: `Failed to upload file: ${err}` });
    }
  });

  // Create directory
  router.post('/mkdir', async (req: Request, res: Response) => {
    try {
      const projectRoot = getProjectRoot();
      if (!projectRoot) { res.status(400).json({ error: 'No project selected' }); return; }
      const { path: dirPath } = req.body;
      if (!dirPath) {
        res.status(400).json({ error: 'Body must include "path"' });
        return;
      }
      const fullPath = safePath(dirPath, projectRoot);
      if (!fullPath) {
        res.status(403).json({ error: 'Path traversal not allowed' });
        return;
      }
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          res.status(409).json({ error: 'Directory already exists' });
          return;
        }
      } catch {
        // Doesn't exist — proceed
      }
      await fs.mkdir(fullPath, { recursive: true });
      res.status(201).json({ path: dirPath, created: true });
    } catch (err) {
      res.status(500).json({ error: `Failed to create directory: ${err}` });
    }
  });

  // Rename / move file
  router.post('/rename', async (req: Request, res: Response) => {
    try {
      const projectRoot = getProjectRoot();
      if (!projectRoot) { res.status(400).json({ error: 'No project selected' }); return; }
      const { from, to } = req.body;
      if (!from || !to) {
        res.status(400).json({ error: 'Body must include "from" and "to" paths' });
        return;
      }
      const fromPath = safePath(from, projectRoot);
      const toPath = safePath(to, projectRoot);
      if (!fromPath || !toPath) {
        res.status(403).json({ error: 'Path traversal not allowed' });
        return;
      }
      await fs.mkdir(path.dirname(toPath), { recursive: true });
      await fs.rename(fromPath, toPath);
      res.json({ from, to, renamed: true });
    } catch (err) {
      res.status(500).json({ error: `Failed to rename: ${err}` });
    }
  });

  // Transfer (copy or move) a file or directory to another project
  router.post('/transfer', async (req: Request, res: Response) => {
    try {
      const projectRoot = getProjectRoot();
      if (!projectRoot) { res.status(400).json({ error: 'No project selected' }); return; }
      const { from, toProject, toPath, mode = 'copy', overwrite = false } = req.body;
      if (!from || typeof from !== 'string') {
        res.status(400).json({ error: 'Body must include "from" string' });
        return;
      }
      if (!toProject || typeof toProject !== 'string') {
        res.status(400).json({ error: 'Body must include "toProject" string' });
        return;
      }
      if (mode !== 'copy' && mode !== 'move') {
        res.status(400).json({ error: 'mode must be "copy" or "move"' });
        return;
      }

      const fromPathFull = safePath(from, projectRoot);
      if (!fromPathFull) {
        res.status(403).json({ error: 'Path traversal not allowed' });
        return;
      }

      const projectsRoot = getProjectsRoot();
      const targetProjectRoot = path.join(projectsRoot, toProject);
      if (!targetProjectRoot.startsWith(projectsRoot + path.sep)) {
        res.status(403).json({ error: 'Invalid target project name' });
        return;
      }
      try {
        const stat = await fs.stat(targetProjectRoot);
        if (!stat.isDirectory()) {
          res.status(404).json({ error: `Target project "${toProject}" does not exist` });
          return;
        }
      } catch {
        res.status(404).json({ error: `Target project "${toProject}" does not exist` });
        return;
      }
      if (path.resolve(targetProjectRoot) === path.resolve(projectRoot)) {
        res.status(400).json({ error: 'Target project must differ from current project' });
        return;
      }

      const destRel = (typeof toPath === 'string' && toPath) ? toPath : from;
      const toPathFull = safePath(destRel, targetProjectRoot);
      if (!toPathFull) {
        res.status(403).json({ error: 'Path traversal not allowed' });
        return;
      }

      if (!overwrite) {
        try {
          await fs.access(toPathFull);
          res.status(409).json({ error: 'Destination already exists' });
          return;
        } catch {
          // doesn't exist — fine
        }
      }

      await fs.mkdir(path.dirname(toPathFull), { recursive: true });
      await fs.cp(fromPathFull, toPathFull, { recursive: true, force: !!overwrite, errorOnExist: !overwrite });
      if (mode === 'move') {
        await fs.rm(fromPathFull, { recursive: true });
      }
      res.json({ from, toProject, to: destRel, mode, transferred: true });
    } catch (err) {
      res.status(500).json({ error: `Failed to transfer: ${err}` });
    }
  });

  // List files in project
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const projectRoot = getProjectRoot();
      if (!projectRoot) { res.json({ root: null, files: [] }); return; }
      const files = await listFiles(projectRoot, projectRoot);
      res.json({ root: projectRoot, files });
    } catch (err) {
      res.status(500).json({ error: `Failed to list files: ${err}` });
    }
  });

  // Read file content
  router.get('/*', async (req: Request, res: Response) => {
    try {
      const projectRoot = getProjectRoot();
      if (!projectRoot) { res.status(400).json({ error: 'No project selected' }); return; }
      const relPath = req.params[0];
      if (!relPath) {
        res.status(400).json({ error: 'No file path specified' });
        return;
      }
      const filePath = safePath(relPath, projectRoot);
      if (!filePath) {
        res.status(403).json({ error: 'Path traversal not allowed' });
        return;
      }
      const content = await fs.readFile(filePath, 'utf-8');
      res.json({ path: relPath, content });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'File not found' });
      } else {
        res.status(500).json({ error: `Failed to read file: ${err}` });
      }
    }
  });

  // Create file
  router.post('/*', async (req: Request, res: Response) => {
    try {
      const projectRoot = getProjectRoot();
      if (!projectRoot) { res.status(400).json({ error: 'No project selected' }); return; }
      const relPath = req.params[0];
      if (!relPath) {
        res.status(400).json({ error: 'No file path specified' });
        return;
      }
      const filePath = safePath(relPath, projectRoot);
      if (!filePath) {
        res.status(403).json({ error: 'Path traversal not allowed' });
        return;
      }
      const { content = '' } = req.body || {};
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      try {
        await fs.access(filePath);
        res.status(409).json({ error: 'File already exists' });
        return;
      } catch {
        // File doesn't exist — proceed
      }
      await fs.writeFile(filePath, content, 'utf-8');
      res.status(201).json({ path: relPath, created: true });
    } catch (err) {
      res.status(500).json({ error: `Failed to create file: ${err}` });
    }
  });

  // Write file content
  router.put('/*', async (req: Request, res: Response) => {
    try {
      const projectRoot = getProjectRoot();
      if (!projectRoot) { res.status(400).json({ error: 'No project selected' }); return; }
      const relPath = req.params[0];
      if (!relPath) {
        res.status(400).json({ error: 'No file path specified' });
        return;
      }
      const filePath = safePath(relPath, projectRoot);
      if (!filePath) {
        res.status(403).json({ error: 'Path traversal not allowed' });
        return;
      }
      const { content } = req.body;
      if (typeof content !== 'string') {
        res.status(400).json({ error: 'Body must include "content" string' });
        return;
      }
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      res.json({ path: relPath, saved: true });
    } catch (err) {
      res.status(500).json({ error: `Failed to write file: ${err}` });
    }
  });

  // Delete file
  router.delete('/*', async (req: Request, res: Response) => {
    try {
      const projectRoot = getProjectRoot();
      if (!projectRoot) { res.status(400).json({ error: 'No project selected' }); return; }
      const relPath = req.params[0];
      if (!relPath) {
        res.status(400).json({ error: 'No file path specified' });
        return;
      }
      const filePath = safePath(relPath, projectRoot);
      if (!filePath) {
        res.status(403).json({ error: 'Path traversal not allowed' });
        return;
      }
      await fs.rm(filePath, { recursive: true });
      res.json({ path: relPath, deleted: true });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'File not found' });
      } else {
        res.status(500).json({ error: `Failed to delete file: ${err}` });
      }
    }
  });

  return router;
}

async function listFiles(dir: string, root: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(root, fullPath);
    if (entry.name === 'build' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(relPath + '/');
      const subFiles = await listFiles(fullPath, root);
      files.push(...subFiles);
    } else {
      files.push(relPath);
    }
  }
  return files;
}
