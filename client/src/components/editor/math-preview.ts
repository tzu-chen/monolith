import { StateField, EditorState } from '@codemirror/state';
import { showTooltip, Tooltip, EditorView, ViewUpdate } from '@codemirror/view';
import katex from 'katex';

interface MathMatch {
  math: string;
  displayMode: boolean;
}

interface MathSpan extends MathMatch {
  /** Start offset within the line (includes opening delimiter) */
  from: number;
  /** End offset within the line (includes closing delimiter) */
  to: number;
}

/**
 * Extract math expressions from a line of text.
 * Handles both inline ($...$) and display ($$...$$) math.
 * Returns position information so callers can check cursor containment.
 */
function extractMathFromLine(lineText: string): MathSpan[] {
  const matches: MathSpan[] = [];
  let i = 0;

  while (i < lineText.length) {
    // Display math $$...$$
    if (lineText[i] === '$' && lineText[i + 1] === '$') {
      const start = i + 2;
      const end = lineText.indexOf('$$', start);
      if (end !== -1) {
        const math = lineText.slice(start, end).trim();
        if (math.length > 0) {
          matches.push({ math, displayMode: true, from: i, to: end + 2 });
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
          if (j + 1 < lineText.length && lineText[j + 1] === '$') continue;
          end = j;
          break;
        }
      }
      if (end !== -1) {
        const math = lineText.slice(start, end).trim();
        if (math.length > 0) {
          matches.push({ math, displayMode: false, from: i, to: end + 1 });
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

  let openLine = -1;
  let closeLine = -1;

  for (let l = cursorLine; l >= 1; l--) {
    const text = doc.line(l).text;
    if (text.includes('$$')) {
      const ddCount = (text.match(/\$\$/g) || []).length;
      if (ddCount === 1) {
        openLine = l;
        break;
      } else if (ddCount >= 2) {
        return null;
      }
    }
  }

  if (openLine === -1) return null;

  for (let l = openLine + 1; l <= totalLines; l++) {
    const text = doc.line(l).text;
    if (text.includes('$$')) {
      closeLine = l;
      break;
    }
  }

  if (closeLine === -1) {
    if (cursorLine < openLine) return null;
    closeLine = cursorLine;
  }

  if (cursorLine < openLine || cursorLine > closeLine) return null;

  const lines: string[] = [];
  for (let l = openLine; l <= closeLine; l++) {
    lines.push(doc.line(l).text);
  }

  let content = lines.join('\n');
  content = content.replace(/^\$\$/, '').replace(/\$\$$/, '').trim();

  if (content.length === 0) return null;

  return { math: content, displayMode: true, lineFrom: openLine };
}

interface MathResult {
  matches: MathMatch[];
  anchorPos: number;
}

function getMathForCursor(state: EditorState): MathResult | null {
  const cursor = state.selection.main.head;
  const cursorLine = state.doc.lineAt(cursor);
  const cursorOffset = cursor - cursorLine.from;

  const allSpans = extractMathFromLine(cursorLine.text);
  const hitMatches = allSpans.filter(s => cursorOffset >= s.from && cursorOffset <= s.to);
  if (hitMatches.length > 0) {
    return { matches: hitMatches, anchorPos: cursorLine.from };
  }

  const multiLine = extractMultiLineMath(state, cursorLine.number);
  if (multiLine) {
    const targetLine = state.doc.line(multiLine.lineFrom);
    return {
      matches: [{ math: multiLine.math, displayMode: multiLine.displayMode }],
      anchorPos: targetLine.from,
    };
  }

  return null;
}

function renderMath(container: HTMLElement, matches: MathMatch[]) {
  container.innerHTML = '';
  for (const expr of matches) {
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
}

function mathKey(matches: MathMatch[]): string {
  return matches.map(m => `${m.displayMode}:${m.math}`).join('|');
}

const mathTooltipField = StateField.define<MathResult | null>({
  create(state) {
    return getMathForCursor(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) {
      return getMathForCursor(tr.state);
    }
    return value;
  },
  provide(field) {
    return showTooltip.compute([field], (state): Tooltip | null => {
      const result = state.field(field);
      if (!result) return null;

      // Capture matches for closure
      const currentMatches = result.matches;

      return {
        pos: result.anchorPos,
        above: true,
        strictSide: true,
        create(): { dom: HTMLElement; update: (update: ViewUpdate) => void } {
          const dom = document.createElement('div');
          dom.className = 'cm-math-preview';
          renderMath(dom, currentMatches);
          let lastKey = mathKey(currentMatches);

          return {
            dom,
            update(update: ViewUpdate) {
              const newResult = update.state.field(field);
              if (!newResult) return;
              const newKey = mathKey(newResult.matches);
              if (newKey !== lastKey) {
                lastKey = newKey;
                renderMath(dom, newResult.matches);
              }
            },
          };
        },
      };
    });
  },
});

export const mathPreview = mathTooltipField;
