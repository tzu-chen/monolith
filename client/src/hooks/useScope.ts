import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { resolveScope } from '../lib/scope-api';

/**
 * Keeps the scope graph in step with the editor.
 *
 * Re-resolves when the active file changes, when it is saved, and when the
 * watcher reports an external change to any file in the resolved chain. Edits
 * that have not been saved do not invalidate it — the resolver reads from disk,
 * so re-running against unsaved text would just return the same answer.
 */
export function useScope() {
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const currentProject = useEditorStore((s) => s.currentProject);
  const scopeNonce = useEditorStore((s) => s.scopeNonce);
  const setScope = useEditorStore((s) => s.setScope);
  const setScopeStatus = useEditorStore((s) => s.setScopeStatus);

  // Guards against a slow response for a file the user has already left.
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const file = useEditorStore.getState().activeTabPath;
    if (!file || !/\.(tex|sty|cls)$/.test(file)) {
      setScope(null);
      setScopeStatus('idle');
      return;
    }

    const id = ++requestId.current;
    setScopeStatus('resolving');
    try {
      const graph = await resolveScope(file);
      if (id !== requestId.current) return;
      setScope(graph);
    } catch (err) {
      if (id !== requestId.current) return;
      setScopeStatus('error', String((err as Error).message || err));
    }
  }, [setScope, setScopeStatus]);

  useEffect(() => {
    refresh();
  }, [refresh, activeTabPath, currentProject, scopeNonce]);

  return { refresh };
}
