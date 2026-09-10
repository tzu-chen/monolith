import { useEditorStore } from '../stores/editorStore';
import * as api from './api';

/**
 * SyncTeX in both directions, as the two toolbar buttons and their shortcuts
 * run it. The editor's Mod-click and the preview's double-click call the same
 * `forwardSync` / `inverseSync` with a position of their own.
 *
 * A jump makes its destination visible first: to the PDF from an editor-only
 * layout opens the split, and to the source from a preview-only one likewise,
 * since a highlight nobody can see is not a jump.
 */

/** Highlight where `line:col` of `file` landed in the PDF. */
export async function forwardSync(file: string, line: number, col: number = 1): Promise<void> {
  try {
    const result = await api.syncTexForward(file, line, col);
    if (result) useEditorStore.getState().setSyncTexHighlight(result);
  } catch {
    // No SyncTeX data — the document may not have been compiled yet.
  }
}

/** Open and scroll the editor to the source of page-space point `x, y` on `page`. */
export async function inverseSync(page: number, x: number, y: number): Promise<void> {
  try {
    const result = await api.syncTexInverse(page, x, y);
    if (!result || result.line <= 0) return;
    const store = useEditorStore.getState();
    if (result.file && result.file !== store.activeTabPath) {
      try {
        store.openFile(result.file, await api.readFile(result.file));
      } catch {
        // Fall through and jump within whatever file is open.
      }
    }
    store.requestScrollToLine(result.line);
  } catch {
    // No SyncTeX data for this point.
  }
}

/** Whether the open tab is something SyncTeX can place in the PDF. */
export function canJumpToPdf(): boolean {
  const path = useEditorStore.getState().activeTabPath;
  return !!path && /\.tex$/i.test(path);
}

/** The "to PDF" button: forward-sync the cursor line of the open tab. */
export function jumpToPdfFromCursor(): void {
  const s = useEditorStore.getState();
  if (!canJumpToPdf()) return;
  if (s.viewMode === 'editor') s.setViewMode('both');
  if (s.previewMode !== 'pdf') s.setPreviewMode('pdf');
  void forwardSync(s.activeTabPath!, s.cursorLine, s.cursorCol);
}

/**
 * The mounted PDF preview registers how to read the point it is showing — the
 * middle of its viewport — since only it knows where its pages are.
 */
let previewPoint: (() => { page: number; x: number; y: number } | null) | null = null;

export function registerPreviewPoint(read: typeof previewPoint): void {
  previewPoint = read;
}

/** The "to source" button: inverse-sync the point in the middle of the preview. */
export function jumpToSourceFromPreview(): void {
  const s = useEditorStore.getState();
  const point = previewPoint?.();
  if (!point) return;
  if (s.viewMode === 'pdf') s.setViewMode('both');
  void inverseSync(point.page, point.x, point.y);
}
