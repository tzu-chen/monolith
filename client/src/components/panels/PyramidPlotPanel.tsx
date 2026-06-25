import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { SpinnerIcon, CloseIcon, ChartIcon, ChevronDown, ChevronRight } from '../shared/Icons';
import * as api from '../../lib/api';
import type { PyramidSession, PyramidPlot, PyramidLink } from '../../lib/api';

type Tab = 'browse' | 'links';

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

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function PyramidPlotPanel() {
  const close = useEditorStore((s) => s.setShowPyramidPlots);
  const insertAtCursor = useEditorStore((s) => s.insertAtCursor);

  const [tab, setTab] = useState<Tab>('browse');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<PyramidSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [plots, setPlots] = useState<Record<string, PyramidPlot[]>>({});
  const [plotsLoading, setPlotsLoading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  // Links tab state.
  const [links, setLinks] = useState<PyramidLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
    if (!available || tab !== 'browse') return;
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
  }, [available, tab, search, flash]);

  // Load links whenever the Links tab is shown (manifest is local — no Pyramid needed).
  const loadLinks = useCallback(async () => {
    setLinksLoading(true);
    try {
      setLinks(await api.listPyramidLinks());
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setLinksLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    if (tab === 'links') {
      setEditingPath(null);
      setConfirmDelete(null);
      loadLinks();
    }
  }, [tab, loadLinks]);

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

  const saveEdit = useCallback(async (link: PyramidLink) => {
    const to = editValue.trim();
    if (!to || to === link.path) { setEditingPath(null); return; }
    setBusy(true);
    try {
      await api.renamePyramidLink(link.path, to);
      setEditingPath(null);
      await loadLinks();
      try { useEditorStore.getState().setFileTree(await api.listFiles()); } catch {}
      flash(`Renamed to ${to}`, 'ok');
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setBusy(false);
    }
  }, [editValue, loadLinks, flash]);

  const removeLink = useCallback(async (link: PyramidLink, deleteFile: boolean) => {
    setBusy(true);
    try {
      await api.deletePyramidLink(link.path, deleteFile);
      setConfirmDelete(null);
      await loadLinks();
      if (deleteFile) { try { useEditorStore.getState().setFileTree(await api.listFiles()); } catch {} }
      flash(deleteFile ? `Deleted ${link.path}` : `Unlinked ${link.path}`, 'ok');
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setBusy(false);
    }
  }, [loadLinks, flash]);

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

  const tabBtn = (active: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-dim)',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    padding: '9px 4px',
    marginBottom: -1,
    cursor: 'pointer',
  });

  const linkActionBtn = (color: string): React.CSSProperties => ({
    border: '1px solid var(--border)',
    background: 'transparent',
    color: busy ? 'var(--text-dim)' : color,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 5,
    cursor: busy ? 'default' : 'pointer',
    flexShrink: 0,
  });

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 0' }}>
          <ChartIcon size={18} style={{ color: 'var(--text-secondary)' }} />
          <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Pyramid plots</h2>
          <div style={{ flex: 1 }} />
          <button onClick={closeModal} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4, display: 'flex' }}>
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '8px 18px 0', borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => setTab('browse')} style={tabBtn(tab === 'browse')}>Browse</button>
          <button onClick={() => setTab('links')} style={tabBtn(tab === 'links')}>
            Links{links.length ? ` (${links.length})` : ''}
          </button>
        </div>

        {/* ---- Browse tab ---- */}
        {tab === 'browse' && (
          <>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
              <input
                type="text"
                placeholder="Search sessions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!available}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            {available === null ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                <SpinnerIcon size={16} />
              </div>
            ) : available === false ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
                <ChartIcon size={28} style={{ color: 'var(--text-dim)' }} />
                <div style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Pyramid isn't reachable.</div>
                <div style={{ fontSize: 14 }}>Start Pyramid (port 3007) to browse and import plots.</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>Existing plot links are still editable under the Links tab.</div>
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
          </>
        )}

        {/* ---- Links tab ---- */}
        {tab === 'links' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {linksLoading ? (
              <div style={{ padding: 40, display: 'flex', justifyContent: 'center', color: 'var(--text-dim)' }}>
                <SpinnerIcon size={16} />
              </div>
            ) : links.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 15 }}>
                No plot links yet. Import a plot from the Browse tab to create one.
              </div>
            ) : (
              links.map((link) => {
                const editing = editingPath === link.path;
                const confirming = confirmDelete === link.path;
                const ext = (link.path.split('.').pop() || '').toLowerCase();
                return (
                  <div
                    key={link.path}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border)' }}
                  >
                    <div style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-warm)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                      {available && ext !== 'pdf' ? (
                        <img
                          src={api.pyramidRawUrl(link.sessionId, link.fileId)}
                          alt={link.path}
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        />
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{ext || '?'}</span>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editing ? (
                        <input
                          autoFocus
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); saveEdit(link); }
                            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditingPath(null); }
                          }}
                          style={{ ...inputStyle, width: '100%', fontSize: 14 }}
                        />
                      ) : (
                        <>
                          <div style={{ color: 'var(--text-primary)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={link.path}>
                            {link.path}
                          </div>
                          <div style={{ color: 'var(--text-dim)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {link.sessionTitle || '(untitled session)'} · {fmtDate(link.importedAt)}
                          </div>
                        </>
                      )}
                    </div>

                    {editing ? (
                      <>
                        <button onClick={() => saveEdit(link)} disabled={busy} style={linkActionBtn('var(--accent)')}>Save</button>
                        <button onClick={() => setEditingPath(null)} disabled={busy} style={linkActionBtn('var(--text-secondary)')}>Cancel</button>
                      </>
                    ) : confirming ? (
                      <>
                        <button onClick={() => removeLink(link, false)} disabled={busy} title="Forget the link but keep the file" style={linkActionBtn('var(--text-secondary)')}>Unlink</button>
                        <button onClick={() => removeLink(link, true)} disabled={busy} title="Forget the link and delete the file" style={linkActionBtn('var(--red)')}>Delete file</button>
                        <button onClick={() => setConfirmDelete(null)} disabled={busy} style={linkActionBtn('var(--text-secondary)')}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setConfirmDelete(null); setEditingPath(link.path); setEditValue(link.path); }}
                          disabled={busy}
                          style={linkActionBtn('var(--text-secondary)')}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => { setEditingPath(null); setConfirmDelete(link.path); }}
                          disabled={busy}
                          style={linkActionBtn('var(--red)')}
                        >
                          Delete
                        </button>
                      </>
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
