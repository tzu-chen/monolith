import { useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import * as api from '../lib/api';

interface FileChangeMessage {
  type: 'file_changed';
  event: string;
  path: string;
}

export function useFileWatcher() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[ws] Connected to file watcher');
      };

      ws.onmessage = async (event) => {
        try {
          const msg: FileChangeMessage = JSON.parse(event.data);
          if (msg.type !== 'file_changed') return;

          // Refresh file tree on any file system change
          const files = await api.listFiles();
          useEditorStore.getState().setFileTree(files);

          // If a currently open file was changed externally, reload its content
          if (msg.event === 'change') {
            const state = useEditorStore.getState();
            const openTab = state.openTabs.find((t) => t.path === msg.path);
            if (openTab && !openTab.dirty) {
              try {
                const content = await api.readFile(msg.path);
                // Re-open file to update content (will switch to existing tab)
                state.openFile(msg.path, content);
                // Since openFile doesn't update content of existing tabs,
                // we need to update it directly
                useEditorStore.setState((s) => ({
                  openTabs: s.openTabs.map((t) =>
                    t.path === msg.path ? { ...t, content } : t
                  ),
                  content: s.activeTabPath === msg.path ? content : s.content,
                }));
              } catch {
                // File might have been deleted — ignore
              }
            }
          }

          // If a file was deleted and is open, close its tab
          if (msg.event === 'unlink') {
            const state = useEditorStore.getState();
            const openTab = state.openTabs.find((t) => t.path === msg.path);
            if (openTab) {
              state.closeTab(msg.path);
            }
          }
        } catch (err) {
          console.error('[ws] Failed to handle message:', err);
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        console.log('[ws] Disconnected, reconnecting in 2s...');
        reconnectTimer.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);
}
