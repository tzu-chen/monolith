import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { ColorScheme } from '../colorSchemes';
import type { FontSettings } from './light';

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function createEditorTheme(scheme: ColorScheme, font: FontSettings) {
  const { colors, type } = scheme;
  const isDark = type === 'dark';
  const gutterFontSize = `${Math.max(8, font.fontSize - 1.5)}px`;

  return EditorView.theme({
    '&': {
      backgroundColor: colors.bgEditor,
      color: colors.textPrimary,
      fontSize: `${font.fontSize}px`,
      fontFamily: font.fontFamily,
      height: '100%',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
    '.cm-content': {
      fontFamily: font.fontFamily,
      lineHeight: '1.75',
      padding: '16px 0',
      caretColor: colors.accent,
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: colors.accent,
      borderLeftWidth: '2px',
    },
    '.cm-gutters': {
      backgroundColor: colors.bgEditor,
      color: isDark ? colors.textDim : colors.borderStrong,
      border: 'none',
      fontFamily: font.fontFamily,
      fontSize: gutterFontSize,
    },
    '.cm-lineNumbers .cm-gutterElement': {
      paddingRight: '18px',
      minWidth: '52px',
      textAlign: 'right',
    },
    '.cm-activeLine': {
      backgroundColor: colors.accentBg,
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: colors.accent,
    },
    '.cm-selectionBackground': {
      backgroundColor: hexToRgba(colors.accent, isDark ? 0.15 : 0.12) + ' !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: hexToRgba(colors.accent, isDark ? 0.2 : 0.15) + ' !important',
    },
    '.cm-line': {
      paddingLeft: '4px',
    },
    '.cm-matchingBracket': {
      backgroundColor: hexToRgba(colors.accent, isDark ? 0.2 : 0.15),
      outline: 'none',
    },
    '.cm-searchMatch': {
      backgroundColor: hexToRgba(colors.orange, isDark ? 0.25 : 0.2),
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: hexToRgba(colors.orange, isDark ? 0.45 : 0.4),
    },
    '.cm-foldPlaceholder': {
      backgroundColor: hexToRgba(colors.accent, isDark ? 0.1 : 0.06),
      border: `1px solid ${colors.border}`,
      color: colors.textSecondary,
    },
    '.cm-tooltip': {
      border: `1px solid ${colors.border}`,
      backgroundColor: isDark ? colors.bgPanel : colors.paper,
      boxShadow: `0 2px 8px ${colors.paperShadow}`,
    },
    '.cm-tooltip-autocomplete > ul': {
      fontFamily: font.fontFamily,
      fontSize: `${Math.max(8, font.fontSize - 1.5)}px`,
    },
    '.cm-tooltip-autocomplete > ul > li': {
      padding: '3px 8px',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: hexToRgba(colors.accent, isDark ? 0.15 : 0.12),
      color: colors.textPrimary,
    },
    '.cm-completionLabel': {
      color: colors.textPrimary,
    },
    '.cm-completionDetail': {
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginLeft: '8px',
    },
    '.cm-snippetFieldPosition': {
      border: `1px solid ${colors.accent}`,
    },
    '.cm-tooltip.cm-math-preview': {
      backgroundColor: isDark ? colors.bgPanel : colors.paper,
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      padding: '8px 14px',
      maxWidth: '600px',
      overflowX: 'auto',
      color: colors.textPrimary,
      fontSize: '15px',
      lineHeight: '1.6',
      boxShadow: `0 2px 12px ${colors.paperShadow}`,
    },
    '.cm-math-preview-display': {
      textAlign: 'center',
    },
  }, { dark: isDark });
}

export function createHighlightStyle(scheme: ColorScheme) {
  const { colors } = scheme;
  return syntaxHighlighting(
    HighlightStyle.define([
      // \begin, \end → accent
      { tag: tags.keyword, color: colors.accent, fontWeight: '500' },
      // \section, \subsection → orange, bold
      { tag: tags.heading, color: colors.orange, fontWeight: '600' },
      // \cmd (commands like \usepackage, \documentclass) → blue
      { tag: tags.tagName, color: colors.blue },
      { tag: tags.processingInstruction, color: colors.blue },
      // Math mode content → purple
      { tag: tags.string, color: colors.purple },
      // Environment names inside \begin{...} → green
      { tag: tags.typeName, color: colors.green, fontWeight: '500' },
      // Comments → dim italic
      { tag: tags.comment, color: colors.textDim, fontStyle: 'italic' },
      { tag: tags.lineComment, color: colors.textDim, fontStyle: 'italic' },
      // Braces → secondary
      { tag: tags.bracket, color: colors.textSecondary },
      { tag: tags.paren, color: colors.textSecondary },
      { tag: tags.squareBracket, color: colors.textSecondary },
      { tag: tags.brace, color: colors.textSecondary },
      // Argument content (like package names) → teal
      { tag: tags.attributeValue, color: colors.teal },
    ])
  );
}
