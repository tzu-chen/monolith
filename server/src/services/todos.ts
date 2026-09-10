import { readJsonStore, writeJsonStore, newId } from '../util/jsonStore.js';

/**
 * The project's to-do list — a flat checklist with deadlines and coloured
 * tags, stored as `<project>/.monolith/todos.json`.
 *
 * Tags are their own list so a colour or a name can change in one place;
 * items refer to them by id. A tag colour is one of a fixed set of names that
 * the client maps to a theme variable, so the list reads the same in both
 * colour schemes.
 */

export const TAG_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export interface TodoTag {
  id: string;
  name: string;
  color: TagColor;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  /** `YYYY-MM-DD`, or null for no deadline. */
  deadline: string | null;
  /** Tag ids. */
  tags: string[];
  createdAt: string;
  completedAt: string | null;
}

export interface TodoStore {
  version: 1;
  tags: TodoTag[];
  items: Todo[];
}

const FILE = 'todos.json';
const EMPTY: TodoStore = { version: 1, tags: [], items: [] };

export function isTagColor(v: unknown): v is TagColor {
  return typeof v === 'string' && (TAG_COLORS as readonly string[]).includes(v);
}

export function isDeadline(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

async function load(projectRoot: string): Promise<TodoStore> {
  const store = await readJsonStore<TodoStore>(projectRoot, FILE, EMPTY);
  return {
    version: 1,
    tags: Array.isArray(store.tags) ? store.tags : [],
    items: Array.isArray(store.items) ? store.items : [],
  };
}

function save(projectRoot: string, store: TodoStore): Promise<void> {
  return writeJsonStore(projectRoot, FILE, store);
}

export async function getTodos(projectRoot: string): Promise<TodoStore> {
  return load(projectRoot);
}

/** Keep only tag ids that exist, each once, in store order. */
function cleanTags(store: TodoStore, tags: string[]): string[] {
  const known = new Set(store.tags.map((t) => t.id));
  return store.tags.map((t) => t.id).filter((id) => known.has(id) && tags.includes(id));
}

export async function createTodo(
  projectRoot: string,
  input: { text: string; deadline: string | null; tags: string[] }
): Promise<Todo> {
  const store = await load(projectRoot);
  const todo: Todo = {
    id: newId(),
    text: input.text,
    done: false,
    deadline: input.deadline,
    tags: cleanTags(store, input.tags),
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  store.items.push(todo);
  await save(projectRoot, store);
  return todo;
}

export async function updateTodo(
  projectRoot: string,
  id: string,
  patch: { text?: string; done?: boolean; deadline?: string | null; tags?: string[] }
): Promise<Todo | null> {
  const store = await load(projectRoot);
  const idx = store.items.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const prev = store.items[idx];
  const done = patch.done ?? prev.done;
  const next: Todo = {
    ...prev,
    text: patch.text ?? prev.text,
    done,
    deadline: patch.deadline !== undefined ? patch.deadline : prev.deadline,
    tags: patch.tags !== undefined ? cleanTags(store, patch.tags) : prev.tags,
    completedAt: done ? (prev.done ? prev.completedAt : new Date().toISOString()) : null,
  };
  store.items[idx] = next;
  await save(projectRoot, store);
  return next;
}

export async function deleteTodo(projectRoot: string, id: string): Promise<boolean> {
  const store = await load(projectRoot);
  const before = store.items.length;
  store.items = store.items.filter((t) => t.id !== id);
  if (store.items.length === before) return false;
  await save(projectRoot, store);
  return true;
}

/** Remove every completed item; returns how many went. */
export async function clearDone(projectRoot: string): Promise<number> {
  const store = await load(projectRoot);
  const before = store.items.length;
  store.items = store.items.filter((t) => !t.done);
  const removed = before - store.items.length;
  if (removed) await save(projectRoot, store);
  return removed;
}

export async function createTag(projectRoot: string, input: { name: string; color: TagColor }): Promise<TodoTag> {
  const store = await load(projectRoot);
  const tag: TodoTag = { id: newId(), name: input.name, color: input.color };
  store.tags.push(tag);
  await save(projectRoot, store);
  return tag;
}

export async function updateTag(
  projectRoot: string,
  id: string,
  patch: { name?: string; color?: TagColor }
): Promise<TodoTag | null> {
  const store = await load(projectRoot);
  const idx = store.tags.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const next: TodoTag = { ...store.tags[idx], ...patch };
  store.tags[idx] = next;
  await save(projectRoot, store);
  return next;
}

/** Delete a tag and take it off every item that carried it. */
export async function deleteTag(projectRoot: string, id: string): Promise<boolean> {
  const store = await load(projectRoot);
  const before = store.tags.length;
  store.tags = store.tags.filter((t) => t.id !== id);
  if (store.tags.length === before) return false;
  store.items = store.items.map((t) => (t.tags.includes(id) ? { ...t, tags: t.tags.filter((x) => x !== id) } : t));
  await save(projectRoot, store);
  return true;
}
