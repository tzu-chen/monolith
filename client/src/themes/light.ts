import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export interface FontSettings {
  fontSize: number;
  fontFamily: string;
}

export function createLightEditorTheme(font: FontSettings) {
  const gutterFontSize = `${Math.max(8, font.fontSize - 1.5)}px`;
  return EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#2c2820',
    fontSize: `${font.fontSize}px`,
    fontFamily: font.fontFamily,
  },
  '.cm-content': {
    fontFamily: font.fontFamily,
    lineHeight: '1.75',
    padding: '16px 0',
    caretColor: '#8b5e3c',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#8b5e3c',
    borderLeftWidth: '2px',
  },
  '.cm-gutters': {
    backgroundColor: '#ffffff',
    color: '#cdc6b8',
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
    backgroundColor: 'rgba(139, 94, 60, 0.04)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: '#8b5e3c',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(139, 94, 60, 0.12) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(139, 94, 60, 0.15) !important',
  },
  '.cm-line': {
    paddingLeft: '4px',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(139, 94, 60, 0.15)',
    outline: 'none',
  },
  '.cm-searchMatch': {
    backgroundColor: 'rgba(176, 120, 48, 0.2)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgba(176, 120, 48, 0.4)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'rgba(139, 94, 60, 0.06)',
    border: '1px solid #e2ddd3',
    color: '#9e9588',
  },
  '.cm-tooltip': {
    border: '1px solid #e2ddd3',
    backgroundColor: '#fffef9',
    boxShadow: '0 2px 8px rgba(44, 40, 32, 0.12)',
  },
  '.cm-tooltip-autocomplete > ul': {
    fontFamily: font.fontFamily,
    fontSize: `${Math.max(8, font.fontSize - 1.5)}px`,
  },
  '.cm-tooltip-autocomplete > ul > li': {
    padding: '3px 8px',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'rgba(139, 94, 60, 0.12)',
    color: '#2c2820',
  },
  '.cm-completionLabel': {
    color: '#2c2820',
  },
  '.cm-completionDetail': {
    color: '#9e9588',
    fontStyle: 'italic',
    marginLeft: '8px',
  },
  '.cm-snippetFieldPosition': {
    border: '1px solid #8b5e3c',
  },
});
}

export const lightHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    // \begin, \end → warm brown (accent)
    { tag: tags.keyword, color: '#8b5e3c', fontWeight: '500' },
    // \section, \subsection → orange, bold
    { tag: tags.heading, color: '#b07830', fontWeight: '600' },
    // \cmd (commands like \usepackage, \documentclass) → blue
    { tag: tags.tagName, color: '#3d6b8e' },
    { tag: tags.processingInstruction, color: '#3d6b8e' },
    // Math mode content → purple
    { tag: tags.string, color: '#7a5a99' },
    // Environment names inside \begin{...} → green
    { tag: tags.typeName, color: '#4a8c5e', fontWeight: '500' },
    // Comments → gray italic
    { tag: tags.comment, color: '#9e9588', fontStyle: 'italic' },
    { tag: tags.lineComment, color: '#9e9588', fontStyle: 'italic' },
    // Braces → dim
    { tag: tags.bracket, color: '#9e9588' },
    { tag: tags.paren, color: '#9e9588' },
    { tag: tags.squareBracket, color: '#9e9588' },
    { tag: tags.brace, color: '#9e9588' },
    // Argument content (like package names) → teal
    { tag: tags.attributeValue, color: '#3d8080' },
  ])
);
