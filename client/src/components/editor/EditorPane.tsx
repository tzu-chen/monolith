import { useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, ViewUpdate } from '@codemirror/view';
import { createExtensions } from './extensions';
import { useEditorStore } from '../../stores/editorStore';

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

  // Stable ref for onSave so we don't recreate the editor on every render
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const createView = useCallback(
    (doc: string, parent: HTMLElement): EditorView => {
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
        }
      );

      const state = EditorState.create({
        doc,
        extensions: [saveKeymap, ...createExtensions(), updateListener],
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
        }
      );

      // Recreate state with cached doc + extensions (CM6 doesn't allow reusing state across views directly)
      const state = EditorState.create({
        doc: cached.doc,
        extensions: [saveKeymap, ...createExtensions(), updateListener],
        selection: cached.selection,
      });

      const view = new EditorView({
        state,
        parent: containerRef.current,
      });
      view.dom.dataset.filePath = activeTabPath;
      viewRef.current = view;
    } else {
      // Create new editor with content from store
      const view = createView(content, containerRef.current);
      view.dom.dataset.filePath = activeTabPath;
      viewRef.current = view;
    }

    return () => {
      // Don't destroy on cleanup — we handle it at the top of this effect
    };
  }, [activeTabPath]); // eslint-disable-line react-hooks/exhaustive-deps

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
          fontSize: 14,
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
        flex: 1,
        overflow: 'auto',
        backgroundColor: 'var(--bg-editor)',
      }}
    />
  );
}
