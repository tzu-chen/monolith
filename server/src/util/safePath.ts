import path from 'path';

/**
 * Resolve a project-relative path against `projectRoot`, refusing anything that
 * escapes the root. Rejects absolute paths and any `..` traversal, then confirms
 * the resolved path stays within the root. The separator is appended so a
 * sibling dir like "<root>-evil" can't satisfy the prefix check.
 *
 * Returns the absolute path, or `null` when the input is unsafe.
 */
export function safePath(relPath: string, projectRoot: string): string | null {
  if (typeof relPath !== 'string' || path.isAbsolute(relPath) || relPath.split(/[\\/]/).includes('..')) {
    return null;
  }
  const resolved = path.resolve(projectRoot, relPath);
  const rootWithSep = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
  if (resolved !== projectRoot && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}
