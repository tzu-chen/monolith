import { useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import {
  createExtensions,
  getThemeReconfiguration,
  getVimReconfiguration,
  getLineWrapReconfiguration,
  getLineNumbersReconfiguration,
  getPreambleReconfiguration,
  getScopeReconfiguration,
  getDiagnosticsReconfiguration,
  getBaselineReconfiguration,
  getFileTreeReconfiguration,
  type EditorConfig,
} from './extensions';
import { useEditorStore } from '../../stores/editorStore';
import { diagnosticsForFile } from '../../lib/diagnostics';
import { claimMacroClick } from './scope-decorations';
import * as api from '../../lib/api';


// Cache EditorState per file so undo history and editing location (cursor +
// scroll) survive both tab switches and EditorPane unmounts — e.g. toggling the
// view to PDF-only and back. Module-scoped so it outlives the component, keyed
// by project + path to avoid collisions between same-named files in different
// projects.
const stateCache = new Map<string, EditorState>();

function cacheKeyFor(path: string): string {
  const project = useEditorStore.getState().currentProject ?? '';
  return `${project}\n${path}`;
}

export default function EditorPane() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const content = useEditorStore((s) => s.content);
  const scrollToLine = useEditorStore((s) => s.scrollToLine);
  const clearScrollToLine = useEditorStore((s) => s.clearScrollToLine);
  const setEditorView = useEditorStore((s) => s.setEditorView);
  const colorScheme = useEditorStore((s) => s.colorScheme);
  const vimMode = useEditorStore((s) => s.vimMode);
  const fontSize = useEditorStore((s) => s.fontSize);
  const fontFamily = useEditorStore((s) => s.fontFamily);
  const lineWrap = useEditorStore((s) => s.lineWrap);
  const showLineNumbers = useEditorStore((s) => s.showLineNumbers);
  const preambleMacros = useEditorStore((s) => s.preambleMacros);
  const scope = useEditorStore((s) => s.scope);
  const diagnostics = useEditorStore((s) => s.diagnostics);
  const compiledFile = useEditorStore((s) => s.compiledFile);
  const compileSnapshot = useEditorStore((s) => s.compileSnapshot);
  const fileTree = useEditorStore((s) => s.fileTree);

  /** Open a file (if needed) and put the cursor on `line`. */
  const goToDefinition = useCallback(async (file: string, line: number) => {
    const store = useEditorStore.getState();
    if (store.activeTabPath !== file) {
      const existing = store.openTabs.find((t) => t.path === file);
      if (existing) {
        store.setActiveTab(file);
      } else {
        try {
          store.openFile(file, await api.readFile(file));
        } catch {
          return;
        }
      }
    }
    store.requestScrollToLine(line);
  }, []);

  /** Everything the editor needs, read fresh from the store. */
  const currentConfig = useCallback((): EditorConfig => {
    const s = useEditorStore.getState();
    const path = s.activeTabPath;
    return {
      colorScheme: s.colorScheme,
      vimMode: s.vimMode,
      font: { fontSize: s.fontSize, fontFamily: s.fontFamily },
      lineWrap: s.lineWrap,
      preambleMacros: s.preambleMacros,
      showLineNumbers: s.showLineNumbers,
      scope: s.scope,
      diagnostics: diagnosticsForFile(s.diagnostics, path, s.compiledFile),
      baseline: path ? s.compileSnapshot[path] ?? null : null,
      fileTree: s.fileTree,
      onGoToDefinition: goToDefinition,
    };
  }, [goToDefinition]);

  /**
   * Listeners and handlers that are identical for a fresh and a restored view.
   *
   * Save is not among them: it is a global shortcut like the rest (registry in
   * `lib/keybindings.ts`), so it stays rebindable and keeps working when the
   * focus is anywhere else in the shell.
   */
  const sharedExtensions = useCallback(() => {
    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        useEditorStore.getState().updateContent(update.state.doc.toString());
      }
      if (update.selectionSet || update.docChanged) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        useEditorStore.getState().setCursorPosition(line.number, head - line.from + 1);
      }
    });

    // SyncTeX forward on modifier-click. The macro handler runs first on
    // mousedown; when it jumped to a definition, the click it left behind is
    // its own and must not also forward-sync.
    const syncTexHandler = EditorView.domEventHandlers({
      click: (event, view) => {
        if (!event.ctrlKey && !event.metaKey) return false;
        if (claimMacroClick()) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;
        const line = view.state.doc.lineAt(pos);
        const col = pos - line.from + 1;
        const filePath = useEditorStore.getState().activeTabPath;
        if (!filePath) return false;

        api
          .syncTexForward(filePath, line.number, col)
          .then((highlight) => {
            if (highlight) useEditorStore.getState().setSyncTexHighlight(highlight);
          })
          .catch(() => {});
        return false;
      },
    });

    return [updateListener, syncTexHandler];
  }, []);

  // Create/swap EditorView when the active tab changes.
  useEffect(() => {
    if (!containerRef.current || !activeTabPath) return;

    // Persist the outgoing view's state before replacing it.
    if (viewRef.current) {
      const currentKey = viewRef.current.dom.dataset.cacheKey;
      if (currentKey) stateCache.set(currentKey, viewRef.current.state);
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const key = cacheKeyFor(activeTabPath);
    const cached = stateCache.get(key);
    const extensions = [...sharedExtensions(), ...createExtensions(currentConfig())];

    const state = EditorState.create({
      doc: cached ? cached.doc : useEditorStore.getState().content,
      extensions,
      selection: cached?.selection,
    });

    const view = new EditorView({ state, parent: containerRef.current });
    view.dom.dataset.cacheKey = key;
    if (cached) {
      // A fresh view starts scrolled to the top; bring the restored cursor back
      // into view so the editing location is preserved, not just the selection.
      view.dispatch({
        effects: EditorView.scrollIntoView(cached.selection.main.head, { y: 'center' }),
      });
    }
    viewRef.current = view;
    setEditorView(view);
  }, [activeTabPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // On unmount (e.g. switching the view to PDF-only), persist the live editor
  // state so the editing location is restored when the pane mounts again.
  useEffect(() => {
    return () => {
      const view = viewRef.current;
      if (!view) return;
      const key = view.dom.dataset.cacheKey;
      if (key) stateCache.set(key, view.state);
      view.destroy();
      viewRef.current = null;
      setEditorView(null);
    };
  }, [setEditorView]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: getThemeReconfiguration(colorScheme, { fontSize, fontFamily }),
    });
  }, [colorScheme, fontSize, fontFamily]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: getVimReconfiguration(vimMode) });
  }, [vimMode]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: getLineWrapReconfiguration(lineWrap) });
  }, [lineWrap]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: getLineNumbersReconfiguration(showLineNumbers) });
  }, [showLineNumbers]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: getPreambleReconfiguration(preambleMacros) });
  }, [preambleMacros]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: getScopeReconfiguration(scope) });
  }, [scope]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: getDiagnosticsReconfiguration(diagnosticsForFile(diagnostics, activeTabPath, compiledFile)),
    });
  }, [diagnostics, activeTabPath, compiledFile]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: getBaselineReconfiguration(activeTabPath ? compileSnapshot[activeTabPath] ?? null : null),
    });
  }, [compileSnapshot, activeTabPath]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: getFileTreeReconfiguration(fileTree) });
  }, [fileTree]);

  // Handle scroll-to-line requests from the outline, panels and status bar.
  useEffect(() => {
    if (scrollToLine == null || !viewRef.current) return;
    const view = viewRef.current;
    const line = view.state.doc.line(Math.min(scrollToLine, view.state.doc.lines));
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    });
    view.focus();
    clearScrollToLine();
  }, [scrollToLine, clearScrollToLine]);

  // `content` drives the editor only on the initial mount of a tab; afterwards
  // the editor is the source of truth and writes back through updateContent.
  void content;

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', overflow: 'hidden', backgroundColor: 'var(--surface-editor)' }}
    />
  );
}
