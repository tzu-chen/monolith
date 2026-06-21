export async function listFiles(): Promise<string[]> {
  const res = await fetch('/api/files/');
  if (!res.ok) {
    throw new Error(`Failed to list files: ${res.statusText}`);
  }
  const data = await res.json();
  return data.files;
}

export async function readFile(filePath: string): Promise<string> {
  const res = await fetch(`/api/files/${filePath}`);
  if (!res.ok) {
    throw new Error(`Failed to read ${filePath}: ${res.statusText}`);
  }
  const data = await res.json();
  return data.content;
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  const res = await fetch(`/api/files/${filePath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error(`Failed to write ${filePath}: ${res.statusText}`);
  }
}

export async function createFile(filePath: string, content: string = ''): Promise<void> {
  const res = await fetch(`/api/files/${filePath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create ${filePath}: ${res.statusText}`);
  }
}

export async function uploadFile(file: File, directory: string = ''): Promise<{ path: string }> {
  const formData = new FormData();
  formData.append('file', file);
  if (directory) {
    formData.append('directory', directory);
  }
  const res = await fetch('/api/files/upload', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to upload file: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteFile(filePath: string): Promise<void> {
  const res = await fetch(`/api/files/${filePath}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete ${filePath}: ${res.statusText}`);
  }
}

export async function createDirectory(dirPath: string): Promise<void> {
  const res = await fetch('/api/files/mkdir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create directory ${dirPath}: ${res.statusText}`);
  }
}

export async function renameFile(from: string, to: string): Promise<void> {
  const res = await fetch('/api/files/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) {
    throw new Error(`Failed to rename ${from} to ${to}: ${res.statusText}`);
  }
}

export async function transferFile(
  from: string,
  toProject: string,
  options: { toPath?: string; mode?: 'copy' | 'move'; overwrite?: boolean } = {}
): Promise<{ from: string; toProject: string; to: string; mode: 'copy' | 'move' }> {
  const res = await fetch('/api/files/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, toProject, ...options }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to transfer ${from} to ${toProject}: ${res.statusText}`);
  }
  return res.json();
}

// Project management
export async function listProjects(): Promise<string[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) {
    throw new Error(`Failed to list projects: ${res.statusText}`);
  }
  const data = await res.json();
  return data.projects;
}

export interface ProjectMeta {
  name: string;
  fileCount: number;
  /** Newest file mtime in ms since epoch; 0 when the project is empty. */
  modified: number;
}

export async function projectsMeta(): Promise<ProjectMeta[]> {
  const res = await fetch('/api/projects/meta');
  if (!res.ok) {
    throw new Error(`Failed to load project metadata: ${res.statusText}`);
  }
  const data = await res.json();
  return data.projects;
}

export async function getCurrentProject(): Promise<{ project: string | null; projectRoot: string | null }> {
  const res = await fetch('/api/projects/current');
  if (!res.ok) {
    throw new Error(`Failed to get current project: ${res.statusText}`);
  }
  const data = await res.json();
  return { project: data.project, projectRoot: data.projectRoot };
}

export async function createProject(name: string, template?: string): Promise<void> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, template }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to create project: ${res.statusText}`);
  }
}

export async function duplicateProject(name: string, newName: string): Promise<{ name: string }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(name)}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to duplicate project: ${res.statusText}`);
  }
  return res.json();
}

export async function renameProject(oldName: string, newName: string): Promise<{ project: string; projectRoot: string }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(oldName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to rename project: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteProject(name: string): Promise<{ deleted: true; switchedTo: string | null }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to delete project: ${res.statusText}`);
  }
  return res.json();
}

export async function switchProject(name: string): Promise<{ projectRoot: string }> {
  const res = await fetch('/api/projects/current', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`Failed to switch project: ${res.statusText}`);
  }
  const data = await res.json();
  return { projectRoot: data.projectRoot };
}

export interface CompileResponse {
  success: boolean;
  pdf?: string;
  log: string;
  errors: string[];
  warnings: string[];
}

export async function compile(mainFile: string = 'main.tex', content?: string): Promise<CompileResponse> {
  const res = await fetch('/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mainFile, content }),
  });
  if (!res.ok) {
    throw new Error(`Compilation request failed: ${res.statusText}`);
  }
  return res.json();
}

// HTML render (LaTeXML)

export type HtmlSplitLevel = 'none' | 'part' | 'chapter' | 'section' | 'subsection';

export interface RenderHtmlResponse {
  ok: boolean;
  /** false when the LaTeXML binary is not installed on the host. */
  available: boolean;
  log: string;
  errors: string[];
  warnings: string[];
}

export async function renderHtml(
  mainFile: string = 'main.tex',
  content?: string,
  splitAt: HtmlSplitLevel = 'none'
): Promise<RenderHtmlResponse> {
  const res = await fetch('/api/render-html', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mainFile, content, splitAt }),
  });
  const data = await res.json().catch(() => ({}));
  // The render endpoint reports render failures in-band (200 with ok:false).
  // Only normalize transport-level errors that don't carry our shape.
  if (!res.ok && !('ok' in data)) {
    return {
      ok: false,
      available: true,
      log: '',
      errors: [data.error || `Render request failed: ${res.statusText}`],
      warnings: [],
    };
  }
  return data as RenderHtmlResponse;
}

// SyncTeX

export interface SyncTexForwardResult {
  page: number;
  x: number;
  y: number;
  h: number;
  w: number;
}

export interface SyncTexInverseResult {
  file: string;
  line: number;
  col: number;
}

export async function syncTexForward(file: string, line: number, col: number = 1): Promise<SyncTexForwardResult | null> {
  const res = await fetch('/api/synctex/forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, line, col }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function syncTexInverse(page: number, x: number, y: number): Promise<SyncTexInverseResult | null> {
  const res = await fetch('/api/synctex/inverse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, x, y }),
  });
  if (!res.ok) return null;
  return res.json();
}

// Pyramid plot interop

export interface PyramidSession {
  id: string;
  title: string;
  session_type?: string;
  language?: string;
  status?: string;
  updated_at?: string;
  linkedToCurrentProject?: boolean;
}

export interface PyramidPlot {
  fileId: string;
  filename: string;
  ext: string;
}

export interface PyramidRefreshResult {
  updated: number;
  unchanged: number;
  missing: number;
}

export async function pyramidHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/pyramid/health');
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.available;
  } catch {
    return false;
  }
}

export async function listPyramidSessions(search: string = ''): Promise<PyramidSession[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await fetch(`/api/pyramid/sessions${qs}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to list Pyramid sessions: ${res.statusText}`);
  }
  const data = await res.json();
  return data.sessions;
}

export async function listPyramidPlots(sessionId: string): Promise<PyramidPlot[]> {
  const res = await fetch(`/api/pyramid/sessions/${sessionId}/plots`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to list plots: ${res.statusText}`);
  }
  const data = await res.json();
  return data.plots;
}

/** URL for an `<img src>` thumbnail of a Pyramid plot (proxied through Monolith). */
export function pyramidRawUrl(sessionId: string, fileId: string): string {
  return `/api/pyramid/sessions/${sessionId}/files/${fileId}/raw`;
}

export async function importPyramidPlot(args: {
  sessionId: string;
  fileId: string;
  filename: string;
  sessionTitle?: string;
  targetDir?: string;
  overwrite?: boolean;
}): Promise<{ path: string }> {
  const res = await fetch('/api/pyramid/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to import plot: ${res.statusText}`);
  }
  return res.json();
}

export async function refreshPyramidPlots(): Promise<PyramidRefreshResult> {
  const res = await fetch('/api/pyramid/refresh', { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to refresh plots: ${res.statusText}`);
  }
  return res.json();
}
