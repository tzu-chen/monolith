import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import * as api from '../lib/api';

export function useCompilation() {
  const content = useEditorStore((s) => s.content);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const dirty = useEditorStore((s) => s.dirty);
  const compilationStatus = useEditorStore((s) => s.compilationStatus);
  const setCompilationStatus = useEditorStore((s) => s.setCompilationStatus);
  const setCompileResult = useEditorStore((s) => s.setCompileResult);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompilingRef = useRef(false);

  const doCompile = useCallback(async () => {
    if (isCompilingRef.current) return;
    isCompilingRef.current = true;
    setCompilationStatus('compiling');

    try {
      // Always compile with main.tex as the entry point
      // But send the current content to save it first
      const state = useEditorStore.getState();
      const mainTab = state.openTabs.find((t) => t.path === 'main.tex');
      const compileContent = mainTab ? mainTab.content : state.content;

      const startTime = Date.now();
      const result = await api.compile('main.tex', compileContent);
      const elapsed = Date.now() - startTime;
      setCompileResult({ ...result, elapsed });
    } catch (err) {
      setCompileResult({
        success: false,
        log: String(err),
        errors: [String(err)],
        warnings: [],
        elapsed: 0,
      });
    } finally {
      isCompilingRef.current = false;
    }
  }, [setCompilationStatus, setCompileResult]);

  // Debounced auto-compile on content change (only for .tex files)
  useEffect(() => {
    if (!dirty) return;
    if (!activeTabPath?.endsWith('.tex')) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      doCompile();
    }, 800);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [content, dirty, activeTabPath, doCompile]);

  return { doCompile, compilationStatus };
}
