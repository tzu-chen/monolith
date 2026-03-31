import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createFilesRouter } from './routes/files.js';
import { createCompileRouter } from './routes/compile.js';
import { createProjectsRouter } from './routes/projects.js';
import { createSyncTeXRouter } from './routes/synctex.js';
import { createReferencesRouter } from './routes/references.js';
import { initProjectContext, getCurrent } from './projectContext.js';
import { setupWebSocket } from './ws.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3005', 10);
const PROJECTS_ROOT = path.resolve(process.env.PROJECTS_ROOT || path.join(import.meta.dirname, '../../projects'));
const CLIENT_DIST = path.resolve(import.meta.dirname, '../../client/dist');

// Ensure projects root exists
if (!fs.existsSync(PROJECTS_ROOT)) {
  fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
}

// Pick default project: first directory in PROJECTS_ROOT (or null if none)
const projectDirs = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  .map((e) => e.name)
  .sort();

const defaultProject = projectDirs[0] || null;

initProjectContext(PROJECTS_ROOT, defaultProject);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api/projects', createProjectsRouter());
app.use('/api/files', createFilesRouter(() => getCurrent().projectRoot));
app.use('/api/compile', createCompileRouter(() => getCurrent().projectRoot));
app.use('/api/synctex', createSyncTeXRouter(() => getCurrent().projectRoot));
app.use('/api/references', createReferencesRouter(() => getCurrent().projectRoot));

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
  console.log(`[monolith] Server listening on http://localhost:${PORT}`);
  console.log(`[monolith] Projects root: ${PROJECTS_ROOT}`);
  console.log(`[monolith] Active project: ${getCurrent().projectName ?? '(none)'}`);
  if (fs.existsSync(CLIENT_DIST)) {
    console.log(`[monolith] Serving client from ${CLIENT_DIST}`);
  }
});

// Mount WebSocket server for file watching
setupWebSocket(server);

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[monolith] Port ${PORT} is already in use. Kill the existing process or set a different port via PORT env var.`);
    process.exit(1);
  } else {
    throw err;
  }
});
