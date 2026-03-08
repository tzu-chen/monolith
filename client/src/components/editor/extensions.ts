import { keymap, highlightActiveLine, highlightActiveLineGutter, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { Extension } from '@codemirror/state';
import { latexLanguage } from './latex-lang';
import { lightEditorTheme, lightHighlightStyle } from '../../themes/light';
import { autoCloseEnv } from './auto-close-env';
import { latexSnippetCompletion } from './snippet-completion';

export function createExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    highlightSelectionMatches(),
    latexLanguage,
    lightEditorTheme,
    lightHighlightStyle,
    latexSnippetCompletion,
    // autoCloseEnv must come before defaultKeymap so it handles Enter first
    autoCloseEnv,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
  ];
}
