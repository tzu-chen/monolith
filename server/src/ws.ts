import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createWatcher, type FileChangeMessage } from './services/watcher.js';
import { getCurrent, onSwitch } from './projectContext.js';
import type { FSWatcher } from 'chokidar';

export type ServerMessage =
  | FileChangeMessage
  | { type: 'project_switched'; project: string }
  /** The project's version history changed (a version saved, relabelled, or restored). */
  | { type: 'versions_changed' }
  /** A comment was added, edited, resolved or deleted. */
  | { type: 'comments_changed' }
  /** The to-do list or its tags changed. */
  | { type: 'todos_changed' };

let wss: WebSocketServer | null = null;

/** Send a message to every connected client. A no-op before the server is up. */
export function broadcast(msg: ServerMessage): void {
  if (!wss) return;
  const data = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

export function setupWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });
  const sockets = wss;
  let watcher: FSWatcher | null = null;

  function startWatcher(projectRoot: string | null) {
    if (watcher) watcher.close();
    watcher = null;
    if (projectRoot) {
      watcher = createWatcher(projectRoot, broadcast);
    }
  }

  // Start watching the current project (may be null)
  startWatcher(getCurrent().projectRoot);

  // Re-start watcher when project switches
  onSwitch((ctx) => {
    startWatcher(ctx.projectRoot);
    broadcast({ type: 'project_switched', project: ctx.projectName ?? '' });
  });

  sockets.on('connection', (ws) => {
    console.log('[ws] Client connected');
    ws.on('close', () => {
      console.log('[ws] Client disconnected');
    });
  });

  sockets.on('close', () => {
    if (watcher) watcher.close();
  });

  console.log('[ws] WebSocket server listening on /ws');
}
