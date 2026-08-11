/**
 * Compile-log diagnostics.
 *
 * Tectonic and LaTeXML both report errors and warnings as free-form strings.
 * The handoff asks for those to land in the editor gutter and be counted in the
 * status bar, which needs a line number per message — parsed here so the gutter,
 * the status bar, and the log view all agree on the same mapping.
 */

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  severity: Severity;
  message: string;
  /** 1-based source line, or null when the message names no line. */
  line: number | null;
  /** Source file when the message names one, else null (assume the main file). */
  file: string | null;
}

const LINE_PATTERNS = [/\bl\.(\d+)\b/, /\bline\s+(\d+)\b/i, /:(\d+):/];

export function parseLineNumber(msg: string): number | null {
  for (const pattern of LINE_PATTERNS) {
    const m = msg.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0) return n;
    }
  }
  return null;
}

/** `./sections/model.tex:12: Undefined control sequence` → `sections/model.tex` */
function parseFile(msg: string): string | null {
  const m = msg.match(/(?:^|\s)\.?\/?([\w./-]+\.(?:tex|sty|cls|bib)):\d+/);
  return m ? m[1].replace(/^\.\//, '') : null;
}

export function parseDiagnostics(errors: string[], warnings: string[]): Diagnostic[] {
  const build = (severity: Severity) => (message: string): Diagnostic => ({
    severity,
    message,
    line: parseLineNumber(message),
    file: parseFile(message),
  });
  return [...errors.map(build('error')), ...warnings.map(build('warning'))];
}

/**
 * Diagnostics that belong to `path`.
 *
 * Tectonic names a file only when the error is in an `\input`ed one, so a
 * message with no file belongs to the document that was compiled — passed in as
 * `compiledFile` rather than assumed to be `main.tex`, since Monolith compiles
 * whichever `.tex` is in front of you.
 */
export function diagnosticsForFile(
  diagnostics: Diagnostic[],
  path: string | null,
  compiledFile: string | null
): Diagnostic[] {
  if (!path) return [];
  return diagnostics.filter(
    (d) => d.line != null && (d.file === path || (d.file == null && path === compiledFile))
  );
}
