import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';

export interface ProjectContext {
  projectName: string | null;
  projectRoot: string | null;
}

type SwitchListener = (ctx: ProjectContext) => void;

// Archive state is a marker file under the project's gitignored `.monolith/` dir
// (alongside the html cache). Living there means it travels with the project on
// rename (the whole dir moves) and is dropped on duplicate (`.monolith` is
// excluded from the copy), so an archived project's copy starts out active.
const ARCHIVE_MARKER = path.join('.monolith', 'archived');

// The project's main .tex file — the one Compile / Render always run on,
// regardless of which file is open in the editor. Stored beside the archive
// marker for the same reasons; absent means "compile whatever is open".
const MAIN_FILE_MARKER = path.join('.monolith', 'main-file');

// The project the app opens on: the one last switched to, recorded under the
// projects root. Dot-prefixed so the listings skip it. Falls back (first run,
// or the project is gone) to the active project most recently worked on.
const LAST_PROJECT_FILE = '.last-project';

let projectsRoot: string;
let current: ProjectContext;
const listeners: SwitchListener[] = [];

function rememberCurrent(): void {
  if (!current.projectName) return;
  fsPromises.writeFile(path.join(projectsRoot, LAST_PROJECT_FILE), current.projectName).catch(() => {
    // Best effort: the next start just falls back to the freshest project.
  });
}

/** Newest mtime of a directory or anything directly inside it. */
function lastTouched(dir: string): number {
  let newest = 0;
  try {
    newest = fs.statSync(dir).mtimeMs;
    for (const entry of fs.readdirSync(dir)) {
      try {
        newest = Math.max(newest, fs.statSync(path.join(dir, entry)).mtimeMs);
      } catch {
        // Vanished mid-scan.
      }
    }
  } catch {
    // Unreadable: sorts last.
  }
  return newest;
}

/**
 * The project to open at startup: the last one opened if it still exists,
 * else the active (unarchived) project touched most recently, else the first
 * of any, else null when the root is empty.
 */
export function pickStartupProject(root: string): string | null {
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
  if (dirs.length === 0) return null;

  try {
    const last = fs.readFileSync(path.join(root, LAST_PROJECT_FILE), 'utf8').trim();
    if (dirs.includes(last)) return last;
  } catch {
    // No record yet.
  }

  const isArchivedIn = (name: string) => fs.existsSync(path.join(root, name, ARCHIVE_MARKER));
  const active = dirs.filter((name) => !isArchivedIn(name));
  const candidates = active.length > 0 ? active : dirs;
  return candidates
    .map((name) => ({ name, touched: lastTouched(path.join(root, name)) }))
    .sort((a, b) => b.touched - a.touched)[0].name;
}

export function initProjectContext(root: string, defaultProject: string | null): void {
  projectsRoot = root;
  if (defaultProject) {
    current = {
      projectName: defaultProject,
      projectRoot: path.join(root, defaultProject),
    };
  } else {
    current = { projectName: null, projectRoot: null };
  }
}

export function getProjectsRoot(): string {
  return projectsRoot;
}

export function getCurrent(): ProjectContext {
  return current;
}

/**
 * Resolve a project directory inside the projects root, rejecting any name that
 * would escape it (`..`, absolute paths, embedded separators). Every filesystem
 * operation keyed by an untrusted project name must go through here so a crafted
 * name can't traverse outside the root. Throws "does not exist" (mapped to 404 by
 * the routes) rather than confirming the traversal attempt.
 */
function resolveProjectDir(name: string): string {
  const resolved = path.resolve(projectsRoot, name);
  const rootWithSep = projectsRoot.endsWith(path.sep) ? projectsRoot : projectsRoot + path.sep;
  if (!resolved.startsWith(rootWithSep)) {
    throw new Error(`Project "${name}" does not exist`);
  }
  return resolved;
}

export function switchProject(name: string): ProjectContext {
  const projectRoot = resolveProjectDir(name);
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    throw new Error(`Project "${name}" does not exist`);
  }
  current = { projectName: name, projectRoot };
  rememberCurrent();
  for (const listener of listeners) {
    listener(current);
  }
  return current;
}

export function onSwitch(listener: SwitchListener): void {
  listeners.push(listener);
}

/** Whether a project is archived (hidden from the quick-switcher). */
export function isArchived(name: string): boolean {
  return fs.existsSync(path.join(projectsRoot, name, ARCHIVE_MARKER));
}

/** Toggle a project's archived state by adding/removing its marker file. */
export async function setArchived(name: string, archived: boolean): Promise<void> {
  const projectPath = resolveProjectDir(name);
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new Error(`Project "${name}" does not exist`);
  }
  const markerPath = path.join(projectPath, ARCHIVE_MARKER);
  if (archived) {
    await fsPromises.mkdir(path.dirname(markerPath), { recursive: true });
    await fsPromises.writeFile(markerPath, '');
  } else {
    await fsPromises.rm(markerPath, { force: true });
  }
}

/**
 * Validate a project-relative main-file path: relative, no parent traversal,
 * a `.tex` file, and inside the project directory. Returns the normalised
 * (forward-slash) path or throws with a user-facing message.
 */
export function normalizeMainFile(projectRoot: string, mainFile: string): string {
  const cleaned = mainFile.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    !cleaned ||
    path.isAbsolute(cleaned) ||
    cleaned.split('/').includes('..') ||
    !cleaned.toLowerCase().endsWith('.tex')
  ) {
    throw new Error('Main file must be a .tex file inside the project');
  }
  const resolved = path.resolve(projectRoot, cleaned);
  const rootWithSep = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
  if (!resolved.startsWith(rootWithSep)) {
    throw new Error('Main file must be a .tex file inside the project');
  }
  return cleaned;
}

/** The project's configured main .tex file, or null when none is set. */
export function getMainFile(projectRoot: string | null): string | null {
  if (!projectRoot) return null;
  try {
    const raw = fs.readFileSync(path.join(projectRoot, MAIN_FILE_MARKER), 'utf-8').trim();
    return raw ? normalizeMainFile(projectRoot, raw) : null;
  } catch {
    return null;
  }
}

/** Set (or, with null, clear) the project's main .tex file. */
export async function setMainFile(projectRoot: string, mainFile: string | null): Promise<string | null> {
  const markerPath = path.join(projectRoot, MAIN_FILE_MARKER);
  if (mainFile === null) {
    await fsPromises.rm(markerPath, { force: true });
    return null;
  }
  const cleaned = normalizeMainFile(projectRoot, mainFile);
  const st = await fsPromises.stat(path.join(projectRoot, cleaned)).catch(() => null);
  if (!st || !st.isFile()) {
    throw new Error(`"${cleaned}" does not exist in the project`);
  }
  await fsPromises.mkdir(path.dirname(markerPath), { recursive: true });
  await fsPromises.writeFile(markerPath, cleaned + '\n', 'utf-8');
  return cleaned;
}

export async function renameProject(oldName: string, newName: string): Promise<ProjectContext> {
  const oldPath = resolveProjectDir(oldName);
  const newPath = resolveProjectDir(newName);
  if (!fs.existsSync(oldPath) || !fs.statSync(oldPath).isDirectory()) {
    throw new Error(`Project "${oldName}" does not exist`);
  }
  if (fs.existsSync(newPath)) {
    throw new Error(`Project "${newName}" already exists`);
  }
  await fsPromises.rename(oldPath, newPath);
  // If the renamed project is the current one, update context
  if (current.projectName === oldName) {
    current = { projectName: newName, projectRoot: newPath };
    rememberCurrent();
    for (const listener of listeners) {
      listener(current);
    }
  }
  return { projectName: newName, projectRoot: newPath };
}

export async function deleteProject(name: string): Promise<{ deleted: true; switchedTo: string | null }> {
  const projectPath = resolveProjectDir(name);
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    throw new Error(`Project "${name}" does not exist`);
  }
  await fsPromises.rm(projectPath, { recursive: true });
  // If deleted project was the current one, switch to another
  let switchedTo: string | null = null;
  if (current.projectName === name) {
    const entries = fs.readdirSync(projectsRoot, { withFileTypes: true });
    const remaining = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
    // Prefer switching to an active project; archived ones are hidden from the
    // switcher, so falling onto one would be surprising.
    const fallback = remaining.find((n) => !isArchived(n));
    if (fallback) {
      switchProject(fallback);
      switchedTo = fallback;
    } else {
      current = { projectName: null, projectRoot: null };
      for (const listener of listeners) {
        listener(current);
      }
    }
  }
  return { deleted: true, switchedTo };
}
