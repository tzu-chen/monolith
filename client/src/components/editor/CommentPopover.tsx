import { useState, useCallback } from 'react';
import type { EditorView } from '@codemirror/view';
import { useEditorStore } from '../../stores/editorStore';
import { Composer } from '../panels/CommentsPanel';
import { closeCommentPopover, commentsAt, setPopover } from './comment-popover';
import { CheckIcon, EditIcon, TrashIcon, CloseIcon, CommentIcon } from '../shared/Icons';
import { Badge, IconButton, OutlinedButton } from '../shared/ui';
import { fs, font } from '../../theme/tokens';
import { formatIsoAge } from '../../lib/time';
import * as commentsApi from '../../lib/comments-api';
import type { Comment } from '../../lib/comments-api';

/**
 * Contents of the floating comment card (see `comment-popover.ts`).
 *
 * Rendered by React into a CodeMirror tooltip, so it reads the store like any
 * panel but takes the editor view and the line from the tooltip. Kept to one
 * column of compact rows: the text, when it was written, and the same three
 * controls the panel has — resolve, edit, delete — plus a composer.
 */

interface Props {
  view: EditorView;
  pos: number;
  composing: boolean;
}

export default function CommentPopover({ view, pos, composing }: Props) {
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const activeCommentId = useEditorStore((s) => s.activeCommentId);
  const setActiveComment = useEditorStore((s) => s.setActiveComment);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);
  const invalidateComments = useEditorStore((s) => s.invalidateComments);
  // Subscribing keeps the card current when the panel or another tab edits.
  useEditorStore((s) => s.comments);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const line = view.state.doc.lineAt(pos);
  const comments = commentsAt(view.state, pos);
  const showComposer = composing || comments.length === 0;

  const fail = useCallback((err: unknown) => {
    setError(String((err as Error).message || err));
    window.setTimeout(() => setError(null), 4000);
  }, []);

  const close = () => closeCommentPopover(view);
  const setComposing = (on: boolean) => view.dispatch({ effects: setPopover.of({ pos, composing: on }) });

  const add = async (text: string) => {
    if (!activeTabPath) return;
    try {
      const created = await commentsApi.createComment({
        file: activeTabPath,
        line: line.number,
        anchor: line.text.trim(),
        text,
      });
      setActiveComment(created.id);
      invalidateComments();
      setComposing(false);
    } catch (err) {
      fail(err);
    }
  };

  const mutate = async (op: () => Promise<unknown>) => {
    try {
      await op();
      invalidateComments();
    } catch (err) {
      fail(err);
    }
  };

  const openPanel = () => {
    if (comments.length) setActiveComment(comments[0].id);
    setActivePanel('comments');
  };

  return (
    <div
      style={{
        width: 360,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: font.ui,
        color: 'var(--text)',
      }}
      onKeyDown={(e) => {
        // Nothing typed here is an editor keystroke.
        e.stopPropagation();
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 6px 6px 12px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <CommentIcon size={12} style={{ color: 'var(--text-faint)' }} />
        <span style={{ fontFamily: font.mono, fontSize: fs.meta, color: 'var(--text-faint)' }}>
          Line {line.number}
          {comments.length > 1 ? ` · ${comments.length}` : ''}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          {!showComposer && (
            <OutlinedButton onClick={() => setComposing(true)} title="Add another comment on this line" style={{ padding: '2px 8px' }}>
              Add
            </OutlinedButton>
          )}
          <OutlinedButton onClick={openPanel} title="Show this file's comments in the panel" style={{ padding: '2px 8px' }}>
            Panel
          </OutlinedButton>
          <IconButton icon={<CloseIcon size={12} />} title="Close (Escape)" size={22} bare onClick={close} />
        </span>
      </div>

      {comments.length > 0 && (
        <div style={{ maxHeight: 260, overflow: 'auto' }}>
          {comments.map((c) => (
            <Row
              key={c.id}
              comment={c}
              active={c.id === activeCommentId}
              editing={editingId === c.id}
              onSelect={() => setActiveComment(c.id)}
              onStartEdit={() => setEditingId(c.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(text) => mutate(() => commentsApi.updateComment(c.id, { text })).then(() => setEditingId(null))}
              onToggleResolved={() => mutate(() => commentsApi.updateComment(c.id, { resolved: !c.resolved }))}
              onDelete={() => mutate(() => commentsApi.deleteComment(c.id))}
            />
          ))}
        </div>
      )}

      {showComposer && (
        <div style={{ padding: '9px 12px 10px', borderTop: comments.length ? '1px solid var(--line)' : undefined }}>
          <Composer
            initial=""
            placeholder={`About line ${line.number}…`}
            submitLabel="Add"
            onSubmit={add}
            onCancel={() => (comments.length ? setComposing(false) : close())}
          />
        </div>
      )}

      {error && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--line)', fontSize: fs.meta, color: 'var(--error)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Row({
  comment,
  active,
  editing,
  onSelect,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleResolved,
  onDelete,
}: {
  comment: Comment;
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => void;
  onToggleResolved: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: '8px 12px',
        borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        background: active ? 'var(--accent-wash)' : 'transparent',
        borderBottom: '1px solid var(--line-faint)',
        opacity: comment.resolved && !active ? 0.6 : 1,
      }}
    >
      {editing ? (
        <div onClick={(e) => e.stopPropagation()}>
          <Composer initial={comment.text} placeholder="Comment" submitLabel="Save" onSubmit={onSaveEdit} onCancel={onCancelEdit} />
        </div>
      ) : (
        <div
          style={{
            fontSize: fs.control,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            textDecoration: comment.resolved ? 'line-through' : undefined,
            textDecorationColor: 'var(--line-strong)',
          }}
        >
          {comment.text}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
        <span style={{ fontSize: fs.meta, color: 'var(--text-faint)' }}>{formatIsoAge(comment.updatedAt)}</span>
        {comment.resolved && <Badge tone="ok">resolved</Badge>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
          <IconButton
            icon={<CheckIcon size={12} />}
            title={comment.resolved ? 'Mark as open again' : 'Mark as resolved'}
            size={22}
            bare
            accent={comment.resolved}
            onClick={onToggleResolved}
          />
          {!editing && <IconButton icon={<EditIcon size={12} />} title="Edit" size={22} bare onClick={onStartEdit} />}
          <IconButton icon={<TrashIcon size={12} />} title="Delete" size={22} bare onClick={onDelete} />
        </span>
      </div>
    </div>
  );
}
