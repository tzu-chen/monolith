import { Facet } from '@codemirror/state';
import { gutter, GutterMarker, EditorView } from '@codemirror/view';
import { diffLines, type DiffMap } from '../../lib/line-diff';

/**
 * Compile-diff gutter.
 *
 * A 2px bar flush to the gutter's left edge on every line that has changed
 * since the last successful compile: `ok` for added lines, `accent` for
 * modified. It answers "is what I am looking at in the PDF?" without a compile.
 *
 * The baseline is the snapshot the store takes on each successful compile.
 */

/** Content of this file as of the last successful compile. */
export const compileBaselineFacet = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null,
});

class DiffMarker extends GutterMarker {
  constructor(private readonly kind: 'added' | 'modified') {
    super();
  }

  eq(other: DiffMarker) {
    return other.kind === this.kind;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = this.kind === 'added' ? 'cm-diff-added' : 'cm-diff-modified';
    span.style.display = 'block';
    span.style.width = '2px';
    span.style.height = '100%';
    return span;
  }
}

const ADDED = new DiffMarker('added');
const MODIFIED = new DiffMarker('modified');

/**
 * Diffing the whole document on every line render would be wasteful, so the
 * result is memoised against the (baseline, current) pair — both are immutable
 * strings, so identity is a sound cache key.
 */
let cacheKey: { baseline: string; current: string } | null = null;
let cacheValue: DiffMap = new Map();

function diffFor(baseline: string, current: string): DiffMap {
  if (cacheKey && cacheKey.baseline === baseline && cacheKey.current === current) {
    return cacheValue;
  }
  cacheValue = diffLines(baseline, current);
  cacheKey = { baseline, current };
  return cacheValue;
}

export const compileDiffGutter = gutter({
  class: 'cm-diffGutter',
  lineMarker: (view, line) => {
    const baseline = view.state.facet(compileBaselineFacet);
    if (baseline === null) return null;
    const current = view.state.doc.toString();
    if (baseline === current) return null;
    const kind = diffFor(baseline, current).get(view.state.doc.lineAt(line.from).number);
    if (!kind) return null;
    return kind === 'added' ? ADDED : MODIFIED;
  },
  lineMarkerChange: (update) =>
    update.docChanged ||
    update.startState.facet(compileBaselineFacet) !== update.state.facet(compileBaselineFacet),
  initialSpacer: () => ADDED,
});

/** Keeps the diff bar flush to the gutter's left edge, with no padding. */
export const compileDiffTheme = EditorView.baseTheme({
  '.cm-diffGutter .cm-gutterElement': { padding: 0 },
});
