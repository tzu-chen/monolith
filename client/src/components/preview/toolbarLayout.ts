/**
 * Progressive disclosure for the preview toolbars.
 *
 * Both toolbars pack a mode toggle, two tabs, a select, a download button, a
 * status line and the Compile/Render button into one row. Laid out plainly
 * that needs ~700px, and a preview pane is routinely narrower than that — the
 * button on the right (the one you actually came for) is what falls off the
 * end. So the trimmings drop out in order of how little they are missed, and
 * the action button never moves.
 *
 * Widths are of the toolbar itself, not the window: the splitter resizes these
 * panes independently. 0 means "not measured yet" — show everything.
 */
export interface ToolbarLayout {
  /** "compiled 14:32:07 in 1.2s" — the coloured dot carries the state without it. */
  showStatusText: boolean;
  /** Text beside the button icons; each button keeps a title tooltip. */
  showButtonLabels: boolean;
  /** The zoom / split-level select. */
  showSelect: boolean;
  /** Tighter padding on the mode toggle and the View/Log tabs. */
  compactControls: boolean;
  gap: number;
  padding: string;
}

export function toolbarLayout(width: number): ToolbarLayout {
  const w = width || Infinity;
  return {
    showStatusText: w >= 620,
    showButtonLabels: w >= 500,
    showSelect: w >= 400,
    compactControls: w < 420,
    gap: w >= 500 ? 12 : w >= 420 ? 8 : 6,
    padding: w >= 500 ? '0 16px' : w >= 420 ? '0 8px' : '0 6px',
  };
}
