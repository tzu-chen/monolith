import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import * as api from '../lib/api';

const AUTOSAVE_DELAY_MS = 1000;

export function useAutosave() {
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const content = useEditorStore((s) => s.content);
  const dirty = useEditorStore((s) => s.dirty);
  const markSaved = useEditorStore((s) => s.markSaved);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const saveFile = useCallback(
    async (path: string, fileContent: string) => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      try {
        await api.writeFile(path, fileContent);
        // Only mark saved if the tab still matches what we saved
        const current = useEditorStore.getState();
        const tab = current.openTabs.find((t) => t.path === path);
        if (tab && tab.content === fileContent) {
          markSaved(path);
        }
      } catch (err) {
        console.error('Autosave failed:', err);
      } finally {
        isSavingRef.current = false;
      }
    },
    [markSaved]
  );

  // Debounced autosave when content changes on .tex files
  useEffect(() => {
    if (!dirty || !activeTabPath?.endsWith('.tex')) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const path = activeTabPath;
    const snapshot = content;
    timerRef.current = setTimeout(() => {
      saveFile(path, snapshot);
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [content, dirty, activeTabPath, saveFile]);

  /** Manually save the active .tex file immediately. */
  const saveNow = useCallback(async () => {
    const state = useEditorStore.getState();
    const path = state.activeTabPath;
    if (!path) return;
    const tab = state.openTabs.find((t) => t.path === path);
    if (!tab) return;
    await saveFile(path, tab.content);
  }, [saveFile]);

  return { saveNow };
}
