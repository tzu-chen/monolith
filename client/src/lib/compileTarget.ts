import { useEditorStore } from '../stores/editorStore';
import * as api from './api';

/**
 * Which `.tex` file Compile / Render run on: the project's main file when one
 * is set, otherwise the active tab. Null when neither is a `.tex` file.
 */
export function resolveCompileTarget(): string | null {
  const state = useEditorStore.getState();
  if (state.mainFile) return state.mainFile;
  const active = state.activeTabPath;
  return active && active.endsWith('.tex') ? active : null;
}

/**
 * Write every dirty open `.tex` tab except `except` to disk, so a compile of the
 * main file sees the edits made in included files. The compile endpoints save
 * the target's own content themselves.
 */
export async function flushDirtyTabs(except: string | null): Promise<void> {
  const state = useEditorStore.getState();
  const pending = state.openTabs.filter((t) => t.dirty && t.path !== except && t.path.endsWith('.tex'));
  await Promise.all(
    pending.map(async (tab) => {
      try {
        await api.writeFile(tab.path, tab.content);
        const now = useEditorStore.getState();
        const fresh = now.openTabs.find((t) => t.path === tab.path);
        if (fresh && fresh.content === tab.content) now.markSaved(tab.path);
      } catch (err) {
        console.error(`Failed to save ${tab.path} before compile:`, err);
      }
    })
  );
}
