import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export default function PreviewPane() {
  const { pdfData, compilationStatus, errors, warnings, lastCompileTime, log } =
    useEditorStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'pdf' | 'log'>('pdf');

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

      // Render each page
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto 20px';
        canvas.style.background = 'var(--paper)';
        canvas.style.border = '1px solid var(--border)';
        canvas.style.borderRadius = '2px';
        canvas.style.boxShadow =
          '0 1px 3px var(--paper-shadow), 0 8px 30px var(--paper-shadow), 0 20px 60px rgba(45,40,30,0.04)';

        container.appendChild(canvas);

        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
      }
    };

    renderPdf().catch(console.error);
  }, [pdfData, activeTab]);

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
          ref={containerRef}
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '30px 20px',
            background: 'linear-gradient(135deg, #f0ece4 0%, #e8e4db 100%)',
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
              {errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div style={{ color: 'var(--orange)', marginBottom: 12 }}>
              {warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          )}
          {log || 'No compilation log yet.'}
        </div>
      )}
    </div>
  );
}
