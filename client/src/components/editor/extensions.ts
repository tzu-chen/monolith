import { keymap, highlightActiveLine, highlightActiveLineGutter, lineNumbers, EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { Extension, Compartment } from '@codemirror/state';
import { vim } from '@replit/codemirror-vim';
import { latexLanguage } from './latex-lang';
import type { FontSettings } from '../../themes/light';
import { createEditorTheme, createHighlightStyle } from '../../themes/editor-theme';
import { getSchemeById } from '../../colorSchemes';
import { autoCloseEnv } from './auto-close-env';
import { latexSnippetCompletion } from './snippet-completion';
import { mathPreview, preambleMacrosFacet } from './math-preview';

export const themeCompartment = new Compartment();
export const vimCompartment = new Compartment();
export const lineWrapCompartment = new Compartment();
export const lineNumbersCompartment = new Compartment();
export const preambleCompartment = new Compartment();

const defaultFont: FontSettings = { fontSize: 13.5, fontFamily: "'Source Code Pro', monospace" };

function getThemeExtensions(colorScheme: string, font: FontSettings = defaultFont): Extension {
  const scheme = getSchemeById(colorScheme);
  return [createEditorTheme(scheme, font), createHighlightStyle(scheme)];
}

// Line-number gutter + its active-line highlight toggle together.
function lineNumbersExtensions(show: boolean): Extension {
  return show ? [lineNumbers(), highlightActiveLineGutter()] : [];
}

export function createExtensions(colorScheme: string = 'light', vimMode: boolean = false, font: FontSettings = defaultFont, lineWrap: boolean = false, preambleMacros: string = '', showLineNumbers: boolean = true): Extension[] {
  return [
    vimCompartment.of(vimMode ? vim() : []),
    lineWrapCompartment.of(lineWrap ? EditorView.lineWrapping : []),
    lineNumbersCompartment.of(lineNumbersExtensions(showLineNumbers)),
    highlightActiveLine(),
    history(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    highlightSelectionMatches(),
    latexLanguage,
    themeCompartment.of(getThemeExtensions(colorScheme, font)),
    preambleCompartment.of(preambleMacrosFacet.of(preambleMacros)),
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

export function getThemeReconfiguration(colorScheme: string, font: FontSettings = defaultFont) {
  return themeCompartment.reconfigure(getThemeExtensions(colorScheme, font));
}

export type { FontSettings };

export function getVimReconfiguration(vimMode: boolean) {
  return vimCompartment.reconfigure(vimMode ? vim() : []);
}

export function getLineWrapReconfiguration(lineWrap: boolean) {
  return lineWrapCompartment.reconfigure(lineWrap ? EditorView.lineWrapping : []);
}

export function getLineNumbersReconfiguration(showLineNumbers: boolean) {
  return lineNumbersCompartment.reconfigure(lineNumbersExtensions(showLineNumbers));
}

export function getPreambleReconfiguration(macros: string) {
  return preambleCompartment.reconfigure(preambleMacrosFacet.of(macros));
}
