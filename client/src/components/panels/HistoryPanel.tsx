import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { SpinnerIcon, RefreshIcon } from '../shared/Icons';
import {
  PanelHeader,
  PanelBody,
  OutlinedButton,
  IconButton,
  Badge,
  SectionLabel,
  EmptyState,
  rowStyle,
  hoverRow,
  leaveRow,
} from '../shared/ui';
import { fs, font, metrics, radius } from '../../theme/tokens';
import { formatIsoAge } from '../../lib/time';
import { flushAllDirtyTabs } from '../../lib/compileTarget';
import * as versions from '../../lib/versions-api';
import type { Change, ChangeKind, ChangeStats, VersionStatus, VersionSummary } from '../../lib/versions-api';

/**
 * History panel — the project's version history.
 *
 * Two stacked lists. At the top, what has changed since the last saved version
 * and the control that saves it as the next one; below, every version, newest
 * first. Selecting a changed file or a version opens it in the detail column
 * beside this panel, where the diffs and the restore controls live — this
 * panel is the list half of that screen, like Plots and References.
 *
 * The history is per project and stays with the project directory; switching
 * projects swaps it out with everything else.
 */

/** One letter per change kind, coloured like the editor's own diff gutter. */
const KIND: Record<ChangeKind, { letter: string; tone: 'ok' | 'accent' | 'error'; label: string }> = {
  added: { letter: 'A', tone: 'ok', label: 'Added' },
  modified: { letter: 'M', tone: 'accent', label: 'Modified' },
  removed: { letter: 'D', tone: 'error', label: 'Removed' },
};

export function ChangeBadge({ kind }: { kind: ChangeKind }) {
  const k = KIND[kind];
  return (
    <span title={k.label} style={{ display: 'inline-flex' }}>
      <Badge tone={k.tone} mono>{k.letter}</Badge>
    </span>
  );
}

/** `+3 ~2 −1`, each count in the colour of its kind; zero counts are dropped. */
export function StatsLine({ stats }: { stats: ChangeStats }) {
  const parts: { text: string; color: string }[] = [];
  if (stats.added) parts.push({ text: `+${stats.added}`, color: 'var(--ok)' });
  if (stats.modified) parts.push({ text: `~${stats.modified}`, color: 'var(--accent)' });
  if (stats.removed) parts.push({ text: `−${stats.removed}`, color: 'var(--error)' });
  if (parts.length === 0) return <span style={{ color: 'var(--text-faint)' }}>no changes</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 6, fontFamily: font.mono }}>
      {parts.map((p) => (
        <span key={p.text} style={{ color: p.color }}>{p.text}</span>
      ))}
    </span>
  );
}

/** Split `chapters/intro.tex` into a faint directory and a bright basename. */
export function PathLabel({ path, active }: { path: string; active?: boolean }) {
  const idx = path.lastIndexOf('/');
  const dir = idx >= 0 ? path.slice(0, idx + 1) : '';
  const base = idx >= 0 ? path.slice(idx + 1) : path;
  return (
    <span
      title={path}
      style={{
        fontFamily: font.mono,
        fontSize: fs.meta,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
        flex: 1,
        color: active ? 'var(--text)' : undefined,
      }}
    >
      {dir && <span style={{ color: 'var(--text-faint)' }}>{dir}</span>}
      {base}
    </span>
  );
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function HistoryPanel() {
  const currentProject = useEditorStore((s) => s.currentProject);
  const versionsNonce = useEditorStore((s) => s.versionsNonce);
  const managerDetail = useEditorStore((s) => s.managerDetail);
  const setManagerDetail = useEditorStore((s) => s.setManagerDetail);
  const invalidateVersions = useEditorStore((s) => s.invalidateVersions);

  const selected = managerDetail?.kind === 'version' ? managerDetail : null;

  const [status, setStatus] = useState<VersionStatus | null>(null);
  const [list, setList] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [flashMsg, setFlashMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  const flash = useCallback((text: string, tone: 'ok' | 'err') => {
    setFlashMsg({ text, tone });
    window.setTimeout(() => setFlashMsg(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([versions.versionStatus(), versions.listVersions()]);
      setStatus(s);
      setList(l.versions);
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setLoading(false);
    }
  }, [flash]);

  // Autosave fires a watcher event a second after every pause in typing, and
  // each one bumps the nonce; coalesce them so status is read once per burst.
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!currentProject) {
      setStatus(null);
      setList([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(load, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [currentProject, versionsNonce, load]);

  const changes: Change[] = status?.changes ?? [];
  const head = status?.head ?? null;

  const save = useCallback(async () => {
    if (busy || changes.length === 0) return;
    setBusy(true);
    try {
      // What gets snapshotted is what is on disk.
      await flushAllDirtyTabs();
      const v = await versions.saveVersion(message.trim());
      setMessage('');
      flash(`Saved v${v.number}`, 'ok');
      invalidateVersions();
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setBusy(false);
    }
  }, [busy, changes.length, message, flash, invalidateVersions]);

  const openChange = (change: Change) =>
    setManagerDetail({ kind: 'version', id: versions.WORKING, path: change.path });

  const openVersion = (v: VersionSummary) => {
    // Clicking the open version again closes its pane, like a rail tool.
    if (selected && selected.id === v.id) setManagerDetail(null);
    else setManagerDetail({ kind: 'version', id: v.id, path: null });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontSize: fs.control,
    fontFamily: font.ui,
    padding: '5px 9px',
    border: '1px solid var(--line)',
    borderRadius: radius.control,
    background: 'transparent',
    color: 'var(--text)',
    outline: 'none',
    minWidth: 0,
  };

  if (!currentProject) {
    return (
      <>
        <PanelHeader title="History" />
        <EmptyState>Open a project to see its history.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PanelHeader title="History">
        {head && (
          <span style={{ fontFamily: font.mono, fontSize: fs.meta, color: 'var(--text-faint)' }} title={`Latest version, ${fmtDateTime(head.createdAt)}`}>
            v{head.number}
          </span>
        )}
        <IconButton
          icon={<RefreshIcon size={13} />}
          title="Re-read the working tree and the history"
          size={24}
          onClick={() => invalidateVersions()}
        />
      </PanelHeader>

      {/* Changes since the last version, and the control that saves them. */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', maxHeight: '45%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `10px ${metrics.padPanel}px 6px` }}>
          <SectionLabel>Changes</SectionLabel>
          <span style={{ fontSize: fs.meta, color: 'var(--text-faint)', marginLeft: 'auto' }}>
            {loading && !status
              ? ''
              : changes.length === 0
                ? head ? `none since v${head.number}` : 'nothing to save'
                : `${changes.length} file${changes.length === 1 ? '' : 's'}`}
          </span>
        </div>

        <div style={{ overflow: 'auto', minHeight: 0 }}>
          {changes.map((c) => {
            const active = !!selected && selected.id === versions.WORKING && selected.path === c.path;
            return (
              <div
                key={c.path}
                onClick={() => openChange(c)}
                onMouseEnter={(e) => hoverRow(e, active)}
                onMouseLeave={(e) => leaveRow(e, active)}
                style={rowStyle(active, { gap: 8, padding: `4px ${metrics.padPanel}px` })}
              >
                <ChangeBadge kind={c.kind} />
                <PathLabel path={c.path} active={active} />
              </div>
            );
          })}
          {status && status.skipped.length > 0 && (
            <div
              style={{ padding: `4px ${metrics.padPanel}px`, fontSize: fs.meta, color: 'var(--warn)' }}
              title={status.skipped.join('\n')}
            >
              {status.skipped.length} file{status.skipped.length === 1 ? '' : 's'} over 50 MB left out
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: `8px ${metrics.padPanel}px 10px`, flexShrink: 0 }}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
            placeholder={changes.length === 0 ? 'Nothing to save' : 'Describe this version…'}
            disabled={changes.length === 0 || busy}
            maxLength={500}
            style={{ ...inputStyle, opacity: changes.length === 0 ? 0.6 : 1 }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--line-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; }}
          />
          <OutlinedButton
            accent
            disabled={changes.length === 0 || busy}
            onClick={save}
            title={
              changes.length === 0
                ? 'Nothing has changed since the last version'
                : `Save a version with ${changes.length} changed file${changes.length === 1 ? '' : 's'} (Enter)`
            }
            icon={busy ? <SpinnerIcon size={12} /> : undefined}
          >
            {head ? `Save as v${head.number + 1}` : 'Save first version'}
          </OutlinedButton>
        </div>
      </div>

      <PanelBody>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `10px ${metrics.padPanel}px 6px` }}>
          <SectionLabel>Versions</SectionLabel>
          {list.length > 0 && (
            <span style={{ fontSize: fs.meta, color: 'var(--text-faint)', marginLeft: 'auto' }}>{list.length}</span>
          )}
        </div>

        {loading && list.length === 0 ? (
          <EmptyState><SpinnerIcon size={16} /></EmptyState>
        ) : list.length === 0 ? (
          <EmptyState>
            No versions yet. Save one to start this project's history — every version is a full
            snapshot you can compare with and restore.
          </EmptyState>
        ) : (
          list.map((v) => {
            const active = !!selected && selected.id === v.id;
            return (
              <div
                key={v.id}
                onClick={() => openVersion(v)}
                onMouseEnter={(e) => hoverRow(e, active)}
                onMouseLeave={(e) => leaveRow(e, active)}
                title={`${fmtDateTime(v.createdAt)} · ${v.id.slice(0, 7)}`}
                style={rowStyle(active, {
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 3,
                  padding: `7px ${metrics.padPanel}px`,
                  borderBottom: '1px solid var(--line-faint)',
                })}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span style={{ fontFamily: font.mono, fontSize: fs.meta, color: active ? 'var(--accent)' : 'var(--text-faint)', flexShrink: 0 }}>
                    v{v.number}
                  </span>
                  <span
                    style={{
                      fontSize: fs.row,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                      flex: 1,
                      color: v.message ? undefined : 'var(--text-faint)',
                      fontStyle: v.message ? undefined : 'italic',
                    }}
                  >
                    {v.message || 'No message'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: fs.meta, color: 'var(--text-faint)' }}>
                  <StatsLine stats={v.stats} />
                  <span style={{ marginLeft: 'auto', flexShrink: 0 }}>{formatIsoAge(v.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
      </PanelBody>

      {flashMsg && (
        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--line)',
            padding: `8px ${metrics.padPanel}px`,
            fontSize: fs.meta,
            color: flashMsg.tone === 'ok' ? 'var(--ok)' : 'var(--error)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {flashMsg.text}
        </div>
      )}
    </>
  );
}
