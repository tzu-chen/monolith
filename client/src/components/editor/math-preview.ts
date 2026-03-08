import { EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
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

function getMathForCursor(state: EditorState): { matches: MathMatch[]; anchorLineFrom: number } | null {
  const cursor = state.selection.main.head;
  const cursorLine = state.doc.lineAt(cursor);

  const singleLineMatches = extractMathFromLine(cursorLine.text);
  if (singleLineMatches.length > 0) {
    return { matches: singleLineMatches, anchorLineFrom: cursorLine.from };
  }

  const multiLine = extractMultiLineMath(state, cursorLine.number);
  if (multiLine) {
    const targetLine = state.doc.line(multiLine.lineFrom);
    return {
      matches: [{ math: multiLine.math, displayMode: multiLine.displayMode }],
      anchorLineFrom: targetLine.from,
    };
  }

  return null;
}

class MathPreviewPlugin {
  private container: HTMLDivElement;
  private lastMathKey = '';

  constructor(private view: EditorView) {
    this.container = document.createElement('div');
    this.container.className = 'cm-math-preview';
    this.container.style.display = 'none';
    this.container.style.position = 'absolute';
    view.dom.style.position = 'relative';
    view.dom.appendChild(this.container);
    this.reposition();
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged) {
      this.reposition();
    }
  }

  private reposition() {
    const result = getMathForCursor(this.view.state);

    if (!result) {
      this.container.style.display = 'none';
      this.lastMathKey = '';
      return;
    }

    // Build a key from math content to avoid re-rendering KaTeX when unchanged
    const mathKey = result.matches.map(m => `${m.displayMode}:${m.math}`).join('|');

    if (mathKey !== this.lastMathKey) {
      this.lastMathKey = mathKey;
      this.container.innerHTML = '';

      for (const expr of result.matches) {
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
        this.container.appendChild(wrapper);
      }
    }

    // Position above the anchor line
    const lineCoords = this.view.coordsAtPos(result.anchorLineFrom);
    const editorRect = this.view.dom.getBoundingClientRect();

    if (!lineCoords) {
      this.container.style.display = 'none';
      return;
    }

    // Show temporarily to measure height
    this.container.style.display = '';
    this.container.style.visibility = 'hidden';
    const previewHeight = this.container.offsetHeight;
    this.container.style.visibility = '';

    const top = lineCoords.top - editorRect.top - previewHeight - 4;
    const left = this.view.defaultCharacterWidth * 2;

    this.container.style.top = `${Math.max(0, top)}px`;
    this.container.style.left = `${left}px`;
  }

  destroy() {
    this.container.remove();
  }
}

export const mathPreview = ViewPlugin.fromClass(MathPreviewPlugin);
