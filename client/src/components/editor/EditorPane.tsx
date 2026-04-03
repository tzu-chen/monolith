import { useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, ViewUpdate } from '@codemirror/view';
import { createExtensions, getThemeReconfiguration, getVimReconfiguration, getLineWrapReconfiguration, getPreambleReconfiguration } from './extensions';
import { useEditorStore } from '../../stores/editorStore';
import * as api from '../../lib/api';

interface EditorPaneProps {
  onSave: () => void;
}

export default function EditorPane({ onSave }: EditorPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Cache EditorState per file so undo history is preserved across tab switches
  const stateCache = useRef<Map<string, EditorState>>(new Map());
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const content = useEditorStore((s) => s.content);
  const scrollToLine = useEditorStore((s) => s.scrollToLine);
  const clearScrollToLine = useEditorStore((s) => s.clearScrollToLine);
  const updateContent = useEditorStore((s) => s.updateContent);
  const setEditorView = useEditorStore((s) => s.setEditorView);
  const colorScheme = useEditorStore((s) => s.colorScheme);
  const vimMode = useEditorStore((s) => s.vimMode);
  const fontSize = useEditorStore((s) => s.fontSize);
  const fontFamily = useEditorStore((s) => s.fontFamily);
  const setCursorPosition = useEditorStore((s) => s.setCursorPosition);
  const lineWrap = useEditorStore((s) => s.lineWrap);
  const setSyncTexHighlight = useEditorStore((s) => s.setSyncTexHighlight);
  const preambleMacros = useEditorStore((s) => s.preambleMacros);

  // Stable ref for onSave so we don't recreate the editor on every render
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const createView = useCallback(
    (doc: string, parent: HTMLElement): EditorView => {
      const s = useEditorStore.getState();
      const currentColorScheme = s.colorScheme;
      const currentVim = s.vimMode;
      const currentFont = { fontSize: s.fontSize, fontFamily: s.fontFamily };
      const currentLineWrap = s.lineWrap;
      const currentPreambleMacros = s.preambleMacros;

      const saveKeymap = keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            onSaveRef.current();
            return true;
          },
        },
      ]);

      const updateListener = EditorView.updateListener.of(
        (update: ViewUpdate) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            useEditorStore.getState().updateContent(newContent);
          }
          // Track cursor position
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            useEditorStore.getState().setCursorPosition(line.number, head - line.from + 1);
          }
        }
      );

      // SyncTeX forward: Ctrl+Click
      const syncTexHandler = EditorView.domEventHandlers({
        click: (event, view) => {
          if (!event.ctrlKey && !event.metaKey) return false;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos == null) return false;
          const line = view.state.doc.lineAt(pos);
          const col = pos - line.from + 1;
          const filePath = useEditorStore.getState().activeTabPath;
          if (!filePath) return false;

          api.syncTexForward(filePath, line.number, col)
            .then((highlight) => {
              if (highlight) {
                useEditorStore.getState().setSyncTexHighlight(highlight);
              }
            })
            .catch(() => {});
          return false;
        },
      });

      const state = EditorState.create({
        doc,
        extensions: [saveKeymap, ...createExtensions(currentColorScheme, currentVim, currentFont, currentLineWrap, currentPreambleMacros), updateListener, syncTexHandler],
      });

      return new EditorView({ state, parent });
    },
    []
  );

  // Create/swap EditorView when active tab changes
  useEffect(() => {
    if (!containerRef.current || !activeTabPath) return;

    // Save current editor state to cache before switching
    if (viewRef.current) {
      const currentPath = viewRef.current.dom.dataset.filePath;
      if (currentPath) {
        stateCache.current.set(currentPath, viewRef.current.state);
      }
      viewRef.current.destroy();
      viewRef.current = null;
    }

    // Check if we have a cached state for this file
    const cached = stateCache.current.get(activeTabPath);
    const currentColorScheme = useEditorStore.getState().colorScheme;
    const currentVim = useEditorStore.getState().vimMode;
    const currentFont = { fontSize: useEditorStore.getState().fontSize, fontFamily: useEditorStore.getState().fontFamily };
    const currentLineWrap = useEditorStore.getState().lineWrap;
    const currentPreambleMacros = useEditorStore.getState().preambleMacros;

    if (cached) {
      // Restore cached state (preserves undo history)
      const saveKeymap = keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            onSaveRef.current();
            return true;
          },
        },
      ]);

      const updateListener = EditorView.updateListener.of(
        (update: ViewUpdate) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            useEditorStore.getState().updateContent(newContent);
          }
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            useEditorStore.getState().setCursorPosition(line.number, head - line.from + 1);
          }
        }
      );

      const syncTexHandler = EditorView.domEventHandlers({
        click: (event, view) => {
          if (!event.ctrlKey && !event.metaKey) return false;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos == null) return false;
          const line = view.state.doc.lineAt(pos);
          const col = pos - line.from + 1;
          const filePath = useEditorStore.getState().activeTabPath;
          if (!filePath) return false;
          api.syncTexForward(filePath, line.number, col)
            .then((highlight) => {
              if (highlight) {
                useEditorStore.getState().setSyncTexHighlight(highlight);
              }
            })
            .catch(() => {});
          return false;
        },
      });

      // Recreate state with cached doc + extensions
      const state = EditorState.create({
        doc: cached.doc,
        extensions: [saveKeymap, ...createExtensions(currentColorScheme, currentVim, currentFont, currentLineWrap, currentPreambleMacros), updateListener, syncTexHandler],
        selection: cached.selection,
      });

      const view = new EditorView({
        state,
        parent: containerRef.current,
      });
      view.dom.dataset.filePath = activeTabPath;
      viewRef.current = view;
      setEditorView(view);
    } else {
      // Create new editor with content from store
      const view = createView(content, containerRef.current);
      view.dom.dataset.filePath = activeTabPath;
      viewRef.current = view;
      setEditorView(view);
    }

    return () => {
      // Don't destroy on cleanup — we handle it at the top of this effect
    };
  }, [activeTabPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reconfigure theme dynamically (also triggered by font/color scheme changes)
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: getThemeReconfiguration(colorScheme, { fontSize, fontFamily }),
    });
  }, [colorScheme, fontSize, fontFamily]);

  // Reconfigure vim mode dynamically
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: getVimReconfiguration(vimMode),
    });
  }, [vimMode]);

  // Reconfigure line wrap dynamically
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: getLineWrapReconfiguration(lineWrap),
    });
  }, [lineWrap]);

  // Reconfigure preamble macros for math preview
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: getPreambleReconfiguration(preambleMacros),
    });
  }, [preambleMacros]);

  // Handle scroll-to-line requests from outline
  useEffect(() => {
    if (scrollToLine == null || !viewRef.current) return;
    const view = viewRef.current;
    const line = view.state.doc.line(Math.min(scrollToLine, view.state.doc.lines));
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    });
    clearScrollToLine();
  }, [scrollToLine, clearScrollToLine]);

  // Show empty state when no tabs are open
  if (!activeTabPath) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-editor)',
          color: 'var(--text-dim)',
          fontSize: 18,
        }}
      >
        Open a file from the sidebar to start editing
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-editor)',
      }}
    />
  );
}
