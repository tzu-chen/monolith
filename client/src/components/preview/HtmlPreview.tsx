import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import type { HtmlSplitLevel } from '../../stores/editorStore';
import { PlayIcon, SpinnerIcon } from '../shared/Icons';
import PreviewModeToggle from './PreviewModeToggle';

/** Try to extract a line number from a LaTeXML diagnostic string. */
function parseLineNumber(msg: string): number | null {
  const patterns = [/\bline\s+(\d+)\b/i, /:(\d+):/, /\bl\.(\d+)\b/];
  for (const pat of patterns) {
    const m = msg.match(pat);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

// CSS custom properties forwarded into the iframe so the HTML preview tracks the
// app's active colour scheme (see colorSchemes.ts / global.css).
const THEME_VARS = [
  '--paper', '--bg-warm', '--bg-panel', '--bg-editor', '--bg-sidebar',
  '--bg-hover', '--bg-active', '--border', '--border-strong', '--text-primary',
  '--text-secondary', '--text-dim', '--accent', '--accent-light', '--accent-bg',
  '--green', '--blue', '--red', '--purple', '--orange', '--teal', '--paper-shadow',
];

const SPLIT_OPTIONS: { value: HtmlSplitLevel; label: string }[] = [
  { value: 'none', label: 'Single page' },
  { value: 'part', label: 'Split: parts' },
  { value: 'chapter', label: 'Split: chapters' },
  { value: 'section', label: 'Split: sections' },
  { value: 'subsection', label: 'Split: subsections' },
];

interface HtmlPreviewProps {
  onRenderHtml: () => void;
}

export default function HtmlPreview({ onRenderHtml }: HtmlPreviewProps) {
  const currentProject = useEditorStore((s) => s.currentProject);
  const previewMode = useEditorStore((s) => s.previewMode);
  const htmlRenderStatus = useEditorStore((s) => s.htmlRenderStatus);
  const htmlSplitAt = useEditorStore((s) => s.htmlSplitAt);
  const setHtmlSplitAt = useEditorStore((s) => s.setHtmlSplitAt);
  const htmlNonce = useEditorStore((s) => s.htmlNonce);
  const htmlLog = useEditorStore((s) => s.htmlLog);
  const htmlErrors = useEditorStore((s) => s.htmlErrors);
  const htmlWarnings = useEditorStore((s) => s.htmlWarnings);
  const theme = useEditorStore((s) => s.theme);
  const colorScheme = useEditorStore((s) => s.colorScheme);
  const autoRecompile = useEditorStore((s) => s.autoRecompile);
  const requestScrollToLine = useEditorStore((s) => s.requestScrollToLine);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showLog, setShowLog] = useState(false);

  const iframeSrc = useMemo(() => {
    if (!currentProject || htmlNonce === 0) return null;
    return `/html/${encodeURIComponent(currentProject)}/index.html?v=${htmlNonce}`;
  }, [currentProject, htmlNonce]);

  // Forward the active colour scheme into the iframe document.
  const postTheme = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    const cs = getComputedStyle(document.documentElement);
    const vars: Record<string, string> = {};
    for (const v of THEME_VARS) vars[v] = cs.getPropertyValue(v).trim();
    iframe.contentWindow.postMessage({ type: 'monolith-theme', theme, vars }, '*');
  }, [theme]);

  // Re-forward whenever the scheme changes.
  useEffect(() => {
    postTheme();
  }, [theme, colorScheme, htmlNonce, postTheme]);

  // Respond to the iframe announcing it's ready (covers load-order races).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // Only honor messages from our own iframe window. It's sandboxed without
      // allow-same-origin, so its origin is the opaque "null"; also accept the
      // app's own origin in case sandboxing is ever relaxed.
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.origin !== 'null' && e.origin !== window.location.origin) return;
      if (e.data && e.data.type === 'monolith-ready') postTheme();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [postTheme]);

  // Kick an initial render the first time the user opens the HTML preview for a
  // project that hasn't been rendered yet. Skipped when auto-recompile is off —
  // there the user renders explicitly with the Render button.
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const triggeredRef = useRef(false);
  const lastProjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoRecompile) return;
    if (previewMode !== 'html') return;
    // Re-arm the one-shot auto-render whenever the project changes.
    if (lastProjectRef.current !== currentProject) {
      lastProjectRef.current = currentProject;
      triggeredRef.current = false;
    }
    if (triggeredRef.current) return;
    if (htmlNonce > 0 || htmlRenderStatus === 'rendering') return;
    if (activeTabPath && activeTabPath.endsWith('.tex')) {
      triggeredRef.current = true;
      onRenderHtml();
    }
  }, [autoRecompile, previewMode, currentProject, activeTabPath, htmlNonce, htmlRenderStatus, onRenderHtml]);

  const statusText = (() => {
    switch (htmlRenderStatus) {
      case 'rendering': return 'rendering...';
      case 'success': return 'rendered';
      case 'error': return 'render failed';
      case 'unavailable': return 'LaTeXML not installed';
      default: return 'ready';
    }
  })();

  const statusColor =
    htmlRenderStatus === 'error' || htmlRenderStatus === 'unavailable'
      ? 'var(--red)'
      : 'var(--green)';

  const rendering = htmlRenderStatus === 'rendering';

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 17,
    color: active ? 'var(--accent)' : 'var(--text-dim)',
    padding: '4px 10px',
    borderRadius: 4,
    cursor: 'pointer',
    background: active ? 'var(--accent-bg)' : 'transparent',
    fontWeight: active ? 500 : 400,
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-warm)', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          height: 36,
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <PreviewModeToggle />
        <div onClick={() => setShowLog(false)} style={tabStyle(!showLog)}>
          View
        </div>
        <div onClick={() => setShowLog(true)} style={tabStyle(showLog)}>
          Log
          {(htmlErrors.length > 0 || htmlWarnings.length > 0) && (
            <span
              style={{
                marginLeft: 5,
                fontSize: 12,
                color: htmlErrors.length > 0 ? 'var(--red)' : 'var(--orange)',
              }}
            >
              {htmlErrors.length + htmlWarnings.length}
            </span>
          )}
        </div>
        {!showLog && (
          <select
            value={htmlSplitAt}
            onChange={(e) => {
              setHtmlSplitAt(e.target.value as HtmlSplitLevel);
              onRenderHtml();
            }}
            title="How to paginate the HTML output"
            style={{
              fontSize: 16,
              padding: '2px 4px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: 'var(--bg-editor)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {SPLIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 16, color: statusColor, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
            {statusText}
          </div>
          <button
            onClick={onRenderHtml}
            disabled={rendering}
            style={{
              fontSize: 17,
              color: 'white',
              background: rendering ? 'var(--accent-light)' : 'var(--accent)',
              border: '1px solid var(--accent)',
              padding: '4px 12px',
              borderRadius: 6,
              cursor: rendering ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {rendering ? <><SpinnerIcon size={12} /> Rendering</> : <><PlayIcon size={10} /> Render</>}
          </button>
        </div>
      </div>

      {/* Content */}
      {!showLog ? (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg-sidebar)' }}>
          {iframeSrc ? (
            <iframe
              ref={iframeRef}
              key={iframeSrc}
              src={iframeSrc}
              onLoad={postTheme}
              title="HTML preview"
              // allow-scripts (for the theme JS) but NOT allow-same-origin, so the
              // rendered document runs in an opaque origin and cannot reach the
              // app's storage/cookies/API even if the .tex injects script.
              sandbox="allow-scripts"
              style={{ width: '100%', height: '100%', border: 'none', background: 'var(--bg-warm)' }}
            />
          ) : (
            <div
              style={{
                color: 'var(--text-dim)',
                fontSize: 18,
                marginTop: 60,
                textAlign: 'center',
                padding: '0 24px',
              }}
            >
              {htmlRenderStatus === 'unavailable' ? (
                <>
                  <strong>LaTeXML is not installed.</strong>
                  <div style={{ fontSize: 15, marginTop: 10, lineHeight: 1.6 }}>
                    Install it to enable HTML rendering:<br />
                    <code>apt install latexml</code> (Debian/Ubuntu) ·{' '}
                    <code>brew install latexml</code> (macOS)
                  </div>
                </>
              ) : htmlRenderStatus === 'rendering' ? (
                'Rendering HTML...'
              ) : htmlRenderStatus === 'error' ? (
                <>Render failed — see the <strong>Log</strong> tab.</>
              ) : (
                <>Click <strong>Render</strong> to generate the HTML preview</>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 16,
            fontFamily: "'Source Code Pro', monospace",
            fontSize: 17,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            color: 'var(--text-secondary)',
            background: 'var(--bg-editor)',
          }}
        >
          {htmlErrors.length > 0 && (
            <div style={{ color: 'var(--red)', marginBottom: 12 }}>
              {htmlErrors.map((e, i) => {
                const lineNum = parseLineNumber(e);
                return (
                  <div
                    key={i}
                    onClick={lineNum ? () => requestScrollToLine(lineNum) : undefined}
                    style={{
                      cursor: lineNum ? 'pointer' : 'default',
                      textDecoration: lineNum ? 'underline' : 'none',
                      textDecorationStyle: 'dotted',
                      padding: '1px 0',
                    }}
                    title={lineNum ? `Go to line ${lineNum}` : undefined}
                  >
                    {e}
                  </div>
                );
              })}
            </div>
          )}
          {htmlWarnings.length > 0 && (
            <div style={{ color: 'var(--orange)', marginBottom: 12 }}>
              {htmlWarnings.map((w, i) => {
                const lineNum = parseLineNumber(w);
                return (
                  <div
                    key={i}
                    onClick={lineNum ? () => requestScrollToLine(lineNum) : undefined}
                    style={{
                      cursor: lineNum ? 'pointer' : 'default',
                      textDecoration: lineNum ? 'underline' : 'none',
                      textDecorationStyle: 'dotted',
                      padding: '1px 0',
                    }}
                    title={lineNum ? `Go to line ${lineNum}` : undefined}
                  >
                    {w}
                  </div>
                );
              })}
            </div>
          )}
          {htmlLog || 'No render log yet.'}
        </div>
      )}
    </div>
  );
}
