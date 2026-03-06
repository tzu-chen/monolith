import { useEffect, useRef } from 'react';
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
  const { content, setContent } = useEditorStore();
  const initialContentRef = useRef(content);

  useEffect(() => {
    if (!containerRef.current) return;

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSave();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        setContent(newContent);
      }
    });

    const state = EditorState.create({
      doc: initialContentRef.current,
      extensions: [
        saveKeymap,
        ...createExtensions(),
        updateListener,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external content changes (e.g. file load) into editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (content !== currentDoc && content !== initialContentRef.current) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: content },
      });
      initialContentRef.current = content;
    }
  }, [content]);

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
