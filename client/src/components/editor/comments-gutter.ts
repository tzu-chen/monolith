import { Facet, StateField, RangeSetBuilder, type EditorState, type Transaction, type Text } from '@codemirror/state';
import { gutter, GutterMarker, Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { Comment } from '../../lib/comments-api';
import { openCommentPopover } from './comment-popover';

/**
 * Comments in the editor.
 *
 * Kept deliberately quiet: a small outlined bubble in a gutter column on each
 * commented line, and nothing in the text itself. The column exists only while
 * the file has line comments, so a file without any is laid out exactly as
 * before. Clicking the bubble selects the comment and opens the floating card
 * under the line (see `comment-popover.ts`), and the selected comment's line
 * gets a wash and an accent edge — the one moment a comment is allowed to
 * colour the document.
 *
 * Lines are tracked here rather than read back from the store on every
 * keystroke. The field starts from the stored lines and then maps each
 * comment's position through every edit, so a comment stays on its text as
 * paragraphs above it grow and shrink. After each edit the new lines are
 * reported back (`onCommentsMoved`) and persisted after a pause. When the
 * store's list arrives again it adds and removes ids but keeps the positions
 * of ids already tracked: the editor is the authority on where its own
 * comments are while the file is open. The exception is a whole-document
 * replacement — a restore, or a reload after the file changed on disk — where
 * the tracked positions mean nothing and the lines are re-found from the
 * store, using each comment's `anchor` text when the stored line no longer
 * matches it.
 */

export interface CommentMoveReport {
  id: string;
  line: number;
  anchor: string | null;
}

/** Line comments of the open file (document-level ones are not shown here). */
export const commentsFacet = Facet.define<Comment[], Comment[]>({
  combine: (values) => values[0] ?? [],
});

export const activeCommentFacet = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null,
});

export const onCommentsMovedFacet = Facet.define<
  ((moves: CommentMoveReport[]) => void) | null,
  ((moves: CommentMoveReport[]) => void) | null
>({ combine: (values) => values[0] ?? null });

export const onCommentClickFacet = Facet.define<
  ((ids: string[], line: number) => void) | null,
  ((ids: string[], line: number) => void) | null
>({ combine: (values) => values[0] ?? null });

interface Tracked {
  id: string;
  /** Start of the comment's line. */
  pos: number;
}

const ANCHOR_SEARCH = 400;

/**
 * The line a stored comment belongs on in `doc`. The stored line wins when
 * its text still matches the anchor; otherwise the nearest line with that
 * text, within a window; otherwise the stored line, clamped.
 */
function resolveLine(doc: Text, line: number, anchor: string | null): number {
  const clamped = Math.max(1, Math.min(line, doc.lines));
  if (!anchor) return clamped;
  if (doc.line(clamped).text.trim() === anchor) return clamped;
  for (let d = 1; d <= ANCHOR_SEARCH; d++) {
    const below = clamped + d;
    if (below <= doc.lines && doc.line(below).text.trim() === anchor) return below;
    const above = clamped - d;
    if (above >= 1 && doc.line(above).text.trim() === anchor) return above;
  }
  return clamped;
}

function fromFacet(state: EditorState, existing: Tracked[]): Tracked[] {
  const doc = state.doc;
  const keep = new Map(existing.map((t) => [t.id, t.pos]));
  const next: Tracked[] = [];
  for (const c of state.facet(commentsFacet)) {
    if (c.line === null) continue;
    const pos = keep.get(c.id);
    if (pos !== undefined) {
      next.push({ id: c.id, pos: doc.lineAt(Math.min(pos, doc.length)).from });
    } else {
      next.push({ id: c.id, pos: doc.line(resolveLine(doc, c.line, c.anchor)).from });
    }
  }
  return next;
}

/** True when the transaction replaced the entire document in one change. */
function replacesWholeDoc(tr: Transaction): boolean {
  let whole = false;
  let count = 0;
  tr.changes.iterChangedRanges((fromA, toA) => {
    count++;
    if (fromA === 0 && toA === tr.startState.doc.length) whole = true;
  });
  return whole && count === 1;
}

export const trackedComments = StateField.define<Tracked[]>({
  create: (state) => fromFacet(state, []),
  update(value, tr) {
    let next = value;
    if (tr.docChanged) {
      if (replacesWholeDoc(tr)) {
        next = fromFacet(tr.state, []);
      } else {
        const doc = tr.state.doc;
        next = value.map((t) => ({ id: t.id, pos: doc.lineAt(tr.changes.mapPos(t.pos, 1)).from }));
      }
    }
    if (tr.startState.facet(commentsFacet) !== tr.state.facet(commentsFacet)) {
      next = fromFacet(tr.state, next);
    }
    return next;
  },
});

/** After an edit, tell the store where each comment ended up. */
const moveReporter = EditorView.updateListener.of((update: ViewUpdate) => {
  if (!update.docChanged) return;
  const report = update.state.facet(onCommentsMovedFacet);
  if (!report) return;
  const stored = new Map(update.state.facet(commentsFacet).map((c) => [c.id, c]));
  const doc = update.state.doc;
  const moves: CommentMoveReport[] = [];
  for (const t of update.state.field(trackedComments)) {
    const c = stored.get(t.id);
    if (!c || c.line === null) continue;
    const line = doc.lineAt(t.pos);
    const anchor = line.text.trim();
    if (line.number !== c.line || anchor !== c.anchor) moves.push({ id: t.id, line: line.number, anchor });
  }
  if (moves.length) report(moves);
});

// ── Gutter ──

const SVG_NS = 'http://www.w3.org/2000/svg';

function bubble(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '13');
  svg.setAttribute('height', '13');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M20 14a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z');
  svg.appendChild(path);
  return svg;
}

class CommentMarker extends GutterMarker {
  constructor(
    readonly ids: string[],
    private readonly title: string,
    private readonly state: 'open' | 'resolved' | 'active'
  ) {
    super();
  }

  eq(other: CommentMarker) {
    return other.title === this.title && other.state === this.state && other.ids.join() === this.ids.join();
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = `cm-comment-marker cm-comment-marker-${this.state}`;
    span.title = this.title;
    span.appendChild(bubble());
    if (this.ids.length > 1) {
      const count = document.createElement('span');
      count.className = 'cm-comment-count';
      count.textContent = String(this.ids.length);
      span.appendChild(count);
    }
    return span;
  }
}

class SpacerMarker extends GutterMarker {
  toDOM() {
    const span = document.createElement('span');
    span.style.display = 'block';
    span.style.width = '13px';
    return span;
  }
}

const SPACER = new SpacerMarker();

function truncate(text: string, max = 160): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
}

export const commentsGutter = gutter({
  class: 'cm-commentGutter',
  lineMarker: (view, line) => {
    const tracked = view.state.field(trackedComments);
    if (tracked.length === 0) return null;
    const onLine = tracked.filter((t) => t.pos === line.from);
    if (onLine.length === 0) return null;
    const byId = new Map(view.state.facet(commentsFacet).map((c) => [c.id, c]));
    const active = view.state.facet(activeCommentFacet);
    const comments = onLine.map((t) => byId.get(t.id)).filter((c): c is Comment => !!c);
    if (comments.length === 0) return null;
    const state = comments.some((c) => c.id === active)
      ? 'active'
      : comments.every((c) => c.resolved)
        ? 'resolved'
        : 'open';
    const title = comments.map((c) => (c.resolved ? `✓ ${truncate(c.text)}` : truncate(c.text))).join('\n\n');
    return new CommentMarker(comments.map((c) => c.id), title, state);
  },
  lineMarkerChange: (update) =>
    update.docChanged ||
    update.startState.field(trackedComments) !== update.state.field(trackedComments) ||
    update.startState.facet(commentsFacet) !== update.state.facet(commentsFacet) ||
    update.startState.facet(activeCommentFacet) !== update.state.facet(activeCommentFacet),
  initialSpacer: () => SPACER,
  domEventHandlers: {
    mousedown: (view, line, event) => {
      const onClick = view.state.facet(onCommentClickFacet);
      if (!onClick) return false;
      const ids = view.state
        .field(trackedComments)
        .filter((t) => t.pos === line.from)
        .map((t) => t.id);
      if (ids.length === 0) return false;
      event.preventDefault();
      const lineNumber = view.state.doc.lineAt(line.from).number;
      onClick(ids, lineNumber);
      openCommentPopover(view, lineNumber, false);
      return true;
    },
  },
});

// ── Selected comment's line ──

const activeLine = Decoration.line({ class: 'cm-comment-active-line' });

function activeDecorations(state: EditorState): DecorationSet {
  const active = state.facet(activeCommentFacet);
  if (!active) return Decoration.none;
  const hit = state.field(trackedComments).find((t) => t.id === active);
  if (!hit) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const from = state.doc.lineAt(hit.pos).from;
  builder.add(from, from, activeLine);
  return builder.finish();
}

const activeCommentLine = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = activeDecorations(view.state);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.startState.facet(activeCommentFacet) !== update.state.facet(activeCommentFacet) ||
        update.startState.field(trackedComments) !== update.state.field(trackedComments)
      ) {
        this.decorations = activeDecorations(update.state);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

/** Everything but the gutter column, which is added only when there is something to put in it. */
export const commentTracking = [trackedComments, moveReporter, activeCommentLine];

/** The line a tracked comment is on right now, or null when it is not tracked. */
export function currentCommentLine(view: EditorView, id: string): number | null {
  const hit = view.state.field(trackedComments).find((t) => t.id === id);
  return hit ? view.state.doc.lineAt(hit.pos).number : null;
}
