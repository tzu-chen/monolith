/**
 * Client for `/api/versions` — the current project's version history.
 *
 * A revision is a version id or `WORKING`, the working tree. Every call is
 * scoped to the server's current project, like the rest of the API.
 */

export const WORKING = 'working';
/** The state before any version: diffing a first version against nothing. */
export const EMPTY = 'empty';

export type ChangeKind = 'added' | 'modified' | 'removed';

export interface ChangeStats {
  added: number;
  modified: number;
  removed: number;
}

export interface VersionSummary {
  id: string;
  /** 1-based position in the chain — shown as `v12`. */
  number: number;
  parent: string | null;
  message: string;
  /** ISO-8601. */
  createdAt: string;
  stats: ChangeStats;
  fileCount: number;
}

export interface Change {
  path: string;
  kind: ChangeKind;
}

export interface VersionStatus {
  head: VersionSummary | null;
  changes: Change[];
  /** Files left out of snapshots because they exceed the size cap. */
  skipped: string[];
}

export interface VersionFile {
  path: string;
  size: number;
  /** Absent when the file is unchanged from the parent version. */
  change?: ChangeKind;
}

export type DiffLineType = 'context' | 'add' | 'del';

export interface DiffLine {
  type: DiffLineType;
  text: string;
  oldNo?: number;
  newNo?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffSide {
  exists: boolean;
  size: number;
  binary: boolean;
}

export interface FileDiff {
  path: string;
  from: DiffSide;
  to: DiffSide;
  binary: boolean;
  tooLarge: boolean;
  identical: boolean;
  diff: { hunks: DiffHunk[]; added: number; removed: number };
}

export interface VersionFileContent {
  path: string;
  binary: boolean;
  size: number;
  content?: string;
}

export interface RestoreResult {
  written: string[];
  removed: string[];
}

async function fail(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || `${fallback}: ${res.statusText}`);
}

export async function listVersions(): Promise<{ head: string | null; versions: VersionSummary[] }> {
  const res = await fetch('/api/versions');
  if (!res.ok) return fail(res, 'Failed to load versions');
  return res.json();
}

export async function versionStatus(): Promise<VersionStatus> {
  const res = await fetch('/api/versions/status');
  if (!res.ok) return fail(res, 'Failed to read changes');
  return res.json();
}

/** Save a version. With `paths`, only those files are taken from the working tree. */
export async function saveVersion(message: string, paths?: string[]): Promise<VersionSummary> {
  const res = await fetch('/api/versions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paths ? { message, paths } : { message }),
  });
  if (!res.ok) return fail(res, 'Failed to save version');
  const data = await res.json();
  const { files, ...summary } = data.version;
  return { ...summary, fileCount: Object.keys(files ?? {}).length };
}

export async function getVersion(id: string): Promise<{ version: VersionSummary; files: VersionFile[] }> {
  const res = await fetch(`/api/versions/${encodeURIComponent(id)}`);
  if (!res.ok) return fail(res, 'Failed to load version');
  return res.json();
}

export async function setVersionMessage(id: string, message: string): Promise<VersionSummary> {
  const res = await fetch(`/api/versions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) return fail(res, 'Failed to relabel version');
  const data = await res.json();
  return data.version;
}

export async function diffFile(path: string, from: string, to: string): Promise<FileDiff> {
  const qs = new URLSearchParams({ path, from, to });
  const res = await fetch(`/api/versions/diff?${qs}`);
  if (!res.ok) return fail(res, 'Failed to diff');
  return res.json();
}

export async function versionFileContent(id: string, path: string): Promise<VersionFileContent> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(`/api/versions/${encodeURIComponent(id)}/file?${qs}`);
  if (!res.ok) return fail(res, 'Failed to read file');
  return res.json();
}

/** Restore the whole version, or with `paths` only those files. */
export async function restoreVersion(id: string, paths?: string[]): Promise<RestoreResult> {
  const res = await fetch(`/api/versions/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paths ? { paths } : {}),
  });
  if (!res.ok) return fail(res, 'Failed to restore');
  return res.json();
}

export async function downloadVersionZip(id: string): Promise<Blob> {
  const res = await fetch(`/api/versions/${encodeURIComponent(id)}/download`);
  if (!res.ok) return fail(res, 'Download failed');
  return res.blob();
}
