import { Facet, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  completionStatus,
  selectedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';

/**
 * Path autocompletion.
 *
 * Fires inside the brace of a command that takes a file path. Enter inserts the
 * path; Shift+Enter inserts the expanded form — for a graphic, the whole `figure`
 * environment with a caption and label already wired up, which is what you were
 * going to type next anyway.
 */

/** Project file list, kept in sync with the store's file tree. */
export const fileTreeFacet = Facet.define<string[], string[]>({
  combine: (values) => values[0] ?? [],
});

interface CommandSpec {
  /** File extensions worth offering, or null for "any file". */
  extensions: string[] | null;
  /** Drop the extension from the inserted path, as `\input` conventionally does. */
  stripExtension?: boolean;
}

const PATH_COMMANDS: Record<string, CommandSpec> = {
  includegraphics: { extensions: ['.pdf', '.png', '.jpg', '.jpeg', '.svg', '.eps'] },
  input: { extensions: ['.tex'], stripExtension: true },
  include: { extensions: ['.tex'], stripExtension: true },
  subfile: { extensions: ['.tex'], stripExtension: true },
  bibliography: { extensions: ['.bib'], stripExtension: true },
  addbibresource: { extensions: ['.bib'] },
  usepackage: { extensions: ['.sty'], stripExtension: true },
  documentclass: { extensions: ['.cls'], stripExtension: true },
};

/** The path-taking command whose argument the cursor sits in, if any. */
function pathContextAt(context: CompletionContext): { command: string; from: number; typed: string } | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  // `\includegraphics[width=…]{fig` — the optional argument may or may not be there.
  const m = before.match(/\\([a-zA-Z@]+)\s*(?:\[[^\]]*\])*\s*\{([^{}]*)$/);
  if (!m) return null;
  if (!(m[1] in PATH_COMMANDS)) return null;
  return { command: m[1], from: context.pos - m[2].length, typed: m[2] };
}

/** `figures/gap-vs-flux.pdf` → `\begin{figure}…\end{figure}` */
function figureEnvironment(relPath: string): string {
  const stem = relPath.split('/').pop()!.replace(/\.[^.]+$/, '');
  const label = stem.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (
    `\\begin{figure}[htbp]\n` +
    `  \\centering\n` +
    `  \\includegraphics[width=0.8\\textwidth]{${relPath}}\n` +
    `  \\caption{${stem}}\n` +
    `  \\label{fig:${label}}\n` +
    `\\end{figure}`
  );
}

/** Marks the completions this source produced, so Shift+Enter knows what it can expand. */
interface PathCompletion extends Completion {
  /** The path as it should land in the brace. */
  pathValue?: string;
  /** The command the completion was offered for. */
  pathCommand?: string;
}

export function pathCompletionSource(context: CompletionContext): CompletionResult | null {
  const hit = pathContextAt(context);
  if (!hit) return null;

  const spec = PATH_COMMANDS[hit.command];
  const files = context.state.facet(fileTreeFacet);
  if (files.length === 0) return null;

  const options: PathCompletion[] = [];
  for (const file of files) {
    if (file.endsWith('/')) continue;
    if (spec.extensions && !spec.extensions.some((ext) => file.toLowerCase().endsWith(ext))) continue;

    const value = spec.stripExtension ? file.replace(/\.[^./]+$/, '') : file;
    const dir = value.includes('/') ? value.slice(0, value.lastIndexOf('/') + 1) : '';
    options.push({
      label: value,
      detail: dir || undefined,
      type: 'file',
      pathValue: value,
      pathCommand: hit.command,
      // Sort files in the same directory as the document first.
      boost: dir ? 0 : 1,
    });
  }

  if (options.length === 0) return null;

  return {
    from: hit.from,
    options,
    // The brace already scopes this; let CodeMirror filter as the user types.
    validFor: /^[^{}]*$/,
  };
}

/**
 * Shift+Enter accepts the selected path in its expanded form. Bound above the default
 * keymap so it wins while the completion tooltip is open, and returns false
 * otherwise so Shift-Enter keeps its usual meaning in prose.
 */
export const expandedAcceptKeymap = Prec.highest(
  keymap.of([
    {
      key: 'Shift-Enter',
      run: (view: EditorView) => {
        if (completionStatus(view.state) !== 'active') return false;
        const option = selectedCompletion(view.state) as PathCompletion | null;
        if (!option?.pathValue) return false;

        const line = view.state.doc.lineAt(view.state.selection.main.head);
        const before = line.text.slice(0, view.state.selection.main.head - line.from);
        const open = before.lastIndexOf('{');
        if (open === -1) return false;

        // Replace the whole `\command[...]{typed` call, plus its closing brace.
        const callStart = line.from + before.lastIndexOf('\\', open);
        let end = view.state.selection.main.head;
        if (view.state.doc.sliceString(end, end + 1) === '}') end += 1;

        const insert =
          option.pathCommand === 'includegraphics'
            ? figureEnvironment(option.pathValue)
            : `\\${option.pathCommand}{${option.pathValue}}`;

        view.dispatch({
          changes: { from: callStart, to: end, insert },
          selection: { anchor: callStart + insert.length },
        });
        return true;
      },
    },
  ])
);

