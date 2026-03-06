import { StreamLanguage, StringStream } from '@codemirror/language';

interface LaTeXState {
  inMath: boolean;
  inDisplayMath: boolean;
  inEnvName: boolean; // inside \begin{...} or \end{...}
}

function startState(): LaTeXState {
  return { inMath: false, inDisplayMath: false, inEnvName: false };
}

function copyState(state: LaTeXState): LaTeXState {
  return { ...state };
}

const SECTION_COMMANDS = new Set([
  'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph',
  'chapter', 'part',
]);

function token(stream: StringStream, state: LaTeXState): string | null {
  // Environment name inside \begin{...} or \end{...}
  if (state.inEnvName) {
    if (stream.match(/^[^}]+/)) {
      return 'typeName';
    }
    if (stream.eat('}')) {
      state.inEnvName = false;
      return 'bracket';
    }
  }

  // Display math mode $$
  if (state.inDisplayMath) {
    if (stream.match('$$')) {
      state.inDisplayMath = false;
      return 'string';
    }
    // Consume characters inside display math
    if (stream.match(/^\\[a-zA-Z@]+/)) {
      return 'string';
    }
    stream.next();
    return 'string';
  }

  // Inline math mode $
  if (state.inMath) {
    if (stream.eat('$')) {
      state.inMath = false;
      return 'string';
    }
    if (stream.match(/^\\[a-zA-Z@]+/)) {
      return 'string';
    }
    stream.next();
    return 'string';
  }

  // Comment
  if (stream.eat('%')) {
    stream.skipToEnd();
    return 'comment';
  }

  // Display math $$
  if (stream.match('$$')) {
    state.inDisplayMath = true;
    return 'string';
  }

  // Inline math $
  if (stream.eat('$')) {
    state.inMath = true;
    return 'string';
  }

  // LaTeX commands
  if (stream.eat('\\')) {
    const cmd = stream.match(/^[a-zA-Z@]+/) as RegExpMatchArray | null;
    if (cmd) {
      const cmdName = cmd[0];

      // \begin and \end
      if (cmdName === 'begin' || cmdName === 'end') {
        // Check if next char is {
        if (stream.eat('{')) {
          state.inEnvName = true;
          // Return keyword for the \begin/\end, brace handled next iteration
          return 'keyword';
        }
        return 'keyword';
      }

      // Section commands
      if (SECTION_COMMANDS.has(cmdName)) {
        return 'heading';
      }

      // All other commands
      return 'tagName';
    }

    // Single special character command like \, \; \! etc
    stream.next();
    return 'tagName';
  }

  // Braces
  if (stream.match(/^[{}]/)) {
    return 'bracket';
  }

  // Square brackets
  if (stream.match(/^[\[\]]/)) {
    return 'bracket';
  }

  // Regular text — consume until next special character
  stream.match(/^[^\\%${}[\]]+/);
  return null;
}

export const latexLanguage = StreamLanguage.define<LaTeXState>({
  startState,
  copyState,
  token,
});
