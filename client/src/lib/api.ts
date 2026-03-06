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

export async function deleteFile(filePath: string): Promise<void> {
  const res = await fetch(`/api/files/${filePath}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete ${filePath}: ${res.statusText}`);
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
