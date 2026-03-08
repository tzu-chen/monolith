import { autocompletion, CompletionContext, snippet } from '@codemirror/autocomplete';
import { latexSnippets } from './latex-snippets';

function snippetCompletions(context: CompletionContext) {
  const word = context.matchBefore(/[a-zA-Z]+/);
  if (!word || word.from === word.to) return null;

  const typed = context.state.doc.sliceString(word.from, word.to).toLowerCase();
  const matching = latexSnippets.filter((s) =>
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

export const latexSnippetCompletion = autocompletion({
  override: [snippetCompletions],
});
