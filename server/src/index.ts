import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createFilesRouter } from './routes/files.js';
import { createCompileRouter } from './routes/compile.js';
import { createProjectsRouter } from './routes/projects.js';
import { initProjectContext, getCurrent } from './projectContext.js';
import { setupWebSocket } from './ws.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const PROJECTS_ROOT = path.resolve(process.env.PROJECTS_ROOT || path.join(import.meta.dirname, '../../projects'));
const CLIENT_DIST = path.resolve(import.meta.dirname, '../../client/dist');
const SAMPLE_PROJECT = path.resolve(import.meta.dirname, '../../sample-project');

// Ensure projects root exists and migrate sample-project if needed
if (!fs.existsSync(PROJECTS_ROOT)) {
  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
}

const sampleDest = path.join(PROJECTS_ROOT, 'sample-project');
if (fs.existsSync(SAMPLE_PROJECT) && !fs.existsSync(sampleDest)) {
  fs.cpSync(SAMPLE_PROJECT, sampleDest, { recursive: true });
}

// Pick default project: first directory in PROJECTS_ROOT
const projectDirs = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  .map((e) => e.name)
  .sort();

const defaultProject = projectDirs.includes('sample-project')
  ? 'sample-project'
  : projectDirs[0] || 'sample-project';

// If no projects exist at all, create a default one
if (projectDirs.length === 0) {
  const defaultDir = path.join(PROJECTS_ROOT, 'sample-project');
  fs.mkdirSync(defaultDir, { recursive: true });
  fs.writeFileSync(
    path.join(defaultDir, 'main.tex'),
    '\\documentclass[12pt]{article}\n\\usepackage{amsmath, amssymb, amsthm}\n\\usepackage{graphicx}\n\n\\title{My Document}\n\\author{Author}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\n\\section{Introduction}\nStart writing here.\n\n\\end{document}\n',
    'utf-8'
  );
}

initProjectContext(PROJECTS_ROOT, defaultProject);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api/projects', createProjectsRouter());
app.use('/api/files', createFilesRouter(() => getCurrent().projectRoot));
app.use('/api/compile', createCompileRouter(() => getCurrent().projectRoot));

app.get('/api/health', (_req, res) => {
  const { projectName, projectRoot } = getCurrent();
  res.json({ status: 'ok', currentProject: projectName, projectRoot });
});

// Serve built client if available
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // SPA fallback — serve index.html for non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`[texlab] Server listening on http://localhost:${PORT}`);
  console.log(`[texlab] Projects root: ${PROJECTS_ROOT}`);
  console.log(`[texlab] Active project: ${getCurrent().projectName}`);
  if (fs.existsSync(CLIENT_DIST)) {
    console.log(`[texlab] Serving client from ${CLIENT_DIST}`);
  }
});

// Mount WebSocket server for file watching
setupWebSocket(server);

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[texlab] Port ${PORT} is already in use. Kill the existing process or set a different port via PORT env var.`);
    process.exit(1);
  } else {
    throw err;
  }
});
