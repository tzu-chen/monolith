import { useCallback } from 'react';
import { useEditorStore } from '../stores/editorStore';
import * as api from '../lib/api';

export function useSyncTeX() {
  const setSyncTexHighlight = useEditorStore((s) => s.setSyncTexHighlight);
  const requestScrollToLine = useEditorStore((s) => s.requestScrollToLine);

  const forwardSync = useCallback(async (file: string, line: number, col: number = 1) => {
    try {
      const result = await api.syncTexForward(file, line, col);
      if (result) {
        setSyncTexHighlight(result);
      }
    } catch {
      // SyncTeX not available — silently ignore
    }
  }, [setSyncTexHighlight]);

  const inverseSync = useCallback(async (page: number, x: number, y: number) => {
    try {
      const result = await api.syncTexInverse(page, x, y);
      if (result && result.line > 0) {
        const store = useEditorStore.getState();
        // Open the file if it's not currently active
        if (result.file && result.file !== store.activeTabPath) {
          try {
            const content = await api.readFile(result.file);
            store.openFile(result.file, content);
          } catch {}
        }
        requestScrollToLine(result.line);
      }
    } catch {
      // SyncTeX not available — silently ignore
    }
  }, [requestScrollToLine]);

  return { forwardSync, inverseSync };
}
