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

let projectsRoot: string;
let current: ProjectContext;
const listeners: SwitchListener[] = [];

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

export function switchProject(name: string): ProjectContext {
  const projectRoot = path.join(projectsRoot, name);
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    throw new Error(`Project "${name}" does not exist`);
  }
  current = { projectName: name, projectRoot };
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
  const projectPath = path.join(projectsRoot, name);
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

export async function renameProject(oldName: string, newName: string): Promise<ProjectContext> {
  const oldPath = path.join(projectsRoot, oldName);
  const newPath = path.join(projectsRoot, newName);
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
    for (const listener of listeners) {
      listener(current);
    }
  }
  return { projectName: newName, projectRoot: newPath };
}

export async function deleteProject(name: string): Promise<{ deleted: true; switchedTo: string | null }> {
  const projectPath = path.join(projectsRoot, name);
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
