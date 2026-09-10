import { readJsonStore, writeJsonStore, newId } from '../util/jsonStore.js';

/**
 * Comments — notes attached to a file, or to one line of it.
 *
 * Stored as `<project>/.monolith/comments.json`. A comment with `line: null`
 * is about the whole document. A line comment also carries `anchor`, the
 * trimmed text of its line when it was placed (and each time the editor
 * reports it moved): when the file changes on disk behind the editor's back,
 * the client uses it to find the line again.
 */

export interface Comment {
  id: string;
  /** Project-relative path of the file the comment is on. */
  file: string;
  /** 1-based line, or null for a comment on the whole document. */
  line: number | null;
  anchor: string | null;
  text: string;
  resolved: boolean;
  /** ISO-8601. */
  createdAt: string;
  updatedAt: string;
}

interface Store {
  version: 1;
  comments: Comment[];
}

const FILE = 'comments.json';
const EMPTY: Store = { version: 1, comments: [] };

async function load(projectRoot: string): Promise<Store> {
  const store = await readJsonStore<Store>(projectRoot, FILE, EMPTY);
  return { version: 1, comments: Array.isArray(store.comments) ? store.comments : [] };
}

function save(projectRoot: string, store: Store): Promise<void> {
  return writeJsonStore(projectRoot, FILE, store);
}

export async function listComments(projectRoot: string): Promise<Comment[]> {
  return (await load(projectRoot)).comments;
}

export async function createComment(
  projectRoot: string,
  input: { file: string; line: number | null; anchor: string | null; text: string }
): Promise<Comment> {
  const store = await load(projectRoot);
  const now = new Date().toISOString();
  const comment: Comment = {
    id: newId(),
    file: input.file,
    line: input.line,
    anchor: input.line === null ? null : input.anchor,
    text: input.text,
    resolved: false,
    createdAt: now,
    updatedAt: now,
  };
  store.comments.push(comment);
  await save(projectRoot, store);
  return comment;
}

export async function updateComment(
  projectRoot: string,
  id: string,
  patch: { text?: string; resolved?: boolean }
): Promise<Comment | null> {
  const store = await load(projectRoot);
  const idx = store.comments.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const next: Comment = {
    ...store.comments[idx],
    ...(patch.text !== undefined ? { text: patch.text } : {}),
    ...(patch.resolved !== undefined ? { resolved: patch.resolved } : {}),
    updatedAt: new Date().toISOString(),
  };
  store.comments[idx] = next;
  await save(projectRoot, store);
  return next;
}

export async function deleteComment(projectRoot: string, id: string): Promise<boolean> {
  const store = await load(projectRoot);
  const before = store.comments.length;
  store.comments = store.comments.filter((c) => c.id !== id);
  if (store.comments.length === before) return false;
  await save(projectRoot, store);
  return true;
}

export interface CommentMove {
  id: string;
  line: number;
  anchor: string | null;
}

/**
 * The editor reports where its comments ended up after edits. Only the
 * position changes — a move never touches the text or the timestamps, so a
 * comment does not read as "edited" because a paragraph above it grew.
 */
export async function moveComments(projectRoot: string, moves: CommentMove[]): Promise<number> {
  const store = await load(projectRoot);
  const byId = new Map(moves.map((m) => [m.id, m]));
  let changed = 0;
  store.comments = store.comments.map((c) => {
    const m = byId.get(c.id);
    if (!m || c.line === null) return c;
    if (c.line === m.line && c.anchor === m.anchor) return c;
    changed++;
    return { ...c, line: m.line, anchor: m.anchor };
  });
  if (changed) await save(projectRoot, store);
  return changed;
}

function underPath(file: string, dir: string): boolean {
  return file === dir || file.startsWith(dir + '/');
}

/** Follow a file (or a directory of files) to its new path. */
export async function renamePath(projectRoot: string, from: string, to: string): Promise<number> {
  const store = await load(projectRoot);
  let changed = 0;
  store.comments = store.comments.map((c) => {
    if (!underPath(c.file, from)) return c;
    changed++;
    return { ...c, file: to + c.file.slice(from.length) };
  });
  if (changed) await save(projectRoot, store);
  return changed;
}

/** Drop the comments of a deleted file or directory. */
export async function removePath(projectRoot: string, target: string): Promise<number> {
  const store = await load(projectRoot);
  const before = store.comments.length;
  store.comments = store.comments.filter((c) => !underPath(c.file, target));
  const changed = before - store.comments.length;
  if (changed) await save(projectRoot, store);
  return changed;
}
