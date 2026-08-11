import { keymap, highlightActiveLine, highlightActiveLineGutter, lineNumbers, EditorView } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { Extension, Compartment } from '@codemirror/state';
import { vim } from '@replit/codemirror-vim';
import { latexLanguage } from './latex-lang';
import { createEditorTheme, createHighlightStyle, type FontSettings } from '../../themes/editor-theme';
import { getSchemeById } from '../../colorSchemes';
import { autoCloseEnv } from './auto-close-env';
import { latexSnippetCompletion } from './snippet-completion';
import { expandedAcceptKeymap, fileTreeFacet } from './path-completion';
import { mathPreview, preambleMacrosFacet } from './math-preview';
import {
  scopeFacet,
  scopeDecorations,
  macroTooltip,
  macroClickHandler,
  goToDefinitionFacet,
} from './scope-decorations';
import { compileBaselineFacet, compileDiffGutter, compileDiffTheme } from './compile-diff';
import { diagnosticsFacet, diagnosticsGutter } from './diagnostics-gutter';
import type { ScopeGraph } from '../../lib/scope-api';
import type { Diagnostic } from '../../lib/diagnostics';

export const themeCompartment = new Compartment();
export const vimCompartment = new Compartment();
export const lineWrapCompartment = new Compartment();
export const lineNumbersCompartment = new Compartment();
export const preambleCompartment = new Compartment();
export const scopeCompartment = new Compartment();
export const diagnosticsCompartment = new Compartment();
export const baselineCompartment = new Compartment();
export const fileTreeCompartment = new Compartment();

const defaultFont: FontSettings = { fontSize: 13.5, fontFamily: "'Source Code Pro', monospace" };

function getThemeExtensions(colorScheme: string, font: FontSettings = defaultFont): Extension {
  const scheme = getSchemeById(colorScheme);
  return [createEditorTheme(scheme, font), createHighlightStyle(scheme)];
}

// Line-number gutter + its active-line highlight toggle together.
function lineNumbersExtensions(show: boolean): Extension {
  return show ? [lineNumbers(), highlightActiveLineGutter()] : [];
}

export interface EditorConfig {
  colorScheme: string;
  vimMode: boolean;
  font: FontSettings;
  lineWrap: boolean;
  preambleMacros: string;
  showLineNumbers: boolean;
  scope: ScopeGraph | null;
  diagnostics: Diagnostic[];
  /** Content as of the last successful compile, for the diff gutter. */
  baseline: string | null;
  fileTree: string[];
  onGoToDefinition: (file: string, line: number) => void;
}

export function createExtensions(config: EditorConfig): Extension[] {
  return [
    vimCompartment.of(config.vimMode ? vim() : []),
    lineWrapCompartment.of(config.lineWrap ? EditorView.lineWrapping : []),
    // Gutters render left to right in the order they are added: the compile
    // diff bar sits flush to the outer edge, then diagnostics, then numbers.
    compileDiffGutter,
    compileDiffTheme,
    diagnosticsGutter,
    lineNumbersCompartment.of(lineNumbersExtensions(config.showLineNumbers)),
    highlightActiveLine(),
    history(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    highlightSelectionMatches(),
    latexLanguage,
    themeCompartment.of(getThemeExtensions(config.colorScheme, config.font)),
    preambleCompartment.of(preambleMacrosFacet.of(config.preambleMacros)),
    scopeCompartment.of(scopeFacet.of(config.scope)),
    diagnosticsCompartment.of(diagnosticsFacet.of(config.diagnostics)),
    baselineCompartment.of(compileBaselineFacet.of(config.baseline)),
    fileTreeCompartment.of(fileTreeFacet.of(config.fileTree)),
    goToDefinitionFacet.of(config.onGoToDefinition),
    scopeDecorations,
    macroTooltip,
    // Must precede the SyncTeX click handler so a modifier-click on a macro
    // jumps to its definition instead of forward-syncing the PDF.
    macroClickHandler,
    latexSnippetCompletion,
    expandedAcceptKeymap,
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

export function getScopeReconfiguration(scope: ScopeGraph | null) {
  return scopeCompartment.reconfigure(scopeFacet.of(scope));
}

export function getDiagnosticsReconfiguration(diagnostics: Diagnostic[]) {
  return diagnosticsCompartment.reconfigure(diagnosticsFacet.of(diagnostics));
}

export function getBaselineReconfiguration(baseline: string | null) {
  return baselineCompartment.reconfigure(compileBaselineFacet.of(baseline));
}

export function getFileTreeReconfiguration(files: string[]) {
  return fileTreeCompartment.reconfigure(fileTreeFacet.of(files));
}
