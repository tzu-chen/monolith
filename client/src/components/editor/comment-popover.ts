import { StateField, StateEffect, Prec, type EditorState } from '@codemirror/state';
import { showTooltip, keymap, EditorView, type Tooltip, type TooltipView, type ViewUpdate } from '@codemirror/view';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { commentsFacet, trackedComments } from './comments-gutter';
import type { Comment } from '../../lib/comments-api';
import CommentPopover from './CommentPopover';

/**
 * The floating comment card.
 *
 * A comment can be read and written without leaving the line it is about: the
 * shortcut and the gutter bubble open a card anchored under that line, showing
 * the comments there with their controls and a composer for a new one. It is
 * a CodeMirror tooltip, so it follows the line through scrolling and edits
 * (its position is mapped through every change), and it lives in the editor's
 * state — a tab switch drops it, and there is at most one per view.
 *
 * The Comments panel is still the overview across the file and the project;
 * the card is the same data, in place.
 */

export interface PopoverState {
  /** Start of the line the card is under; mapped through edits. */
  pos: number;
  /** Show the composer even when the line already has comments. */
  composing: boolean;
}

export const setPopover = StateEffect.define<PopoverState | null>();

export const popoverField = StateField.define<PopoverState | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setPopover)) return e.value;
    }
    if (value && tr.docChanged) {
      return { ...value, pos: tr.state.doc.lineAt(tr.changes.mapPos(value.pos, 1)).from };
    }
    return value;
  },
});

/** The comments tracked on the card's line, in stored order. */
export function commentsAt(state: EditorState, pos: number): Comment[] {
  const from = state.doc.lineAt(pos).from;
  const ids = new Set(state.field(trackedComments).filter((t) => t.pos === from).map((t) => t.id));
  return state.facet(commentsFacet).filter((c) => ids.has(c.id));
}

/** Open the card under `line`, composing when the line has nothing yet. */
export function openCommentPopover(view: EditorView, line: number, compose?: boolean): void {
  const l = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
  const composing = compose ?? commentsAt(view.state, l.from).length === 0;
  view.dispatch({ effects: setPopover.of({ pos: l.from, composing }) });
}

export function closeCommentPopover(view: EditorView, refocus = true): void {
  if (!view.state.field(popoverField)) return;
  view.dispatch({ effects: setPopover.of(null) });
  if (refocus) view.focus();
}

function render(root: Root, view: EditorView, state: PopoverState) {
  root.render(createElement(CommentPopover, { view, pos: state.pos, composing: state.composing }));
}

/** One stable `create` so CodeMirror updates the card in place rather than remounting it. */
function create(view: EditorView): TooltipView {
  const dom = document.createElement('div');
  dom.className = 'cm-comment-popover';
  const root = createRoot(dom);
  const state = view.state.field(popoverField);
  if (state) render(root, view, state);
  return {
    dom,
    update(update: ViewUpdate) {
      const next = update.state.field(popoverField);
      if (next) render(root, update.view, next);
    },
    destroy() {
      // React refuses to unmount from inside its own commit; defer a tick.
      window.setTimeout(() => root.unmount(), 0);
    },
  };
}

const popoverTooltip = showTooltip.compute([popoverField], (state): Tooltip | null => {
  const popover = state.field(popoverField);
  if (!popover) return null;
  return { pos: popover.pos, above: false, strictSide: false, arrow: false, create };
});

/** Escape closes the card when the editor has focus; the card's own fields handle their Escape. */
const escapeKeymap = Prec.highest(
  keymap.of([
    {
      key: 'Escape',
      run: (view) => {
        if (!view.state.field(popoverField)) return false;
        closeCommentPopover(view);
        return true;
      },
    },
  ])
);

/** A click back in the text puts the card away. */
const clickAway = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    if (!view.state.field(popoverField)) return false;
    const target = event.target as Element | null;
    if (target?.closest('.cm-comment-popover')) return false;
    closeCommentPopover(view, false);
    return false;
  },
});

export const commentPopover = [popoverField, popoverTooltip, escapeKeymap, clickAway];
