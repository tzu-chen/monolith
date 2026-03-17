import { useCallback, useEffect } from 'react';
import TopBar from './nav/TopBar';
import BottomBar from './nav/BottomBar';
import Layout from './Layout';
import SymbolPalette from './panels/SymbolPalette';
import SnippetPanel from './panels/SnippetPanel';
import { useEditorStore } from '../stores/editorStore';
import { getSchemeById, applyColorScheme } from '../colorSchemes';
import { useCompilation } from '../hooks/useCompilation';
import { useAutosave } from '../hooks/useAutosave';
import { useFileWatcher } from '../hooks/useFileWatcher';
import * as api from '../lib/api';

export default function App() {
  const { doCompile } = useCompilation();
  const { saveNow } = useAutosave();
  const activePanel = useEditorStore((s) => s.activePanel);

  // Ctrl+S: save file to disk then compile
  const handleSave = useCallback(async () => {
    await saveNow();
    doCompile();
  }, [saveNow, doCompile]);

  // Initialize color scheme on mount
  useEffect(() => {
    const schemeId = useEditorStore.getState().colorScheme;
    applyColorScheme(getSchemeById(schemeId));
  }, []);

  // Load projects, file tree, and open main.tex on mount
  useEffect(() => {
    const init = async () => {
      try {
        const store = useEditorStore.getState();

        // Fetch project list and current project
        const [projects, currentInfo] = await Promise.all([
          api.listProjects(),
          api.getCurrentProject(),
        ]);
        store.setProjects(projects);
        store.setCurrentProject(currentInfo.project ?? '');
        store.setProjectRoot(currentInfo.projectRoot);

        // Only load files if a project is selected
        if (!currentInfo.project) return;

        // Fetch file tree
        const files = await api.listFiles();
        store.setFileTree(files);

        // Open main.tex as the default file if it exists
        try {
          const content = await api.readFile('main.tex');
          store.openFile('main.tex', content);
        } catch {
          // main.tex doesn't exist — no file opened by default
        }
      } catch (err) {
        console.error('Failed to initialize:', err);
      }
    };
    init();
  }, []);

  // Connect file watcher
  useFileWatcher();

  return (
    <>
      <TopBar onCompile={doCompile} />
      {activePanel === 'symbols' && <SymbolPalette />}
      {activePanel === 'snippets' && <SnippetPanel />}
      <Layout onSave={handleSave} onManualSave={saveNow} />
      <BottomBar />
    </>
  );
}
