/**
 * Client for `/api/todos` — the current project's to-do list.
 */

export const TAG_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

/** The theme variable behind a tag colour name. */
export function tagColorVar(color: TagColor): string {
  return `var(--tag-${color})`;
}

export interface TodoTag {
  id: string;
  name: string;
  color: TagColor;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  /** `YYYY-MM-DD`, or null. */
  deadline: string | null;
  tags: string[];
  createdAt: string;
  completedAt: string | null;
}

export interface TodoList {
  tags: TodoTag[];
  items: Todo[];
}

async function fail(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || `${fallback}: ${res.statusText}`);
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function listTodos(): Promise<TodoList> {
  const res = await fetch('/api/todos');
  if (!res.ok) return fail(res, 'Failed to load the to-do list');
  return res.json();
}

export async function createTodo(input: { text: string; deadline: string | null; tags: string[] }): Promise<Todo> {
  const res = await fetch('/api/todos', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) });
  if (!res.ok) return fail(res, 'Failed to add the item');
  return (await res.json()).todo;
}

export async function updateTodo(
  id: string,
  patch: { text?: string; done?: boolean; deadline?: string | null; tags?: string[] }
): Promise<Todo> {
  const res = await fetch(`/api/todos/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  if (!res.ok) return fail(res, 'Failed to update the item');
  return (await res.json()).todo;
}

export async function deleteTodo(id: string): Promise<void> {
  const res = await fetch(`/api/todos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) return fail(res, 'Failed to delete the item');
}

export async function clearDone(): Promise<number> {
  const res = await fetch('/api/todos/clear-done', { method: 'POST' });
  if (!res.ok) return fail(res, 'Failed to clear completed items');
  return (await res.json()).removed;
}

export async function createTag(input: { name: string; color: TagColor }): Promise<TodoTag> {
  const res = await fetch('/api/todos/tags', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) });
  if (!res.ok) return fail(res, 'Failed to add the tag');
  return (await res.json()).tag;
}

export async function updateTag(id: string, patch: { name?: string; color?: TagColor }): Promise<TodoTag> {
  const res = await fetch(`/api/todos/tags/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  if (!res.ok) return fail(res, 'Failed to update the tag');
  return (await res.json()).tag;
}

export async function deleteTag(id: string): Promise<void> {
  const res = await fetch(`/api/todos/tags/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) return fail(res, 'Failed to delete the tag');
}

// ── Deadlines ──

/** Today as `YYYY-MM-DD` in local time. */
export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Whole days from today to `deadline` (negative when it has passed). */
export function daysUntil(deadline: string): number {
  const [y, m, d] = deadline.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export type DeadlineTone = 'overdue' | 'soon' | 'later';

/** "today", "tomorrow", "in 3d", "2d overdue", "Mar 4", plus how urgent it reads. */
export function describeDeadline(deadline: string): { label: string; tone: DeadlineTone } {
  const days = daysUntil(deadline);
  if (days < 0) return { label: days === -1 ? '1d overdue' : `${-days}d overdue`, tone: 'overdue' };
  if (days === 0) return { label: 'today', tone: 'soon' };
  if (days === 1) return { label: 'tomorrow', tone: 'soon' };
  if (days <= 7) return { label: `in ${days}d`, tone: days <= 2 ? 'soon' : 'later' };
  const [y, m, d] = deadline.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return {
    label: date.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }),
    tone: 'later',
  };
}
