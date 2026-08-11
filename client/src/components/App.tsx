import { useCallback, useEffect } from 'react';
import Shell from './shell/Shell';
import { useEditorStore } from '../stores/editorStore';
import { getSchemeById, applyColorScheme } from '../colorSchemes';
import { useCompilation } from '../hooks/useCompilation';
import { useHtmlRender } from '../hooks/useHtmlRender';
import { useAutosave } from '../hooks/useAutosave';
import { useFileWatcher } from '../hooks/useFileWatcher';
import { useScope } from '../hooks/useScope';
import * as api from '../lib/api';
import { extractMacroDefinitions } from './editor/math-preview';

export default function App() {
  const { doCompile } = useCompilation();
  const { doRender } = useHtmlRender();
  const { saveNow } = useAutosave();

  // Ctrl+S: save file to disk then compile
  const handleSave = useCallback(async () => {
    await saveNow();
    doCompile();
  }, [saveNow, doCompile]);

  // Initialize color scheme on mount, and tick auto-switch each minute
  const autoSwitchEnabled = useEditorStore((s) => s.autoSwitch.enabled);
  useEffect(() => {
    applyColorScheme(getSchemeById(useEditorStore.getState().colorScheme));
  }, []);

  useEffect(() => {
    if (!autoSwitchEnabled) return;
    useEditorStore.getState().applyAutoSwitchScheme();
    const id = window.setInterval(() => {
      useEditorStore.getState().applyAutoSwitchScheme();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [autoSwitchEnabled]);

  // Load projects, file tree, and open main.tex on mount
  useEffect(() => {
    const init = async () => {
      try {
        const store = useEditorStore.getState();

        const [projects, currentInfo] = await Promise.all([
          api.listProjects(),
          api.getCurrentProject(),
        ]);
        store.setProjects(projects);
        store.setCurrentProject(currentInfo.project ?? '');
        store.setProjectRoot(currentInfo.projectRoot);

        if (!currentInfo.project) return;

        store.setFileTree(await api.listFiles());

        try {
          store.openFile('main.tex', await api.readFile('main.tex'));
        } catch {
          // main.tex doesn't exist — no file opened by default
        }

        try {
          store.setPreambleMacros(extractMacroDefinitions(await api.readFile('preamble.tex')));
        } catch {
          // No preamble.tex — no custom macros
        }
      } catch (err) {
        console.error('Failed to initialize:', err);
      }
    };
    init();
  }, []);

  // Global shortcuts. Everything here also has a visible control somewhere in
  // the shell — these are accelerators, never the only way in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const store = useEditorStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (e.key === 'Escape') {
        if (store.finder) {
          store.setFinder(null);
          e.preventDefault();
        } else if (store.showSettings) {
          store.setShowSettings(false);
          e.preventDefault();
        } else if (store.activeDrawer) {
          store.setActiveDrawer(null);
          e.preventDefault();
        }
        return;
      }

      if (!mod) return;

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        store.setFinder(e.shiftKey ? 'projects' : 'files');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave]);

  useFileWatcher();
  useScope();

  return (
    <Shell
      onSave={handleSave}
      onManualSave={saveNow}
      onCompile={doCompile}
      onRenderHtml={doRender}
    />
  );
}
