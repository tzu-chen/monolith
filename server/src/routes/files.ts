import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';

export function createFilesRouter(getProjectRoot: () => string | null): Router {
  const router = Router();

  function safePath(relPath: string, projectRoot: string): string | null {
    const filePath = path.join(projectRoot, relPath);
    if (!filePath.startsWith(projectRoot)) return null;
    return filePath;
  }

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
