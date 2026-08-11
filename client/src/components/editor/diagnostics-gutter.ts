import { Facet } from '@codemirror/state';
import { gutter, GutterMarker } from '@codemirror/view';
import type { Diagnostic } from '../../lib/diagnostics';

/**
 * Diagnostics gutter.
 *
 * An outlined circle for an error and an outlined triangle for a warning, left
 * of the line number, drawn from the compile log's parsed line references. The
 * status bar counts the same list, so the two never disagree.
 */

export const diagnosticsFacet = Facet.define<Diagnostic[], Diagnostic[]>({
  combine: (values) => values[0] ?? [],
});

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Stroke-only glyphs, matching the rest of the icon set. */
const GLYPHS = {
  error: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v6M12 16.5v.01'],
  warning: ['M12 4l9 16H3z', 'M12 10v4M12 17v.01'],
} as const;

function glyph(severity: 'error' | 'warning'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '13');
  svg.setAttribute('height', '13');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of GLYPHS[severity]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

class DiagnosticMarker extends GutterMarker {
  constructor(
    private readonly severity: 'error' | 'warning',
    private readonly message: string
  ) {
    super();
  }

  eq(other: DiagnosticMarker) {
    return other.severity === this.severity && other.message === this.message;
  }

  toDOM() {
    const span = document.createElement('span');
    span.title = this.message;
    span.style.display = 'flex';
    span.style.alignItems = 'center';
    span.style.justifyContent = 'center';
    span.style.color = this.severity === 'error' ? 'var(--error)' : 'var(--warn)';
    span.appendChild(glyph(this.severity));
    return span;
  }
}

/** Blank marker reserving the gutter's width so line numbers never shift. */
class SpacerMarker extends GutterMarker {
  toDOM() {
    const span = document.createElement('span');
    span.style.display = 'block';
    span.style.width = '13px';
    return span;
  }
}

const SPACER = new SpacerMarker();

export const diagnosticsGutter = gutter({
  class: 'cm-diagnosticGutter',
  lineMarker: (view, line) => {
    const diagnostics = view.state.facet(diagnosticsFacet);
    if (diagnostics.length === 0) return null;
    const lineNumber = view.state.doc.lineAt(line.from).number;
    // An error outranks a warning when both land on the same line.
    const onLine = diagnostics.filter((d) => d.line === lineNumber);
    if (onLine.length === 0) return null;
    const worst = onLine.find((d) => d.severity === 'error') ?? onLine[0];
    const message = onLine.length > 1 ? onLine.map((d) => d.message).join('\n\n') : worst.message;
    return new DiagnosticMarker(worst.severity, message);
  },
  lineMarkerChange: (update) =>
    update.startState.facet(diagnosticsFacet) !== update.state.facet(diagnosticsFacet),
  initialSpacer: () => SPACER,
});
