import { useCallback, useEffect, useMemo } from 'react';
import Shell from './shell/Shell';
import { useEditorStore } from '../stores/editorStore';
import { getSchemeById, applyColorScheme } from '../colorSchemes';
import { useCompilation } from '../hooks/useCompilation';
import { useHtmlRender } from '../hooks/useHtmlRender';
import { useAutosave } from '../hooks/useAutosave';
import { useFileWatcher } from '../hooks/useFileWatcher';
import { useScope } from '../hooks/useScope';
import { useShortcuts, type ShortcutHandlers } from '../hooks/useShortcuts';
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
  // the shell — these are accelerators, never the only way in. The chords live
  // in the registry (`lib/keybindings.ts`) and are rebindable in Settings; this
  // is only the map from action to what it does.
  const shortcutHandlers = useMemo<ShortcutHandlers>(() => {
    const store = () => useEditorStore.getState();
    return {
      panelFiles: () => store().toggleActivePanel('files'),
      panelOutline: () => store().toggleActivePanel('outline'),
      panelScope: () => store().toggleActivePanel('scope'),
      panelReferences: () => store().toggleActivePanel('references'),
      panelPlots: () => store().toggleActivePanel('plots'),
      panelProjects: () => store().toggleActivePanel('projects'),
      drawerSymbols: () => store().toggleDrawer('symbols'),
      drawerSnippets: () => store().toggleDrawer('snippets'),
      compile: doCompile,
      renderHtml: doRender,
      save: handleSave,
      findFile: () => store().setFinder('files'),
      findProject: () => store().setFinder('projects'),
      openSettings: () => store().setShowSettings(true),
    };
  }, [doCompile, doRender, handleSave]);

  useShortcuts(shortcutHandlers);

  // Escape unwinds whatever is on top. It is deliberately not in the registry:
  // it closes things rather than doing anything, and nothing else may hold it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const store = useEditorStore.getState();
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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useFileWatcher();
  useScope();

  return (
    <Shell
      onManualSave={saveNow}
      onCompile={doCompile}
      onRenderHtml={doRender}
    />
  );
}
