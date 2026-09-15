import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';

// Colors match .claude/rules/styling.md's zinc/indigo dark palette.
export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: '#a5b4fc', fontWeight: 'bold' }, // indigo-300
  { tag: tags.strong, color: '#f4f4f5', fontWeight: 'bold' }, // zinc-100
  { tag: tags.emphasis, color: '#f4f4f5', fontStyle: 'italic' },
  { tag: tags.strikethrough, color: '#a1a1aa', textDecoration: 'line-through' }, // zinc-400
  { tag: tags.link, color: '#818cf8', textDecoration: 'underline' }, // indigo-400
  { tag: tags.url, color: '#818cf8' },
  { tag: tags.monospace, color: '#a78bfa', backgroundColor: '#1a1a1a' }, // matches globals.css inline code
  { tag: tags.quote, color: '#a1a1aa', fontStyle: 'italic' },
  { tag: tags.list, color: '#818cf8' },
  { tag: tags.processingInstruction, color: '#71717a' }, // zinc-500 — #, -, ``` markers
]);

export const markdownEditorTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: '#a1a1aa', height: '100%' },
    '.cm-content': { fontSize: '0.875rem', lineHeight: '1.625', caretColor: '#818cf8' },
    '.cm-gutters': { display: 'none' },
    '&.cm-focused': { outline: 'none' },
    '.cm-search-match': {
      borderRadius: '0.125rem',
      backgroundColor: 'rgba(129, 140, 248, 0.3)', // indigo-400/30
      color: '#c7d2fe', // indigo-200
    },
  },
  { dark: true },
);
