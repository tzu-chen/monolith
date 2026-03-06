import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';

export function createFilesRouter(projectRoot: string): Router {
  const router = Router();

  // List files in project
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const files = await listFiles(projectRoot, projectRoot);
      res.json({ root: projectRoot, files });
    } catch (err) {
      res.status(500).json({ error: `Failed to list files: ${err}` });
    }
  });

  // Read file content
  router.get('/*', async (req: Request, res: Response) => {
    try {
      const relPath = req.params[0];
      if (!relPath) {
        res.status(400).json({ error: 'No file path specified' });
        return;
      }
      const filePath = path.join(projectRoot, relPath);
      // Prevent path traversal
      if (!filePath.startsWith(projectRoot)) {
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

  // Write file content
  router.put('/*', async (req: Request, res: Response) => {
    try {
      const relPath = req.params[0];
      if (!relPath) {
        res.status(400).json({ error: 'No file path specified' });
        return;
      }
      const filePath = path.join(projectRoot, relPath);
      if (!filePath.startsWith(projectRoot)) {
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
