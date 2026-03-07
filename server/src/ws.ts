import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createWatcher, type FileChangeMessage } from './services/watcher.js';
import { getCurrent, onSwitch } from './projectContext.js';
import type { FSWatcher } from 'chokidar';

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });
  let watcher: FSWatcher | null = null;

  const broadcast = (msg: FileChangeMessage | { type: 'project_switched'; project: string }) => {
    const data = JSON.stringify(msg);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  };

  function startWatcher(projectRoot: string) {
    if (watcher) watcher.close();
    watcher = createWatcher(projectRoot, broadcast);
  }

  // Start watching the current project
  startWatcher(getCurrent().projectRoot);

  // Re-start watcher when project switches
  onSwitch((ctx) => {
    startWatcher(ctx.projectRoot);
    broadcast({ type: 'project_switched', project: ctx.projectName });
  });

  wss.on('connection', (ws) => {
    console.log('[ws] Client connected');
    ws.on('close', () => {
      console.log('[ws] Client disconnected');
    });
  });

  wss.on('close', () => {
    if (watcher) watcher.close();
  });

  console.log('[ws] WebSocket server listening on /ws');
}
