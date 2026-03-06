import express from 'express';
import cors from 'cors';
import path from 'path';
import { createFilesRouter } from './routes/files.js';
import { createCompileRouter } from './routes/compile.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const PROJECT_ROOT = path.resolve(process.env.PROJECT_ROOT || path.join(import.meta.dirname, '../../sample-project'));

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/files', createFilesRouter(PROJECT_ROOT));
app.use('/api/compile', createCompileRouter(PROJECT_ROOT));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', projectRoot: PROJECT_ROOT });
});

function startServer(port: number) {
  const server = app.listen(port, () => {
    console.log(`[texlab] Server listening on http://localhost:${port}`);
    console.log(`[texlab] Project root: ${PROJECT_ROOT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`[texlab] Port ${port} is in use, trying ${nextPort}...`);
      startServer(nextPort);
    } else {
      throw err;
    }
  });
}

startServer(PORT);
