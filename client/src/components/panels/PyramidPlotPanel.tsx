import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { SpinnerIcon, CloseIcon, ChartIcon, ChevronDown, ChevronRight } from '../shared/Icons';
import * as api from '../../lib/api';
import type { PyramidSession, PyramidPlot } from '../../lib/api';

/** Build the figure block inserted at the cursor — mirrors the `bfig` snippet. */
function figureBlock(relPath: string): string {
  const stem = relPath.split('/').pop()!.replace(/\.[^.]+$/, '');
  const label = stem.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (
    `\\begin{figure}[htbp]\n` +
    `  \\centering\n` +
    `  \\includegraphics[width=0.8\\textwidth]{${relPath}}\n` +
    `  \\caption{${stem}}\n` +
    `  \\label{fig:${label}}\n` +
    `\\end{figure}\n`
  );
}

export default function PyramidPlotPanel() {
  const close = useEditorStore((s) => s.setShowPyramidPlots);
  const insertAtCursor = useEditorStore((s) => s.insertAtCursor);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<PyramidSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [plots, setPlots] = useState<Record<string, PyramidPlot[]>>({});
  const [plotsLoading, setPlotsLoading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  const closeModal = useCallback(() => close(false), [close]);

  const flash = useCallback((text: string, tone: 'ok' | 'err') => {
    setMsg({ text, tone });
    window.setTimeout(() => setMsg(null), 3500);
  }, []);

  // Health check once on mount.
  useEffect(() => {
    api.pyramidHealth().then(setAvailable);
  }, []);

  // Load sessions (debounced on search) once Pyramid is known reachable.
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!available) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const list = await api.listPyramidSessions(search);
        // Surface sessions linked to this project first.
        list.sort((a, b) => Number(!!b.linkedToCurrentProject) - Number(!!a.linkedToCurrentProject));
        setSessions(list);
      } catch (err) {
        flash(String((err as Error).message || err), 'err');
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [available, search, flash]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeModal]);

  const toggleSession = useCallback(async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!plots[id]) {
      setPlotsLoading(id);
      try {
        const list = await api.listPyramidPlots(id);
        setPlots((prev) => ({ ...prev, [id]: list }));
      } catch (err) {
        flash(String((err as Error).message || err), 'err');
      } finally {
        setPlotsLoading(null);
      }
    }
  }, [expanded, plots, flash]);

  const insertPlot = useCallback(async (session: PyramidSession, plot: PyramidPlot) => {
    setBusy(true);
    try {
      const { path } = await api.importPyramidPlot({
        sessionId: session.id,
        fileId: plot.fileId,
        filename: plot.filename,
        sessionTitle: session.title,
      });
      insertAtCursor(figureBlock(path));
      // Reflect the newly written file in the tree.
      try { useEditorStore.getState().setFileTree(await api.listFiles()); } catch {}
      flash(`Inserted ${path}`, 'ok');
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setBusy(false);
    }
  }, [insertAtCursor, flash]);

  const refreshLinked = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.refreshPyramidPlots();
      try { useEditorStore.getState().setFileTree(await api.listFiles()); } catch {}
      const parts = [`${r.updated} updated`, `${r.unchanged} unchanged`];
      if (r.missing > 0) parts.push(`${r.missing} source missing`);
      flash(parts.join(', '), r.missing > 0 ? 'err' : 'ok');
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setBusy(false);
    }
  }, [flash]);

  const inputStyle: React.CSSProperties = {
    fontSize: 15,
    padding: '6px 10px',
    border: '1px solid var(--border)',
    borderRadius: 5,
    background: 'var(--bg-editor)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    outline: 'none',
  };

  return (
    <div
      onClick={closeModal}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: 'min(740px, 94vw)',
          height: 'min(80vh, 720px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <ChartIcon size={18} style={{ color: 'var(--text-secondary)' }} />
          <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Pyramid plots</h2>
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!available}
            style={{ ...inputStyle, flex: 1, minWidth: 80 }}
          />
          <button onClick={closeModal} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4, display: 'flex' }}>
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Body */}
        {available === null ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            <SpinnerIcon size={16} />
          </div>
        ) : available === false ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
            <ChartIcon size={28} style={{ color: 'var(--text-dim)' }} />
            <div style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Pyramid isn't reachable.</div>
            <div style={{ fontSize: 14 }}>Start Pyramid (port 3007) to browse and import plots.</div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 40, display: 'flex', justifyContent: 'center', color: 'var(--text-dim)' }}>
                <SpinnerIcon size={16} />
              </div>
            ) : sessions.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 15 }}>
                {search ? 'No sessions match your search' : 'No Pyramid sessions found'}
              </div>
            ) : (
              sessions.map((s) => {
                const isOpen = expanded === s.id;
                const sessionPlots = plots[s.id] || [];
                return (
                  <div key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <div
                      onClick={() => toggleSession(s.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', cursor: 'pointer' }}
                    >
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.title || '(untitled session)'}
                      </span>
                      {s.linkedToCurrentProject && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', flexShrink: 0 }}>linked</span>
                      )}
                      {s.language && (
                        <span style={{ fontSize: 12, color: 'var(--text-dim)', background: 'var(--bg-warm)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 7px', flexShrink: 0 }}>
                          {s.language}
                        </span>
                      )}
                    </div>

                    {isOpen && (
                      <div style={{ padding: '4px 18px 14px' }}>
                        {plotsLoading === s.id ? (
                          <div style={{ padding: 16, display: 'flex', justifyContent: 'center', color: 'var(--text-dim)' }}>
                            <SpinnerIcon size={14} />
                          </div>
                        ) : sessionPlots.length === 0 ? (
                          <div style={{ padding: '8px 4px', color: 'var(--text-dim)', fontSize: 14 }}>No plots in this session.</div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                            {sessionPlots.map((p) => (
                              <div
                                key={p.fileId}
                                style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-editor)' }}
                              >
                                <div style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-warm)', overflow: 'hidden' }}>
                                  {p.ext === 'pdf' ? (
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>PDF</span>
                                  ) : (
                                    <img
                                      src={api.pyramidRawUrl(s.id, p.fileId)}
                                      alt={p.filename}
                                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                    />
                                  )}
                                </div>
                                <div style={{ padding: '6px 8px', fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.filename}>
                                  {p.filename}
                                </div>
                                <button
                                  onClick={() => insertPlot(s, p)}
                                  disabled={busy}
                                  style={{
                                    border: 'none',
                                    borderTop: '1px solid var(--border)',
                                    background: 'none',
                                    color: 'var(--accent)',
                                    fontFamily: 'inherit',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    padding: '6px 0',
                                    cursor: busy ? 'default' : 'pointer',
                                    opacity: busy ? 0.6 : 1,
                                  }}
                                >
                                  Insert
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
          {msg && (
            <span style={{ fontSize: 14, color: msg.tone === 'ok' ? 'var(--green)' : 'var(--red)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {msg.text}
            </span>
          )}
          <button
            onClick={refreshLinked}
            disabled={busy || !available}
            title="Re-pull every plot previously imported into this project"
            style={{
              marginLeft: 'auto',
              fontSize: 14,
              padding: '5px 14px',
              borderRadius: 5,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: busy || !available ? 'var(--text-dim)' : 'var(--text-secondary)',
              cursor: busy || !available ? 'default' : 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
            }}
          >
            {busy ? 'Working…' : 'Refresh linked plots'}
          </button>
        </div>
      </div>
    </div>
  );
}
