import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';

export interface ProjectContext {
  projectName: string | null;
  projectRoot: string | null;
}

type SwitchListener = (ctx: ProjectContext) => void;

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
    if (remaining.length > 0) {
      switchProject(remaining[0]);
      switchedTo = remaining[0];
    } else {
      current = { projectName: null, projectRoot: null };
      for (const listener of listeners) {
        listener(current);
      }
    }
  }
  return { deleted: true, switchedTo };
}
