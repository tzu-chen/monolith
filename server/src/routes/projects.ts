import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getProjectsRoot, getCurrent, switchProject, renameProject, deleteProject } from '../projectContext.js';

const VALID_NAME = /^[a-zA-Z0-9_-]+$/;

// Directories excluded from metadata counts and project duplication (build artifacts).
const EXCLUDED_DIRS = new Set(['build', '.monolith']);

const TEMPLATES: Record<string, Record<string, string>> = {
  article: {
    'main.tex': `\\documentclass{article}
\\input{preamble}

\\title{Untitled}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}

\\end{document}
`,
    'preamble.tex': `\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{graphicx}
`,
  },
};

/** Recursive file count (excluding build artifacts) and newest mtime for a project dir. */
async function projectStats(dir: string): Promise<{ fileCount: number; modified: number }> {
  let fileCount = 0;
  let modified = 0;
  async function walk(current: string, top: boolean): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (top && EXCLUDED_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full, false);
      } else {
        fileCount++;
        try {
          const st = await fs.stat(full);
          if (st.mtimeMs > modified) modified = st.mtimeMs;
        } catch {
          // ignore unreadable file
        }
      }
    }
  }
  await walk(dir, true);
  return { fileCount, modified };
}

export function createProjectsRouter(): Router {
  const router = Router();

  // List all projects (names only — keeps the quick-switcher fast)
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const entries = await fs.readdir(getProjectsRoot(), { withFileTypes: true });
      const projects = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort();
      res.json({ projects });
    } catch (err) {
      res.status(500).json({ error: `Failed to list projects: ${err}` });
    }
  });

  // List projects with metadata (file count + last modified) for the dashboard
  router.get('/meta', async (_req: Request, res: Response) => {
    try {
      const root = getProjectsRoot();
      const entries = await fs.readdir(root, { withFileTypes: true });
      const names = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort();
      const projects = await Promise.all(
        names.map(async (name) => {
          const { fileCount, modified } = await projectStats(path.join(root, name));
          return { name, fileCount, modified };
        })
      );
      res.json({ projects });
    } catch (err) {
      res.status(500).json({ error: `Failed to read project metadata: ${err}` });
    }
  });

  // Get current project
  router.get('/current', (_req: Request, res: Response) => {
    const { projectName, projectRoot } = getCurrent();
    res.json({ project: projectName, projectRoot });
  });

  // Create a new project (optionally from a template)
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { name, template } = req.body;
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Body must include "name" string' });
        return;
      }
      if (!VALID_NAME.test(name)) {
        res.status(400).json({ error: 'Project name may only contain letters, numbers, hyphens, and underscores' });
        return;
      }
      const projectDir = path.join(getProjectsRoot(), name);
      try {
        await fs.access(projectDir);
        res.status(409).json({ error: 'Project already exists' });
        return;
      } catch {
        // Does not exist — proceed
      }
      await fs.mkdir(projectDir, { recursive: true });

      const files = template && template !== 'blank' ? TEMPLATES[template] : undefined;
      if (files) {
        await Promise.all(
          Object.entries(files).map(([file, content]) =>
            fs.writeFile(path.join(projectDir, file), content, 'utf-8')
          )
        );
      }

      res.status(201).json({ name, created: true });
    } catch (err) {
      res.status(500).json({ error: `Failed to create project: ${err}` });
    }
  });

  // Duplicate a project (excluding build artifacts)
  router.post('/:name/duplicate', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const { newName } = req.body;
      if (!newName || typeof newName !== 'string') {
        res.status(400).json({ error: 'Body must include "newName" string' });
        return;
      }
      if (!VALID_NAME.test(newName)) {
        res.status(400).json({ error: 'Project name may only contain letters, numbers, hyphens, and underscores' });
        return;
      }
      const root = getProjectsRoot();
      const src = path.join(root, name);
      const dest = path.join(root, newName);
      try {
        const st = await fs.stat(src);
        if (!st.isDirectory()) throw new Error('not a directory');
      } catch {
        res.status(404).json({ error: `Project "${name}" does not exist` });
        return;
      }
      try {
        await fs.access(dest);
        res.status(409).json({ error: 'Project already exists' });
        return;
      } catch {
        // Does not exist — proceed
      }
      await fs.cp(src, dest, {
        recursive: true,
        filter: (s) => {
          const rel = path.relative(src, s);
          const topSegment = rel.split(path.sep)[0];
          return !EXCLUDED_DIRS.has(topSegment);
        },
      });
      res.status(201).json({ name: newName });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to duplicate project: ${err.message}` });
    }
  });

  // Switch active project
  router.put('/current', (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Body must include "name" string' });
        return;
      }
      const ctx = switchProject(name);
      res.json({ project: ctx.projectName, projectRoot: ctx.projectRoot });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // Rename a project
  router.put('/:name', async (req: Request, res: Response) => {
    try {
      const oldName = req.params.name;
      const { name: newName } = req.body;
      if (!newName || typeof newName !== 'string') {
        res.status(400).json({ error: 'Body must include "name" string' });
        return;
      }
      if (!VALID_NAME.test(newName)) {
        res.status(400).json({ error: 'Project name may only contain letters, numbers, hyphens, and underscores' });
        return;
      }
      const ctx = await renameProject(oldName, newName);
      res.json({ project: ctx.projectName, projectRoot: ctx.projectRoot });
    } catch (err: any) {
      const status = err.message.includes('does not exist') ? 404
        : err.message.includes('already exists') ? 409 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  // Delete a project
  router.delete('/:name', async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const result = await deleteProject(name);
      res.json(result);
    } catch (err: any) {
      const status = err.message.includes('does not exist') ? 404
        : err.message.includes('Cannot delete') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  return router;
}
