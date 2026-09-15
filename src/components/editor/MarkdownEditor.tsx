// src/components/editor/MarkdownEditor.tsx
'use client';

import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { markdownHighlightStyle, markdownEditorTheme } from './markdown-theme';
import { searchHighlightExtension, getFirstMatchPos } from './markdown-search-highlight';
import type { FormattingResult } from '@/lib/markdown/formatting';

export interface MarkdownEditorHandle {
  focus: () => void;
  getSelection: () => { start: number; end: number };
  applyFormatting: (result: FormattingResult) => void;
  insertAt: (range: { start: number; end: number }, text: string) => void;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onPasteText: (text: string) => string | null;
  onPasteImage: (file: File) => void;
  autoFocus?: boolean;
  searchQuery: string;
}

const searchCompartment = new Compartment();

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    { value, onChange, onPasteText, onPasteImage, autoFocus, searchQuery },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onPasteTextRef = useRef(onPasteText);
    onPasteTextRef.current = onPasteText;
    const onPasteImageRef = useRef(onPasteImage);
    onPasteImageRef.current = onPasteImage;

    useEffect(() => {
      if (!containerRef.current) return;

      const state = EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(markdownHighlightStyle),
          markdownEditorTheme,
          EditorView.lineWrapping,
          searchCompartment.of(searchHighlightExtension(searchQuery)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            paste(event, view) {
              const items = Array.from(event.clipboardData?.items ?? []);
              const imageItem = items.find((item) => item.type.startsWith('image/'));
              if (imageItem) {
                const file = imageItem.getAsFile();
                if (file) {
                  event.preventDefault();
                  onPasteImageRef.current(file);
                  return true;
                }
              }

              const text = event.clipboardData?.getData('text/plain') ?? '';
              const replacement = onPasteTextRef.current(text);
              if (replacement === null) return false;
              event.preventDefault();
              const { from, to } = view.state.selection.main;
              view.dispatch({
                changes: { from, to, insert: replacement },
                selection: { anchor: from + replacement.length },
              });
              return true;
            },
          }),
        ],
      });

      const view = new EditorView({ state, parent: containerRef.current });
      viewRef.current = view;
      if (autoFocus) view.focus();
      const pos = getFirstMatchPos(view.state.doc, searchQuery);
      if (pos !== null) view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });

      return () => view.destroy();
      // One EditorView per mount. EditorCanvas remounts this component with
      // key={note.id} on note switch, so a fresh view always starts with the
      // right `value` baked into EditorState.create — no manual content-sync
      // effect needed (unlike the old Tiptap instance, which was reused across
      // notes behind a syncedNoteIdRef guard).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: searchCompartment.reconfigure(searchHighlightExtension(searchQuery)),
      });
      if (!searchQuery) return;
      const pos = getFirstMatchPos(view.state.doc, searchQuery);
      if (pos !== null) view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    }, [searchQuery]);

    useImperativeHandle(ref, () => ({
      focus: () => viewRef.current?.focus(),
      getSelection: () => {
        const sel = viewRef.current?.state.selection.main;
        return { start: sel?.from ?? 0, end: sel?.to ?? 0 };
      },
      applyFormatting: (result) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: result.text },
          selection: { anchor: result.selection.start, head: result.selection.end },
        });
        view.focus();
      },
      insertAt: (range, text) => {
        const view = viewRef.current;
        if (!view) return;
        // The caller (image paste) captures `range` synchronously at paste
        // time, before an async resize completes - the document may have
        // changed length by then (e.g. more typing), so clamp rather than
        // trust the captured offsets are still exactly in bounds.
        const docLength = view.state.doc.length;
        const from = Math.min(range.start, docLength);
        const to = Math.min(range.end, docLength);
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
      },
    }));

    return <div ref={containerRef} className="h-full font-mono text-sm text-zinc-400" />;
  },
);

export default MarkdownEditor;
