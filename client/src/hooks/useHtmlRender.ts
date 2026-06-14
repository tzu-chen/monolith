import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import * as api from '../lib/api';

/**
 * Drives the LaTeXML HTML render path — the web-render counterpart to
 * `useCompilation` (the PDF path). Renders on a debounced edit while the HTML
 * preview is active, and exposes `doRender` for explicit (re)renders.
 */
export function useHtmlRender() {
  const content = useEditorStore((s) => s.content);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const dirty = useEditorStore((s) => s.dirty);
  const previewMode = useEditorStore((s) => s.previewMode);
  const htmlSplitAt = useEditorStore((s) => s.htmlSplitAt);
  const setHtmlRenderStatus = useEditorStore((s) => s.setHtmlRenderStatus);
  const setHtmlResult = useEditorStore((s) => s.setHtmlResult);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRenderingRef = useRef(false);

  const doRender = useCallback(async () => {
    if (isRenderingRef.current) return;

    const state = useEditorStore.getState();
    const activeFile = state.activeTabPath;
    if (!activeFile || !activeFile.endsWith('.tex')) {
      setHtmlResult({
        ok: false,
        available: true,
        log: '',
        errors: ['No .tex file is currently open'],
        warnings: [],
      });
      return;
    }

    isRenderingRef.current = true;
    setHtmlRenderStatus('rendering');
    try {
      const activeTab = state.openTabs.find((t) => t.path === activeFile);
      const renderContent = activeTab ? activeTab.content : state.content;
      const result = await api.renderHtml(activeFile, renderContent, state.htmlSplitAt);
      setHtmlResult(result);
    } catch (err) {
      setHtmlResult({
        ok: false,
        available: true,
        log: String(err),
        errors: [String(err)],
        warnings: [],
      });
    } finally {
      isRenderingRef.current = false;
    }
  }, [setHtmlRenderStatus, setHtmlResult]);

  // Debounced auto-render on content change — only while the HTML preview is the
  // active mode, so we don't pay for renders the user can't see.
  useEffect(() => {
    if (previewMode !== 'html') return;
    if (!dirty) return;
    if (!activeTabPath?.endsWith('.tex')) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doRender();
    }, 1000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, dirty, activeTabPath, previewMode, htmlSplitAt, doRender]);

  return { doRender };
}
