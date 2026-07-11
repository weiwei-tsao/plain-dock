'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Note } from '@/types';
import { noteApi } from '@/lib/api-client';

const sortNotes = (list: Note[]): Note[] =>
  [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
import Sidebar from '@/components/sidebar/Sidebar';
import EditorCanvas, { type EditorCanvasHandle } from '@/components/editor/EditorCanvas';

type ActiveNoteStatus = 'idle' | 'loading' | 'ready' | 'error';

const skeletonLineWidths = ['w-full', 'w-11/12', 'w-4/5', 'w-10/12', 'w-2/3'];

function NoteLoadingState() {
  return (
    <div
      className="flex flex-1 flex-col overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading note"
    >
      <div className="border-b border-zinc-800/80 px-5 py-4">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <div className="h-7 w-48 animate-pulse rounded bg-zinc-800" />
          <div className="flex gap-2">
            <div className="h-8 w-8 animate-pulse rounded bg-zinc-800/80" />
            <div className="h-8 w-8 animate-pulse rounded bg-zinc-800/80" />
            <div className="h-8 w-8 animate-pulse rounded bg-zinc-800/80" />
            <div className="h-8 w-20 animate-pulse rounded bg-zinc-800/80" />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-8">
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

export default function MainPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [activeNoteStatus, setActiveNoteStatus] = useState<ActiveNoteStatus>('idle');
  const [noteLoadAttempt, setNoteLoadAttempt] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
  const [autoFocusNote, setAutoFocusNote] = useState(false);
  const editorRef = useRef<EditorCanvasHandle>(null);

  const loadNotes = useCallback(async () => {
    const data = await noteApi.list();
    setNotes(data);
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

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
      setMobileView('editor');
    },
    [activeNoteId, cleanupEmptyNote],
  );

  const handleBack = useCallback(async () => {
    await cleanupEmptyNote();
    setActiveNoteId(null);
    setActiveNote(null);
    setActiveNoteStatus('idle');
    setMobileView('list');
  }, [cleanupEmptyNote]);

  const handleCreateNote = useCallback(async () => {
    await cleanupEmptyNote();
    const newNote = await noteApi.create();
    setNotes((prev) => sortNotes([newNote, ...prev]));
    setActiveNote(null);
    setActiveNoteStatus('loading');
    setActiveNoteId(newNote.id);
    setAutoFocusNote(true);
    setMobileView('editor');
    loadNotes().catch(() => {});
  }, [cleanupEmptyNote, loadNotes]);

  const handleDeleteNote = async (id: string) => {
    await noteApi.delete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeNoteId === id) {
      setActiveNoteId(null);
      setActiveNote(null);
      setActiveNoteStatus('idle');
      setMobileView('list');
    }
  };

  const handleUpdateNoteLocally = (updatedNote: Note) => {
    setNotes((prev) => sortNotes(prev.map((n) => (n.id === updatedNote.id ? updatedNote : n))));
    setActiveNote(updatedNote);
    setActiveNoteStatus('ready');
  };

  const handleRefresh = useCallback(async () => {
    await loadNotes();
    if (activeNoteId) {
      setActiveNote(null);
      setActiveNoteStatus('loading');
      setNoteLoadAttempt((attempt) => attempt + 1);
    }
  }, [loadNotes, activeNoteId]);

  const handleRetryNoteLoad = useCallback(() => {
    setActiveNote(null);
    setActiveNoteStatus('loading');
    setNoteLoadAttempt((attempt) => attempt + 1);
  }, []);

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-black font-sans text-zinc-100">
      {/* Sidebar: transparent wrapper on tablet+, hidden on phone when in editor view */}
      <div className={mobileView === 'editor' ? 'hidden md:contents' : 'contents'}>
        <Sidebar
          notes={notes}
          activeNoteId={activeNoteId}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          searchQuery={searchQuery}
          onSearch={setSearchQuery}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          onRefresh={handleRefresh}
        />
      </div>

      {/* Editor: hidden on phone when in list view */}
      <main
        className={`${mobileView === 'list' ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 flex-col overflow-hidden bg-zinc-900/30`}
      >
        {activeNoteStatus === 'loading' ? (
          <NoteLoadingState />
        ) : activeNoteStatus === 'error' ? (
          <div className="flex flex-1 items-center justify-center px-6 text-zinc-500">
            <div className="text-center">
              <h1 className="mb-2 text-2xl font-light text-zinc-300">Unable to load note</h1>
              <p className="text-sm">The selected note could not be opened.</p>
              <button
                onClick={handleRetryNoteLoad}
                className="mt-6 rounded-lg border border-zinc-700 px-4 py-2 text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : activeNote ? (
          <EditorCanvas
            ref={editorRef}
            note={activeNote}
            onUpdate={handleUpdateNoteLocally}
            onDelete={() => handleDeleteNote(activeNote.id)}
            onBack={handleBack}
            autoFocus={autoFocusNote}
            onAutoFocusHandled={() => setAutoFocusNote(false)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-zinc-500">
            <div className="text-center">
              <h1 className="mb-2 text-2xl font-light">PlainDock</h1>
              <p className="text-sm">Select or create a note to begin</p>
              <button
                onClick={handleCreateNote}
                className="mt-6 rounded-lg border border-zinc-700 px-4 py-2 transition-colors hover:bg-zinc-800"
              >
                Create New Note
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
