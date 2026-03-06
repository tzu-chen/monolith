import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import * as api from '../lib/api';

export function useCompilation() {
  const {
    content,
    filePath,
    dirty,
    compilationStatus,
    setCompilationStatus,
    setCompileResult,
  } = useEditorStore();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompilingRef = useRef(false);

  const doCompile = useCallback(async () => {
    if (isCompilingRef.current) return;
    isCompilingRef.current = true;
    setCompilationStatus('compiling');

    try {
      // Save first
      await api.writeFile(filePath, useEditorStore.getState().content);
      // Then compile
      const startTime = Date.now();
      const result = await api.compile(filePath);
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
  }, [filePath, setCompilationStatus, setCompileResult]);

  // Debounced auto-compile on content change
  useEffect(() => {
    if (!dirty) return;
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
  }, [content, dirty, doCompile]);

  return { doCompile, compilationStatus };
}
