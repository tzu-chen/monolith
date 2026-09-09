import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore, type ManagerDetail } from '../../stores/editorStore';
import { CloseIcon, DownloadIcon, EditIcon, SpinnerIcon, HistoryIcon } from '../shared/Icons';
import { Bar, OutlinedButton, IconButton, Pill, EmptyState, rowStyle, hoverRow, leaveRow } from '../shared/ui';
import { fs, font, metrics, radius } from '../../theme/tokens';
import { downloadBlob } from '../../lib/download';
import * as api from '../../lib/api';
import * as versions from '../../lib/versions-api';
import type { ChangeKind, DiffHunk, FileDiff, RestoreResult, VersionFile, VersionSummary } from '../../lib/versions-api';
import { replaceTabContent } from '../editor/EditorPane';
import { ChangeBadge, PathLabel, StatsLine } from './HistoryPanel';

/**
 * A version, opened from the History panel — the detail half of that screen.
 *
 * Left, the version's files; right, the one you picked as a unified diff
 * against the version before it. The same component shows the changes since
 * the last version (`id: working`), diffed against that version, which is
 * where "discard my edits to this file" lives.
 *
 * Restore never rewrites history. It writes the chosen file — or the whole
 * version — back into the working tree, reloads any open tab it touched, and
 * leaves the result showing as a change to be saved as the next version.
 */

type VersionDetailProps = { detail: Extract<ManagerDetail, { kind: 'version' }> };

type FilesFilter = 'changed' | 'all';

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Bring the editor in line with what a restore wrote: open tabs re-read the
 * file, tabs of removed files close, the tree and the history refresh.
 */
async function applyRestore(result: RestoreResult): Promise<void> {
  const store = useEditorStore.getState();
  for (const p of result.written) {
    if (!store.openTabs.some((t) => t.path === p)) continue;
    try {
      replaceTabContent(p, await api.readFile(p));
    } catch {
      // Unreadable now — the watcher will sort the tab out.
    }
  }
  for (const p of result.removed) {
    if (useEditorStore.getState().openTabs.some((t) => t.path === p)) {
      useEditorStore.getState().closeTab(p);
    }
  }
  try {
    useEditorStore.getState().setFileTree(await api.listFiles());
  } catch {
    // Best-effort; the watcher refreshes it too.
  }
  useEditorStore.getState().invalidateVersions();
}

function describeRestore(result: RestoreResult): string {
  const parts: string[] = [];
  if (result.written.length) parts.push(`${result.written.length} written`);
  if (result.removed.length) parts.push(`${result.removed.length} removed`);
  return parts.length ? `Restored: ${parts.join(', ')}` : 'Already up to date';
}

export default function VersionDetail({ detail }: VersionDetailProps) {
  const setManagerDetail = useEditorStore((s) => s.setManagerDetail);
  const versionsNonce = useEditorStore((s) => s.versionsNonce);
  const invalidateVersions = useEditorStore((s) => s.invalidateVersions);
  const currentProject = useEditorStore((s) => s.currentProject);

  const isWorking = detail.id === versions.WORKING;

  const [version, setVersion] = useState<VersionSummary | null>(null);
  const [head, setHead] = useState<VersionSummary | null>(null);
  const [files, setFiles] = useState<VersionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilesFilter>('changed');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'version' | 'file' | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  const flash = useCallback((text: string, tone: 'ok' | 'err') => {
    setMsg({ text, tone });
    window.setTimeout(() => setMsg(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      if (isWorking) {
        const s = await versions.versionStatus();
        setHead(s.head);
        setVersion(null);
        setFiles(s.changes.map((c) => ({ path: c.path, size: 0, change: c.kind })));
      } else {
        const r = await versions.getVersion(detail.id);
        setVersion(r.version);
        setFiles(r.files);
      }
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setLoading(false);
    }
  }, [detail.id, isWorking, flash]);

  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(load, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [load, versionsNonce]);

  useEffect(() => {
    setConfirm(null);
    setEditing(false);
    setFilter('changed');
  }, [detail.id]);

  /** Revisions the diff runs between. */
  const from = isWorking ? head?.id ?? versions.EMPTY : version?.parent ?? versions.EMPTY;
  const to = isWorking ? versions.WORKING : detail.id;

  const changedFiles = useMemo(() => files.filter((f) => f.change), [files]);
  const shown = filter === 'all' ? files : changedFiles;
  const selectedFile = detail.path ? files.find((f) => f.path === detail.path) ?? null : null;

  const selectPath = (path: string | null) => setManagerDetail({ ...detail, path });
  const close = () => setManagerDetail(null);

  const restoreWhole = useCallback(async () => {
    if (!version) return;
    setBusy(true);
    try {
      const result = await versions.restoreVersion(version.id);
      await applyRestore(result);
      setConfirm(null);
      flash(describeRestore(result), 'ok');
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setBusy(false);
    }
  }, [version, flash]);

  /** For a version: put its copy of the file back. For working: undo the edits since HEAD. */
  const restoreFile = useCallback(async () => {
    const path = detail.path;
    const target = isWorking ? head : version;
    if (!path || !target) return;
    setBusy(true);
    try {
      const result = await versions.restoreVersion(target.id, [path]);
      await applyRestore(result);
      setConfirm(null);
      flash(describeRestore(result), 'ok');
      // The file no longer differs from HEAD, so it leaves the working list.
      if (isWorking) selectPath(null);
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setBusy(false);
    }
  }, [detail.path, isWorking, head, version, flash]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMessage = useCallback(async () => {
    if (!version) return;
    const next = draft.trim();
    setEditing(false);
    if (next === version.message) return;
    try {
      const v = await versions.setVersionMessage(version.id, next);
      setVersion(v);
      invalidateVersions();
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    }
  }, [version, draft, invalidateVersions, flash]);

  const download = useCallback(async () => {
    if (!version) return;
    setBusy(true);
    try {
      const blob = await versions.downloadVersionZip(version.id);
      const name = `${(currentProject ?? 'project').replace(/[^A-Za-z0-9._-]/g, '_')}-v${version.number}.zip`;
      downloadBlob(blob, name);
    } catch (err) {
      flash(String((err as Error).message || err), 'err');
    } finally {
      setBusy(false);
    }
  }, [version, currentProject, flash]);

  const title = isWorking
    ? 'Changes since the last version'
    : version
      ? version.message || 'No message'
      : '';

  const inputStyle: React.CSSProperties = {
    fontSize: fs.row,
    fontFamily: font.ui,
    padding: '3px 8px',
    border: '1px solid var(--accent)',
    borderRadius: radius.chip,
    background: 'transparent',
    color: 'var(--text)',
    outline: 'none',
    minWidth: 0,
    flex: 1,
  };

  /** What restoring the selected file would do, for the button's label. */
  const fileRestoreLabel = isWorking
    ? selectedFile?.change === 'added' ? 'Delete file'
      : selectedFile?.change === 'removed' ? 'Restore file'
      : 'Discard changes'
    : selectedFile?.change === 'removed' ? 'Delete file' : 'Restore file';

  return (
    <>
      <Bar height={metrics.header} padding={metrics.padPane} gap={10}>
        {!isWorking && version && (
          <span style={{ fontFamily: font.mono, fontSize: fs.row, color: 'var(--accent)', flexShrink: 0 }}>
            v{version.number}
          </span>
        )}
        {editing && version ? (
          <input
            autoFocus
            value={draft}
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveMessage();
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={saveMessage}
            style={inputStyle}
          />
        ) : (
          <span
            title={version ? `${fmtDateTime(version.createdAt)} · ${version.id.slice(0, 12)}` : undefined}
            style={{
              fontSize: fs.row,
              color: isWorking || version?.message ? 'var(--text)' : 'var(--text-faint)',
              fontStyle: !isWorking && version && !version.message ? 'italic' : undefined,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
            }}
          >
            {title}
          </span>
        )}
        {!editing && (
          <span style={{ fontSize: fs.meta, color: 'var(--text-faint)', flexShrink: 0 }}>
            {isWorking
              ? head ? `against v${head.number}` : 'no versions yet'
              : version ? fmtDateTime(version.createdAt) : ''}
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          {!isWorking && version && !editing && (
            <>
              <IconButton
                size={24}
                icon={<EditIcon size={12} />}
                title="Edit the message"
                onClick={() => { setDraft(version.message); setEditing(true); }}
              />
              <IconButton
                size={24}
                icon={<DownloadIcon size={13} />}
                title="Download this version as a .zip"
                onClick={download}
              />
              <OutlinedButton
                accent={confirm !== 'version'}
                icon={<HistoryIcon size={12} />}
                title="Write every file in this version back into the project"
                onClick={() => setConfirm(confirm === 'version' ? null : 'version')}
                disabled={busy}
              >
                Restore
              </OutlinedButton>
            </>
          )}
          <IconButton bare size={24} icon={<CloseIcon size={13} />} title="Close" onClick={close} />
        </span>
      </Bar>

      {confirm === 'version' && version && (
        <ConfirmStrip
          text={`Restore v${version.number}? Every file in it is written back over the working copy, and a file in the latest version that v${version.number} does not have is removed. Files never saved in a version are kept. Open tabs reload.`}
          action="Restore version"
          busy={busy}
          onConfirm={restoreWhole}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Files */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {!isWorking && (
            <div style={{ display: 'flex', gap: 6, padding: `8px ${metrics.padPanel}px`, borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
              <Pill mono={false} active={filter === 'changed'} onClick={() => setFilter('changed')}>
                Changed {changedFiles.length}
              </Pill>
              <Pill mono={false} active={filter === 'all'} onClick={() => setFilter('all')}>
                All {files.length}
              </Pill>
            </div>
          )}
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {loading && files.length === 0 ? (
              <EmptyState><SpinnerIcon size={16} /></EmptyState>
            ) : shown.length === 0 ? (
              <EmptyState>{isWorking ? 'Nothing has changed' : 'No files changed'}</EmptyState>
            ) : (
              shown.map((f) => {
                const active = detail.path === f.path;
                return (
                  <div
                    key={f.path}
                    onClick={() => selectPath(f.path)}
                    onMouseEnter={(e) => hoverRow(e, active)}
                    onMouseLeave={(e) => leaveRow(e, active)}
                    style={rowStyle(active, { gap: 8, padding: `4px ${metrics.padPanel}px` })}
                  >
                    {f.change ? <ChangeBadge kind={f.change} /> : <span style={{ width: 22, flexShrink: 0 }} />}
                    <PathLabel path={f.path} active={active} />
                  </div>
                );
              })
            )}
          </div>
          {!isWorking && version && (
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--line)', padding: `7px ${metrics.padPanel}px`, fontSize: fs.meta, color: 'var(--text-faint)', display: 'flex', gap: 8 }}>
              <StatsLine stats={version.stats} />
              <span style={{ marginLeft: 'auto' }}>{version.fileCount} files</span>
            </div>
          )}
        </div>

        {/* Diff */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {!detail.path ? (
            <EmptyState>
              {isWorking
                ? 'Select a file to see what changed since the last version.'
                : 'Select a file to see what this version changed in it.'}
            </EmptyState>
          ) : (
            <DiffView
              key={`${from}→${to}:${detail.path}`}
              path={detail.path}
              from={from}
              to={to}
              versionId={isWorking ? null : detail.id}
              change={selectedFile?.change}
              nonce={versionsNonce}
              actions={
                (isWorking ? !!head : !!version) && selectedFile?.change ? (
                  <OutlinedButton
                    danger={confirm === 'file'}
                    disabled={busy}
                    title={
                      isWorking
                        ? `Put back what v${head?.number} had for this file`
                        : `Put this version's copy of the file into the project`
                    }
                    onClick={() => setConfirm(confirm === 'file' ? null : 'file')}
                  >
                    {fileRestoreLabel}
                  </OutlinedButton>
                ) : null
              }
              confirm={
                confirm === 'file' ? (
                  <ConfirmStrip
                    text={
                      isWorking
                        ? selectedFile?.change === 'added'
                          ? `Delete ${detail.path}? It is not in v${head?.number}.`
                          : selectedFile?.change === 'removed'
                            ? `Put ${detail.path} back as it was in v${head?.number}?`
                            : `Discard the edits to ${detail.path} since v${head?.number}?`
                        : selectedFile?.change === 'removed'
                          ? `Delete ${detail.path}? It is not in v${version?.number}.`
                          : `Overwrite ${detail.path} with the copy in v${version?.number}?`
                    }
                    action={fileRestoreLabel}
                    busy={busy}
                    onConfirm={restoreFile}
                    onCancel={() => setConfirm(null)}
                  />
                ) : null
              }
            />
          )}
        </div>
      </div>

      {msg && (
        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--line)',
            padding: `8px ${metrics.padPane}px`,
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

/** An inline confirmation — a sentence and two buttons, no modal. */
function ConfirmStrip({
  text,
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  text: string;
  action: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: `8px ${metrics.padPane}px`,
        borderBottom: '1px solid var(--line)',
        background: 'var(--accent-wash)',
        fontSize: fs.control,
        color: 'var(--text)',
        flexShrink: 0,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>{text}</span>
      <OutlinedButton danger disabled={busy} onClick={onConfirm} icon={busy ? <SpinnerIcon size={12} /> : undefined}>
        {action}
      </OutlinedButton>
      <OutlinedButton disabled={busy} onClick={onCancel}>Cancel</OutlinedButton>
    </div>
  );
}

// ── Diff view ──

interface DiffViewProps {
  path: string;
  from: string;
  to: string;
  /** The version whose copy is shown when the file did not change in it. */
  versionId: string | null;
  change: ChangeKind | undefined;
  nonce: number;
  actions: React.ReactNode;
  confirm: React.ReactNode;
}

type Loaded =
  | { kind: 'diff'; diff: FileDiff }
  | { kind: 'content'; content: string; size: number }
  | { kind: 'binary'; size: number };

function DiffView({ path, from, to, versionId, change, nonce, actions, confirm }: DiffViewProps) {
  const fontSize = useEditorStore((s) => s.fontSize);
  const fontFamily = useEditorStore((s) => s.fontFamily);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!change && versionId) {
          // Unchanged in this version: show the file as it was, not an empty diff.
          const f = await versions.versionFileContent(versionId, path);
          if (cancelled) return;
          setLoaded(f.binary ? { kind: 'binary', size: f.size } : { kind: 'content', content: f.content ?? '', size: f.size });
        } else {
          const diff = await versions.diffFile(path, from, to);
          if (cancelled) return;
          setLoaded({ kind: 'diff', diff });
        }
        setError(null);
      } catch (err) {
        if (!cancelled) setError(String((err as Error).message || err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, from, to, versionId, change, nonce]);

  const summary = (() => {
    if (!loaded) return '';
    if (loaded.kind === 'binary') return `binary · ${formatBytes(loaded.size)}`;
    if (loaded.kind === 'content') return `unchanged · ${formatBytes(loaded.size)}`;
    const d = loaded.diff;
    if (d.binary) return `binary · ${formatBytes(d.from.size)} → ${formatBytes(d.to.size)}`;
    if (d.tooLarge) return 'too large to diff';
    if (d.identical) return 'identical';
    return '';
  })();

  const counts = loaded?.kind === 'diff' && !loaded.diff.binary && !loaded.diff.tooLarge ? loaded.diff.diff : null;

  return (
    <>
      <Bar height={metrics.bar} padding={metrics.padPane} gap={10}>
        {change && <ChangeBadge kind={change} />}
        <PathLabel path={path} active />
        {counts && (
          <span style={{ display: 'inline-flex', gap: 6, fontFamily: font.mono, fontSize: fs.meta, flexShrink: 0 }}>
            {counts.added > 0 && <span style={{ color: 'var(--ok)' }}>+{counts.added}</span>}
            {counts.removed > 0 && <span style={{ color: 'var(--error)' }}>−{counts.removed}</span>}
          </span>
        )}
        {summary && <span style={{ fontSize: fs.meta, color: 'var(--text-faint)', flexShrink: 0 }}>{summary}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 7, flexShrink: 0 }}>{actions}</span>
      </Bar>

      {confirm}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--surface-editor)' }}>
        {error ? (
          <EmptyState>{error}</EmptyState>
        ) : !loaded ? (
          <EmptyState><SpinnerIcon size={16} /></EmptyState>
        ) : loaded.kind === 'binary' ? (
          <EmptyState>Binary file — no text to show.</EmptyState>
        ) : loaded.kind === 'content' ? (
          <PlainListing content={loaded.content} fontSize={fontSize} fontFamily={fontFamily} />
        ) : loaded.diff.binary ? (
          <EmptyState>Binary file — no text diff.</EmptyState>
        ) : loaded.diff.tooLarge ? (
          <EmptyState>This file is too large to diff in the browser.</EmptyState>
        ) : loaded.diff.identical ? (
          <EmptyState>{loaded.diff.to.exists ? 'No differences.' : 'The file does not exist on either side.'}</EmptyState>
        ) : loaded.diff.diff.hunks.length === 0 ? (
          <EmptyState>Only line endings or trailing whitespace differ.</EmptyState>
        ) : (
          <HunkList hunks={loaded.diff.diff.hunks} fontSize={fontSize} fontFamily={fontFamily} />
        )}
      </div>
    </>
  );
}

const GUTTER = 46;

/**
 * Unified diff. Structure is the two number gutters and a 2px edge on each
 * changed line — `ok` for added, `error` for removed, the gutter's own idiom —
 * over a faint wash of the same colour. Hunk headers sit on the sunken surface.
 */
function HunkList({ hunks, fontSize, fontFamily }: { hunks: DiffHunk[]; fontSize: number; fontFamily: string }) {
  return (
    <div style={{ fontFamily, fontSize, lineHeight: 1.5, minWidth: 'max-content' }}>
      {hunks.map((h, i) => (
        <div key={i}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 26,
              padding: `0 ${metrics.padPane}px 0 ${GUTTER * 2 + 12}px`,
              background: 'var(--surface-sunken)',
              borderTop: i === 0 ? undefined : '1px solid var(--line)',
              borderBottom: '1px solid var(--line)',
              color: 'var(--text-faint)',
              fontSize: fs.meta,
              position: 'sticky',
              left: 0,
            }}
          >
            @@ −{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@
          </div>
          {h.lines.map((l, j) => {
            const edge = l.type === 'add' ? 'var(--ok)' : l.type === 'del' ? 'var(--error)' : 'transparent';
            const wash =
              l.type === 'add'
                ? 'color-mix(in srgb, var(--ok) 11%, transparent)'
                : l.type === 'del'
                  ? 'color-mix(in srgb, var(--error) 11%, transparent)'
                  : 'transparent';
            return (
              <div key={j} style={{ display: 'flex', background: wash }}>
                <Gutter no={l.oldNo} />
                <Gutter no={l.newNo} />
                <span
                  style={{
                    width: 2,
                    flexShrink: 0,
                    background: edge,
                    marginRight: 10,
                  }}
                />
                <span
                  style={{
                    whiteSpace: 'pre',
                    color: l.type === 'context' ? 'var(--text-muted)' : 'var(--text)',
                    paddingRight: metrics.padPane,
                  }}
                >
                  {l.text || ' '}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Gutter({ no }: { no: number | undefined }) {
  return (
    <span
      style={{
        width: GUTTER,
        flexShrink: 0,
        textAlign: 'right',
        paddingRight: 8,
        color: 'var(--text-faint)',
        userSelect: 'none',
        fontSize: fs.meta,
      }}
    >
      {no ?? ''}
    </span>
  );
}

/** A file as it was in a version, with one gutter and no marks. */
function PlainListing({ content, fontSize, fontFamily }: { content: string; fontSize: number; fontFamily: string }) {
  const lines = content === '' ? [] : content.replace(/\n$/, '').split('\n');
  if (lines.length === 0) return <EmptyState>Empty file.</EmptyState>;
  return (
    <div style={{ fontFamily, fontSize, lineHeight: 1.5, minWidth: 'max-content', padding: '4px 0' }}>
      {lines.map((text, i) => (
        <div key={i} style={{ display: 'flex' }}>
          <Gutter no={i + 1} />
          <span style={{ width: 2, flexShrink: 0, marginRight: 10 }} />
          <span style={{ whiteSpace: 'pre', color: 'var(--text-muted)', paddingRight: metrics.padPane }}>{text || ' '}</span>
        </div>
      ))}
    </div>
  );
}
