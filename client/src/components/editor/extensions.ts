import { keymap, highlightActiveLine, highlightActiveLineGutter, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { Extension, Compartment } from '@codemirror/state';
import { vim } from '@replit/codemirror-vim';
import { latexLanguage } from './latex-lang';
import { lightEditorTheme, lightHighlightStyle } from '../../themes/light';
import { darkEditorTheme, darkHighlightStyle } from '../../themes/dark';
import { autoCloseEnv } from './auto-close-env';
import { latexSnippetCompletion } from './snippet-completion';
import type { Theme } from '../../stores/editorStore';

export const themeCompartment = new Compartment();
export const vimCompartment = new Compartment();

function getThemeExtensions(theme: Theme): Extension {
  if (theme === 'dark') {
    return [darkEditorTheme, darkHighlightStyle];
  }
  return [lightEditorTheme, lightHighlightStyle];
}

export function createExtensions(theme: Theme = 'light', vimMode: boolean = false): Extension[] {
  return [
    vimCompartment.of(vimMode ? vim() : []),
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    highlightSelectionMatches(),
    latexLanguage,
    themeCompartment.of(getThemeExtensions(theme)),
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

export function getThemeReconfiguration(theme: Theme) {
  return themeCompartment.reconfigure(getThemeExtensions(theme));
}

export function getVimReconfiguration(vimMode: boolean) {
  return vimCompartment.reconfigure(vimMode ? vim() : []);
}
