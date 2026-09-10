import { useEditorStore } from '../stores/editorStore';

/**
 * Client for `/api/comments` — the current project's comments.
 *
 * A comment sits on a file (`line: null`) or on one line of it. Line comments
 * are tracked by the editor while the file is edited; `queueMoves` batches
 * those position reports and sends them a moment after typing pauses.
 */

export interface Comment {
  id: string;
  file: string;
  /** 1-based line, or null for a comment on the whole document. */
  line: number | null;
  /** Trimmed text of the line when the comment was placed or last moved. */
  anchor: string | null;
  text: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommentMove {
  id: string;
  line: number;
  anchor: string | null;
}

async function fail(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || `${fallback}: ${res.statusText}`);
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function listComments(): Promise<Comment[]> {
  const res = await fetch('/api/comments');
  if (!res.ok) return fail(res, 'Failed to load comments');
  return (await res.json()).comments;
}

export async function createComment(input: {
  file: string;
  line: number | null;
  anchor: string | null;
  text: string;
}): Promise<Comment> {
  const res = await fetch('/api/comments', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) });
  if (!res.ok) return fail(res, 'Failed to add comment');
  return (await res.json()).comment;
}

export async function updateComment(id: string, patch: { text?: string; resolved?: boolean }): Promise<Comment> {
  const res = await fetch(`/api/comments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  if (!res.ok) return fail(res, 'Failed to update comment');
  return (await res.json()).comment;
}

export async function deleteComment(id: string): Promise<void> {
  const res = await fetch(`/api/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) return fail(res, 'Failed to delete comment');
}

async function sendMoves(moves: CommentMove[]): Promise<void> {
  const res = await fetch('/api/comments/moves', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ moves }) });
  if (!res.ok) return fail(res, 'Failed to move comments');
}

// ── Debounced position reports ──

const MOVE_DELAY_MS = 800;
let pending = new Map<string, CommentMove>();
let pendingProject: string | null = null;
let timer: number | null = null;

/**
 * Record where line comments now sit; sent after a pause. The batch is tied to
 * the project it was collected in, so a switch in between drops it rather than
 * writing one project's lines into another's store.
 */
export function queueMoves(moves: CommentMove[]): void {
  const project = useEditorStore.getState().currentProject;
  if (!project) return;
  if (pendingProject !== project) {
    pending = new Map();
    pendingProject = project;
  }
  for (const m of moves) pending.set(m.id, m);
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(flushMoves, MOVE_DELAY_MS);
}

export function flushMoves(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (pending.size === 0) return;
  const batch = [...pending.values()];
  const project = pendingProject;
  pending = new Map();
  if (project !== useEditorStore.getState().currentProject) return;
  sendMoves(batch).catch((err) => console.error('Failed to save comment positions:', err));
}
