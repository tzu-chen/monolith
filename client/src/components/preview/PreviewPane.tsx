import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import * as pdfjsLib from 'pdfjs-dist';
import * as api from '../../lib/api';
import { PlayIcon, SpinnerIcon, DownloadIcon, MinusIcon, PlusIcon } from '../shared/Icons';
import { OutlinedButton, IconButton, Dot, BarDivider } from '../shared/ui';
import ViewModeControl, { ownsViewModeControl } from '../shared/ViewModeControl';
import { formatChord } from '../../lib/keybindings';
import { base64ToBlob, downloadBlob } from '../../lib/download';
import PreviewModeToggle from './PreviewModeToggle';
import HtmlPreview from './HtmlPreview';
import { useElementWidth } from '../../hooks/useElementWidth';
import { formatClock } from '../../lib/time';
import { toolbarLayout } from './toolbarLayout';
import { parseLineNumber } from '../../lib/diagnostics';
import { fs, font, metrics, radius, motion } from '../../theme/tokens';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * PDF preview pane: toolbar / page / status bar.
 *
 * The rendered page is a paper surface — a light sheet even in dark mode, since
 * it stands for the printed article rather than for the app's chrome. The
 * inverted rendering is still available behind a setting for low-light work.
 */

type Zoom = number | 'fit';

const ZOOM_STEPS = [50, 75, 90, 100, 116, 125, 150, 200, 300];

function zoomToScale(zoom: Zoom, containerWidth: number, pageWidth: number): number {
  // Leave the handoff's 18px page padding on each side, plus room for a scrollbar.
  if (zoom === 'fit') return Math.max(0.1, (containerWidth - metrics.padPage * 2 - 12) / pageWidth);
  return zoom / 100;
}

interface PreviewPaneProps {
  onCompile: () => void;
  onRenderHtml: () => void;
}

export default function PreviewPane({ onCompile, onRenderHtml }: PreviewPaneProps) {
  const pdfData = useEditorStore((s) => s.pdfData);
  const compilationStatus = useEditorStore((s) => s.compilationStatus);
  const errors = useEditorStore((s) => s.errors);
  const warnings = useEditorStore((s) => s.warnings);
  const log = useEditorStore((s) => s.log);
  const lastCompileAt = useEditorStore((s) => s.lastCompileAt);
  const lastCompileTime = useEditorStore((s) => s.lastCompileTime);
  const syncTexHighlight = useEditorStore((s) => s.syncTexHighlight);
  const theme = useEditorStore((s) => s.theme);
  const invertPdfInDark = useEditorStore((s) => s.invertPdfInDark);
  const previewMode = useEditorStore((s) => s.previewMode);
  const viewMode = useEditorStore((s) => s.viewMode);
  const currentProject = useEditorStore((s) => s.currentProject);
  const requestScrollToLine = useEditorStore((s) => s.requestScrollToLine);
  const setSyncTexHighlight = useEditorStore((s) => s.setSyncTexHighlight);
  const keybindings = useEditorStore((s) => s.keybindings);

  const containerRef = useRef<HTMLDivElement>(null);
  const [showLog, setShowLog] = useState(false);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [zoomDraft, setZoomDraft] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [renderedScale, setRenderedScale] = useState(1);
  const pageGeometryRef = useRef<Array<{ canvas: HTMLCanvasElement; page: number; scale: number }>>([]);
  const savedScrollRatioRef = useRef<number | null>(null);
  const hasRenderedRef = useRef(false);
  const [toolbarRef, toolbarWidth] = useElementWidth<HTMLDivElement>();
  const layout = toolbarLayout(toolbarWidth);

  const invert = theme === 'dark' && invertPdfInDark;

  const handleInverseSync = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = (e.target as HTMLElement).closest('canvas');
    if (!canvas) return;
    const pageInfo = pageGeometryRef.current.find((p) => p.canvas === canvas);
    if (!pageInfo) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / pageInfo.scale;
    const y = (e.clientY - rect.top) / pageInfo.scale;

    try {
      const result = await api.syncTexInverse(pageInfo.page, x, y);
      if (!result || result.line <= 0) return;
      const store = useEditorStore.getState();
      if (result.file && result.file !== store.activeTabPath) {
        try {
          store.openFile(result.file, await api.readFile(result.file));
        } catch {
          // Fall through and jump within whatever file is open.
        }
      }
      store.requestScrollToLine(result.line);
    } catch {
      // No SyncTeX data for this point.
    }
  }, []);

  const handleDownloadPdf = useCallback(() => {
    if (!pdfData) return;
    const fallback = (currentProject || 'document').replace(/[^A-Za-z0-9._-]/g, '_') || 'document';
    const input = window.prompt('Download PDF as:', `${fallback}.pdf`);
    if (input === null) return;
    let name = input.trim().replace(/[^A-Za-z0-9._-]/g, '_').replace(/^_+/, '');
    if (!name || /^\.pdf$/i.test(name)) name = `${fallback}.pdf`;
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    downloadBlob(base64ToBlob(pdfData, 'application/pdf'), name);
  }, [pdfData, currentProject]);

  const stepZoom = useCallback((direction: 1 | -1) => {
    setZoom((current) => {
      const percent = current === 'fit' ? Math.round(renderedScale * 100) : current;
      if (direction === 1) return ZOOM_STEPS.find((z) => z > percent) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
      return [...ZOOM_STEPS].reverse().find((z) => z < percent) ?? ZOOM_STEPS[0];
    });
  }, [renderedScale]);

  // Load the PDF document when pdfData changes
  useEffect(() => {
    if (!pdfData) {
      hasRenderedRef.current = false;
      return;
    }
    const loadPdf = async () => {
      const binaryStr = atob(pdfData);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      setPdfDoc(await pdfjsLib.getDocument({ data: bytes }).promise);
    };
    loadPdf().catch(console.error);
  }, [pdfData]);

  // Render pages whenever the doc, zoom, theme or log toggle changes.
  useEffect(() => {
    if (!pdfDoc || !containerRef.current || showLog) return;

    const container = containerRef.current;
    const pdf = pdfDoc;
    let cancelled = false;

    const renderPdf = async () => {
      const firstPage = await pdf.getPage(1);
      const baseViewport = firstPage.getViewport({ scale: 1 });
      const scale = zoomToScale(zoom, container.clientWidth, baseViewport.width);
      if (cancelled) return;
      setRenderedScale(scale);

      if (hasRenderedRef.current && container.scrollHeight > 0) {
        savedScrollRatioRef.current = container.scrollTop / container.scrollHeight;
      } else {
        savedScrollRatioRef.current = null;
      }

      container.innerHTML = '';
      pageGeometryRef.current = [];

      const outputScale = window.devicePixelRatio || 1;

      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.margin = '0 auto 20px';
        wrapper.style.width = `${viewport.width}px`;
        wrapper.dataset.page = String(i);

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.display = 'block';
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.style.background = 'var(--paper-sheet)';
        canvas.style.border = '1px solid var(--line)';
        canvas.style.boxShadow = 'var(--shadow-paper)';
        if (invert) {
          canvas.style.filter = 'invert(0.88) hue-rotate(180deg) brightness(0.95)';
          canvas.style.background = 'white';
        }

        wrapper.appendChild(canvas);
        container.appendChild(wrapper);
        pageGeometryRef.current.push({ canvas, page: i, scale });

        const ctx = canvas.getContext('2d')!;
        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
        await page.render({ canvasContext: ctx, viewport, transform }).promise;
      }

      // Restore the reading position after a recompile, unless SyncTeX is about
      // to scroll somewhere more specific.
      if (savedScrollRatioRef.current !== null && !useEditorStore.getState().syncTexHighlight) {
        container.scrollTop = savedScrollRatioRef.current * container.scrollHeight;
        savedScrollRatioRef.current = null;
      }
      hasRenderedRef.current = true;
    };

    renderPdf().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, showLog, invert, zoom]);

  // Track which page is under the viewport's midline, for the status bar.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || showLog) return;
    const onScroll = () => {
      const midline = container.scrollTop + container.clientHeight / 2;
      let page = 1;
      for (const wrapper of Array.from(container.children) as HTMLElement[]) {
        if (wrapper.offsetTop <= midline) page = Number(wrapper.dataset.page) || page;
        else break;
      }
      setCurrentPage(page);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [showLog, pdfDoc]);

  // SyncTeX highlight overlay
  useEffect(() => {
    document.querySelectorAll('.synctex-highlight').forEach((el) => el.remove());
    if (!syncTexHighlight || !containerRef.current || showLog) return;

    const { page, x, y, h, w } = syncTexHighlight;
    const pageInfo = pageGeometryRef.current.find((p) => p.page === page);
    const wrapper = pageInfo?.canvas.parentElement;
    if (!wrapper) return;

    const overlay = document.createElement('div');
    overlay.className = 'synctex-highlight';
    overlay.style.position = 'absolute';
    overlay.style.left = `${x * pageInfo!.scale}px`;
    overlay.style.top = `${y * pageInfo!.scale}px`;
    overlay.style.width = `${Math.max(w * pageInfo!.scale, 200)}px`;
    overlay.style.height = `${Math.max(h * pageInfo!.scale, 16)}px`;
    overlay.style.border = '2px solid var(--accent)';
    overlay.style.background = 'var(--accent-wash-strong)';
    overlay.style.borderRadius = '2px';
    overlay.style.pointerEvents = 'none';
    overlay.style.transition = 'opacity 0.3s';
    wrapper.appendChild(overlay);
    overlay.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const timer = setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        setSyncTexHighlight(null);
      }, 300);
    }, 3000);

    return () => {
      clearTimeout(timer);
      overlay.remove();
    };
  }, [syncTexHighlight, showLog, setSyncTexHighlight]);

  const engineLabel = useMemo(() => {
    if (compilationStatus === 'compiling') return 'tectonic · compiling…';
    if (compilationStatus === 'idle' || lastCompileAt === null) return 'tectonic · not run';
    const at = formatClock(lastCompileAt);
    if (compilationStatus === 'error') return `tectonic · failed ${at}`;
    const elapsed = lastCompileTime != null ? ` in ${(lastCompileTime / 1000).toFixed(1)}s` : '';
    return `tectonic · compiled ${at}${elapsed}`;
  }, [compilationStatus, lastCompileAt, lastCompileTime]);

  const zoomPercent = zoom === 'fit' ? Math.round(renderedScale * 100) : zoom;
  const compiling = compilationStatus === 'compiling';

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

  // The HTML (LaTeXML) renderer is a self-contained view. Every hook above runs
  // unconditionally but no-ops here — its container is not mounted.
  if (previewMode === 'html') {
    return <HtmlPreview onRenderHtml={onRenderHtml} />;
  }

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
            {(errors.length > 0 || warnings.length > 0) && (
              <span style={{ fontSize: fs.meta, color: errors.length > 0 ? 'var(--error)' : 'var(--warn)' }}>
                {errors.length + warnings.length}
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

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
          {!showLog && layout.showSelect && (
            <>
              <IconButton icon={<MinusIcon size={12} />} title="Zoom out" size={24} onClick={() => stepZoom(-1)} />
              <input
                value={zoomDraft ?? `${zoomPercent}%`}
                onChange={(e) => setZoomDraft(e.target.value)}
                onFocus={() => setZoomDraft(String(zoomPercent))}
                onBlur={() => {
                  const parsed = parseInt((zoomDraft ?? '').replace('%', ''), 10);
                  if (!Number.isNaN(parsed)) setZoom(Math.min(800, Math.max(10, parsed)));
                  setZoomDraft(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    setZoomDraft(null);
                    e.currentTarget.blur();
                  }
                }}
                title="Zoom level"
                style={{
                  width: 56,
                  textAlign: 'center',
                  fontFamily: font.mono,
                  fontSize: fs.meta,
                  padding: '3px 4px',
                  border: '1px solid var(--line)',
                  borderRadius: radius.chip,
                  background: 'transparent',
                  color: 'var(--text-muted)',
                }}
              />
              <IconButton icon={<PlusIcon size={12} />} title="Zoom in" size={24} onClick={() => stepZoom(1)} />
              <OutlinedButton
                onClick={() => setZoom('fit')}
                title="Fit page width"
                style={{ borderColor: zoom === 'fit' ? 'var(--accent)' : undefined, color: zoom === 'fit' ? 'var(--accent)' : undefined }}
              >
                Fit
              </OutlinedButton>
              <BarDivider />
            </>
          )}
          {pdfData && (
            <IconButton icon={<DownloadIcon size={13} />} title="Download PDF" size={26} onClick={handleDownloadPdf} />
          )}
          <OutlinedButton
            accent
            onClick={onCompile}
            disabled={compiling}
            title={compiling ? 'Compiling…' : `Compile (${formatChord(keybindings.compile)})`}
            icon={compiling ? <SpinnerIcon size={12} /> : <PlayIcon size={12} />}
          >
            {layout.showButtonLabels && (compiling ? 'Compiling' : 'Compile')}
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
        <div
          key="pdf"
          ref={containerRef}
          onDoubleClick={handleInverseSync}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: `${metrics.padPage}px ${metrics.padPage}px 0`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {!pdfData && compilationStatus === 'idle' && (
            <div style={{ color: 'var(--text-faint)', fontSize: fs.title, marginTop: 60, textAlign: 'center' }}>
              Press <strong>Compile</strong> or{' '}
              <code style={{ fontFamily: font.mono }}>{formatChord(keybindings.compile)}</code> to build a preview
            </div>
          )}
          {!pdfData && compiling && (
            <div style={{ color: 'var(--text-faint)', fontSize: fs.title, marginTop: 60 }}>Compiling…</div>
          )}
        </div>
      ) : (
        <div
          key="log"
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
          {[...errors.map((m) => ({ m, tone: 'error' as const })), ...warnings.map((m) => ({ m, tone: 'warn' as const }))].map(
            ({ m, tone }, i) => {
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
            }
          )}
          {(errors.length > 0 || warnings.length > 0) && <div style={{ height: 12 }} />}
          {log || 'No compilation log yet.'}
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
        <span>Page {currentPage} / {pdfDoc?.numPages ?? 0}</span>
        <span style={{ borderLeft: '1px solid var(--line)', paddingLeft: 14 }}>
          SyncTeX {pdfData ? 'linked' : 'idle'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Dot
            color={
              compilationStatus === 'error' ? 'var(--error)' :
              compiling ? 'var(--warn)' :
              'var(--ok)'
            }
            filled
          />
          {compilationStatus === 'error' ? 'compile failed' : compiling ? 'compiling' : 'tectonic ready'}
        </span>
      </div>
    </div>
  );
}
