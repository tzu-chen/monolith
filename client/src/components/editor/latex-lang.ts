import { StreamLanguage, StringStream } from '@codemirror/language';

/**
 * LaTeX stream tokenizer.
 *
 * Tags are chosen to land on the six syntax roles in the design handoff (see
 * `createHighlightStyle`):
 *
 *   keyword        → control sequences and math delimiters   --syn-command
 *   typeName       → environment names                       --syn-env
 *   string         → math content and section arguments      --syn-arg
 *   labelName      → reference / cite / include commands     --syn-ref
 *   number         → lengths and numbers                     --syn-number
 *
 * User-defined macros (`--syn-macro`) are not a tokenizer concern — they depend
 * on the resolved scope graph and are painted by the `userMacros` decoration
 * layer in `macro-decorations.ts`.
 */

interface LaTeXState {
  inMath: boolean;
  inDisplayMath: boolean;
  /** Inside `\begin{…}` / `\end{…}` — the environment name. */
  inEnvName: boolean;
  /** Brace depth remaining in a section command's argument. */
  argDepth: number;
}

function startState(): LaTeXState {
  return { inMath: false, inDisplayMath: false, inEnvName: false, argDepth: 0 };
}

function copyState(state: LaTeXState): LaTeXState {
  return { ...state };
}

const SECTION_COMMANDS = new Set([
  'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph',
  'chapter', 'part', 'title',
]);

/**
 * Commands that name something elsewhere — a label, a citation key, a file.
 * The handoff renders these in the muted reference colour so the *key* reads
 * louder than the command wrapping it.
 */
const REFERENCE_COMMANDS = new Set([
  'label', 'ref', 'eqref', 'pageref', 'nameref', 'autoref', 'cref', 'Cref',
  'cite', 'citep', 'citet', 'citeauthor', 'citeyear', 'nocite',
  'input', 'include', 'includeonly', 'includegraphics', 'subfile',
  'bibliography', 'bibliographystyle', 'addbibresource',
  'usepackage', 'documentclass', 'caption', 'subcaption',
]);

/** A length or bare number: `12pt`, `0.86\linewidth`, `1.5em`, `42`. */
const LENGTH = /^\d*\.?\d+\s*(pt|em|ex|cm|mm|in|bp|pc|sp|dd|cc|px|\\[a-zA-Z@]+)?/;

function token(stream: StringStream, state: LaTeXState): string | null {
  // Environment name inside \begin{…} / \end{…}
  if (state.inEnvName) {
    if (stream.match(/^[^}]+/)) return 'typeName';
    if (stream.eat('}')) {
      state.inEnvName = false;
      return 'bracket';
    }
  }

  // Section argument — the title text reads as argument text.
  if (state.argDepth > 0) {
    if (stream.eat('{')) {
      state.argDepth++;
      return 'bracket';
    }
    if (stream.eat('}')) {
      state.argDepth--;
      return 'bracket';
    }
    if (stream.match(/^\\[a-zA-Z@]+/)) return 'string';
    if (stream.match(/^[^{}\\]+/)) return 'string';
    stream.next();
    return 'string';
  }

  // Math mode — delimiters are control sequences, contents are argument text.
  if (state.inDisplayMath || state.inMath) {
    const closer = state.inDisplayMath ? '$$' : '$';
    if (stream.match(closer)) {
      state.inDisplayMath = false;
      state.inMath = false;
      return 'keyword';
    }
    if (stream.match(LENGTH)) return 'number';
    if (stream.match(/^\\[a-zA-Z@]+/)) return 'string';
    stream.next();
    return 'string';
  }

  // Comment
  if (stream.eat('%')) {
    stream.skipToEnd();
    return 'comment';
  }

  if (stream.match('$$')) {
    state.inDisplayMath = true;
    return 'keyword';
  }

  if (stream.eat('$')) {
    state.inMath = true;
    return 'keyword';
  }

  // LaTeX commands
  if (stream.eat('\\')) {
    const cmd = stream.match(/^[a-zA-Z@]+/) as RegExpMatchArray | null;
    if (cmd) {
      const cmdName = cmd[0];

      if (cmdName === 'begin' || cmdName === 'end') {
        if (stream.eat('{')) state.inEnvName = true;
        return 'keyword';
      }

      if (SECTION_COMMANDS.has(cmdName)) {
        if (stream.peek() === '{') state.argDepth = 0; // opened on the next pass
        return 'heading';
      }

      if (REFERENCE_COMMANDS.has(cmdName)) return 'labelName';

      return 'keyword';
    }

    // `\(` `\)` `\[` `\]` are math delimiters; other escapes are control symbols.
    const ch = stream.next();
    return ch && '()[]'.includes(ch) ? 'keyword' : 'keyword';
  }

  // A `{` directly after a section command opens its argument.
  if (stream.peek() === '{' && sectionJustSeen(stream)) {
    stream.next();
    state.argDepth = 1;
    return 'bracket';
  }

  if (stream.match(/^[{}]/)) return 'bracket';
  if (stream.match(/^[[\]]/)) return 'bracket';
  if (stream.match(LENGTH)) return 'number';

  // Plain text — consume up to the next special character.
  stream.match(/^[^\\%${}[\]0-9]+/) || stream.next();
  return null;
}

/**
 * True when the text immediately before the cursor is a section command, so its
 * following brace opens an argument. StreamLanguage hands us only the current
 * line, which is where section commands live in practice.
 */
function sectionJustSeen(stream: StringStream): boolean {
  const before = stream.string.slice(0, stream.pos);
  const m = before.match(/\\([a-zA-Z@]+)\s*$/);
  return !!m && SECTION_COMMANDS.has(m[1]);
}

export const latexLanguage = StreamLanguage.define<LaTeXState>({
  startState,
  copyState,
  token,
});
