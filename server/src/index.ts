import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createFilesRouter } from './routes/files.js';
import { createCompileRouter } from './routes/compile.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const PROJECT_ROOT = path.resolve(process.env.PROJECT_ROOT || path.join(import.meta.dirname, '../../sample-project'));
const CLIENT_DIST = path.resolve(import.meta.dirname, '../../client/dist');

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api/files', createFilesRouter(PROJECT_ROOT));
app.use('/api/compile', createCompileRouter(PROJECT_ROOT));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', projectRoot: PROJECT_ROOT });
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
  console.log(`[texlab] Project root: ${PROJECT_ROOT}`);
  if (fs.existsSync(CLIENT_DIST)) {
    console.log(`[texlab] Serving client from ${CLIENT_DIST}`);
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[texlab] Port ${PORT} is already in use. Kill the existing process or set a different port via PORT env var.`);
    process.exit(1);
  } else {
    throw err;
  }
});
