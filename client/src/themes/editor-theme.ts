import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { ColorScheme } from '../colorSchemes';

export interface FontSettings {
  fontSize: number;
  fontFamily: string;
}

/**
 * Editor line-height is 1.85 per the handoff: a blank source line must occupy a
 * full line box so gutter markers (diagnostics, compile-diff bars) line up with
 * the real line numbers beside them.
 */
export const EDITOR_LINE_HEIGHT = 1.85;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function createEditorTheme(scheme: ColorScheme, font: FontSettings) {
  const { colors, type } = scheme;
  const isDark = type === 'dark';

  return EditorView.theme(
    {
      '&': {
        backgroundColor: colors.surfaceEditor,
        color: colors.text,
        fontSize: `${font.fontSize}px`,
        fontFamily: font.fontFamily,
        height: '100%',
      },
      '.cm-scroller': {
        overflow: 'auto',
        lineHeight: String(EDITOR_LINE_HEIGHT),
      },
      '.cm-content': {
        fontFamily: font.fontFamily,
        lineHeight: String(EDITOR_LINE_HEIGHT),
        padding: '10px 0',
        caretColor: colors.accent,
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: colors.accent,
        borderLeftWidth: '2px',
      },
      // Gutters sit on the editor surface, divided by a hairline.
      '.cm-gutters': {
        backgroundColor: colors.surfaceEditor,
        color: colors.textDisabled,
        borderRight: `1px solid ${colors.lineFaint}`,
        fontFamily: font.fontFamily,
        fontSize: `${Math.max(8, font.fontSize - 1.5)}px`,
      },
      '.cm-lineNumbers .cm-gutterElement': {
        paddingRight: '9px',
        minWidth: '44px',
        textAlign: 'right',
      },
      '.cm-activeLine': { backgroundColor: colors.accentWash },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: colors.accent,
      },
      '.cm-selectionBackground': {
        backgroundColor: `${hexToRgba(colors.accent, isDark ? 0.18 : 0.12)} !important`,
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: `${hexToRgba(colors.accent, isDark ? 0.24 : 0.15)} !important`,
      },
      '.cm-line': { paddingLeft: '4px' },
      '.cm-matchingBracket': {
        backgroundColor: hexToRgba(colors.accent, isDark ? 0.2 : 0.15),
        outline: 'none',
      },
      '.cm-searchMatch': { backgroundColor: hexToRgba(colors.warn, isDark ? 0.25 : 0.2) },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: hexToRgba(colors.warn, isDark ? 0.45 : 0.4),
      },
      '.cm-foldPlaceholder': {
        backgroundColor: colors.accentWash,
        border: `1px solid ${colors.line}`,
        color: colors.textFaint,
      },

      // Popovers: 1px --line-strong, radius 7, paper surface, popover shadow.
      '.cm-tooltip': {
        border: `1px solid ${colors.lineStrong}`,
        borderRadius: '7px',
        backgroundColor: colors.surfacePaper,
        boxShadow: colors.shadowPopover,
        overflow: 'hidden',
      },
      '.cm-tooltip-autocomplete > ul': {
        fontFamily: font.fontFamily,
        fontSize: `${Math.max(8, font.fontSize - 1)}px`,
        maxHeight: '16em',
      },
      '.cm-tooltip-autocomplete > ul > li': {
        padding: '5px 10px',
        borderLeft: '2px solid transparent',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: colors.accentWash,
        borderLeftColor: colors.accent,
        color: colors.text,
      },
      '.cm-completionLabel': { color: colors.text },
      '.cm-completionDetail': {
        color: colors.textFaint,
        fontStyle: 'normal',
        marginLeft: '10px',
        fontFamily: "'DM Sans', system-ui, sans-serif",
      },
      '.cm-snippetFieldPosition': { border: `1px solid ${colors.accent}` },

      '.cm-tooltip.cm-math-preview': {
        backgroundColor: colors.surfacePaper,
        border: `1px solid ${colors.lineStrong}`,
        borderRadius: '7px',
        padding: '8px 14px',
        maxWidth: '600px',
        overflowX: 'auto',
        color: colors.text,
        fontSize: '15px',
        lineHeight: '1.6',
        boxShadow: colors.shadowPopover,
      },
      '.cm-math-preview-display': { textAlign: 'center' },

      // Diagnostics and compile-diff gutters (see diagnostics-gutter.ts /
      // compile-diff.ts). The diff bar is flush to the gutter's left edge.
      '.cm-diagnosticGutter': { width: '18px' },
      '.cm-diagnosticGutter .cm-gutterElement': {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
      '.cm-diffGutter': { width: '2px', paddingLeft: 0 },
      '.cm-diffGutter .cm-gutterElement': { width: '2px' },
      '.cm-diff-added': { backgroundColor: colors.ok },
      '.cm-diff-modified': { backgroundColor: colors.accent },

      // User macro and broken-citation decorations.
      '.cm-macro-token': {
        color: colors.synMacro,
        borderBottom: `1px dotted ${colors.lineStrong}`,
        cursor: 'pointer',
      },
      '.cm-broken-cite': {
        color: colors.error,
        borderBottom: `1px dotted ${colors.error}`,
      },
    },
    { dark: isDark }
  );
}

/**
 * The handoff's six syntax roles. Tags are produced by `latex-lang.ts`.
 */
export function createHighlightStyle(scheme: ColorScheme) {
  const { colors } = scheme;
  return syntaxHighlighting(
    HighlightStyle.define([
      // Control sequences and math delimiters
      { tag: tags.keyword, color: colors.synCommand },
      { tag: tags.heading, color: colors.synCommand, fontWeight: '600' },
      // Environment names
      { tag: tags.typeName, color: colors.synEnv },
      // Argument text and math symbols
      { tag: tags.string, color: colors.synArg },
      { tag: tags.attributeValue, color: colors.synArg },
      // Reference, cite and include commands
      { tag: tags.labelName, color: colors.synRef },
      { tag: tags.tagName, color: colors.synRef },
      { tag: tags.processingInstruction, color: colors.synRef },
      // Lengths and numbers
      { tag: tags.number, color: colors.synNumber },
      // Comments
      { tag: tags.comment, color: colors.textFaint, fontStyle: 'italic' },
      { tag: tags.lineComment, color: colors.textFaint, fontStyle: 'italic' },
      // Braces recede
      { tag: tags.bracket, color: colors.textFaint },
      { tag: tags.paren, color: colors.textFaint },
      { tag: tags.squareBracket, color: colors.textFaint },
      { tag: tags.brace, color: colors.textFaint },
    ])
  );
}
