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
import { ENTER } from '../../lib/shortcuts';
import * as api from '../../lib/api';
import type { PyramidSession, PyramidPlot, PyramidLink } from '../../lib/api';

/**
 * Plots panel.
 *
 * Plots are produced by the companion Pyramid app; this panel browses that
 * app's sessions and imports a plot into the project — it never generates or
 * edits one. That is the same contract as the handoff's plot manager, with
 * Pyramid sessions standing in for watched folders.
 *
 * Layout follows S7b (list over detail rather than beside it, to fit a side
 * panel): sessions and their plots on top, then the selected plot's preview
 * with the insert-as controls and a live snippet preview beneath it.
 */

type Tab = 'browse' | 'linked';
type InsertMode = 'figure' | 'includegraphics' | 'wrapfigure';

const INSERT_MODES: { value: InsertMode; label: string }[] = [
  { value: 'figure', label: 'figure environment' },
  { value: 'includegraphics', label: 'includegraphics only' },
  { value: 'wrapfigure', label: 'wrapfigure' },
];

/** Compose the snippet from the current insert mode and width. */
function snippetFor(mode: InsertMode, relPath: string, width: string): string {
  const stem = relPath.split('/').pop()!.replace(/\.[^.]+$/, '');
  const label = stem.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const include = `\\includegraphics[width=${width}]{${relPath}}`;

  if (mode === 'includegraphics') return `${include}\n`;
  if (mode === 'wrapfigure') {
    return (
      `\\begin{wrapfigure}{r}{${width}}\n` +
      `  \\centering\n` +
      `  ${include}\n` +
      `  \\caption{${stem}}\n` +
      `  \\label{fig:${label}}\n` +
      `\\end{wrapfigure}\n`
    );
  }
  return (
    `\\begin{figure}[htbp]\n` +
    `  \\centering\n` +
    `  ${include}\n` +
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

interface Selection {
  session: PyramidSession;
  plot: PyramidPlot;
}

export default function PlotsPanel() {
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
  const [selection, setSelection] = useState<Selection | null>(null);

  const [insertMode, setInsertMode] = useState<InsertMode>('figure');
  const [insertWidth, setInsertWidth] = useState('0.8\\textwidth');

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

  useEffect(() => {
    if (tab !== 'linked') return;
    setEditingPath(null);
    setConfirmDelete(null);
    loadLinks();
  }, [tab, loadLinks]);

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

  const insertSelected = useCallback(async () => {
    if (!selection) return;
    setBusy(true);
    try {
      const { path } = await api.importPyramidPlot({
        sessionId: selection.session.id,
        fileId: selection.plot.fileId,
        filename: selection.plot.filename,
        sessionTitle: selection.session.title,
      });
      insertAtCursor(snippetFor(insertMode, path, insertWidth));
      try {
        useEditorStore.getState().setFileTree(await api.listFiles());
      } catch {
        // The file landed; the tree will catch up on the next watcher event.
      }
      flash(`Inserted ${path}`, 'ok');
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setBusy(false);
    }
  }, [selection, insertMode, insertWidth, insertAtCursor, flash]);

  const refreshLinked = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.refreshPyramidPlots();
      try {
        useEditorStore.getState().setFileTree(await api.listFiles());
      } catch {
        // Best-effort tree refresh.
      }
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

  const previewSnippet = useMemo(
    () =>
      selection
        ? snippetFor(insertMode, `figures/${selection.plot.filename}`, insertWidth)
        : '',
    [selection, insertMode, insertWidth]
  );

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
                        const active =
                          selection?.plot.fileId === plot.fileId && selection?.session.id === session.id;
                        return (
                          <div
                            key={plot.fileId}
                            onClick={() => setSelection({ session, plot })}
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
        ) : linksLoading ? (
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
        )}
      </PanelBody>

      {tab === 'browse' && selection && (
        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--line)',
            padding: `10px ${metrics.padPanel}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: radius.control,
              background: 'var(--paper-sheet)',
              padding: 8,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <img
              src={api.pyramidRawUrl(selection.session.id, selection.plot.fileId)}
              alt={selection.plot.filename}
              style={{ maxWidth: '100%', maxHeight: 140, objectFit: 'contain' }}
            />
          </div>

          <SectionLabel>Insert as</SectionLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {INSERT_MODES.map((m) => (
              <Pill key={m.value} mono={false} active={insertMode === m.value} onClick={() => setInsertMode(m.value)}>
                {m.label}
              </Pill>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <SectionLabel>Width</SectionLabel>
            <input
              value={insertWidth}
              onChange={(e) => setInsertWidth(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>

          <pre
            style={{
              margin: 0,
              border: '1px solid var(--line)',
              borderRadius: radius.control,
              background: 'var(--surface-editor)',
              padding: '7px 9px',
              fontFamily: font.mono,
              fontSize: fs.meta,
              lineHeight: 1.6,
              color: 'var(--text-muted)',
              overflowX: 'auto',
              whiteSpace: 'pre',
            }}
          >
            {previewSnippet}
          </pre>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {msg && (
              <span
                style={{
                  fontSize: fs.meta,
                  color: msg.tone === 'ok' ? 'var(--ok)' : 'var(--error)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {msg.text}
              </span>
            )}
            <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <OutlinedButton accent onClick={insertSelected} disabled={busy}>
                {busy ? 'Working…' : `Insert at cursor ${ENTER}`}
              </OutlinedButton>
            </span>
          </div>
        </div>
      )}

      {tab === 'linked' && msg && (
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
