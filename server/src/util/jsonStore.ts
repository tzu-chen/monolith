import fs from 'fs/promises';
import path from 'path';

/**
 * A small JSON document under a project's `.monolith/` directory.
 *
 * Comments and the to-do list live here, beside the archive marker and the
 * version store, for the same reasons those do: the directory moves with the
 * project on rename and is left out of a duplicate. Reads tolerate a missing
 * or corrupt file (the caller's `fallback` wins); writes go through a temp
 * file so a crash never leaves half a document behind.
 */
export async function readJsonStore<T>(projectRoot: string, name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, '.monolith', name), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJsonStore(projectRoot: string, name: string, data: unknown): Promise<void> {
  const dir = path.join(projectRoot, '.monolith');
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, name);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  await fs.rename(tmp, target);
}

/** Short random id, unique enough for a per-project list. */
export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
