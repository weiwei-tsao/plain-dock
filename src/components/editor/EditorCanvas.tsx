'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import type { Note, NotePayload } from '@/types';
import { NoteMode, type SaveState } from '@/types';
import { noteApi } from '@/lib/api-client';
import { sanitizeHTML, wrapPlainText, getNoteTextContent } from '@/lib/sanitizer';
import RichToolbar from './RichToolbar';
import ConfirmDialog from '../ui/ConfirmDialog';
import Toast from '../ui/Toast';
import {
  Pin,
  Trash2,
  Copy,
  FileCode,
  Type,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  MoreHorizontal,
} from 'lucide-react';

interface EditorCanvasProps {
  note: Note;
  onUpdate: (note: Note) => void;
  onDelete: () => void;
  onBack?: () => void;
}

const EditorCanvas: React.FC<EditorCanvasProps> = ({ note, onUpdate, onDelete, onBack }) => {
  const [saveState, setSaveState] = useState<SaveState>('IDLE');
  const [localTitle, setLocalTitle] = useState(note.title);
  const [plainContent, setPlainContent] = useState(note.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showModeConfirm, setShowModeConfirm] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    variant: 'success' | 'error' | 'info';
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestQueue = useRef<Promise<unknown>>(Promise.resolve());
  const syncedNoteIdRef = useRef<string | null>(null);
  // Ref so triggerSave always reads current plain content without a stale closure
  const plainContentRef = useRef(note.content);

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: note.content,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[400px]',
      },
      handlePaste: (view, event) => {
        if (note.mode === NoteMode.PLAIN || !editor) return false;
        const html = event.clipboardData?.getData('text/html');
        const text = event.clipboardData?.getData('text/plain');

        if (html && html.trim() !== '') {
          const clean = sanitizeHTML(html);
          editor.commands.insertContent(clean);
          return true;
        } else if (text) {
          const clean = wrapPlainText(text);
          editor.commands.insertContent(clean);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (note.mode === NoteMode.RICH) {
        triggerSave({ content: ed.getHTML() });
      }
    },
  });

  // Sync editor content when switching notes — not on every save round-trip.
  // note.content changes after each save (onUpdate propagates the server response),
  // which would re-run this effect and call setContent, jumping the cursor.
  // The ref guard ensures setContent only fires when the note ID actually changes.
  useEffect(() => {
    if (syncedNoteIdRef.current === note.id) return;
    syncedNoteIdRef.current = note.id;
    if (editor) {
      editor.commands.setContent(note.content, false);
    }
    setLocalTitle(note.title);
    setPlainContent(note.content);
    plainContentRef.current = note.content;
    setSaveState('IDLE');
  }, [note.id, note.title, editor, note.content, note.mode]);

  // Auto-resize textarea to match content height
  useEffect(() => {
    const ta = textareaRef.current;
    if (note.mode === NoteMode.PLAIN && ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [plainContent, note.mode]);

  const persistChange = useCallback(
    (payload: NotePayload) => {
      setSaveState('SAVING');
      requestQueue.current = requestQueue.current.then(async () => {
        try {
          const updated = await noteApi.update(note.id, payload);
          onUpdate(updated);
          setSaveState('SAVED');
          setTimeout(() => setSaveState('IDLE'), 2000);
        } catch {
          setSaveState('FAILED');
        }
      });
    },
    [note.id, onUpdate],
  );

  const triggerSave = useCallback(
    (updates: Partial<NotePayload>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        const content =
          updates.content ??
          (note.mode === NoteMode.RICH ? editor?.getHTML() : plainContentRef.current) ??
          '';
        const payload: NotePayload = {
          title: updates.title ?? localTitle,
          content,
          textContent: getNoteTextContent(content),
          mode: updates.mode ?? note.mode,
          isPinned: updates.isPinned ?? note.isPinned,
        };
        persistChange(payload);
      }, 1000);
    },
    [localTitle, note.mode, note.isPinned, persistChange, editor],
  );

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalTitle(val);
    triggerSave({ title: val });
  };

  const handleTogglePin = () => {
    persistChange({
      content: note.content,
      textContent: note.textContent,
      mode: note.mode,
      isPinned: !note.isPinned,
    });
  };

  const handleSwitchMode = () => {
    if (note.mode === NoteMode.RICH) {
      setShowModeConfirm(true);
    } else {
      const richHTML = wrapPlainText(plainContentRef.current);
      editor?.commands.setContent(richHTML);
      persistChange({
        content: richHTML,
        textContent: getNoteTextContent(richHTML),
        mode: NoteMode.RICH,
      });
    }
  };

  const confirmSwitchToPlain = () => {
    setShowModeConfirm(false);
    const plainText = editor?.getText() || '';
    setPlainContent(plainText);
    plainContentRef.current = plainText;
    editor?.commands.setContent(plainText);
    persistChange({
      content: plainText,
      textContent: plainText,
      mode: NoteMode.PLAIN,
    });
  };

  const copyToClipboard = async (isHTML: boolean = false) => {
    const plainText =
      note.mode === NoteMode.PLAIN ? plainContentRef.current : editor?.getText() ?? '';
    try {
      if (isHTML && note.mode === NoteMode.RICH) {
        if (!editor) return;
        const html = editor.getHTML();
        const blobHTML = new Blob([html], { type: 'text/html' });
        const blobText = new Blob([plainText], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': blobHTML, 'text/plain': blobText }),
        ]);
        setToast({ message: 'Rich text copied!', variant: 'success' });
      } else {
        await navigator.clipboard.writeText(plainText);
        setToast({ message: 'Plain text copied!', variant: 'success' });
      }
    } catch {
      try {
        await navigator.clipboard.writeText(plainText);
        setToast({
          message: 'Copying rich text failed, plain text copied instead.',
          variant: 'error',
        });
      } catch {
        setToast({ message: 'Clipboard access denied.', variant: 'error' });
      }
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      {/* Editor Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-black/50 backdrop-blur-md">
        {/* Top row: back button (phone) + title + desktop controls */}
        <div className="flex items-center gap-2 px-4 py-3 md:px-6 md:py-4">
          <button
            onClick={() => onBack?.()}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Notes</span>
          </button>

          <input
            type="text"
            value={localTitle}
            onChange={handleTitleChange}
            placeholder="Note Title"
            className="min-w-0 flex-1 bg-transparent text-lg font-medium text-zinc-100 placeholder-zinc-800 focus:outline-none md:text-xl"
          />

          {/* Tablet/Desktop controls */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <div className="mr-2 flex items-center">
              {saveState === 'SAVING' && (
                <div className="mr-2 h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
              )}
              {saveState === 'SAVED' && <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />}
              {saveState === 'FAILED' && <AlertCircle className="mr-2 h-4 w-4 text-red-500" />}
              <span className="text-[10px] font-bold tracking-wider text-zinc-600 uppercase">
                {saveState === 'IDLE' ? '' : saveState}
              </span>
            </div>

            <button
              onClick={handleTogglePin}
              className={`rounded-lg p-2 transition-all ${note.isPinned ? 'bg-indigo-400/10 text-indigo-400' : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'}`}
              title="Pin note"
            >
              <Pin className={`h-4 w-4 ${note.isPinned ? 'fill-current' : ''}`} />
            </button>

            <button
              onClick={handleSwitchMode}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold shadow-sm transition-all ${
                note.mode === NoteMode.RICH
                  ? 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
              title="Switch Mode (Cmd+Shift+P)"
            >
              {note.mode === NoteMode.RICH ? (
                <FileCode className="h-4 w-4" />
              ) : (
                <Type className="h-4 w-4" />
              )}
              {note.mode}
            </button>

            <div className="mx-1 h-6 w-px bg-zinc-800" />

            <button
              onClick={() => copyToClipboard(false)}
              className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              title="Copy Plain"
            >
              <Copy className="h-4 w-4" />
            </button>

            {note.mode === NoteMode.RICH && (
              <button
                onClick={() => copyToClipboard(true)}
                className="flex items-center gap-1.5 rounded-lg p-2 text-zinc-500 transition-all hover:bg-indigo-400/10 hover:text-indigo-400"
                title="Copy Rich (HTML)"
              >
                <Copy className="h-4 w-4" />
                <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                  HTML
                </span>
              </button>
            )}

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-400/10 hover:text-red-400"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Phone action bar — second row */}
        <div className="flex items-center justify-between px-4 pb-2 md:hidden">
          <div className="flex items-center">
            {saveState === 'SAVING' && (
              <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
            )}
            {saveState === 'SAVED' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {saveState === 'FAILED' && <AlertCircle className="h-4 w-4 text-red-500" />}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleTogglePin}
              className={`rounded-lg p-2.5 transition-all ${note.isPinned ? 'bg-indigo-400/10 text-indigo-400' : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'}`}
            >
              <Pin className={`h-4 w-4 ${note.isPinned ? 'fill-current' : ''}`} />
            </button>

            <button
              onClick={handleSwitchMode}
              className={`rounded-lg p-2.5 transition-all ${
                note.mode === NoteMode.RICH
                  ? 'bg-indigo-400/10 text-indigo-400'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              {note.mode === NoteMode.RICH ? (
                <FileCode className="h-4 w-4" />
              ) : (
                <Type className="h-4 w-4" />
              )}
            </button>

            {/* Overflow menu */}
            <div className="relative">
              <button
                onClick={() => setShowOverflowMenu((v) => !v)}
                className="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {showOverflowMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowOverflowMenu(false)} />
                  <div className="absolute top-full right-0 z-50 mt-1 w-44 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
                    <button
                      onClick={() => {
                        copyToClipboard(false);
                        setShowOverflowMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <Copy className="h-4 w-4" />
                      Copy Plain
                    </button>
                    {note.mode === NoteMode.RICH && (
                      <button
                        onClick={() => {
                          copyToClipboard(true);
                          setShowOverflowMenu(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                      >
                        <Copy className="h-4 w-4" />
                        Copy HTML
                      </button>
                    )}
                    <div className="my-1 border-t border-zinc-800" />
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(true);
                        setShowOverflowMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-400/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Formatting Toolbar for Rich Mode */}
      {editor && note.mode === NoteMode.RICH && <RichToolbar editor={editor} />}

      {/* Editor Body */}
      <div
        className={`flex-1 overflow-auto p-6 transition-colors md:px-20 lg:px-40 ${note.mode === NoteMode.PLAIN ? 'font-mono' : 'font-sans'}`}
      >
        {note.mode === NoteMode.RICH ? (
          <EditorContent editor={editor} className="h-full" />
        ) : (
          <textarea
            ref={textareaRef}
            value={plainContent}
            onChange={(e) => {
              const val = e.target.value;
              setPlainContent(val);
              plainContentRef.current = val;
              triggerSave({ content: val });
            }}
            placeholder="Start typing plain text..."
            className="min-h-full w-full resize-none overflow-hidden bg-transparent font-mono text-sm leading-relaxed text-zinc-400 focus:outline-none"
          />
        )}
      </div>

      {/* Footer Info — tablet/desktop only */}
      <footer className="hidden items-center justify-between border-t border-zinc-900 bg-black px-6 py-2 text-[10px] font-bold tracking-widest text-zinc-600 uppercase md:flex">
        <div className="flex items-center gap-4">
          <span>Synced: {new Date(note.updatedAt).toLocaleTimeString()}</span>
          <span className="text-zinc-800">&bull;</span>
          <span>{note.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={note.mode === NoteMode.RICH ? 'text-indigo-500' : 'text-zinc-500'}>
            {note.mode}
          </span>
          <span className="text-zinc-800">&bull;</span>
          <span>{getNoteTextContent(note.content).length} chars</span>
        </div>
      </footer>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Note"
        message="This note will be permanently deleted. This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={showModeConfirm}
        title="Switch to Plain Text"
        message="Switching to plain text will permanently remove formatting and save immediately. Continue?"
        variant="warning"
        confirmLabel="Switch"
        onConfirm={confirmSwitchToPlain}
        onCancel={() => setShowModeConfirm(false)}
      />

      <Toast
        open={toast !== null}
        message={toast?.message ?? ''}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />
    </div>
  );
};

export default EditorCanvas;
