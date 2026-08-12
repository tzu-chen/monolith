import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { SpinnerIcon, ChevronDown, ChevronRight, RefreshIcon, CloseIcon, EditIcon } from '../shared/Icons';
import {
  PanelHeader,
  FilterRow,
  FilterInput,
  PanelBody,
  OutlinedButton,
  IconButton,
  Pill,
  Badge,
  Dot,
  SectionLabel,
  EmptyState,
  rowStyle,
  hoverRow,
  leaveRow,
} from '../shared/ui';
import { fs, font, metrics, radius } from '../../theme/tokens';
import { formatIsoAge } from '../../lib/time';
import * as api from '../../lib/api';
import type { PyramidSession, PyramidPlot, PyramidLink } from '../../lib/api';

/**
 * Plots panel — the list half of the handoff's plot manager (1f).
 *
 * Plots are produced by the companion Pyramid app; this panel browses that
 * app's sessions and imports a plot into the project — it never generates or
 * edits one. That is the same contract as the handoff's plot manager, with
 * Pyramid sessions standing in for the watched folder.
 *
 * Selecting a plot opens it in the detail column beside this one, where the
 * zoomable preview and the insert controls live. `Recently changed` lists the
 * plots this project has re-pulled most recently, from the link manifest.
 */

type Tab = 'browse' | 'linked';

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

/** When a link last changed on disk: its newest revision, else its import. */
function lastChangedAt(link: PyramidLink): string {
  const revisions = link.revisions;
  return revisions && revisions.length > 0 ? revisions[revisions.length - 1].at : link.importedAt;
}

export default function PlotsPanel() {
  const setManagerDetail = useEditorStore((s) => s.setManagerDetail);
  const managerDetail = useEditorStore((s) => s.managerDetail);
  const activeFileId = managerDetail?.kind === 'plot' ? managerDetail.fileId : null;

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

  const [links, setLinks] = useState<PyramidLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const flash = useCallback((text: string, tone: 'ok' | 'err') => {
    setMsg({ text, tone });
    window.setTimeout(() => setMsg(null), 3500);
  }, []);

  useEffect(() => {
    api.pyramidHealth().then(setAvailable);
  }, []);

  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!available || tab !== 'browse') return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const list = await api.listPyramidSessions(search);
        // Sessions already linked to this project surface first.
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

  // Both tabs need the manifest: `Linked` lists it, and `Browse` reads its
  // revision times for the "Recently changed" section.
  useEffect(() => {
    setEditingPath(null);
    setConfirmDelete(null);
    loadLinks();
  }, [tab, loadLinks]);

  /** The plots this project has pulled most recently, newest first. */
  const recentlyChanged = useMemo(
    () =>
      [...links]
        .sort((a, b) => Date.parse(lastChangedAt(b)) - Date.parse(lastChangedAt(a)))
        .slice(0, 4),
    [links]
  );

  const selectPlot = useCallback(
    (session: PyramidSession, plot: PyramidPlot) => {
      setManagerDetail({
        kind: 'plot',
        sessionId: session.id,
        sessionTitle: session.title,
        fileId: plot.fileId,
        filename: plot.filename,
        updatedAt: plot.updatedAt ?? null,
      });
    },
    [setManagerDetail]
  );

  const selectLink = useCallback(
    (link: PyramidLink) => {
      setManagerDetail({
        kind: 'plot',
        sessionId: link.sessionId,
        sessionTitle: link.sessionTitle,
        fileId: link.fileId,
        filename: link.filename,
        updatedAt: lastChangedAt(link),
      });
    },
    [setManagerDetail]
  );

  const toggleSession = useCallback(async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (plots[id]) return;
    setPlotsLoading(id);
    try {
      const list = await api.listPyramidPlots(id);
      setPlots((prev) => ({ ...prev, [id]: list }));
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setPlotsLoading(null);
    }
  }, [expanded, plots, flash]);

  const refreshLinked = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.refreshPyramidPlots();
      try {
        useEditorStore.getState().setFileTree(await api.listFiles());
      } catch {
        // Best-effort tree refresh.
      }
      await loadLinks();
      const parts = [`${r.updated} updated`, `${r.unchanged} unchanged`];
      if (r.missing > 0) parts.push(`${r.missing} source missing`);
      flash(parts.join(', '), r.missing > 0 ? 'err' : 'ok');
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setBusy(false);
    }
  }, [loadLinks, flash]);

  const saveEdit = useCallback(async (link: PyramidLink) => {
    const to = editValue.trim();
    if (!to || to === link.path) {
      setEditingPath(null);
      return;
    }
    setBusy(true);
    try {
      await api.renamePyramidLink(link.path, to);
      setEditingPath(null);
      await loadLinks();
      try {
        useEditorStore.getState().setFileTree(await api.listFiles());
      } catch {
        // Best-effort tree refresh.
      }
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
      if (deleteFile) {
        try {
          useEditorStore.getState().setFileTree(await api.listFiles());
        } catch {
          // Best-effort tree refresh.
        }
      }
      flash(deleteFile ? `Deleted ${link.path}` : `Unlinked ${link.path}`, 'ok');
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setBusy(false);
    }
  }, [loadLinks, flash]);

  const inputStyle: React.CSSProperties = {
    fontSize: fs.meta,
    fontFamily: font.mono,
    padding: '4px 8px',
    border: '1px solid var(--line)',
    borderRadius: radius.chip,
    background: 'var(--surface-editor)',
    color: 'var(--text)',
    outline: 'none',
    minWidth: 0,
  };

  return (
    <>
      <PanelHeader title="Plots">
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: fs.meta, color: 'var(--text-faint)' }}>
          <Dot color={available ? 'var(--ok)' : 'var(--text-faint)'} filled={!!available} />
          {available === null ? 'checking' : available ? 'live' : 'offline'}
        </span>
        <IconButton
          icon={<RefreshIcon size={13} />}
          title="Re-import every linked plot from its Pyramid source"
          size={24}
          onClick={refreshLinked}
        />
      </PanelHeader>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: `8px ${metrics.padPanel}px`,
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        <Pill mono={false} active={tab === 'browse'} onClick={() => setTab('browse')}>Browse</Pill>
        <Pill mono={false} active={tab === 'linked'} onClick={() => setTab('linked')}>Linked</Pill>
      </div>

      {tab === 'browse' && (
        <FilterRow>
          <FilterInput value={search} onChange={setSearch} placeholder="Filter sessions…" />
        </FilterRow>
      )}

      <PanelBody>
        {tab === 'browse' ? (
          available === false ? (
            <EmptyState>
              Pyramid is not reachable. Start it to browse plot sessions — the rest of the
              editor is unaffected.
            </EmptyState>
          ) : loading ? (
            <EmptyState><SpinnerIcon size={16} /></EmptyState>
          ) : sessions.length === 0 ? (
            <EmptyState>{search ? 'No sessions match' : 'No plot sessions yet'}</EmptyState>
          ) : (
            sessions.map((session) => {
              const isExpanded = expanded === session.id;
              const sessionPlots = plots[session.id] ?? [];
              return (
                <div key={session.id}>
                  <div
                    onClick={() => toggleSession(session.id)}
                    onMouseEnter={(e) => hoverRow(e, false)}
                    onMouseLeave={(e) => leaveRow(e, false)}
                    style={rowStyle(false, {
                      gap: 7,
                      padding: `7px ${metrics.padPanel}px`,
                      fontSize: fs.row,
                    })}
                  >
                    <span style={{ display: 'flex', color: 'var(--text-faint)', flexShrink: 0 }}>
                      {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {session.title}
                    </span>
                    {session.linkedToCurrentProject && <Badge tone="ok">linked</Badge>}
                  </div>

                  {isExpanded && (
                    plotsLoading === session.id ? (
                      <div style={{ padding: `6px ${metrics.padPanel + 18}px`, color: 'var(--text-faint)' }}>
                        <SpinnerIcon size={13} />
                      </div>
                    ) : sessionPlots.length === 0 ? (
                      <div
                        style={{
                          padding: `6px ${metrics.padPanel + 18}px`,
                          color: 'var(--text-faint)',
                          fontSize: fs.meta,
                        }}
                      >
                        No plots in this session
                      </div>
                    ) : (
                      sessionPlots.map((plot) => {
                        const active = activeFileId === plot.fileId;
                        return (
                          <div
                            key={plot.fileId}
                            onClick={() => selectPlot(session, plot)}
                            onMouseEnter={(e) => hoverRow(e, active)}
                            onMouseLeave={(e) => leaveRow(e, active)}
                            title={plot.filename}
                            style={rowStyle(active, {
                              gap: 8,
                              padding: `5px ${metrics.padPanel}px 5px ${metrics.padPanel + 16}px`,
                              fontFamily: font.mono,
                              fontSize: fs.meta,
                            })}
                          >
                            <img
                              src={api.pyramidRawUrl(session.id, plot.fileId)}
                              alt=""
                              style={{
                                width: 40,
                                height: 28,
                                objectFit: 'contain',
                                border: '1px solid var(--line)',
                                borderRadius: 3,
                                background: 'var(--paper-sheet)',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                              {plot.filename}
                            </span>
                          </div>
                        );
                      })
                    )
                  )}
                </div>
              );
            })
          )
        ) : null}

        {tab === 'browse' && recentlyChanged.length > 0 && (
          <>
            <div
              style={{
                margin: `12px ${metrics.padPanel}px 6px`,
                paddingTop: 12,
                borderTop: '1px solid var(--line)',
              }}
            >
              <SectionLabel>Recently changed</SectionLabel>
            </div>
            {recentlyChanged.map((link) => {
              const active = activeFileId === link.fileId;
              return (
                <div
                  key={link.path}
                  onClick={() => selectLink(link)}
                  onMouseEnter={(e) => hoverRow(e, active)}
                  onMouseLeave={(e) => leaveRow(e, active)}
                  title={`${link.path} · from ${link.sessionTitle}`}
                  style={rowStyle(active, {
                    gap: 7,
                    padding: `5px ${metrics.padPanel}px`,
                    fontSize: fs.meta,
                  })}
                >
                  <span
                    style={{
                      fontFamily: font.mono,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      minWidth: 0,
                    }}
                  >
                    {link.path.split('/').pop()}
                  </span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-faint)' }}>
                    {formatIsoAge(lastChangedAt(link))}
                  </span>
                </div>
              );
            })}
          </>
        )}

        {tab === 'linked' && (linksLoading ? (
          <EmptyState><SpinnerIcon size={16} /></EmptyState>
        ) : links.length === 0 ? (
          <EmptyState>No plots imported into this project yet</EmptyState>
        ) : (
          links.map((link) => (
            <div
              key={link.path}
              style={{
                padding: `7px ${metrics.padPanel}px`,
                borderBottom: '1px solid var(--line-faint)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {editingPath === link.path ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(link);
                      if (e.key === 'Escape') setEditingPath(null);
                    }}
                    style={{ ...inputStyle, flex: 1, borderColor: 'var(--accent)' }}
                  />
                  <OutlinedButton accent onClick={() => saveEdit(link)} disabled={busy}>Save</OutlinedButton>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: fs.meta,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}
                    title={link.path}
                  >
                    {link.path}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexShrink: 0 }}>
                    <IconButton
                      bare
                      size={20}
                      icon={<EditIcon size={12} />}
                      title="Rename in project"
                      onClick={() => { setEditingPath(link.path); setEditValue(link.path); }}
                    />
                    <IconButton
                      bare
                      size={20}
                      icon={<CloseIcon size={12} />}
                      title="Unlink or delete"
                      onClick={() => setConfirmDelete(link.path)}
                    />
                  </span>
                </div>
              )}
              <div
                style={{
                  fontSize: fs.meta,
                  color: 'var(--text-faint)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {link.sessionTitle} · {fmtDate(link.importedAt)}
              </div>
              {confirmDelete === link.path && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <OutlinedButton onClick={() => removeLink(link, false)} disabled={busy}>Unlink</OutlinedButton>
                  <OutlinedButton danger onClick={() => removeLink(link, true)} disabled={busy}>Delete file</OutlinedButton>
                  <OutlinedButton onClick={() => setConfirmDelete(null)}>Cancel</OutlinedButton>
                </div>
              )}
            </div>
          ))
        ))}
      </PanelBody>

      {msg && (
        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--line)',
            padding: `8px ${metrics.padPanel}px`,
            fontSize: fs.meta,
            color: msg.tone === 'ok' ? 'var(--ok)' : 'var(--error)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {msg.text}
        </div>
      )}

    </>
  );
}
