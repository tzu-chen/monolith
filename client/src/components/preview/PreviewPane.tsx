import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import * as pdfjsLib from 'pdfjs-dist';
import * as api from '../../lib/api';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/** Try to extract a line number from an error/warning string */
function parseLineNumber(msg: string): number | null {
  // Match patterns like "l.42", "line 42", ":42:"
  const patterns = [
    /\bl\.(\d+)\b/,
    /\bline\s+(\d+)\b/i,
    /:(\d+):/,
  ];
  for (const pat of patterns) {
    const m = msg.match(pat);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

export default function PreviewPane() {
  const { pdfData, compilationStatus, errors, warnings, lastCompileTime, log, syncTexHighlight, theme } =
    useEditorStore();
  const requestScrollToLine = useEditorStore((s) => s.requestScrollToLine);
  const setSyncTexHighlight = useEditorStore((s) => s.setSyncTexHighlight);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'pdf' | 'log'>('pdf');
  const pageGeometryRef = useRef<Array<{ canvas: HTMLCanvasElement; page: number; scale: number; width: number; height: number }>>([]);

  const handleInverseSync = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const canvas = target.closest('canvas');
    if (!canvas) return;

    const pageInfo = pageGeometryRef.current.find((p) => p.canvas === canvas);
    if (!pageInfo) return;

    const rect = canvas.getBoundingClientRect();
    // Convert click coordinates to PDF coordinates (scale back)
    const x = (e.clientX - rect.left) / pageInfo.scale;
    const y = (e.clientY - rect.top) / pageInfo.scale;

    try {
      const result = await api.syncTexInverse(pageInfo.page, x, y);
      if (result && result.line > 0) {
        // Open file if needed and jump to line
        const store = useEditorStore.getState();
        if (result.file && result.file !== store.activeTabPath) {
          try {
            const content = await api.readFile(result.file);
            store.openFile(result.file, content);
          } catch {}
        }
        store.requestScrollToLine(result.line);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!pdfData || !containerRef.current || activeTab !== 'pdf') return;

    const container = containerRef.current;
    const renderPdf = async () => {
      // Decode base64 to Uint8Array
      const binaryStr = atob(pdfData);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;

      // Clear previous pages
      container.innerHTML = '';
      pageGeometryRef.current = [];

      // Render each page
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        // Wrapper for positioning highlight overlays
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.margin = '0 auto 20px';
        wrapper.style.width = `${viewport.width}px`;
        wrapper.dataset.page = String(i);

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.display = 'block';
        canvas.style.background = 'var(--paper)';
        canvas.style.border = '1px solid var(--border)';
        canvas.style.borderRadius = '2px';
        canvas.style.boxShadow =
          '0 1px 3px var(--paper-shadow), 0 8px 30px var(--paper-shadow), 0 20px 60px rgba(45,40,30,0.04)';
        if (theme === 'dark') {
          canvas.style.filter = 'invert(1) hue-rotate(180deg)';
        }

        wrapper.appendChild(canvas);
        container.appendChild(wrapper);

        pageGeometryRef.current.push({
          canvas,
          page: i,
          scale,
          width: viewport.width,
          height: viewport.height,
        });

        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
      }
    };

    renderPdf().catch(console.error);
  }, [pdfData, activeTab, theme]);

  // Render SyncTeX highlight overlay
  useEffect(() => {
    // Remove any existing highlights
    document.querySelectorAll('.synctex-highlight').forEach((el) => el.remove());

    if (!syncTexHighlight || !containerRef.current || activeTab !== 'pdf') return;

    const { page, x, y, h, w } = syncTexHighlight;
    const pageInfo = pageGeometryRef.current.find((p) => p.page === page);
    if (!pageInfo) return;

    const wrapper = pageInfo.canvas.parentElement;
    if (!wrapper) return;

    const overlay = document.createElement('div');
    overlay.className = 'synctex-highlight';
    overlay.style.position = 'absolute';
    overlay.style.left = `${x * pageInfo.scale}px`;
    overlay.style.top = `${y * pageInfo.scale}px`;
    overlay.style.width = `${Math.max(w * pageInfo.scale, 200)}px`;
    overlay.style.height = `${Math.max(h * pageInfo.scale, 16)}px`;
    overlay.style.background = 'rgba(124, 111, 240, 0.25)';
    overlay.style.border = '2px solid rgba(124, 111, 240, 0.6)';
    overlay.style.borderRadius = '2px';
    overlay.style.pointerEvents = 'none';
    overlay.style.transition = 'opacity 0.3s';
    wrapper.appendChild(overlay);

    // Scroll the highlight into view
    overlay.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Fade out after 3 seconds
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
  }, [syncTexHighlight, activeTab, setSyncTexHighlight]);

  const statusText = (() => {
    if (compilationStatus === 'compiling') return 'compiling...';
    if (compilationStatus === 'success' && lastCompileTime != null) {
      return `compiled ${(lastCompileTime / 1000).toFixed(1)}s ago`;
    }
    if (compilationStatus === 'error') return 'compilation failed';
    return 'ready';
  })();

  const statusColor =
    compilationStatus === 'error' ? 'var(--red)' : 'var(--green)';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-warm)', overflow: 'hidden' }}>
      {/* Preview Toolbar */}
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
        <div
          onClick={() => setActiveTab('pdf')}
          style={{
            fontSize: 12,
            color: activeTab === 'pdf' ? 'var(--accent)' : 'var(--text-dim)',
            padding: '4px 10px',
            borderRadius: 4,
            cursor: 'pointer',
            background: activeTab === 'pdf' ? 'var(--accent-bg)' : 'transparent',
            fontWeight: activeTab === 'pdf' ? 500 : 400,
          }}
        >
          PDF
        </div>
        <div
          onClick={() => setActiveTab('log')}
          style={{
            fontSize: 12,
            color: activeTab === 'log' ? 'var(--accent)' : 'var(--text-dim)',
            padding: '4px 10px',
            borderRadius: 4,
            cursor: 'pointer',
            background: activeTab === 'log' ? 'var(--accent-bg)' : 'transparent',
            fontWeight: activeTab === 'log' ? 500 : 400,
          }}
        >
          Log
        </div>
        <div
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: statusColor,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusColor,
            }}
          />
          {statusText}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'pdf' ? (
        <div
          key="pdf"
          ref={containerRef}
          onDoubleClick={handleInverseSync}
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '30px 20px',
            background: 'var(--bg-sidebar)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {!pdfData && compilationStatus === 'idle' && (
            <div
              style={{
                color: 'var(--text-dim)',
                fontSize: 14,
                marginTop: 60,
                textAlign: 'center',
              }}
            >
              Click <strong>Compile</strong> or press <code>Ctrl+S</code> to
              generate PDF preview
            </div>
          )}
          {compilationStatus === 'compiling' && (
            <div
              style={{
                color: 'var(--text-dim)',
                fontSize: 14,
                marginTop: 60,
              }}
            >
              Compiling...
            </div>
          )}
        </div>
      ) : (
        <div
          key="log"
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 16,
            fontFamily: "'Source Code Pro', monospace",
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            color: 'var(--text-secondary)',
            background: 'var(--bg-editor)',
          }}
        >
          {errors.length > 0 && (
            <div style={{ color: 'var(--red)', marginBottom: 12 }}>
              {errors.map((e, i) => {
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
          {warnings.length > 0 && (
            <div style={{ color: 'var(--orange)', marginBottom: 12 }}>
              {warnings.map((w, i) => {
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
          {log || 'No compilation log yet.'}
        </div>
      )}
    </div>
  );
}
