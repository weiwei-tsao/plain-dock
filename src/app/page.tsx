'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Folder, Note } from '@/types';
import { folderApi, noteApi } from '@/lib/api-client';
import {
  getLayout,
  saveLayout,
  clamp,
  FOLDER_WIDTH_MIN,
  FOLDER_WIDTH_MAX,
  FOLDER_WIDTH_DEFAULT,
  NOTES_WIDTH_MIN,
  NOTES_WIDTH_MAX,
  NOTES_WIDTH_DEFAULT,
} from '@/lib/layout-storage';

const sortNotes = (list: Note[]): Note[] =>
  [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
import FolderSidebar from '@/components/sidebar/FolderSidebar';
import NotesList from '@/components/sidebar/NotesList';
import ResizeHandle from '@/components/sidebar/ResizeHandle';
import EditorCanvas, { type EditorCanvasHandle } from '@/components/editor/EditorCanvas';
import PlainDockIcon from '@/components/ui/PlainDockIcon';

type ActiveNoteStatus = 'idle' | 'loading' | 'ready' | 'error';
type ViewportTier = 'mobile' | 'tablet' | 'desktop';

const MOBILE_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;

function getViewportTier(width: number): ViewportTier {
  if (width < MOBILE_BREAKPOINT) return 'mobile';
  if (width < DESKTOP_BREAKPOINT) return 'tablet';
  return 'desktop';
}

const skeletonLineWidths = ['w-full', 'w-11/12', 'w-4/5', 'w-10/12', 'w-2/3'];

function NoteLoadingState() {
  return (
    <div
      className="flex flex-1 flex-col overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading note"
    >
      <div className="border-b border-zinc-800/80 px-4 py-3 md:px-6 md:py-4">
        <div className="flex flex-col gap-4">
          <div className="h-7 w-48 animate-pulse rounded bg-zinc-800" />
          <div className="flex gap-2">
            <div className="h-8 w-8 animate-pulse rounded bg-zinc-800/80" />
            <div className="h-8 w-8 animate-pulse rounded bg-zinc-800/80" />
            <div className="h-8 w-8 animate-pulse rounded bg-zinc-800/80" />
            <div className="h-8 w-20 animate-pulse rounded bg-zinc-800/80" />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-6 md:px-10 lg:px-20">
        <p className="mb-7 text-sm text-zinc-500">Loading note...</p>
        <div className="space-y-4">
          {skeletonLineWidths.map((width) => (
            <div key={width} className={`${width} h-4 animate-pulse rounded bg-zinc-800/80`} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface EditorAreaProps {
  activeNoteStatus: ActiveNoteStatus;
  activeNote: Note | null;
  editorRef: React.RefObject<EditorCanvasHandle | null>;
  onUpdate: (note: Note) => void;
  onDelete: () => void;
  onBack: () => void;
  autoFocus: boolean;
  onAutoFocusHandled: () => void;
  folders: Folder[];
  onRetry: () => void;
  onCreateNote: () => void;
  searchQuery: string;
}

function EditorArea({
  activeNoteStatus,
  activeNote,
  editorRef,
  onUpdate,
  onDelete,
  onBack,
  autoFocus,
  onAutoFocusHandled,
  folders,
  onRetry,
  onCreateNote,
  searchQuery,
}: EditorAreaProps) {
  if (activeNoteStatus === 'loading') return <NoteLoadingState />;

  if (activeNoteStatus === 'error') {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-zinc-500">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-light text-zinc-300">Unable to load note</h1>
          <p className="text-sm">The selected note could not be opened.</p>
          <button
            onClick={onRetry}
            className="mt-6 rounded-lg border border-zinc-700 px-4 py-2 text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (activeNote) {
    return (
      <EditorCanvas
        ref={editorRef}
        note={activeNote}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onBack={onBack}
        autoFocus={autoFocus}
        onAutoFocusHandled={onAutoFocusHandled}
        folders={folders}
        searchQuery={searchQuery}
      />
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center text-zinc-500">
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-light">PlainDock</h1>
        <p className="text-sm">Select or create a note to begin</p>
        <button
          onClick={onCreateNote}
          className="mt-6 rounded-lg border border-zinc-700 px-4 py-2 transition-colors hover:bg-zinc-800"
        >
          Create New Note
        </button>
      </div>
    </div>
  );
}

export default function MainPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [activeNoteStatus, setActiveNoteStatus] = useState<ActiveNoteStatus>('idle');
  const [noteLoadAttempt, setNoteLoadAttempt] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoFocusNote, setAutoFocusNote] = useState(false);
  const editorRef = useRef<EditorCanvasHandle>(null);

  // Desktop/tablet pane layout
  const [folderWidth, setFolderWidth] = useState(FOLDER_WIDTH_DEFAULT);
  const [notesWidth, setNotesWidth] = useState(NOTES_WIDTH_DEFAULT);
  const [folderCollapsed, setFolderCollapsed] = useState(false);
  const [folderOverlayOpen, setFolderOverlayOpen] = useState(false);
  const [viewportTier, setViewportTier] = useState<ViewportTier>('desktop');

  // Mobile navigation
  const [mobilePanel, setMobilePanel] = useState<'list' | 'editor'>('list');
  const [showFolders, setShowFolders] = useState(false);

  useEffect(() => {
    const update = () => setViewportTier(getViewportTier(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const stored = getLayout();
    if (stored) {
      setFolderWidth(stored.folderWidth);
      setNotesWidth(stored.notesWidth);
      setFolderCollapsed(stored.folderCollapsed);
    }
  }, []);

  useEffect(() => {
    saveLayout({ folderWidth, notesWidth, folderCollapsed });
  }, [folderWidth, notesWidth, folderCollapsed]);

  const loadNotes = useCallback(async () => {
    const data = await noteApi.list();
    setNotes(data);
    return data;
  }, []);

  const activeFolderIdRef = useRef(activeFolderId);
  activeFolderIdRef.current = activeFolderId;

  const activeNoteIdRef = useRef(activeNoteId);
  activeNoteIdRef.current = activeNoteId;

  useEffect(() => {
    let cancelled = false;
    loadNotes().then((data) => {
      if (cancelled || activeNoteIdRef.current) return;
      const folderId = activeFolderIdRef.current;
      const scoped = folderId ? data.filter((n) => n.folderId === folderId) : data;
      if (scoped.length === 0) return;
      setActiveNoteId(scoped[0].id);
      setMobilePanel('editor');
    });
    return () => {
      cancelled = true;
    };
  }, [loadNotes]);

  const loadFolders = useCallback(async () => {
    const data = await folderApi.list();
    setFolders(data);
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Fetch full note (with content) when selection changes
  useEffect(() => {
    if (!activeNoteId) {
      setActiveNote(null);
      setActiveNoteStatus('idle');
      return;
    }

    let isCurrentRequest = true;
    setActiveNote(null);
    setActiveNoteStatus('loading');
    noteApi
      .get(activeNoteId)
      .then((note) => {
        if (!isCurrentRequest) return;
        setActiveNote(note);
        setActiveNoteStatus('ready');
      })
      .catch(() => {
        if (!isCurrentRequest) return;
        setActiveNote(null);
        setActiveNoteStatus('error');
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [activeNoteId, noteLoadAttempt]);

  const cleanupEmptyNote = useCallback(async () => {
    if (!activeNote) return;
    const current = editorRef.current?.getCurrentState();
    const title = current?.title ?? activeNote.title;
    const textContent = current?.textContent ?? activeNote.textContent;
    if (title.trim() === '' && textContent.trim() === '') {
      await noteApi.delete(activeNote.id);
      setNotes((prev) => prev.filter((n) => n.id !== activeNote.id));
    }
  }, [activeNote]);

  const handleSelectNote = useCallback(
    async (id: string) => {
      if (id !== activeNoteId) {
        await cleanupEmptyNote();
        setActiveNote(null);
        setActiveNoteStatus('loading');
      }
      setActiveNoteId(id);
      setMobilePanel('editor');
    },
    [activeNoteId, cleanupEmptyNote],
  );

  const handleBack = useCallback(async () => {
    await cleanupEmptyNote();
    setActiveNoteId(null);
    setActiveNote(null);
    setActiveNoteStatus('idle');
    setMobilePanel('list');
  }, [cleanupEmptyNote]);

  const prevFolderIdRef = useRef(activeFolderId);
  useEffect(() => {
    if (prevFolderIdRef.current === activeFolderId) return;
    prevFolderIdRef.current = activeFolderId;

    const scoped = activeFolderId ? notes.filter((n) => n.folderId === activeFolderId) : notes;
    if (activeNoteId && scoped.some((n) => n.id === activeNoteId)) return;

    cleanupEmptyNote();
    setActiveNote(null);
    setActiveNoteStatus(scoped.length > 0 ? 'loading' : 'idle');
    setActiveNoteId(scoped.length > 0 ? scoped[0].id : null);
    setMobilePanel(scoped.length > 0 ? 'editor' : 'list');
  }, [activeFolderId, notes, activeNoteId, cleanupEmptyNote]);

  const handleCreateNote = useCallback(async () => {
    await cleanupEmptyNote();
    const newNote = await noteApi.create(activeFolderId);
    setNotes((prev) => sortNotes([newNote, ...prev]));
    setActiveNote(null);
    setActiveNoteStatus('loading');
    setActiveNoteId(newNote.id);
    setAutoFocusNote(true);
    setMobilePanel('editor');
    loadNotes().catch(() => {});
  }, [cleanupEmptyNote, loadNotes, activeFolderId]);

  const handleDeleteNote = async (id: string) => {
    await noteApi.delete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeNoteId === id) {
      setActiveNoteId(null);
      setActiveNote(null);
      setActiveNoteStatus('idle');
      setMobilePanel('list');
    }
  };

  const handleUpdateNoteLocally = (updatedNote: Note) => {
    setNotes((prev) => sortNotes(prev.map((n) => (n.id === updatedNote.id ? updatedNote : n))));
    setActiveNote(updatedNote);
    setActiveNoteStatus('ready');
  };

  const handleRefresh = useCallback(async () => {
    await Promise.all([loadNotes(), loadFolders()]);
    if (activeNoteId) {
      setActiveNote(null);
      setActiveNoteStatus('loading');
      setNoteLoadAttempt((attempt) => attempt + 1);
    }
  }, [loadNotes, loadFolders, activeNoteId]);

  const handleCreateFolder = useCallback(async (name: string) => {
    const folder = await folderApi.create(name);
    setFolders((prev) => [...prev, folder]);
  }, []);

  const handleRenameFolder = useCallback(async (id: string, name: string) => {
    const folder = await folderApi.rename(id, name);
    setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
  }, []);

  // Mirrors the DB's ON DELETE SET NULL in client state — no refetch needed
  const handleDeleteFolder = useCallback(
    async (id: string) => {
      await folderApi.remove(id);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setNotes((prev) => prev.map((n) => (n.folderId === id ? { ...n, folderId: null } : n)));
      setActiveNote((prev) => (prev?.folderId === id ? { ...prev, folderId: null } : prev));
      if (activeFolderId === id) setActiveFolderId(null);
    },
    [activeFolderId],
  );

  const handleRetryNoteLoad = useCallback(() => {
    setActiveNote(null);
    setActiveNoteStatus('loading');
    setNoteLoadAttempt((attempt) => attempt + 1);
  }, []);

  // Cmd/Ctrl+K focuses search. Tiptap's extensions (StarterKit, Underline,
  // Image, Table*, Link, CodeBlockLowlight) don't bind this shortcut, so no
  // conflict with the editor.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();

      if (viewportTier === 'mobile') {
        setShowFolders(false);
        setMobilePanel('list');
      } else if (viewportTier === 'tablet') {
        setFolderOverlayOpen(false);
      }

      requestAnimationFrame(() => {
        document.getElementById('notes-search-input')?.focus();
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewportTier]);

  const handleToggleFolders = useCallback(() => {
    if (viewportTier === 'desktop') {
      setFolderCollapsed((v) => !v);
    } else if (viewportTier === 'tablet') {
      setFolderOverlayOpen((v) => !v);
    } else {
      setShowFolders(true);
    }
  }, [viewportTier]);

  const handleSelectFolderMobile = useCallback((id: string | null) => {
    setActiveFolderId(id);
    setShowFolders(false);
  }, []);

  const handleSelectFolderOverlay = useCallback((id: string | null) => {
    setActiveFolderId(id);
    setFolderOverlayOpen(false);
  }, []);

  const activeFolderName = activeFolderId
    ? (folders.find((f) => f.id === activeFolderId)?.name ?? 'All Notes')
    : 'All Notes';

  const folderSidebarProps = {
    notes,
    folders,
    activeFolderId,
    onCreateFolder: handleCreateFolder,
    onRenameFolder: handleRenameFolder,
    onDeleteFolder: handleDeleteFolder,
  };

  const editorAreaProps = {
    activeNoteStatus,
    activeNote,
    editorRef,
    onUpdate: handleUpdateNoteLocally,
    onDelete: () => activeNote && handleDeleteNote(activeNote.id),
    onBack: handleBack,
    autoFocus: autoFocusNote,
    onAutoFocusHandled: () => setAutoFocusNote(false),
    folders,
    onRetry: handleRetryNoteLoad,
    onCreateNote: handleCreateNote,
    searchQuery,
  };

  const notesListProps = {
    notes,
    activeFolderId,
    activeFolderName,
    activeNoteId,
    onSelectNote: handleSelectNote,
    onCreateNote: handleCreateNote,
    searchQuery,
    onSearch: setSearchQuery,
    onRefresh: handleRefresh,
    onToggleFolders: handleToggleFolders,
  };

  if (viewportTier === 'mobile') {
    return (
      <div className="fixed inset-0 flex overflow-hidden bg-black font-sans text-zinc-100">
        {showFolders ? (
          <FolderSidebar
            {...folderSidebarProps}
            onSelectFolder={handleSelectFolderMobile}
            variant="mobile-fullscreen"
            onBack={() => setShowFolders(false)}
          />
        ) : (
          <>
            <div className={mobilePanel === 'editor' ? 'hidden' : 'contents'}>
              <NotesList {...notesListProps} />
            </div>
            <main
              className={`${mobilePanel === 'list' ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col overflow-hidden bg-zinc-900/30`}
            >
              <EditorArea {...editorAreaProps} />
            </main>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-black font-sans text-zinc-100">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 p-4">
        <PlainDockIcon className="h-5 w-5 shrink-0 text-indigo-400" />
        <span className="truncate font-semibold">PlainDock</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {viewportTier === 'desktop' && !folderCollapsed && (
          <>
            <div style={{ width: folderWidth }} className="h-full shrink-0">
              <FolderSidebar
                {...folderSidebarProps}
                onSelectFolder={setActiveFolderId}
                variant="pane"
              />
            </div>
            <ResizeHandle
              onResize={(dx) =>
                setFolderWidth((w) => {
                  const next = w + dx;
                  if (next < FOLDER_WIDTH_MIN) {
                    setFolderCollapsed(true);
                    return w;
                  }
                  return clamp(next, FOLDER_WIDTH_MIN, FOLDER_WIDTH_MAX);
                })
              }
            />
          </>
        )}

        <div style={{ width: notesWidth }} className="relative h-full shrink-0">
          <NotesList {...notesListProps} />
          {viewportTier === 'tablet' && folderOverlayOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setFolderOverlayOpen(false)} />
              <div
                style={{ width: folderWidth }}
                className="absolute top-0 left-0 z-50 h-full border-r border-zinc-800 bg-black shadow-2xl"
              >
                <FolderSidebar
                  {...folderSidebarProps}
                  onSelectFolder={handleSelectFolderOverlay}
                  variant="pane"
                />
              </div>
            </>
          )}
        </div>

        <ResizeHandle
          onResize={(dx) => setNotesWidth((w) => clamp(w + dx, NOTES_WIDTH_MIN, NOTES_WIDTH_MAX))}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-zinc-900/30">
          <EditorArea {...editorAreaProps} />
        </main>
      </div>
    </div>
  );
}
