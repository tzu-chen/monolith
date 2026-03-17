import { keymap, highlightActiveLine, highlightActiveLineGutter, lineNumbers, EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { Extension, Compartment } from '@codemirror/state';
import { vim } from '@replit/codemirror-vim';
import { latexLanguage } from './latex-lang';
import { createLightEditorTheme, lightHighlightStyle } from '../../themes/light';
import type { FontSettings } from '../../themes/light';
import { createDarkEditorTheme, darkHighlightStyle } from '../../themes/dark';
import { autoCloseEnv } from './auto-close-env';
import { latexSnippetCompletion } from './snippet-completion';
import { mathPreview } from './math-preview';
import type { Theme } from '../../stores/editorStore';

export const themeCompartment = new Compartment();
export const vimCompartment = new Compartment();
export const lineWrapCompartment = new Compartment();

const defaultFont: FontSettings = { fontSize: 13.5, fontFamily: "'Source Code Pro', monospace" };

function getThemeExtensions(theme: Theme, font: FontSettings = defaultFont): Extension {
  if (theme === 'dark') {
    return [createDarkEditorTheme(font), darkHighlightStyle];
  }
  return [createLightEditorTheme(font), lightHighlightStyle];
}

export function createExtensions(theme: Theme = 'light', vimMode: boolean = false, font: FontSettings = defaultFont, lineWrap: boolean = false): Extension[] {
  return [
    vimCompartment.of(vimMode ? vim() : []),
    lineWrapCompartment.of(lineWrap ? EditorView.lineWrapping : []),
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    highlightSelectionMatches(),
    latexLanguage,
    themeCompartment.of(getThemeExtensions(theme, font)),
    latexSnippetCompletion,
    mathPreview,
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

export function getThemeReconfiguration(theme: Theme, font: FontSettings = defaultFont) {
  return themeCompartment.reconfigure(getThemeExtensions(theme, font));
}

export type { FontSettings };

export function getVimReconfiguration(vimMode: boolean) {
  return vimCompartment.reconfigure(vimMode ? vim() : []);
}

export function getLineWrapReconfiguration(lineWrap: boolean) {
  return lineWrapCompartment.reconfigure(lineWrap ? EditorView.lineWrapping : []);
}
