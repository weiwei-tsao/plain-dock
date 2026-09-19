import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';

export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--md-heading)', fontWeight: 'bold' },
  { tag: tags.strong, color: 'var(--md-heading)', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  {
    tag: tags.link,
    color: 'var(--md-link)',
    textDecoration: 'underline',
    textDecorationColor: 'var(--md-link)',
  },
  { tag: tags.url, color: 'var(--md-link)' },
  { tag: tags.quote, color: 'var(--md-secondary)' },
  { tag: tags.processingInstruction, color: 'var(--md-syntax)' },
]);

export const markdownEditorTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--md-canvas)', color: 'var(--md-text)', height: '100%' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-content': { fontSize: '0.875rem', lineHeight: '1.625', caretColor: 'var(--md-link)' },
    '.cm-gutters': { display: 'none' },
    '&.cm-focused': { outline: 'none' },
    '.cm-md-heading-line': {
      color: 'var(--md-heading)',
      fontWeight: '700',
      lineHeight: '1.3',
      paddingTop: '0.8em',
      paddingBottom: '0.35em',
    },
    '.cm-md-heading-1': { fontSize: '2em' },
    '.cm-md-heading-2': { fontSize: '1.65em' },
    '.cm-md-heading-3': { fontSize: '1.4em' },
    '.cm-md-heading-4': { fontSize: '1.2em' },
    '.cm-md-heading-5, .cm-md-heading-6': { fontSize: '1em' },
    '.cm-md-list-marker, .cm-md-list-marker *': {
      color: 'var(--md-list-marker) !important',
    },
    '.cm-md-syntax-mark': { color: 'var(--md-syntax)' },
    '.cm-md-quote-line': {
      color: 'var(--md-secondary)',
      fontStyle: 'italic',
      borderLeft: '3px solid var(--md-quote-border)',
      paddingLeft: '1em',
    },
    '.cm-md-inline-code': {
      color: 'var(--md-code-text)',
      backgroundColor: 'var(--md-code-bg)',
      borderRadius: '0.2em',
      padding: '0 0.3em',
    },
    '.cm-md-inline-code *': { color: 'var(--md-code-text)' },
    '.cm-md-inline-code .cm-md-code-mark, .cm-md-code-mark': { color: 'var(--md-syntax)' },
    '.cm-md-code-line': {
      color: 'var(--md-code-text)',
      backgroundColor: 'var(--md-code-bg)',
      fontStyle: 'normal',
      borderLeft: '1px solid var(--md-border)',
      borderRight: '1px solid var(--md-border)',
      paddingLeft: '16px',
      paddingRight: '16px',
    },
    '.cm-md-code-line *': { color: 'var(--md-code-text)' },
    '.cm-md-code-line .cm-md-code-mark': { color: 'var(--md-syntax)' },
    '.cm-md-code-line .cm-md-code-info': { color: 'var(--md-secondary)' },
    '.cm-md-code-first': {
      borderTop: '1px solid var(--md-border)',
      borderTopLeftRadius: '8px',
      borderTopRightRadius: '8px',
      paddingTop: '12px',
    },
    '.cm-md-code-last': {
      borderBottom: '1px solid var(--md-border)',
      borderBottomLeftRadius: '8px',
      borderBottomRightRadius: '8px',
      paddingBottom: '12px',
    },
    '.cm-search-match, .cm-search-match *': {
      backgroundColor: 'var(--md-search-bg) !important',
      color: 'var(--md-search-text) !important',
      borderRadius: '0.125rem',
    },
    '.cm-content::selection, .cm-content *::selection': {
      backgroundColor: 'var(--md-selection-bg) !important',
      color: 'var(--md-selection-text) !important',
    },
  },
  { dark: true },
);
