import { useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import * as api from '../lib/api';
import { extractMacroDefinitions } from '../components/editor/math-preview';

interface FileChangeMessage {
  type: 'file_changed';
  event: string;
  path: string;
}

interface ProjectSwitchedMessage {
  type: 'project_switched';
  project: string;
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
          const msg: FileChangeMessage | ProjectSwitchedMessage = JSON.parse(event.data);

          // Handle project switch (from another client/tab)
          if (msg.type === 'project_switched') {
            const store = useEditorStore.getState();
            store.resetEditorState();
            store.setCurrentProject(msg.project);

            const [projects, currentInfo, files] = await Promise.all([
              api.listProjects(),
              api.getCurrentProject(),
              api.listFiles(),
            ]);
            store.setProjects(projects);
            store.setProjectRoot(currentInfo.projectRoot);
            store.setFileTree(files);

            try {
              const content = await api.readFile('main.tex');
              store.openFile('main.tex', content);
            } catch {
              // No main.tex in this project
            }

            // Load preamble macros for math preview
            try {
              const preamble = await api.readFile('preamble.tex');
              store.setPreambleMacros(extractMacroDefinitions(preamble));
            } catch {
              // No preamble.tex
            }
            return;
          }

          if (msg.type !== 'file_changed') return;

          // Refresh file tree on any file system change
          const files = await api.listFiles();
          useEditorStore.getState().setFileTree(files);

          // Re-fetch preamble macros when preamble.tex changes
          if (msg.path === 'preamble.tex' && (msg.event === 'change' || msg.event === 'add')) {
            try {
              const preamble = await api.readFile('preamble.tex');
              useEditorStore.getState().setPreambleMacros(extractMacroDefinitions(preamble));
            } catch {}
          } else if (msg.path === 'preamble.tex' && msg.event === 'unlink') {
            useEditorStore.getState().setPreambleMacros('');
          }

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
