import { useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import * as api from '../lib/api';
import { extractMacroDefinitions } from '../components/editor/math-preview';
import { replaceTabContent } from '../components/editor/EditorPane';

interface FileChangeMessage {
  type: 'file_changed';
  event: string;
  path: string;
}

interface ProjectSwitchedMessage {
  type: 'project_switched';
  project: string;
}

interface VersionsChangedMessage {
  type: 'versions_changed';
}

interface CommentsChangedMessage {
  type: 'comments_changed';
}

interface TodosChangedMessage {
  type: 'todos_changed';
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
          const msg:
            | FileChangeMessage
            | ProjectSwitchedMessage
            | VersionsChangedMessage
            | CommentsChangedMessage
            | TodosChangedMessage = JSON.parse(event.data);

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
            store.setMainFile(currentInfo.mainFile);
            store.setFileTree(files);

            const entry = currentInfo.mainFile ?? 'main.tex';
            try {
              store.openFile(entry, await api.readFile(entry));
            } catch {
              // No main file in this project
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

          // A version saved, relabelled or restored — here or in another tab.
          if (msg.type === 'versions_changed') {
            useEditorStore.getState().invalidateVersions();
            return;
          }

          if (msg.type === 'comments_changed') {
            useEditorStore.getState().invalidateComments();
            return;
          }

          if (msg.type === 'todos_changed') {
            useEditorStore.getState().invalidateTodos();
            return;
          }

          if (msg.type !== 'file_changed') return;

          // Refresh file tree on any file system change
          const files = await api.listFiles();
          useEditorStore.getState().setFileTree(files);

          // What is uncommitted is a function of what is on disk.
          useEditorStore.getState().invalidateVersions();

          // A change anywhere in the include chain invalidates the scope graph:
          // a new \usepackage in preamble.tex changes what main.tex has.
          if (useEditorStore.getState().scopeChainIncludes(msg.path)) {
            useEditorStore.getState().invalidateScope();
          }

          // The reference library is entries joined to \cite uses, so either
          // side of that join going stale invalidates it.
          if (msg.path.endsWith('.bib') || msg.path.endsWith('.tex')) {
            useEditorStore.getState().invalidateLibrary();
          }

          // Re-fetch preamble macros when preamble.tex changes
          if (msg.path === 'preamble.tex' && (msg.event === 'change' || msg.event === 'add')) {
            try {
              const preamble = await api.readFile('preamble.tex');
              useEditorStore.getState().setPreambleMacros(extractMacroDefinitions(preamble));
            } catch {}
          } else if (msg.path === 'preamble.tex' && msg.event === 'unlink') {
            useEditorStore.getState().setPreambleMacros('');
          }

          // If a currently open file was changed on disk, reload its content
          // in place. This must not activate the tab: a compile writes the
          // main file to disk, and the chapter being edited has to stay in
          // front when that event comes back round.
          if (msg.event === 'change') {
            const state = useEditorStore.getState();
            const openTab = state.openTabs.find((t) => t.path === msg.path);
            if (openTab && !openTab.dirty) {
              try {
                replaceTabContent(msg.path, await api.readFile(msg.path));
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
