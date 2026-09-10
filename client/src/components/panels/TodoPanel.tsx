import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { CalendarIcon, TagIcon, TrashIcon, ChevronDown, ChevronRight, PlusIcon } from '../shared/Icons';
import {
  PanelHeader,
  PanelBody,
  OutlinedButton,
  IconButton,
  Checkbox,
  Dot,
  SectionLabel,
  EmptyState,
  rowStyle,
  hoverRow,
  leaveRow,
} from '../shared/ui';
import { fs, font, metrics, radius, motion } from '../../theme/tokens';
import * as todosApi from '../../lib/todos-api';
import {
  TAG_COLORS,
  tagColorVar,
  describeDeadline,
  type Todo,
  type TodoTag,
  type TagColor,
  type DeadlineTone,
} from '../../lib/todos-api';

/**
 * To-do panel — the project's checklist.
 *
 * A flat list with deadlines and coloured tags. Open items come first, soonest
 * deadline at the top and undated ones after; completed items sit in a folded
 * section below. Clicking an item opens it in place for its text, deadline and
 * tags. Tags are a fixed palette of theme hues so they read the same in both
 * schemes; a tag appears on a row as a 6px dot, the one solid fill the design
 * allows outside paper, and by name in the item's editor and the filters.
 *
 * The list is per project (`<project>/.monolith/todos.json`) and is re-read
 * whenever the server says it changed, so two tabs stay in step.
 */

const TONE_COLOR: Record<DeadlineTone, string> = {
  overdue: 'var(--error)',
  soon: 'var(--warn)',
  later: 'var(--text-faint)',
};

const inputStyle: React.CSSProperties = {
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

function focusStrong(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = 'var(--line-strong)';
}
function blurLine(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = 'var(--line)';
}

/** A native date field, outlined like every other input. */
function DateInput({
  value,
  onChange,
  title,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  title?: string;
}) {
  const theme = useEditorStore((s) => s.theme);
  return (
    <input
      type="date"
      value={value ?? ''}
      title={title ?? 'Deadline'}
      onChange={(e) => onChange(e.target.value || null)}
      onClick={(e) => e.stopPropagation()}
      onFocus={focusStrong}
      onBlur={blurLine}
      style={{
        ...inputStyle,
        fontSize: fs.meta,
        padding: '3px 7px',
        // The picker is a native widget: without this it draws light in Graphite.
        colorScheme: theme,
        color: value ? 'var(--text)' : 'var(--text-faint)',
      }}
    />
  );
}

/** Tag chip: outlined, with the tag's dot; in the tag's colour when active. */
function TagPill({
  tag,
  active,
  onClick,
  title,
}: {
  tag: TodoTag;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const color = tagColorVar(tag.color);
  return (
    <span
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick();
      }}
      title={title ?? tag.name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: `1px solid ${active ? color : 'var(--line)'}`,
        borderRadius: radius.pill,
        padding: '2px 9px 2px 7px',
        fontFamily: font.ui,
        fontSize: fs.meta,
        color: active ? 'var(--text)' : 'var(--text-muted)',
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        maxWidth: 160,
        transition: `color ${motion.color}, border-color ${motion.color}`,
      }}
    >
      <Dot color={color} filled />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag.name}</span>
    </span>
  );
}

/** Colour choice: the 6px dot of each hue, ringed when selected. */
function ColorPicker({ value, onChange }: { value: TagColor; onChange: (c: TagColor) => void }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {TAG_COLORS.map((c) => (
        <span
          key={c}
          role="radio"
          aria-checked={value === c}
          title={c}
          onClick={(e) => {
            e.stopPropagation();
            onChange(c);
          }}
          style={{
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${value === c ? tagColorVar(c) : 'transparent'}`,
            borderRadius: '50%',
            cursor: 'pointer',
          }}
        >
          <Dot color={tagColorVar(c)} filled />
        </span>
      ))}
    </span>
  );
}

function DeadlineChip({ deadline, done }: { deadline: string; done: boolean }) {
  const { label, tone } = describeDeadline(deadline);
  return (
    <span
      title={`Due ${deadline}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: fs.meta,
        color: done ? 'var(--text-faint)' : TONE_COLOR[tone],
        flexShrink: 0,
      }}
    >
      <CalendarIcon size={11} />
      {label}
    </span>
  );
}

function TodoRow({
  todo,
  tags,
  open,
  onToggleOpen,
  onChange,
  onDelete,
}: {
  todo: Todo;
  tags: TodoTag[];
  open: boolean;
  onToggleOpen: () => void;
  onChange: (patch: Parameters<typeof todosApi.updateTodo>[1]) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(todo.text);
  useEffect(() => setText(todo.text), [todo.text]);
  const itemTags = tags.filter((t) => todo.tags.includes(t.id));

  const commitText = () => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== todo.text) onChange({ text: trimmed });
    else setText(todo.text);
  };

  return (
    <div
      onClick={onToggleOpen}
      onMouseEnter={(e) => hoverRow(e, open)}
      onMouseLeave={(e) => leaveRow(e, open)}
      style={rowStyle(open, {
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 6,
        padding: `7px ${metrics.padPanel}px`,
        borderBottom: '1px solid var(--line-faint)',
        whiteSpace: 'normal',
      })}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, minWidth: 0 }}>
        <span style={{ paddingTop: 2 }}>
          <Checkbox
            checked={todo.done}
            onChange={() => onChange({ done: !todo.done })}
            title={todo.done ? 'Mark as not done' : 'Mark as done'}
          />
        </span>
        {open ? (
          <input
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitText();
                onToggleOpen();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setText(todo.text);
                onToggleOpen();
              }
            }}
            maxLength={2000}
            style={{ ...inputStyle, flex: 1, padding: '2px 7px', borderColor: 'var(--line-strong)' }}
          />
        ) : (
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: fs.row,
              lineHeight: 1.4,
              color: todo.done ? 'var(--text-faint)' : undefined,
              textDecoration: todo.done ? 'line-through' : undefined,
              textDecorationColor: 'var(--line-strong)',
              wordBreak: 'break-word',
            }}
          >
            {todo.text}
          </span>
        )}
      </div>

      {!open && (todo.deadline || itemTags.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 26, minWidth: 0 }}>
          {todo.deadline && <DeadlineChip deadline={todo.deadline} done={todo.done} />}
          {itemTags.length > 0 && (
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} title={itemTags.map((t) => t.name).join(', ')}>
              {itemTags.map((t) => (
                <Dot key={t.id} color={tagColorVar(t.color)} filled />
              ))}
            </span>
          )}
        </div>
      )}

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingLeft: 26 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <DateInput value={todo.deadline} onChange={(deadline) => onChange({ deadline })} />
            {todo.deadline && (
              <button
                onClick={() => onChange({ deadline: null })}
                title="Remove the deadline"
                style={{ fontSize: fs.meta, color: 'var(--text-faint)', cursor: 'pointer', padding: 0 }}
              >
                clear
              </button>
            )}
            <span style={{ marginLeft: 'auto' }}>
              <IconButton icon={<TrashIcon size={12} />} title="Delete the item" size={24} onClick={onDelete} />
            </span>
          </div>
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {tags.map((t) => {
                const on = todo.tags.includes(t.id);
                return (
                  <TagPill
                    key={t.id}
                    tag={t}
                    active={on}
                    title={on ? `Remove “${t.name}”` : `Add “${t.name}”`}
                    onClick={() =>
                      onChange({ tags: on ? todo.tags.filter((id) => id !== t.id) : [...todo.tags, t.id] })
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TagManager({
  tags,
  onCreate,
  onUpdate,
  onDelete,
}: {
  tags: TodoTag[];
  onCreate: (name: string, color: TagColor) => void;
  onUpdate: (id: string, patch: { name?: string; color?: TagColor }) => void;
  onDelete: (tag: TodoTag) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<TagColor>('blue');
  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, color);
    setName('');
  };
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: `8px ${metrics.padPanel}px 10px`,
        borderBottom: '1px solid var(--line)',
        flexShrink: 0,
      }}
    >
      <SectionLabel>Tags</SectionLabel>
      {tags.map((t) => (
        <TagEditor key={t.id} tag={t} onUpdate={(patch) => onUpdate(t.id, patch)} onDelete={() => onDelete(t)} />
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="New tag…"
          maxLength={40}
          onFocus={focusStrong}
          onBlur={blurLine}
          style={{ ...inputStyle, flex: 1, padding: '3px 8px' }}
        />
        <ColorPicker value={color} onChange={setColor} />
        <IconButton icon={<PlusIcon size={12} />} title="Add the tag (Enter)" size={24} accent={!!name.trim()} onClick={add} />
      </div>
    </div>
  );
}

function TagEditor({
  tag,
  onUpdate,
  onDelete,
}: {
  tag: TodoTag;
  onUpdate: (patch: { name?: string; color?: TagColor }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(tag.name);
  useEffect(() => setName(tag.name), [tag.name]);
  const commit = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== tag.name) onUpdate({ name: trimmed });
    else setName(tag.name);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <Dot color={tagColorVar(tag.color)} filled />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          }
        }}
        maxLength={40}
        onFocus={focusStrong}
        style={{ ...inputStyle, flex: 1, padding: '3px 8px', borderColor: 'transparent' }}
        title="Rename the tag"
      />
      <ColorPicker value={tag.color} onChange={(color) => onUpdate({ color })} />
      <IconButton icon={<TrashIcon size={12} />} title="Delete the tag from every item" size={24} onClick={onDelete} />
    </div>
  );
}

/** Soonest deadline first, undated after, then oldest first. */
function orderOpen(a: Todo, b: Todo): number {
  if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline);
  if (a.deadline && !b.deadline) return -1;
  if (!a.deadline && b.deadline) return 1;
  return a.createdAt.localeCompare(b.createdAt);
}

function orderDone(a: Todo, b: Todo): number {
  return (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
}

export default function TodoPanel() {
  const currentProject = useEditorStore((s) => s.currentProject);
  const todosNonce = useEditorStore((s) => s.todosNonce);
  const invalidateTodos = useEditorStore((s) => s.invalidateTodos);

  const [tags, setTags] = useState<TodoTag[]>([]);
  const [items, setItems] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [composing, setComposing] = useState(false);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [manageTags, setManageTags] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fail = useCallback((err: unknown) => {
    setError(String((err as Error).message || err));
    window.setTimeout(() => setError(null), 4000);
  }, []);

  useEffect(() => {
    if (!currentProject) {
      setTags([]);
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    todosApi
      .listTodos()
      .then((list) => {
        if (cancelled) return;
        setTags(list.tags);
        setItems(list.items);
      })
      .catch((err) => !cancelled && fail(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [currentProject, todosNonce, fail]);

  /** Run a mutation, then re-read — the broadcast covers other tabs. */
  const mutate = useCallback(
    async (op: () => Promise<unknown>) => {
      try {
        await op();
        invalidateTodos();
      } catch (err) {
        fail(err);
      }
    },
    [invalidateTodos, fail]
  );

  const add = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    mutate(() => todosApi.createTodo({ text: trimmed, deadline, tags: newTags }));
    setText('');
    setDeadline(null);
    setNewTags([]);
    inputRef.current?.focus();
  }, [text, deadline, newTags, mutate]);

  const filtered = useMemo(
    () => (filterTags.length === 0 ? items : items.filter((t) => filterTags.every((id) => t.tags.includes(id)))),
    [items, filterTags]
  );
  const open = useMemo(() => filtered.filter((t) => !t.done).sort(orderOpen), [filtered]);
  const done = useMemo(() => filtered.filter((t) => t.done).sort(orderDone), [filtered]);
  const overdue = open.filter((t) => t.deadline && describeDeadline(t.deadline).tone === 'overdue').length;

  if (!currentProject) {
    return (
      <>
        <PanelHeader title="To do" />
        <EmptyState>Open a project to see its list.</EmptyState>
      </>
    );
  }

  const showDetails = composing || text.trim() !== '' || deadline !== null || newTags.length > 0;

  return (
    <>
      <PanelHeader title="To do">
        {open.length > 0 && (
          <span
            style={{ fontFamily: font.mono, fontSize: fs.meta, color: overdue ? 'var(--error)' : 'var(--text-faint)' }}
            title={overdue ? `${open.length} open, ${overdue} overdue` : `${open.length} open`}
          >
            {open.length}
          </span>
        )}
        <IconButton
          icon={<TagIcon size={13} />}
          title={manageTags ? 'Hide the tag editor' : 'Add, rename and recolour tags'}
          size={24}
          active={manageTags}
          onClick={() => setManageTags((v) => !v)}
        />
      </PanelHeader>

      {manageTags && (
        <TagManager
          tags={tags}
          onCreate={(name, color) => mutate(() => todosApi.createTag({ name, color }))}
          onUpdate={(id, patch) => mutate(() => todosApi.updateTag(id, patch))}
          onDelete={(tag) => {
            if (window.confirm(`Delete the tag “${tag.name}”? It is removed from every item.`)) {
              mutate(() => todosApi.deleteTag(tag.id));
            }
          }}
        />
      )}

      {/* New item. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          padding: `9px ${metrics.padPanel}px`,
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => {
              focusStrong(e);
              setComposing(true);
            }}
            onBlur={(e) => {
              blurLine(e);
              // Let a click on the details row land before it folds away.
              window.setTimeout(() => setComposing(false), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add a task…"
            maxLength={2000}
            style={{ ...inputStyle, flex: 1 }}
          />
          <IconButton icon={<PlusIcon size={13} />} title="Add the task (Enter)" size={28} accent={!!text.trim()} onClick={add} />
        </div>
        {showDetails && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
            onMouseDown={() => setComposing(true)}
          >
            <DateInput value={deadline} onChange={setDeadline} title="Deadline for the new task" />
            {tags.map((t) => {
              const on = newTags.includes(t.id);
              return (
                <TagPill
                  key={t.id}
                  tag={t}
                  active={on}
                  onClick={() => setNewTags(on ? newTags.filter((id) => id !== t.id) : [...newTags, t.id])}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Tag filter. */}
      {tags.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            flexWrap: 'wrap',
            padding: `8px ${metrics.padPanel}px`,
            borderBottom: '1px solid var(--line)',
            flexShrink: 0,
          }}
        >
          {tags.map((t) => {
            const on = filterTags.includes(t.id);
            return (
              <TagPill
                key={t.id}
                tag={t}
                active={on}
                title={on ? `Stop filtering by “${t.name}”` : `Show only “${t.name}”`}
                onClick={() => setFilterTags(on ? filterTags.filter((id) => id !== t.id) : [...filterTags, t.id])}
              />
            );
          })}
          {filterTags.length > 0 && (
            <button
              onClick={() => setFilterTags([])}
              style={{ fontSize: fs.meta, color: 'var(--text-faint)', cursor: 'pointer', padding: '0 4px' }}
            >
              clear
            </button>
          )}
        </div>
      )}

      <PanelBody>
        {loading && items.length === 0 ? (
          <EmptyState>Loading…</EmptyState>
        ) : items.length === 0 ? (
          <EmptyState>Nothing to do yet. Add a task above; give it a deadline and tags once it is in the list.</EmptyState>
        ) : open.length === 0 && done.length === 0 ? (
          <EmptyState>No items carry every selected tag.</EmptyState>
        ) : (
          <>
            {open.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                tags={tags}
                open={openId === t.id}
                onToggleOpen={() => setOpenId((id) => (id === t.id ? null : t.id))}
                onChange={(patch) => mutate(() => todosApi.updateTodo(t.id, patch))}
                onDelete={() => {
                  setOpenId(null);
                  mutate(() => todosApi.deleteTodo(t.id));
                }}
              />
            ))}
            {open.length === 0 && (
              <div style={{ padding: `14px ${metrics.padPanel}px`, fontSize: fs.control, color: 'var(--text-faint)', textAlign: 'center' }}>
                All done.
              </div>
            )}

            {done.length > 0 && (
              <>
                <div
                  onClick={() => setShowDone((v) => !v)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: `10px ${metrics.padPanel}px 6px`,
                    cursor: 'pointer',
                    color: 'var(--text-faint)',
                  }}
                >
                  {showDone ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <SectionLabel>Done</SectionLabel>
                  <span style={{ fontSize: fs.meta }}>{done.length}</span>
                  {showDone && (
                    <span style={{ marginLeft: 'auto' }} onClick={(e) => e.stopPropagation()}>
                      <OutlinedButton
                        onClick={() => {
                          if (window.confirm(`Remove ${done.length} completed item${done.length === 1 ? '' : 's'}?`)) {
                            mutate(() => todosApi.clearDone());
                          }
                        }}
                        title="Remove every completed item"
                        style={{ padding: '2px 8px' }}
                      >
                        Clear
                      </OutlinedButton>
                    </span>
                  )}
                </div>
                {showDone &&
                  done.map((t) => (
                    <TodoRow
                      key={t.id}
                      todo={t}
                      tags={tags}
                      open={openId === t.id}
                      onToggleOpen={() => setOpenId((id) => (id === t.id ? null : t.id))}
                      onChange={(patch) => mutate(() => todosApi.updateTodo(t.id, patch))}
                      onDelete={() => {
                        setOpenId(null);
                        mutate(() => todosApi.deleteTodo(t.id));
                      }}
                    />
                  ))}
              </>
            )}
          </>
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
