'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
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
  Download,
  FileCode,
  Type,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  MoreHorizontal,
} from 'lucide-react';

async function resizeImageToDataURL(file: File, maxDimension = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas 2d context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/webp', 0.85));
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

type TiptapMark = { type: string; attrs?: Record<string, unknown> };

type TiptapNode = {
  type?: string;
  text?: string;
  content?: TiptapNode[];
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
};
const BLOCK_NODE_TYPES = new Set(['paragraph', 'heading', 'blockquote', 'listItem', 'codeBlock']);

function nodeToText(node: TiptapNode): string {
  if (node.type === 'image') {
    const alt = node.attrs?.alt as string | undefined;
    return `[image: ${alt || 'embedded-image.webp'}]`;
  }
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (!node.content?.length) return '';
  const inner = node.content.map(nodeToText).join('');
  return BLOCK_NODE_TYPES.has(node.type ?? '') ? inner + '\n' : inner;
}

function applyMarks(text: string, marks: TiptapMark[] = []): string {
  const wrappers: Array<[string, (s: string) => string]> = [
    ['code', (s) => `\`${s}\``],
    ['strike', (s) => `~~${s}~~`],
    ['italic', (s) => `_${s}_`],
    ['bold', (s) => `**${s}**`],
    ['underline', (s) => `<u>${s}</u>`],
  ];
  let result = text;
  for (const [type, wrap] of wrappers) {
    if (marks.some((m) => m.type === type)) result = wrap(result);
  }
  // No Link extension is registered on this editor (see useEditor below), so no text
  // node can carry a 'link' mark today — this branch is inert until one is added.
  const link = marks.find((m) => m.type === 'link');
  const href = link?.attrs?.href;
  if (typeof href === 'string') {
    result = `[${result}](${href})`;
  }
  return result;
}

function nodeToMarkdown(node: TiptapNode): string {
  if (node.type === 'image') {
    const alt = node.attrs?.alt as string | undefined;
    return `[image: ${alt || 'embedded-image.webp'}]`;
  }
  if (node.type === 'text') return applyMarks(node.text ?? '', node.marks);
  if (node.type === 'hardBreak') return '\n';

  const inner = (node.content ?? []).map(nodeToMarkdown);

  switch (node.type) {
    case 'heading': {
      const level = (node.attrs?.level as number | undefined) ?? 1;
      return `${'#'.repeat(level)} ${inner.join('')}\n\n`;
    }
    case 'paragraph':
      return `${inner.join('')}\n\n`;
    case 'codeBlock':
      return `\`\`\`\n${inner.join('')}\n\`\`\`\n\n`;
    case 'blockquote':
      return (
        inner
          .join('')
          .trimEnd()
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n') + '\n\n'
      );
    case 'bulletList':
      return (node.content ?? []).map((li) => `- ${nodeToMarkdown(li).trim()}`).join('\n') + '\n\n';
    case 'orderedList':
      return (
        (node.content ?? []).map((li, i) => `${i + 1}. ${nodeToMarkdown(li).trim()}`).join('\n') +
        '\n\n'
      );
    case 'listItem':
      return inner.join('');
    default:
      return inner.join('');
  }
}

function sanitizeFilename(title: string): string {
  const cleaned = title.trim().replace(/[\\/:*?"<>|]/g, '-');
  return cleaned || 'untitled';
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// CJK scripts have no spaces between words, so a plain whitespace split undercounts
// them (e.g. "统计 中文" would count as 2 "words" instead of 4 characters). Count each
// CJK character individually, then count remaining whitespace-delimited runs as words.
const CJK_CHAR_REGEX = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7a3]/g;

function countWords(text: string): number {
  const cjkCount = (text.match(CJK_CHAR_REGEX) ?? []).length;
  const nonCjkText = text.replace(CJK_CHAR_REGEX, ' ').trim();
  const nonCjkCount = nonCjkText ? nonCjkText.split(/\s+/).length : 0;
  return cjkCount + nonCjkCount;
}

const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function countCharacters(text: string): number {
  return Array.from(GRAPHEME_SEGMENTER.segment(text)).length;
}

interface EditorCanvasProps {
  note: Note;
  onUpdate: (note: Note) => void;
  onDelete: () => void;
  onBack?: () => void;
  autoFocus?: boolean;
  onAutoFocusHandled?: () => void;
}

export interface EditorCanvasHandle {
  getCurrentState: () => { title: string; textContent: string };
}

const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  { note, onUpdate, onDelete, onBack, autoFocus, onAutoFocusHandled },
  ref,
) {
  const [saveState, setSaveState] = useState<SaveState>('IDLE');
  const [localTitle, setLocalTitle] = useState(note.title);
  const [plainContent, setPlainContent] = useState(note.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showModeConfirm, setShowModeConfirm] = useState(false);
  const [modeConfirmHasImages, setModeConfirmHasImages] = useState(false);
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
  const currentModeRef = useRef(note.mode);

  const editor = useEditor({
    extensions: [StarterKit, Underline, Image.configure({ allowBase64: true })],
    content: note.content,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[400px]',
      },
      handlePaste: (view, event) => {
        if (note.mode === NoteMode.PLAIN || !editor) return false;
        // Inside a code block, let Tiptap handle paste natively (plain text only)
        if (editor.isActive('codeBlock')) return false;

        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((item) => item.type.startsWith('image/'));
        if (imageItem) {
          const file = imageItem.getAsFile();
          if (file) {
            const pasteNoteId = syncedNoteIdRef.current;
            const pasteFrom = view.state.selection.from;
            resizeImageToDataURL(file).then((dataUrl) => {
              if (syncedNoteIdRef.current !== pasteNoteId) return;
              if (currentModeRef.current !== NoteMode.RICH) return;
              const insertPos = Math.min(pasteFrom, editor.state.doc.content.size);
              editor
                .chain()
                .focus()
                .insertContentAt(insertPos, {
                  type: 'image',
                  attrs: { src: dataUrl, alt: file.name },
                })
                .run();
            });
            return true;
          }
        }

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
    currentModeRef.current = note.mode;
    if (syncedNoteIdRef.current === note.id) return;
    syncedNoteIdRef.current = note.id;
    if (editor) {
      editor.commands.setContent(note.content, false);
    }
    setLocalTitle(note.title);
    setPlainContent(note.content);
    plainContentRef.current = note.content;
    setSaveState('IDLE');
    if (autoFocus) {
      if (note.mode === NoteMode.RICH) {
        editor?.commands.focus();
      } else {
        textareaRef.current?.focus();
      }
      onAutoFocusHandled?.();
    }
  }, [note.id, note.title, editor, note.content, note.mode, autoFocus, onAutoFocusHandled]);

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

  useImperativeHandle(
    ref,
    () => ({
      getCurrentState: () => {
        const textContent =
          note.mode === NoteMode.RICH
            ? nodeToText((editor?.getJSON() ?? {}) as TiptapNode)
            : getNoteTextContent(plainContentRef.current);
        return { title: localTitle, textContent };
      },
    }),
    [localTitle, note.mode, editor],
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
      setModeConfirmHasImages(editor?.getHTML().includes('<img') ?? false);
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
    const json = editor?.getJSON() as TiptapNode | undefined;
    const plainText = json ? nodeToText(json).trim() : '';
    setPlainContent(plainText);
    plainContentRef.current = plainText;
    editor?.commands.setContent(plainText);
    persistChange({
      content: plainText,
      textContent: plainText,
      mode: NoteMode.PLAIN,
    });
  };

  const copyToClipboard = async () => {
    const plainText =
      note.mode === NoteMode.PLAIN ? plainContentRef.current : (editor?.getText() ?? '');
    try {
      await navigator.clipboard.writeText(plainText);
      setToast({ message: 'Copied!', variant: 'success' });
    } catch {
      setToast({ message: 'Clipboard access denied.', variant: 'error' });
    }
  };

  const handleExportTxt = () => {
    const text =
      note.mode === NoteMode.RICH
        ? nodeToText((editor?.getJSON() ?? {}) as TiptapNode)
        : plainContentRef.current;
    downloadTextFile(`${sanitizeFilename(localTitle)}.txt`, text);
  };

  const handleExportMd = () => {
    const text =
      note.mode === NoteMode.RICH
        ? nodeToMarkdown((editor?.getJSON() ?? {}) as TiptapNode).trim()
        : plainContentRef.current;
    downloadTextFile(`${sanitizeFilename(localTitle)}.md`, text);
  };

  // Word counting needs block boundaries preserved (otherwise adjacent paragraphs merge
  // into one "word"); character counting needs them absent (773dc49 — no phantom \n\n).
  // One separator can't serve both, so RICH mode reads two differently-separated strings.
  const wordCount =
    note.mode === NoteMode.RICH
      ? countWords(editor?.getText({ blockSeparator: '\n' }) ?? '')
      : countWords(plainContent);
  const charCount =
    note.mode === NoteMode.RICH
      ? countCharacters(editor?.getText({ blockSeparator: '' }) ?? '')
      : countCharacters(plainContent);

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
            placeholder="Untitled"
            className="min-w-0 flex-1 bg-transparent text-lg font-medium text-zinc-100 placeholder-zinc-800 focus:outline-none md:text-xl"
          />

          {/* Mobile action group — pin, mode, overflow */}
          <div className="flex shrink-0 items-center gap-1 md:hidden">
            <div className="flex items-center px-1">
              {saveState === 'SAVING' && (
                <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
              )}
              {saveState === 'SAVED' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
              {saveState === 'FAILED' && <AlertCircle className="h-4 w-4 text-red-500" />}
            </div>

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
                        copyToClipboard();
                        setShowOverflowMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        handleExportTxt();
                        setShowOverflowMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <Download className="h-4 w-4" />
                      Export .txt
                    </button>
                    <button
                      onClick={() => {
                        handleExportMd();
                        setShowOverflowMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <Download className="h-4 w-4" />
                      Export .md
                    </button>
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
              onClick={copyToClipboard}
              className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              title="Copy"
            >
              <Copy className="h-4 w-4" />
            </button>

            <button
              onClick={handleExportTxt}
              className="flex items-center gap-1.5 rounded-lg p-2 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white"
              title="Export as .txt"
            >
              <Download className="h-4 w-4" />
              <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                TXT
              </span>
            </button>

            <button
              onClick={handleExportMd}
              className="flex items-center gap-1.5 rounded-lg p-2 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white"
              title="Export as .md"
            >
              <Download className="h-4 w-4" />
              <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                MD
              </span>
            </button>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-400/10 hover:text-red-400"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
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
            onPaste={(e) => {
              const items = Array.from(e.clipboardData?.items ?? []);
              const imageItem = items.find((item) => item.type.startsWith('image/'));
              if (imageItem) {
                e.preventDefault();
                const file = imageItem.getAsFile();
                const name = file?.name || 'clipboard-image.png';
                const ta = textareaRef.current;
                if (ta) {
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  const placeholder = `[image: ${name}]`;
                  const newVal =
                    plainContent.slice(0, start) + placeholder + plainContent.slice(end);
                  setPlainContent(newVal);
                  plainContentRef.current = newVal;
                  triggerSave({ content: newVal });
                }
              }
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
        </div>
        <div className="flex items-center gap-2">
          <span className={note.mode === NoteMode.RICH ? 'text-indigo-500' : 'text-zinc-500'}>
            {note.mode}
          </span>
          <span className="text-zinc-800">&bull;</span>
          <span>{wordCount} Words</span>
          <span className="text-zinc-800">&bull;</span>
          <span>{charCount} Characters</span>
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
        message={
          modeConfirmHasImages
            ? 'Switching to plain text will permanently remove formatting and embedded images. Images will be replaced with placeholders. Continue?'
            : 'Switching to plain text will permanently remove formatting and save immediately. Continue?'
        }
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
});

export default EditorCanvas;
