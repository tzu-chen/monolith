import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { safePath } from '../util/safePath.js';
import { diffText, type LineDiff } from '../util/diff.js';

/**
 * Per-project version history.
 *
 * A project's history is a linear chain of versions, each a full snapshot of
 * the project's files, kept under the project's own `.monolith/versions/`:
 *
 *   objects/<sha256>     one blob per distinct file content (content-addressed,
 *                        so a figure that never changes is stored once however
 *                        many versions include it)
 *   commits/<id>.json    one manifest per version: message, time, parent, and
 *                        the path → blob map
 *   HEAD                 id of the newest version
 *
 * Nothing here shells out: the store is plain files, so it works wherever
 * Monolith runs and travels with the project directory. It lives beside the
 * archive marker and main-file marker for the same reasons they do — it moves
 * with a rename and is dropped on duplicate (a copy starts a fresh history).
 *
 * "Restore" writes a version's files back into the working tree and records
 * nothing itself: the working tree then shows as changed against HEAD, and the
 * user saves a new version when ready. History is append-only.
 */

export interface FileEntry {
  sha: string;
  size: number;
}

export interface Version {
  id: string;
  /** 1-based position in the chain — what the UI calls `v12`. */
  number: number;
  parent: string | null;
  message: string;
  /** ISO-8601. */
  createdAt: string;
  files: Record<string, FileEntry>;
  stats: ChangeStats;
}

export type VersionSummary = Omit<Version, 'files'> & { fileCount: number };

export type ChangeKind = 'added' | 'modified' | 'removed';

export interface Change {
  path: string;
  kind: ChangeKind;
}

export interface ChangeStats {
  added: number;
  modified: number;
  removed: number;
}

export interface Status {
  head: VersionSummary | null;
  changes: Change[];
  /** Files left out of snapshots (over the size cap). */
  skipped: string[];
}

/** One side of a file diff. */
export interface DiffSide {
  exists: boolean;
  size: number;
  binary: boolean;
}

export interface FileDiff {
  path: string;
  from: DiffSide;
  to: DiffSide;
  /** True when either side is not text; hunks are then empty. */
  binary: boolean;
  /** True when either side exceeds the diff size cap; hunks are then empty. */
  tooLarge: boolean;
  identical: boolean;
  diff: LineDiff;
}

export interface RestoreResult {
  written: string[];
  removed: string[];
}

/** A file as it exists inside a version, with how it changed from the parent. */
export interface VersionFile {
  path: string;
  size: number;
  /** Absent when unchanged from the parent version. */
  change?: ChangeKind;
}

/** The working tree, addressed the same way a version is. */
export const WORKING = 'working';
/** The state before any version: no files. Diffs a first version from nothing. */
export const EMPTY = 'empty';

const STORE_DIR = path.join('.monolith', 'versions');
const OBJECTS_DIR = 'objects';
const COMMITS_DIR = 'commits';
const HEAD_FILE = 'HEAD';

/** Top-level directories that are never part of a snapshot. */
const EXCLUDED_DIRS = new Set(['build', 'node_modules', '.monolith']);

/** TeX intermediates that may be lying around between compiles. */
const EXCLUDED_EXTS = new Set([
  '.aux', '.log', '.bbl', '.blg', '.out', '.toc', '.lof', '.lot',
  '.fls', '.fdb_latexmk', '.nav', '.snm', '.vrb', '.xdv',
]);

/** Files above this are left out of snapshots and reported as skipped. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Above this, a text diff is not attempted. */
const MAX_DIFF_BYTES = 4 * 1024 * 1024;

const ID_RE = /^[0-9a-f]{64}$/;

export function isVersionId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

function storeDir(projectRoot: string): string {
  return path.join(projectRoot, STORE_DIR);
}

function objectPath(projectRoot: string, sha: string): string {
  return path.join(storeDir(projectRoot), OBJECTS_DIR, sha);
}

function commitPath(projectRoot: string, id: string): string {
  return path.join(storeDir(projectRoot), COMMITS_DIR, `${id}.json`);
}

function sha256(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** Write via a temp file so a crash never leaves a half-written object. */
async function writeAtomic(target: string, data: Buffer | string): Promise<void> {
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, target);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ── Serialisation ──
//
// Mutations on one project run one at a time; two clients saving versions in
// the same instant must not both read the same HEAD and race to replace it.

const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(projectRoot: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(projectRoot) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  locks.set(projectRoot, run.catch(() => undefined));
  try {
    return await run;
  } finally {
    if (locks.get(projectRoot) === run) locks.delete(projectRoot);
  }
}

// ── Working tree ──

interface WorkingFile {
  abs: string;
  sha: string;
  size: number;
}

/**
 * Hashes keyed by absolute path, valid while the file's mtime and size are
 * unchanged. Status runs after every autosave, and re-hashing every figure in
 * the project each time would be waste.
 */
const hashCache = new Map<string, { mtimeMs: number; size: number; sha: string }>();

function isExcludedFile(name: string): boolean {
  if (name.startsWith('.')) return true;
  const lower = name.toLowerCase();
  if (lower.endsWith('.synctex.gz')) return true;
  return EXCLUDED_EXTS.has(path.extname(lower));
}

/** Every file that belongs in a snapshot, keyed by forward-slash relative path. */
async function scanWorkingTree(
  projectRoot: string
): Promise<{ files: Map<string, WorkingFile>; skipped: string[] }> {
  const files = new Map<string, WorkingFile>();
  const skipped: string[] = [];

  async function walk(dir: string, top: boolean): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        if (top && EXCLUDED_DIRS.has(entry.name)) continue;
        if (entry.name === 'node_modules') continue;
        await walk(path.join(dir, entry.name), false);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isExcludedFile(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(projectRoot, abs).split(path.sep).join('/');
      let st;
      try {
        st = await fs.stat(abs);
      } catch {
        continue;
      }
      if (st.size > MAX_FILE_BYTES) {
        skipped.push(rel);
        continue;
      }
      const cached = hashCache.get(abs);
      let sha: string;
      if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
        sha = cached.sha;
      } else {
        let bytes: Buffer;
        try {
          bytes = await fs.readFile(abs);
        } catch {
          continue;
        }
        sha = sha256(bytes);
        hashCache.set(abs, { mtimeMs: st.mtimeMs, size: st.size, sha });
      }
      files.set(rel, { abs, sha, size: st.size });
    }
  }

  await walk(projectRoot, true);
  skipped.sort();
  return { files, skipped };
}

// ── Reading versions ──

async function readVersion(projectRoot: string, id: string): Promise<Version | null> {
  if (!isVersionId(id)) return null;
  try {
    const raw = await fs.readFile(commitPath(projectRoot, id), 'utf-8');
    const v = JSON.parse(raw) as Version;
    if (v.id !== id || typeof v.files !== 'object') return null;
    return v;
  } catch {
    return null;
  }
}

async function readHeadId(projectRoot: string): Promise<string | null> {
  try {
    const id = (await fs.readFile(path.join(storeDir(projectRoot), HEAD_FILE), 'utf-8')).trim();
    return isVersionId(id) ? id : null;
  } catch {
    return null;
  }
}

function summarise(v: Version): VersionSummary {
  const { files, ...rest } = v;
  return { ...rest, fileCount: Object.keys(files).length };
}

/** The newest version, or null for a project with no history yet. */
export async function getHead(projectRoot: string): Promise<Version | null> {
  const id = await readHeadId(projectRoot);
  return id ? readVersion(projectRoot, id) : null;
}

/** Every version, newest first, by walking the parent chain from HEAD. */
export async function listVersions(projectRoot: string): Promise<VersionSummary[]> {
  const out: VersionSummary[] = [];
  const seen = new Set<string>();
  let id = await readHeadId(projectRoot);
  while (id && !seen.has(id)) {
    seen.add(id);
    const v = await readVersion(projectRoot, id);
    if (!v) break;
    out.push(summarise(v));
    id = v.parent;
  }
  return out;
}

export async function getVersion(projectRoot: string, id: string): Promise<Version | null> {
  return readVersion(projectRoot, id);
}

/** The files of a version, each marked with how it changed from its parent. */
export async function versionFiles(projectRoot: string, v: Version): Promise<VersionFile[]> {
  const parent = v.parent ? await readVersion(projectRoot, v.parent) : null;
  const parentFiles = parent?.files ?? {};
  const out: VersionFile[] = [];
  for (const [p, entry] of Object.entries(v.files)) {
    const before = parentFiles[p];
    const change: ChangeKind | undefined = !before ? 'added' : before.sha !== entry.sha ? 'modified' : undefined;
    out.push(change ? { path: p, size: entry.size, change } : { path: p, size: entry.size });
  }
  for (const [p, entry] of Object.entries(parentFiles)) {
    if (!(p in v.files)) out.push({ path: p, size: entry.size, change: 'removed' });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

// ── Status ──

function compareTrees(
  before: Record<string, FileEntry>,
  after: Record<string, FileEntry>
): Change[] {
  const changes: Change[] = [];
  for (const [p, entry] of Object.entries(after)) {
    const prev = before[p];
    if (!prev) changes.push({ path: p, kind: 'added' });
    else if (prev.sha !== entry.sha) changes.push({ path: p, kind: 'modified' });
  }
  for (const p of Object.keys(before)) {
    if (!(p in after)) changes.push({ path: p, kind: 'removed' });
  }
  changes.sort((a, b) => a.path.localeCompare(b.path));
  return changes;
}

function statsOf(changes: Change[]): ChangeStats {
  const stats: ChangeStats = { added: 0, modified: 0, removed: 0 };
  for (const c of changes) stats[c.kind]++;
  return stats;
}

function toEntries(files: Map<string, WorkingFile>): Record<string, FileEntry> {
  const out: Record<string, FileEntry> = {};
  for (const [p, f] of files) out[p] = { sha: f.sha, size: f.size };
  return out;
}

/** What has changed in the working tree since HEAD. */
export async function status(projectRoot: string): Promise<Status> {
  const [head, tree] = await Promise.all([getHead(projectRoot), scanWorkingTree(projectRoot)]);
  const changes = compareTrees(head?.files ?? {}, toEntries(tree.files));
  return { head: head ? summarise(head) : null, changes, skipped: tree.skipped };
}

// ── Creating versions ──

/**
 * Snapshot the working tree as a new version. With `paths`, only those files
 * are taken from the working tree and every other file is carried over from
 * HEAD unchanged — a partial save, like staging a subset.
 */
export async function createVersion(
  projectRoot: string,
  message: string,
  paths?: string[]
): Promise<Version> {
  return withLock(projectRoot, async () => {
    const [head, tree] = await Promise.all([getHead(projectRoot), scanWorkingTree(projectRoot)]);
    const working = toEntries(tree.files);

    let files: Record<string, FileEntry>;
    if (paths && paths.length > 0) {
      files = { ...(head?.files ?? {}) };
      for (const p of paths) {
        if (p in working) files[p] = working[p];
        else delete files[p];
      }
    } else {
      files = working;
    }

    const changes = compareTrees(head?.files ?? {}, files);
    if (changes.length === 0) {
      throw new NoChangesError();
    }

    const dir = storeDir(projectRoot);
    await fs.mkdir(path.join(dir, OBJECTS_DIR), { recursive: true });
    await fs.mkdir(path.join(dir, COMMITS_DIR), { recursive: true });

    // Store the blobs that are new to the store. Only changed files can need
    // it, but checking every entry keeps a store with a missing object
    // self-healing on the next save.
    for (const [p, entry] of Object.entries(files)) {
      const target = objectPath(projectRoot, entry.sha);
      if (await exists(target)) continue;
      const wf = tree.files.get(p);
      if (!wf) continue;
      const bytes = await fs.readFile(wf.abs);
      const sha = sha256(bytes);
      if (sha !== entry.sha) {
        // Changed between scan and read — take what is on disk now.
        files[p] = { sha, size: bytes.length };
        hashCache.delete(wf.abs);
      }
      await writeAtomic(objectPath(projectRoot, sha), bytes);
    }

    const createdAt = new Date().toISOString();
    const body = {
      number: (head?.number ?? 0) + 1,
      parent: head?.id ?? null,
      message: message.trim(),
      createdAt,
      files,
      stats: statsOf(compareTrees(head?.files ?? {}, files)),
    };
    const id = sha256(Buffer.from(JSON.stringify({ parent: body.parent, createdAt, files }), 'utf-8'));
    const version: Version = { id, ...body };
    await writeAtomic(commitPath(projectRoot, id), JSON.stringify(version, null, 2));
    await writeAtomic(path.join(dir, HEAD_FILE), id + '\n');
    return version;
  });
}

export class NoChangesError extends Error {
  constructor() {
    super('Nothing has changed since the last version');
    this.name = 'NoChangesError';
  }
}

/** Relabel a version. The id does not change: it is derived from the content. */
export async function setMessage(projectRoot: string, id: string, message: string): Promise<Version> {
  return withLock(projectRoot, async () => {
    const v = await readVersion(projectRoot, id);
    if (!v) throw new Error('Version does not exist');
    const next = { ...v, message: message.trim() };
    await writeAtomic(commitPath(projectRoot, id), JSON.stringify(next, null, 2));
    return next;
  });
}

// ── Reading file content ──

async function readBlob(projectRoot: string, sha: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(objectPath(projectRoot, sha));
  } catch {
    return null;
  }
}

/** The bytes of `relPath` in a version, or null when the version lacks it. */
export async function readVersionFile(
  projectRoot: string,
  v: Version,
  relPath: string
): Promise<Buffer | null> {
  const entry = v.files[relPath];
  if (!entry) return null;
  return readBlob(projectRoot, entry.sha);
}

/** A NUL byte in the head of the file is the usual tell for binary content. */
export function looksBinary(bytes: Buffer): boolean {
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}

// ── Diff ──

/**
 * Resolve a revision selector — a version id or `working` — to the bytes of
 * one file, or null when it has no such file.
 */
async function fileAt(projectRoot: string, rev: string, relPath: string): Promise<Buffer | null> {
  if (rev === EMPTY) return null;
  if (rev === WORKING) {
    const abs = safePath(relPath, projectRoot);
    if (!abs) return null;
    try {
      const st = await fs.stat(abs);
      if (!st.isFile()) return null;
      return await fs.readFile(abs);
    } catch {
      return null;
    }
  }
  const v = await readVersion(projectRoot, rev);
  if (!v) throw new Error('Version does not exist');
  return readVersionFile(projectRoot, v, relPath);
}

function side(bytes: Buffer | null): DiffSide {
  if (!bytes) return { exists: false, size: 0, binary: false };
  return { exists: true, size: bytes.length, binary: looksBinary(bytes) };
}

/** Diff one file between two revisions (each a version id or `working`). */
export async function diffFile(
  projectRoot: string,
  relPath: string,
  fromRev: string,
  toRev: string
): Promise<FileDiff> {
  const [before, after] = await Promise.all([
    fileAt(projectRoot, fromRev, relPath),
    fileAt(projectRoot, toRev, relPath),
  ]);
  const from = side(before);
  const to = side(after);
  const binary = from.binary || to.binary;
  const tooLarge = from.size > MAX_DIFF_BYTES || to.size > MAX_DIFF_BYTES;
  const identical =
    (!before && !after) || (!!before && !!after && before.equals(after));
  const empty: LineDiff = { hunks: [], added: 0, removed: 0 };
  if (binary || tooLarge || identical) {
    return { path: relPath, from, to, binary, tooLarge, identical, diff: empty };
  }
  const diff = diffText(before ? before.toString('utf-8') : '', after ? after.toString('utf-8') : '');
  return { path: relPath, from, to, binary, tooLarge, identical, diff };
}

// ── Restore ──

/**
 * Write a version's files back into the working tree.
 *
 * With `paths`, only those files are restored: each is written from the
 * version, or deleted when the version does not have it. Without `paths`, the
 * whole version is restored: every file in it is written, and a file that HEAD
 * tracks but the version lacks is removed. Files HEAD has never seen — new work
 * that was never saved as a version — are left alone.
 */
export async function restore(
  projectRoot: string,
  v: Version,
  paths?: string[]
): Promise<RestoreResult> {
  return withLock(projectRoot, async () => {
    const written: string[] = [];
    const removed: string[] = [];

    const targets = paths && paths.length > 0 ? paths : null;
    const toWrite = targets ? targets.filter((p) => p in v.files) : Object.keys(v.files);

    let toRemove: string[];
    if (targets) {
      toRemove = targets.filter((p) => !(p in v.files));
    } else {
      const head = await getHead(projectRoot);
      toRemove = Object.keys(head?.files ?? {}).filter((p) => !(p in v.files));
    }

    for (const p of toWrite) {
      const abs = safePath(p, projectRoot);
      if (!abs) continue;
      const bytes = await readBlob(projectRoot, v.files[p].sha);
      if (!bytes) throw new Error(`Stored content for "${p}" is missing`);
      // Skip files that already match, so the watcher does not fire for nothing.
      try {
        const current = await fs.readFile(abs);
        if (current.equals(bytes)) continue;
      } catch {
        // Absent — write it.
      }
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await writeAtomic(abs, bytes);
      written.push(p);
    }

    for (const p of toRemove) {
      const abs = safePath(p, projectRoot);
      if (!abs) continue;
      if (!(await exists(abs))) continue;
      await fs.rm(abs, { force: true });
      removed.push(p);
    }

    return { written, removed };
  });
}

/** Every (path, absolute blob path) pair of a version, for streaming a zip. */
export function versionBlobPaths(projectRoot: string, v: Version): { path: string; abs: string }[] {
  return Object.entries(v.files).map(([p, entry]) => ({ path: p, abs: objectPath(projectRoot, entry.sha) }));
}
