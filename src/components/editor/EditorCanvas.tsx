'use client';

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { createPortal } from 'react-dom';
import type { Folder, Note, NotePayload } from '@/types';
import type { SaveState } from '@/types';
import { noteApi } from '@/lib/api-client';
import { detectTerminalTable } from '@/lib/markdown/terminal-table';
import { markdownToPlainText } from '@/lib/markdown/text-projection';
import {
  toggleInlineMark,
  toggleLinePrefix,
  wrapCodeBlock,
  type FormattingResult,
} from '@/lib/markdown/formatting';
import MarkdownEditor, { type MarkdownEditorHandle } from './MarkdownEditor';
import MarkdownPreview from './MarkdownPreview';
import type { EditorScrollPosition } from './editor-scroll';
import RichToolbar from './RichToolbar';
import ConfirmDialog from '../ui/ConfirmDialog';
import Toast from '../ui/Toast';
import {
  Pin,
  Trash2,
  Copy,
  Download,
  Eye,
  Pencil,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  MoreHorizontal,
  Folder as FolderIcon,
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
  folders: Folder[];
  searchQuery: string;
}

export interface EditorCanvasHandle {
  getCurrentState: () => { title: string; textContent: string };
}

const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  { note, onUpdate, onDelete, onBack, autoFocus, onAutoFocusHandled, folders, searchQuery },
  ref,
) {
  const [saveState, setSaveState] = useState<SaveState>('IDLE');
  const [localTitle, setLocalTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  // Header row scrolls horizontally (overflow-x-auto) on narrow panes, which forces
  // overflow-y to clip too — so these dropdowns are portaled to <body> and positioned
  // from the trigger's rect instead of relying on absolute + a relative ancestor.
  const [overflowMenuPos, setOverflowMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [moveMenuPos, setMoveMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [exportMenuPos, setExportMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    variant: 'success' | 'error' | 'info';
  } | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestQueue = useRef<Promise<unknown>>(Promise.resolve());
  const syncedNoteIdRef = useRef<string | null>(null);
  // Ref so triggerSave always reads current content without a stale closure
  const contentRef = useRef(note.content);
  const markdownEditorRef = useRef<MarkdownEditorHandle>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const previewScrollTopRef = useRef(0);
  const editScrollRef = useRef<{
    outer: EditorScrollPosition;
    inner: EditorScrollPosition;
  } | null>(null);
  const rememberPreviewScroll = useCallback((top: number) => {
    previewScrollTopRef.current = top;
  }, []);
  const rememberEditScroll = () => {
    const outer = editorScrollRef.current;
    editScrollRef.current = {
      outer: { top: outer?.scrollTop ?? 0, left: outer?.scrollLeft ?? 0 },
      inner: markdownEditorRef.current?.getScrollPosition() ?? { top: 0, left: 0 },
    };
  };
  const togglePreview = () => {
    if (!previewMode) rememberEditScroll();
    setPreviewMode((value) => !value);
  };
  useLayoutEffect(() => {
    const saved = editScrollRef.current;
    if (previewMode || !saved) return;
    const restoreOuter = () => {
      const outer = editorScrollRef.current;
      if (outer) {
        outer.scrollTop = saved.outer.top;
        outer.scrollLeft = saved.outer.left;
      }
    };
    markdownEditorRef.current?.restoreScrollPosition(saved.inner, restoreOuter);
  }, [previewMode]);

  // Sync content when switching notes — not on every save round-trip.
  // note.content changes after each save (persistChange propagates the server response),
  // which would re-run this effect and call setContent, jumping the cursor.
  // The ref guard ensures setContent only fires when the note ID actually changes.
  useEffect(() => {
    if (syncedNoteIdRef.current === note.id) return;
    syncedNoteIdRef.current = note.id;
    setContent(note.content);
    contentRef.current = note.content;
    setLocalTitle(note.title);
    setSaveState('IDLE');
    setPreviewMode(false);
    previewScrollTopRef.current = 0;
    editScrollRef.current = null;
    if (autoFocus) onAutoFocusHandled?.();
  }, [note.id, note.title, note.content, autoFocus, onAutoFocusHandled]);
  useEffect(
    () => () => {
      syncedNoteIdRef.current = null;
    },
    [],
  );

  const persistChange = useCallback(
    (payload: Partial<NotePayload>, options: { showProgressAndSuccess?: boolean } = {}) => {
      const showProgressAndSuccess = options.showProgressAndSuccess ?? true;
      if (showProgressAndSuccess) setSaveState('SAVING');

      requestQueue.current = requestQueue.current.then(async () => {
        try {
          const updated = await noteApi.update(note.id, payload);
          onUpdate(updated);
          // Only adopt the server's title if nothing newer has been typed since this
          // request was sent — otherwise a slow round-trip clobbers in-progress typing
          // (most visible with IME composition, e.g. Chinese input).
          setLocalTitle((current) =>
            payload.title !== undefined && current === payload.title ? updated.title : current,
          );

          if (showProgressAndSuccess) {
            setSaveState('SAVED');
            setTimeout(() => setSaveState('IDLE'), 2000);
          }
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
        const newContent = updates.content ?? contentRef.current;
        const mode = updates.mode ?? note.mode;
        // Always the stripped projection — content is canonical Markdown in both
        // modes now, so this is the correct searchable/display representation
        // regardless of which mode the note is currently in (see Fix 2).
        const textContent = markdownToPlainText(newContent);
        const payload: NotePayload = {
          title: updates.title ?? localTitle,
          content: newContent,
          textContent,
          mode,
          isPinned: updates.isPinned ?? note.isPinned,
        };
        persistChange(payload);
      }, 1000);
    },
    [localTitle, note.mode, note.isPinned, persistChange],
  );

  const handlePasteText = useCallback((text: string): string | null => {
    const detection = detectTerminalTable(text);
    if (detection.type === 'table') return detection.markdown;
    if (detection.type === 'code') return '```text\n' + text + '\n```';
    return null; // let CodeMirror's default plain-text paste handle it
  }, []);

  const handlePasteImage = useCallback((file: File) => {
    const pasteNoteId = syncedNoteIdRef.current;
    // Capture the selection synchronously, at paste time — resizing runs
    // async (canvas.toDataURL), during which the user can move the cursor
    // or select other text. Reading the selection only after the resize
    // resolves would insert the image at the wrong, now-current position.
    const pasteRange = markdownEditorRef.current?.getSelection() ?? { start: 0, end: 0 };
    resizeImageToDataURL(file).then((dataUrl) => {
      if (syncedNoteIdRef.current !== pasteNoteId) return;
      markdownEditorRef.current?.insertAt(pasteRange, `![${file.name}](${dataUrl})`);
    });
  }, []);

  const applyFormatting = useCallback(
    (fn: (text: string, sel: { start: number; end: number }) => FormattingResult) => {
      const editor = markdownEditorRef.current;
      if (!editor) return;
      const sel = editor.getSelection();
      const result = fn(content, sel);
      editor.applyFormatting(result);
      setContent(result.text);
      contentRef.current = result.text;
      triggerSave({ content: result.text });
    },
    [content, triggerSave],
  );

  useImperativeHandle(
    ref,
    () => ({
      getCurrentState: () => {
        const textContent = markdownToPlainText(content);
        return { title: localTitle, textContent };
      },
    }),
    [localTitle, content],
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

  // Sends ONLY { folderId } — a full payload here could clobber content
  // that a pending debounced save hasn't flushed yet (see design spec).
  const handleMoveToFolder = (folderId: string | null) => {
    setShowMoveMenu(false);
    setShowOverflowMenu(false);
    if (folderId !== note.folderId) persistChange({ folderId });
  };

  // Project the current draft, including edits whose autosave is still pending.
  // The frozen compatibility mode never changes how content is interpreted.
  const displayText = markdownToPlainText(content);
  const wordCount = countWords(displayText);
  const charCount = countCharacters(displayText);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(displayText);
      setToast({ message: 'Copied!', variant: 'success' });
    } catch {
      setToast({ message: 'Clipboard access denied.', variant: 'error' });
    }
  };

  const handleExportTxt = () => {
    downloadTextFile(`${sanitizeFilename(localTitle)}.txt`, displayText);
  };

  const handleExportMd = () => {
    downloadTextFile(`${sanitizeFilename(localTitle)}.md`, content);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      {/* Editor Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-black/50 backdrop-blur-md">
        {/* Top row: back button (phone) + title + desktop controls */}
        <div className="flex items-center gap-2 overflow-x-auto px-4 py-3 md:px-6 md:py-4">
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

          {/* Mobile action group — pin, preview, overflow */}
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
              title={note.isPinned ? 'Unpin note' : 'Pin note'}
              aria-label={note.isPinned ? 'Unpin note' : 'Pin note'}
              aria-pressed={note.isPinned}
            >
              <Pin className={`h-4 w-4 ${note.isPinned ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={togglePreview}
              aria-label={previewMode ? 'Edit' : 'Preview'}
              aria-pressed={previewMode}
              title={previewMode ? 'Edit' : 'Preview'}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${previewMode ? 'border-indigo-400/30 bg-indigo-400/10 text-indigo-400' : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
            >
              {previewMode ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="hidden md:inline">{previewMode ? 'Edit' : 'Preview'}</span>
            </button>

            {/* Overflow menu */}
            <div className="relative">
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setShowOverflowMenu((v) => {
                    if (v) {
                      setShowExportMenu(false);
                      setShowMoveMenu(false);
                    } else {
                      setOverflowMenuPos({
                        top: rect.bottom + 4,
                        right: window.innerWidth - rect.right,
                      });
                    }
                    return !v;
                  });
                }}
                className="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                title="More options"
                aria-label="More options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {showOverflowMenu &&
                overflowMenuPos &&
                createPortal(
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => {
                        setShowOverflowMenu(false);
                        setShowExportMenu(false);
                        setShowMoveMenu(false);
                      }}
                    />
                    <div
                      className="fixed z-50 w-44 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
                      style={{ top: overflowMenuPos.top, right: overflowMenuPos.right }}
                    >
                      <button
                        onClick={() => {
                          copyToClipboard();
                          setShowExportMenu(false);
                          setShowOverflowMenu(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                      >
                        <Copy className="h-4 w-4" />
                        Copy
                      </button>
                      <button
                        onClick={() => setShowMoveMenu((v) => !v)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                      >
                        <FolderIcon className="h-4 w-4" />
                        Move to
                      </button>
                      {showMoveMenu && (
                        <div className="max-h-48 overflow-y-auto border-y border-zinc-800 bg-black/20 py-1">
                          <button
                            onClick={() => handleMoveToFolder(null)}
                            className={`flex w-full items-center px-11 py-2 text-sm transition-colors hover:bg-zinc-800 ${
                              note.folderId === null
                                ? 'text-indigo-400'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            All Notes
                          </button>
                          {folders.map((folder) => (
                            <button
                              key={folder.id}
                              onClick={() => handleMoveToFolder(folder.id)}
                              className={`flex w-full items-center px-11 py-2 text-sm transition-colors hover:bg-zinc-800 ${
                                note.folderId === folder.id
                                  ? 'text-indigo-400'
                                  : 'text-zinc-400 hover:text-white'
                              }`}
                            >
                              <span className="truncate">{folder.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => setShowExportMenu((v) => !v)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                      >
                        <Download className="h-4 w-4" />
                        Export
                      </button>
                      {showExportMenu && (
                        <div className="border-y border-zinc-800 bg-black/20 py-1">
                          <button
                            onClick={() => {
                              handleExportTxt();
                              setShowExportMenu(false);
                              setShowOverflowMenu(false);
                            }}
                            className="flex w-full items-center justify-between px-11 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                          >
                            <span>Text</span>
                            <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                              TXT
                            </span>
                          </button>
                          <button
                            onClick={() => {
                              handleExportMd();
                              setShowExportMenu(false);
                              setShowOverflowMenu(false);
                            }}
                            className="flex w-full items-center justify-between px-11 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                          >
                            <span>Markdown</span>
                            <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                              MD
                            </span>
                          </button>
                        </div>
                      )}
                      <div className="my-1 border-t border-zinc-800" />
                      <button
                        onClick={() => {
                          setShowDeleteConfirm(true);
                          setShowExportMenu(false);
                          setShowOverflowMenu(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-400/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </>,
                  document.body,
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
              title={note.isPinned ? 'Unpin note' : 'Pin note'}
              aria-label={note.isPinned ? 'Unpin note' : 'Pin note'}
              aria-pressed={note.isPinned}
            >
              <Pin className={`h-4 w-4 ${note.isPinned ? 'fill-current' : ''}`} />
            </button>

            <div className="relative">
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setShowExportMenu(false);
                  setShowMoveMenu((v) => {
                    if (!v) {
                      setMoveMenuPos({
                        top: rect.bottom + 4,
                        right: window.innerWidth - rect.right,
                      });
                    }
                    return !v;
                  });
                }}
                className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                title="Move to folder"
              >
                <FolderIcon className="h-4 w-4" />
              </button>

              {showMoveMenu &&
                moveMenuPos &&
                createPortal(
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMoveMenu(false)} />
                    <div
                      className="fixed z-50 max-h-64 w-44 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
                      style={{ top: moveMenuPos.top, right: moveMenuPos.right }}
                    >
                      <button
                        onClick={() => handleMoveToFolder(null)}
                        className={`flex w-full items-center px-4 py-2.5 text-sm transition-colors hover:bg-zinc-800 ${
                          note.folderId === null
                            ? 'text-indigo-400'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        All Notes
                      </button>
                      {folders.map((folder) => (
                        <button
                          key={folder.id}
                          onClick={() => handleMoveToFolder(folder.id)}
                          className={`flex w-full items-center px-4 py-2.5 text-sm transition-colors hover:bg-zinc-800 ${
                            note.folderId === folder.id
                              ? 'text-indigo-400'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          <span className="truncate">{folder.name}</span>
                        </button>
                      ))}
                    </div>
                  </>,
                  document.body,
                )}
            </div>

            <button
              type="button"
              onClick={togglePreview}
              aria-label={previewMode ? 'Edit' : 'Preview'}
              aria-pressed={previewMode}
              title={previewMode ? 'Edit' : 'Preview'}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${previewMode ? 'border-indigo-400/30 bg-indigo-400/10 text-indigo-400' : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
            >
              {previewMode ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="hidden md:inline">{previewMode ? 'Edit' : 'Preview'}</span>
            </button>

            <div className="mx-1 h-6 w-px bg-zinc-800" />

            <button
              onClick={copyToClipboard}
              className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              title="Copy"
            >
              <Copy className="h-4 w-4" />
            </button>

            <div className="relative">
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setShowMoveMenu(false);
                  setShowExportMenu((v) => {
                    if (!v) {
                      setExportMenuPos({
                        top: rect.bottom + 4,
                        right: window.innerWidth - rect.right,
                      });
                    }
                    return !v;
                  });
                }}
                className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                title="Export"
              >
                <Download className="h-4 w-4" />
              </button>

              {showExportMenu &&
                exportMenuPos &&
                createPortal(
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                    <div
                      className="fixed z-50 w-36 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
                      style={{ top: exportMenuPos.top, right: exportMenuPos.right }}
                    >
                      <button
                        onClick={() => {
                          handleExportTxt();
                          setShowExportMenu(false);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                      >
                        <span>Text</span>
                        <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                          TXT
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          handleExportMd();
                          setShowExportMenu(false);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                      >
                        <span>Markdown</span>
                        <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                          MD
                        </span>
                      </button>
                    </div>
                  </>,
                  document.body,
                )}
            </div>

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

      {/* Formatting Toolbar */}
      {!previewMode && (
        <RichToolbar
          onToggleInlineMark={(marker) =>
            applyFormatting((text, sel) => toggleInlineMark(text, sel, marker))
          }
          onToggleLinePrefix={(prefix) =>
            applyFormatting((text, sel) => toggleLinePrefix(text, sel, prefix))
          }
          onWrapCodeBlock={() => applyFormatting(wrapCodeBlock)}
        />
      )}

      {/* Editor Body */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={editorScrollRef}
          data-testid="markdown-editor-scroll"
          hidden={previewMode}
          inert={previewMode}
          aria-hidden={previewMode}
          className="md-editor-surface h-full overflow-auto p-6 font-mono md:px-10 lg:px-20"
        >
          <MarkdownEditor
            key={note.id}
            ref={markdownEditorRef}
            value={content}
            onChange={(val) => {
              setContent(val);
              contentRef.current = val;
              triggerSave({ content: val });
            }}
            onPasteText={handlePasteText}
            onPasteImage={handlePasteImage}
            autoFocus={autoFocus}
            searchQuery={searchQuery}
          />
        </div>
        {previewMode && (
          <MarkdownPreview
            content={content}
            initialScrollTop={previewScrollTopRef.current}
            onScrollPositionChange={rememberPreviewScroll}
          />
        )}
      </div>

      {/* Footer Info — tablet/desktop only */}
      <footer className="hidden items-center justify-between border-t border-zinc-900 bg-black px-6 py-2 text-[10px] font-bold tracking-widest text-zinc-600 uppercase md:flex">
        <div className="flex items-center gap-4">
          <span>
            Synced:{' '}
            {new Date(note.updatedAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">{previewMode ? 'PREVIEW' : 'EDIT'}</span>
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
