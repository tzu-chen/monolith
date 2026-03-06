import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createWatcher, type FileChangeMessage } from './services/watcher.js';

export function setupWebSocket(server: Server, projectRoot: string): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcast = (msg: FileChangeMessage) => {
    const data = JSON.stringify(msg);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  };

  const watcher = createWatcher(projectRoot, broadcast);

  wss.on('connection', (ws) => {
    console.log('[ws] Client connected');
    ws.on('close', () => {
      console.log('[ws] Client disconnected');
    });
  });

  wss.on('close', () => {
    watcher.close();
  });

  console.log('[ws] WebSocket server listening on /ws');
}
