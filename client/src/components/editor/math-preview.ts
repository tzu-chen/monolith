import { StateField, EditorState } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import katex from 'katex';

interface MathMatch {
  math: string;
  displayMode: boolean;
}

/**
 * Extract math expressions from a line of text.
 * Handles both inline ($...$) and display ($$...$$) math.
 */
function extractMathFromLine(lineText: string): MathMatch[] {
  const matches: MathMatch[] = [];
  let i = 0;

  while (i < lineText.length) {
    // Display math $$...$$
    if (lineText[i] === '$' && lineText[i + 1] === '$') {
      const start = i + 2;
      const end = lineText.indexOf('$$', start);
      if (end !== -1) {
        const math = lineText.slice(start, end).trim();
        if (math.length > 0) {
          matches.push({ math, displayMode: true });
        }
        i = end + 2;
        continue;
      }
    }

    // Inline math $...$
    if (lineText[i] === '$') {
      const start = i + 1;
      let end = -1;
      for (let j = start; j < lineText.length; j++) {
        if (lineText[j] === '$' && lineText[j - 1] !== '\\') {
          // Make sure it's not a $$ (display math opening)
          if (j + 1 < lineText.length && lineText[j + 1] === '$') continue;
          end = j;
          break;
        }
      }
      if (end !== -1) {
        const math = lineText.slice(start, end).trim();
        if (math.length > 0) {
          matches.push({ math, displayMode: false });
        }
        i = end + 1;
        continue;
      }
    }

    i++;
  }

  return matches;
}

/**
 * For multi-line display math: look for an opening $$ without a closing $$ on the same line,
 * then scan surrounding lines to gather the full math block.
 */
function extractMultiLineMath(state: EditorState, cursorLine: number): { math: string; displayMode: boolean; lineFrom: number } | null {
  const doc = state.doc;
  const totalLines = doc.lines;

  // Search upward from cursor line for an opening $$
  let openLine = -1;
  let closeLine = -1;

  for (let l = cursorLine; l >= 1; l--) {
    const text = doc.line(l).text;
    // Check if this line has a standalone $$ (opening)
    if (text.includes('$$')) {
      // Count $$ occurrences on the line
      const ddCount = (text.match(/\$\$/g) || []).length;
      if (ddCount === 1) {
        openLine = l;
        break;
      } else if (ddCount >= 2) {
        // Both open and close on the same line — handled by single-line extraction
        return null;
      }
    }
  }

  if (openLine === -1) return null;

  // Search downward from opening line for a closing $$
  for (let l = openLine + 1; l <= totalLines; l++) {
    const text = doc.line(l).text;
    if (text.includes('$$')) {
      closeLine = l;
      break;
    }
  }

  if (closeLine === -1) {
    // No closing found — show preview of what we have so far (cursor must be inside)
    if (cursorLine < openLine) return null;
    closeLine = cursorLine;
  }

  // Cursor must be within the math block
  if (cursorLine < openLine || cursorLine > closeLine) return null;

  // Gather math content
  const lines: string[] = [];
  for (let l = openLine; l <= closeLine; l++) {
    lines.push(doc.line(l).text);
  }

  let content = lines.join('\n');
  // Strip the $$ delimiters
  content = content.replace(/^\$\$/, '').replace(/\$\$$/, '').trim();

  if (content.length === 0) return null;

  return { math: content, displayMode: true, lineFrom: openLine };
}

class MathWidget extends WidgetType {
  constructor(
    private readonly mathExpressions: MathMatch[]
  ) {
    super();
  }

  eq(other: MathWidget): boolean {
    if (this.mathExpressions.length !== other.mathExpressions.length) return false;
    return this.mathExpressions.every(
      (m, i) => m.math === other.mathExpressions[i].math && m.displayMode === other.mathExpressions[i].displayMode
    );
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'cm-math-preview';

    for (const expr of this.mathExpressions) {
      const wrapper = document.createElement('div');
      wrapper.className = expr.displayMode ? 'cm-math-preview-display' : 'cm-math-preview-inline';
      try {
        katex.render(expr.math, wrapper, {
          throwOnError: false,
          displayMode: expr.displayMode,
          output: 'html',
        });
      } catch {
        wrapper.textContent = expr.math;
      }
      container.appendChild(wrapper);
    }

    return container;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const cursor = state.selection.main.head;
  const cursorLine = state.doc.lineAt(cursor);
  const lineText = cursorLine.text;

  // First try single-line math extraction
  const singleLineMatches = extractMathFromLine(lineText);

  if (singleLineMatches.length > 0) {
    const widget = new MathWidget(singleLineMatches);
    const deco = Decoration.widget({
      widget,
      block: true,
      side: -1,
    });
    return Decoration.set([deco.range(cursorLine.from)]);
  }

  // Try multi-line display math
  const multiLine = extractMultiLineMath(state, cursorLine.number);
  if (multiLine) {
    const widget = new MathWidget([{ math: multiLine.math, displayMode: multiLine.displayMode }]);
    const targetLine = state.doc.line(multiLine.lineFrom);
    const deco = Decoration.widget({
      widget,
      block: true,
      side: -1,
    });
    return Decoration.set([deco.range(targetLine.from)]);
  }

  return Decoration.none;
}

const mathPreviewField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) {
      return buildDecorations(tr.state);
    }
    return value;
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

export const mathPreview = mathPreviewField;
