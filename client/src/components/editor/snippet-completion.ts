import { autocompletion, CompletionContext, snippet } from '@codemirror/autocomplete';
import { latexSnippets, loadCustomSnippets } from './latex-snippets';
import { pathCompletionSource } from './path-completion';

function snippetCompletions(context: CompletionContext) {
  const word = context.matchBefore(/[a-zA-Z]+/);
  if (!word || word.from === word.to) return null;

  const typed = context.state.doc.sliceString(word.from, word.to).toLowerCase();
  const allSnippets = [...latexSnippets, ...loadCustomSnippets()];
  const matching = allSnippets.filter((s) =>
    s.label.toLowerCase().startsWith(typed)
  );
  if (matching.length === 0) return null;

  return {
    from: word.from,
    options: matching.map((s) => ({
      label: s.label,
      detail: s.detail,
      type: 'snippet' as const,
      apply: snippet(s.template),
    })),
  };
}

/**
 * Completion sources, in priority order. The path source only fires inside the
 * brace of a path-taking command, so the two never compete for the same
 * position.
 */
export const latexSnippetCompletion = autocompletion({
  override: [pathCompletionSource, snippetCompletions],
  icons: false,
});
