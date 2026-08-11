import { useEditorStore } from '../stores/editorStore';
import * as api from './api';

/**
 * Jump to a source location.
 *
 * Panels hold locations in other files — a macro defined in preamble.tex, a
 * label declared in sections/model.tex — so getting there means opening the
 * file first when it is not already the active tab. Everything that points at a
 * `file:line` goes through here so the gesture behaves the same everywhere.
 */
export async function goToSource(file: string, line: number): Promise<void> {
  const state = useEditorStore.getState();

  if (state.activeTabPath !== file) {
    const open = state.openTabs.find((t) => t.path === file);
    if (open) {
      state.setActiveTab(file);
    } else {
      try {
        state.openFile(file, await api.readFile(file));
      } catch {
        return; // Deleted or unreadable — leave the editor where it is.
      }
    }
  }

  useEditorStore.getState().requestScrollToLine(line);
}
