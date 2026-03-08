import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

import type { FontSettings } from './light';

export function createDarkEditorTheme(font: FontSettings) {
  const gutterFontSize = `${Math.max(8, font.fontSize - 1.5)}px`;
  return EditorView.theme({
  '&': {
    backgroundColor: '#1a1a26',
    color: '#c8c8d8',
    fontSize: `${font.fontSize}px`,
    fontFamily: font.fontFamily,
  },
  '.cm-content': {
    fontFamily: font.fontFamily,
    lineHeight: '1.75',
    padding: '16px 0',
    caretColor: '#7c6ff0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#7c6ff0',
    borderLeftWidth: '2px',
  },
  '.cm-gutters': {
    backgroundColor: '#1a1a26',
    color: '#44445a',
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
    backgroundColor: 'rgba(124, 111, 240, 0.06)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: '#7c6ff0',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(124, 111, 240, 0.15) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(124, 111, 240, 0.2) !important',
  },
  '.cm-line': {
    paddingLeft: '4px',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(124, 111, 240, 0.2)',
    outline: 'none',
  },
  '.cm-searchMatch': {
    backgroundColor: 'rgba(232, 168, 85, 0.25)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgba(232, 168, 85, 0.45)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'rgba(124, 111, 240, 0.1)',
    border: '1px solid #2a2a3e',
    color: '#6a6a88',
  },
  '.cm-tooltip': {
    border: '1px solid #2a2a3e',
    backgroundColor: '#12121c',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
  },
  '.cm-tooltip-autocomplete > ul': {
    fontFamily: font.fontFamily,
    fontSize: `${Math.max(8, font.fontSize - 1.5)}px`,
  },
  '.cm-tooltip-autocomplete > ul > li': {
    padding: '3px 8px',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'rgba(124, 111, 240, 0.15)',
    color: '#c8c8d8',
  },
  '.cm-completionLabel': {
    color: '#c8c8d8',
  },
  '.cm-completionDetail': {
    color: '#6a6a88',
    fontStyle: 'italic',
    marginLeft: '8px',
  },
  '.cm-snippetFieldPosition': {
    border: '1px solid #7c6ff0',
  },
  '.cm-math-preview': {
    zIndex: '10',
    pointerEvents: 'none',
    backgroundColor: 'rgba(18, 18, 28, 0.95)',
    backdropFilter: 'blur(4px)',
    border: '1px solid #2a2a3e',
    borderRadius: '6px',
    padding: '8px 14px',
    maxWidth: 'calc(100% - 80px)',
    overflowX: 'auto',
    color: '#c8c8d8',
    fontSize: '15px',
    lineHeight: '1.6',
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.3)',
  },
  '.cm-math-preview-display': {
    textAlign: 'center',
  },
}, { dark: true });
}

export const darkHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    // \begin, \end
    { tag: tags.keyword, color: '#7c6ff0', fontWeight: '500' },
    // \section, \subsection
    { tag: tags.heading, color: '#d4c870', fontWeight: '600' },
    // \cmd (commands)
    { tag: tags.tagName, color: '#5cc8cf' },
    { tag: tags.processingInstruction, color: '#5cc8cf' },
    // Math mode
    { tag: tags.string, color: '#e8a855' },
    // Environment names
    { tag: tags.typeName, color: '#5ccf8a', fontWeight: '500' },
    // Comments
    { tag: tags.comment, color: '#44445a', fontStyle: 'italic' },
    { tag: tags.lineComment, color: '#44445a', fontStyle: 'italic' },
    // Braces
    { tag: tags.bracket, color: '#6a6a88' },
    { tag: tags.paren, color: '#6a6a88' },
    { tag: tags.squareBracket, color: '#6a6a88' },
    { tag: tags.brace, color: '#6a6a88' },
    // Argument content
    { tag: tags.attributeValue, color: '#5cc8cf' },
  ])
);
