import path from 'path';
import fs from 'fs';

export interface ProjectContext {
  projectName: string;
  projectRoot: string;
}

type SwitchListener = (ctx: ProjectContext) => void;

let projectsRoot: string;
let current: ProjectContext;
const listeners: SwitchListener[] = [];

export function initProjectContext(root: string, defaultProject: string): void {
  projectsRoot = root;
  current = {
    projectName: defaultProject,
    projectRoot: path.join(root, defaultProject),
  };
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
