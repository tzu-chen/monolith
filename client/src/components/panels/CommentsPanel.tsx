import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { CheckIcon, EditIcon, TrashIcon, CommentIcon } from '../shared/Icons';
import {
  PanelHeader,
  PanelBody,
  OutlinedButton,
  IconButton,
  Badge,
  Pill,
  SectionLabel,
  EmptyState,
  rowStyle,
  hoverRow,
  leaveRow,
} from '../shared/ui';
import { fs, font, metrics, radius } from '../../theme/tokens';
import { formatChord } from '../../lib/keybindings';
import { formatIsoAge } from '../../lib/time';
import { goToSource } from '../../lib/navigate';
import * as api from '../../lib/api';
import * as commentsApi from '../../lib/comments-api';
import type { Comment } from '../../lib/comments-api';

/**
 * Comments panel.
 *
 * Every comment on the open file, or on every file in the project. A comment
 * is either on the whole document or on one line of it; line comments follow
 * their text while the file is edited (see `editor/comments-gutter.ts`), and
 * the line numbers here are those live positions.
 *
 * Selecting a comment highlights its line in the editor and reveals its
 * controls — resolve, edit, delete — so the list stays a list until you pick
 * something. New comments are written in a composer at the top, opened by the
 * two buttons under the header, the gutter, or the shortcut.
 */

type Scope = 'file' | 'project';

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 64,
  resize: 'vertical',
  fontSize: fs.control,
  fontFamily: font.ui,
  lineHeight: 1.5,
  padding: '6px 9px',
  border: '1px solid var(--line-strong)',
  borderRadius: radius.control,
  background: 'transparent',
  color: 'var(--text)',
  outline: 'none',
  minWidth: 0,
};

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

/** The trimmed text of `line` in an open tab, for the comment's anchor. */
function anchorFor(file: string, line: number | null): string | null {
  if (line === null) return null;
  const tab = useEditorStore.getState().openTabs.find((t) => t.path === file);
  if (!tab) return null;
  const text = tab.content.split('\n')[line - 1];
  return text === undefined ? null : text.trim();
}

/** Multi-line editor that submits on Enter and cancels on Escape. */
export function Composer({
  initial,
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(text.length, text.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const submit = () => {
    const trimmed = text.trim();
    if (trimmed) onSubmit(trimmed);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        maxLength={10_000}
        style={textareaStyle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: fs.meta, color: 'var(--text-faint)', marginRight: 'auto' }}>
          Enter to {submitLabel.toLowerCase()} · Shift+Enter for a new line
        </span>
        <OutlinedButton onClick={onCancel}>Cancel</OutlinedButton>
        <OutlinedButton accent onClick={submit} disabled={!text.trim()}>
          {submitLabel}
        </OutlinedButton>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  active,
  showFile,
  editing,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleResolved,
  onDelete,
}: {
  comment: Comment;
  active: boolean;
  showFile: boolean;
  editing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: (text: string) => void;
  onCancelEdit: () => void;
  onToggleResolved: () => void;
  onDelete: () => void;
}) {
  const faint = comment.resolved && !active;
  return (
    <div
      onClick={onSelect}
      onMouseEnter={(e) => hoverRow(e, active)}
      onMouseLeave={(e) => leaveRow(e, active)}
      title={comment.line === null ? 'On the whole document' : `Line ${comment.line}`}
      style={rowStyle(active, {
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 5,
        padding: `8px ${metrics.padPanel}px`,
        borderBottom: '1px solid var(--line-faint)',
        whiteSpace: 'normal',
        opacity: faint ? 0.6 : 1,
      })}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        {comment.line === null ? (
          <Badge tone={active ? 'accent' : undefined}>Doc</Badge>
        ) : (
          <Badge tone={active ? 'accent' : undefined} mono>L{comment.line}</Badge>
        )}
        {showFile && (
          <span
            style={{
              fontFamily: font.mono,
              fontSize: fs.meta,
              color: 'var(--text-faint)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
            title={comment.file}
          >
            {basename(comment.file)}
          </span>
        )}
        {comment.resolved && <Badge tone="ok">resolved</Badge>}
        <span style={{ marginLeft: 'auto', fontSize: fs.meta, color: 'var(--text-faint)', flexShrink: 0 }}>
          {formatIsoAge(comment.updatedAt)}
        </span>
      </div>

      {editing ? (
        <div onClick={(e) => e.stopPropagation()}>
          <Composer
            initial={comment.text}
            placeholder="Comment"
            submitLabel="Save"
            onSubmit={onSaveEdit}
            onCancel={onCancelEdit}
          />
        </div>
      ) : (
        <div
          style={{
            fontSize: fs.row,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: active ? 'var(--text)' : 'var(--text-muted)',
            textDecoration: comment.resolved ? 'line-through' : undefined,
            textDecorationColor: 'var(--line-strong)',
          }}
        >
          {comment.text}
        </div>
      )}

      {active && !editing && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          <OutlinedButton
            icon={<CheckIcon size={12} />}
            onClick={onToggleResolved}
            title={comment.resolved ? 'Mark as open again' : 'Mark as resolved'}
            style={{ padding: '3px 9px' }}
          >
            {comment.resolved ? 'Reopen' : 'Resolve'}
          </OutlinedButton>
          <IconButton icon={<EditIcon size={12} />} title="Edit the comment" size={24} onClick={onStartEdit} />
          <IconButton icon={<TrashIcon size={12} />} title="Delete the comment" size={24} onClick={onDelete} />
        </div>
      )}
    </div>
  );
}

/** Document comments first, then by line. */
function order(a: Comment, b: Comment): number {
  if (a.line === null && b.line !== null) return -1;
  if (a.line !== null && b.line === null) return 1;
  if (a.line !== null && b.line !== null && a.line !== b.line) return a.line - b.line;
  return a.createdAt.localeCompare(b.createdAt);
}

export default function CommentsPanel() {
  const currentProject = useEditorStore((s) => s.currentProject);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const cursorLine = useEditorStore((s) => s.cursorLine);
  const comments = useEditorStore((s) => s.comments);
  const activeCommentId = useEditorStore((s) => s.activeCommentId);
  const setActiveComment = useEditorStore((s) => s.setActiveComment);
  const draft = useEditorStore((s) => s.commentDraft);
  const startCommentDraft = useEditorStore((s) => s.startCommentDraft);
  const clearCommentDraft = useEditorStore((s) => s.clearCommentDraft);
  const invalidateComments = useEditorStore((s) => s.invalidateComments);
  const keybindings = useEditorStore((s) => s.keybindings);

  const [scope, setScope] = useState<Scope>('file');
  const [showResolved, setShowResolved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((err: unknown) => {
    setError(String((err as Error).message || err));
    window.setTimeout(() => setError(null), 4000);
  }, []);

  // The selected comment, when it is in another file, is still worth showing.
  useEffect(() => {
    const active = comments.find((c) => c.id === activeCommentId);
    if (active && activeTabPath && active.file !== activeTabPath && scope === 'file') setScope('project');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCommentId]);

  const visible = useMemo(() => {
    const inScope = scope === 'file' ? comments.filter((c) => c.file === activeTabPath) : comments;
    return inScope.filter((c) => showResolved || !c.resolved || c.id === activeCommentId);
  }, [comments, scope, activeTabPath, showResolved, activeCommentId]);

  const groups = useMemo(() => {
    const byFile = new Map<string, Comment[]>();
    for (const c of visible) {
      const list = byFile.get(c.file) ?? [];
      list.push(c);
      byFile.set(c.file, list);
    }
    return [...byFile.entries()]
      .sort(([a], [b]) => (a === activeTabPath ? -1 : b === activeTabPath ? 1 : a.localeCompare(b)))
      .map(([file, list]) => ({ file, comments: list.sort(order) }));
  }, [visible, activeTabPath]);

  const openCount = useMemo(() => {
    const inScope = scope === 'file' ? comments.filter((c) => c.file === activeTabPath) : comments;
    return inScope.filter((c) => !c.resolved).length;
  }, [comments, scope, activeTabPath]);
  const resolvedCount = useMemo(() => {
    const inScope = scope === 'file' ? comments.filter((c) => c.file === activeTabPath) : comments;
    return inScope.filter((c) => c.resolved).length;
  }, [comments, scope, activeTabPath]);

  const select = useCallback(
    async (c: Comment) => {
      setActiveComment(c.id);
      setEditingId(null);
      if (c.line !== null) {
        await goToSource(c.file, c.line);
      } else if (c.file !== useEditorStore.getState().activeTabPath) {
        // A document comment: open the file, but leave the cursor alone.
        const store = useEditorStore.getState();
        const open = store.openTabs.find((t) => t.path === c.file);
        if (open) store.setActiveTab(c.file);
        else {
          try {
            store.openFile(c.file, await api.readFile(c.file));
          } catch {
            // Gone — the comment still lists the path it was on.
          }
        }
      }
    },
    [setActiveComment]
  );

  const submitDraft = useCallback(
    async (text: string) => {
      if (!draft) return;
      try {
        const created = await commentsApi.createComment({
          file: draft.file,
          line: draft.line,
          anchor: anchorFor(draft.file, draft.line),
          text,
        });
        clearCommentDraft();
        setActiveComment(created.id);
        invalidateComments();
      } catch (err) {
        fail(err);
      }
    },
    [draft, clearCommentDraft, setActiveComment, invalidateComments, fail]
  );

  const saveEdit = useCallback(
    async (id: string, text: string) => {
      try {
        await commentsApi.updateComment(id, { text });
        setEditingId(null);
        invalidateComments();
      } catch (err) {
        fail(err);
      }
    },
    [invalidateComments, fail]
  );

  const toggleResolved = useCallback(
    async (c: Comment) => {
      try {
        await commentsApi.updateComment(c.id, { resolved: !c.resolved });
        invalidateComments();
      } catch (err) {
        fail(err);
      }
    },
    [invalidateComments, fail]
  );

  const remove = useCallback(
    async (c: Comment) => {
      try {
        await commentsApi.deleteComment(c.id);
        if (useEditorStore.getState().activeCommentId === c.id) setActiveComment(null);
        invalidateComments();
      } catch (err) {
        fail(err);
      }
    },
    [invalidateComments, setActiveComment, fail]
  );

  if (!currentProject) {
    return (
      <>
        <PanelHeader title="Comments" />
        <EmptyState>Open a project to see its comments.</EmptyState>
      </>
    );
  }

  const addChord = keybindings.addComment ? formatChord(keybindings.addComment) : '';

  return (
    <>
      <PanelHeader title="Comments">
        {openCount > 0 && (
          <span style={{ fontFamily: font.mono, fontSize: fs.meta, color: 'var(--text-faint)' }} title="Open comments">
            {openCount}
          </span>
        )}
      </PanelHeader>

      {/* Scope and filters. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: `9px ${metrics.padPanel}px`,
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        <Pill active={scope === 'file'} onClick={() => setScope('file')} mono={false} title="Comments on the open file">
          File
        </Pill>
        <Pill active={scope === 'project'} onClick={() => setScope('project')} mono={false} title="Comments on every file">
          Project
        </Pill>
        <span style={{ marginLeft: 'auto' }}>
          <Pill
            active={showResolved}
            onClick={() => setShowResolved((v) => !v)}
            mono={false}
            title={showResolved ? 'Hide resolved comments' : 'Show resolved comments'}
          >
            Resolved{resolvedCount > 0 ? ` ${resolvedCount}` : ''}
          </Pill>
        </span>
      </div>

      {/* New comment. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: `9px ${metrics.padPanel}px`,
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        {draft ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <SectionLabel>New comment</SectionLabel>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: fs.meta,
                  color: 'var(--text-faint)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
                title={draft.file}
              >
                {basename(draft.file)}
                {draft.line !== null ? `:${draft.line}` : ' · whole document'}
              </span>
            </div>
            <Composer
              initial=""
              placeholder={draft.line !== null ? `About line ${draft.line}…` : 'About this document…'}
              submitLabel="Add"
              onSubmit={submitDraft}
              onCancel={clearCommentDraft}
            />
          </>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <OutlinedButton
              accent
              icon={<CommentIcon size={12} />}
              disabled={!activeTabPath}
              onClick={() => startCommentDraft(cursorLine)}
              title={activeTabPath ? `Comment on the cursor line${addChord ? ` (${addChord})` : ''}` : 'Open a file first'}
              style={{ flex: 1 }}
            >
              Line {activeTabPath ? cursorLine : '—'}
              {addChord && (
                <span style={{ fontFamily: font.mono, fontSize: fs.meta, opacity: 0.7 }}>{addChord}</span>
              )}
            </OutlinedButton>
            <OutlinedButton
              disabled={!activeTabPath}
              onClick={() => startCommentDraft(null)}
              title={activeTabPath ? 'Comment on the whole document' : 'Open a file first'}
              style={{ flex: 1 }}
            >
              Whole document
            </OutlinedButton>
          </div>
        )}
      </div>

      <PanelBody>
        {scope === 'file' && !activeTabPath ? (
          <EmptyState>Open a file to see its comments.</EmptyState>
        ) : groups.length === 0 ? (
          <EmptyState>
            {scope === 'file'
              ? resolvedCount > 0
                ? 'Every comment on this file is resolved.'
                : 'No comments on this file yet. Add one on the cursor line or on the whole document.'
              : resolvedCount > 0
                ? 'Every comment in this project is resolved.'
                : 'No comments in this project yet.'}
          </EmptyState>
        ) : (
          groups.map((g) => (
            <div key={g.file}>
              {scope === 'project' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: `10px ${metrics.padPanel}px 4px`,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: fs.meta,
                      color: g.file === activeTabPath ? 'var(--text)' : 'var(--text-faint)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={g.file}
                  >
                    {g.file}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: fs.meta, color: 'var(--text-faint)', flexShrink: 0 }}>
                    {g.comments.length}
                  </span>
                </div>
              )}
              {g.comments.map((c) => (
                <CommentRow
                  key={c.id}
                  comment={c}
                  active={c.id === activeCommentId}
                  showFile={false}
                  editing={editingId === c.id}
                  onSelect={() => select(c)}
                  onStartEdit={() => setEditingId(c.id)}
                  onSaveEdit={(text) => saveEdit(c.id, text)}
                  onCancelEdit={() => setEditingId(null)}
                  onToggleResolved={() => toggleResolved(c)}
                  onDelete={() => remove(c)}
                />
              ))}
            </div>
          ))
        )}
      </PanelBody>

      {error && (
        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid var(--line)',
            padding: `8px ${metrics.padPanel}px`,
            fontSize: fs.meta,
            color: 'var(--error)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}
