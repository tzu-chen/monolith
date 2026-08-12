import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import type { HtmlSplitLevel } from '../../stores/editorStore';
import { PlayIcon, SpinnerIcon, DownloadIcon, ExternalIcon } from '../shared/Icons';
import { OutlinedButton, IconButton, Dot, BarDivider } from '../shared/ui';
import ViewModeControl, { ownsViewModeControl } from '../shared/ViewModeControl';
import { downloadBlob } from '../../lib/download';
import * as api from '../../lib/api';
import { THEME_VAR_NAMES } from '../../colorSchemes';
import { formatChord } from '../../lib/keybindings';
import PreviewModeToggle from './PreviewModeToggle';
import { useElementWidth } from '../../hooks/useElementWidth';
import { formatClock } from '../../lib/time';
import { toolbarLayout } from './toolbarLayout';
import { parseLineNumber } from '../../lib/diagnostics';
import { fs, font, metrics, radius, motion } from '../../theme/tokens';

/**
 * LaTeXML HTML preview.
 *
 * Unlike the PDF page, this one follows the theme: it is a themed document
 * view, not a sheet of paper. The rendered document runs in a sandboxed iframe
 * and receives the active colour scheme by postMessage.
 */

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
  const viewMode = useEditorStore((s) => s.viewMode);
  const htmlRenderStatus = useEditorStore((s) => s.htmlRenderStatus);
  const htmlSplitAt = useEditorStore((s) => s.htmlSplitAt);
  const setHtmlSplitAt = useEditorStore((s) => s.setHtmlSplitAt);
  const htmlNonce = useEditorStore((s) => s.htmlNonce);
  const htmlLog = useEditorStore((s) => s.htmlLog);
  const htmlErrors = useEditorStore((s) => s.htmlErrors);
  const htmlWarnings = useEditorStore((s) => s.htmlWarnings);
  const htmlRenderedAt = useEditorStore((s) => s.htmlRenderedAt);
  const theme = useEditorStore((s) => s.theme);
  const colorScheme = useEditorStore((s) => s.colorScheme);
  const autoRecompile = useEditorStore((s) => s.autoRecompile);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const requestScrollToLine = useEditorStore((s) => s.requestScrollToLine);
  const keybindings = useEditorStore((s) => s.keybindings);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showLog, setShowLog] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [toolbarRef, toolbarWidth] = useElementWidth<HTMLDivElement>();
  const layout = toolbarLayout(toolbarWidth);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await api.downloadHtmlZip();
      const name = (currentProject || 'html').replace(/[^A-Za-z0-9._-]/g, '_') || 'html';
      downloadBlob(blob, `${name}.zip`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }, [downloading, currentProject]);

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
    for (const v of THEME_VAR_NAMES) vars[v] = cs.getPropertyValue(v).trim();
    iframe.contentWindow.postMessage({ type: 'monolith-theme', theme, vars }, '*');
  }, [theme]);

  useEffect(() => {
    postTheme();
  }, [theme, colorScheme, htmlNonce, postTheme]);

  // Respond to the iframe announcing it's ready (covers load-order races).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // Only honour messages from our own iframe window. It's sandboxed without
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
  const triggeredRef = useRef(false);
  const lastProjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoRecompile || previewMode !== 'html') return;
    if (lastProjectRef.current !== currentProject) {
      lastProjectRef.current = currentProject;
      triggeredRef.current = false;
    }
    if (triggeredRef.current) return;
    if (htmlNonce > 0 || htmlRenderStatus === 'rendering') return;
    if (activeTabPath?.endsWith('.tex')) {
      triggeredRef.current = true;
      onRenderHtml();
    }
  }, [autoRecompile, previewMode, currentProject, activeTabPath, htmlNonce, htmlRenderStatus, onRenderHtml]);

  const rendering = htmlRenderStatus === 'rendering';
  const failed = htmlRenderStatus === 'error' || htmlRenderStatus === 'unavailable';

  const engineLabel = (() => {
    if (rendering) return 'latexml · rendering…';
    if (htmlRenderStatus === 'unavailable') return 'latexml not installed';
    if (htmlRenderStatus === 'error') return 'latexml · render failed';
    if (htmlNonce === 0) return 'latexml · not run';
    return `latexml · MathML · rendered ${formatClock(htmlRenderedAt)}`;
  })();

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontSize: fs.toolbar,
    color: active ? 'var(--text)' : 'var(--text-faint)',
    fontWeight: active ? 500 : 400,
    padding: '0 2px',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
    cursor: 'pointer',
    transition: `color ${motion.color}`,
  });

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-sunken)',
        overflow: 'hidden',
      }}
    >
      <div
        ref={toolbarRef}
        style={{
          height: metrics.bar,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'stretch',
          gap: layout.gap,
          padding: layout.padding,
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface-chrome)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: layout.gap, minWidth: 0, overflow: 'hidden' }}>
          <PreviewModeToggle compact={layout.compactControls} />
          <div onClick={() => setShowLog(false)} style={tabStyle(!showLog)}>View</div>
          <div onClick={() => setShowLog(true)} style={tabStyle(showLog)}>
            Log
            {(htmlErrors.length > 0 || htmlWarnings.length > 0) && (
              <span style={{ fontSize: fs.meta, color: htmlErrors.length > 0 ? 'var(--error)' : 'var(--warn)' }}>
                {htmlErrors.length + htmlWarnings.length}
              </span>
            )}
          </div>
          {layout.showStatusText && (
            <span
              style={{
                fontSize: fs.meta,
                color: 'var(--text-faint)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
              }}
            >
              {engineLabel}
            </span>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {!showLog && layout.showSelect && (
            <>
              <select
                value={htmlSplitAt}
                onChange={(e) => {
                  setHtmlSplitAt(e.target.value as HtmlSplitLevel);
                  onRenderHtml();
                }}
                title="How to paginate the HTML output"
                style={{
                  fontSize: fs.meta,
                  padding: '3px 6px',
                  borderRadius: radius.chip,
                  border: '1px solid var(--line)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  outline: 'none',
                  maxWidth: layout.showButtonLabels ? undefined : 110,
                }}
              >
                {SPLIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <BarDivider />
            </>
          )}
          {iframeSrc && (
            <IconButton
              icon={<ExternalIcon size={13} />}
              title="Open in a new tab"
              size={26}
              onClick={() => window.open(iframeSrc, '_blank', 'noopener,noreferrer')}
            />
          )}
          {htmlNonce > 0 && (
            <IconButton
              icon={downloading ? <SpinnerIcon size={13} /> : <DownloadIcon size={13} />}
              title="Download HTML (.zip with assets)"
              size={26}
              onClick={handleDownload}
            />
          )}
          <OutlinedButton
            accent
            onClick={onRenderHtml}
            disabled={rendering}
            title={rendering ? 'Rendering HTML…' : `Render HTML (${formatChord(keybindings.renderHtml)})`}
            icon={rendering ? <SpinnerIcon size={12} /> : <PlayIcon size={12} />}
          >
            {layout.showButtonLabels && (rendering ? 'Rendering' : 'Render')}
          </OutlinedButton>
          {/* Only bar on screen when the editor is hidden — see ViewModeControl. */}
          {ownsViewModeControl(viewMode, 'preview') && (
            <>
              <BarDivider />
              <ViewModeControl />
            </>
          )}
        </div>
      </div>

      {!showLog ? (
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
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
              style={{ width: '100%', height: '100%', border: 'none', background: 'var(--surface-chrome)' }}
            />
          ) : (
            <div
              style={{
                color: 'var(--text-faint)',
                fontSize: fs.title,
                marginTop: 60,
                textAlign: 'center',
                padding: `0 ${metrics.padPage}px`,
                lineHeight: 1.7,
              }}
            >
              {htmlRenderStatus === 'unavailable' ? (
                <>
                  <strong>LaTeXML is not installed.</strong>
                  <div style={{ fontSize: fs.control, marginTop: 10 }}>
                    Install it to enable HTML rendering:<br />
                    <code style={{ fontFamily: font.mono }}>apt install latexml</code> (Debian/Ubuntu) ·{' '}
                    <code style={{ fontFamily: font.mono }}>brew install latexml</code> (macOS)
                    <div style={{ marginTop: 8, color: 'var(--text-disabled)' }}>
                      The PDF preview is unaffected.
                    </div>
                  </div>
                </>
              ) : rendering ? (
                'Rendering HTML…'
              ) : htmlRenderStatus === 'error' ? (
                <>Render failed — see the <strong>Log</strong> tab.</>
              ) : (
                <>Press <strong>Render</strong> to generate the HTML preview</>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: metrics.padPane,
            fontFamily: font.mono,
            fontSize: fs.control,
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            color: 'var(--text-muted)',
            background: 'var(--surface-editor)',
          }}
        >
          {[
            ...htmlErrors.map((m) => ({ m, tone: 'error' as const })),
            ...htmlWarnings.map((m) => ({ m, tone: 'warn' as const })),
          ].map(({ m, tone }, i) => {
            const lineNum = parseLineNumber(m);
            return (
              <div
                key={`${tone}-${i}`}
                onClick={lineNum ? () => requestScrollToLine(lineNum) : undefined}
                title={lineNum ? `Go to line ${lineNum}` : undefined}
                style={{
                  color: tone === 'error' ? 'var(--error)' : 'var(--warn)',
                  borderLeft: `2px solid ${tone === 'error' ? 'var(--error)' : 'var(--warn)'}`,
                  paddingLeft: 8,
                  marginBottom: 4,
                  cursor: lineNum ? 'pointer' : 'default',
                }}
              >
                {m}
              </div>
            );
          })}
          {(htmlErrors.length > 0 || htmlWarnings.length > 0) && <div style={{ height: 12 }} />}
          {htmlLog || 'No render log yet.'}
        </div>
      )}

      <div
        style={{
          height: metrics.status,
          flexShrink: 0,
          borderTop: '1px solid var(--line)',
          background: 'var(--surface-chrome)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: `0 ${metrics.padPanel}px`,
          fontSize: fs.meta,
          color: 'var(--text-faint)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <span>latexml</span>
        {htmlWarnings.length > 0 && (
          <span style={{ borderLeft: '1px solid var(--line)', paddingLeft: 14, color: 'var(--warn)' }}>
            {htmlWarnings.length} warning{htmlWarnings.length === 1 ? '' : 's'} — review
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Dot color={failed ? 'var(--error)' : rendering ? 'var(--warn)' : 'var(--ok)'} filled />
          {htmlRenderStatus === 'unavailable'
            ? 'latexml unavailable'
            : htmlRenderStatus === 'error'
              ? 'render failed'
              : rendering
                ? 'rendering'
                : htmlNonce > 0
                  ? `rendered ${formatClock(htmlRenderedAt)}`
                  : 'ready'}
        </span>
      </div>
    </div>
  );
}
