import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import * as api from '../lib/api';
import { resolveCompileTarget, flushDirtyTabs } from '../lib/compileTarget';

export function useCompilation() {
  const content = useEditorStore((s) => s.content);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const dirty = useEditorStore((s) => s.dirty);
  const autoRecompile = useEditorStore((s) => s.autoRecompile);
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
      // Compile the project's main file if one is set, else the active .tex tab.
      const targetFile = resolveCompileTarget();
      if (!targetFile) {
        setCompileResult({
          success: false,
          log: '',
          errors: ['No .tex file is currently open'],
          warnings: [],
          elapsed: 0,
          file: null,
        });
        return;
      }
      // Edits in other open files (chapters included by the main file) must be
      // on disk before Tectonic reads them.
      await flushDirtyTabs(targetFile);
      const state = useEditorStore.getState();
      const targetTab = state.openTabs.find((t) => t.path === targetFile);
      const compileContent = targetTab ? targetTab.content : undefined;

      const startTime = Date.now();
      const result = await api.compile(targetFile, compileContent);
      const elapsed = Date.now() - startTime;
      setCompileResult({ ...result, elapsed, file: targetFile });
    } catch (err) {
      setCompileResult({
        success: false,
        log: String(err),
        errors: [String(err)],
        warnings: [],
        elapsed: 0,
        file: resolveCompileTarget(),
      });
    } finally {
      isCompilingRef.current = false;
    }
  }, [setCompilationStatus, setCompileResult]);

  // Debounced auto-compile on content change (only for .tex files, and only
  // when auto-recompile is enabled in settings)
  useEffect(() => {
    if (!autoRecompile) return;
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
  }, [content, dirty, activeTabPath, autoRecompile, doCompile]);

  return { doCompile, compilationStatus };
}
