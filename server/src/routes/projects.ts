import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getProjectsRoot, getCurrent, switchProject } from '../projectContext.js';

const VALID_NAME = /^[a-zA-Z0-9_-]+$/;

const DEFAULT_MAIN_TEX = `\\documentclass[12pt]{article}
\\usepackage{amsmath, amssymb, amsthm}
\\usepackage{graphicx}

\\title{My Document}
\\author{Author}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Start writing here.

\\end{document}
`;

export function createProjectsRouter(): Router {
  const router = Router();

  // List all projects
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

  // Get current project
  router.get('/current', (_req: Request, res: Response) => {
    const { projectName, projectRoot } = getCurrent();
    res.json({ project: projectName, projectRoot });
  });

  // Create a new project
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { name } = req.body;
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
      await fs.writeFile(path.join(projectDir, 'main.tex'), DEFAULT_MAIN_TEX, 'utf-8');
      res.status(201).json({ name, created: true });
    } catch (err) {
      res.status(500).json({ error: `Failed to create project: ${err}` });
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

  return router;
}
