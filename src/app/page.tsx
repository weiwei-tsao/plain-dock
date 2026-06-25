'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Note } from '@/types';
import { noteApi } from '@/lib/api-client';
import Sidebar from '@/components/sidebar/Sidebar';
import EditorCanvas from '@/components/editor/EditorCanvas';

export default function MainPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');

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
      return;
    }
    setActiveNote(null);
    noteApi
      .get(activeNoteId)
      .then(setActiveNote)
      .catch(() => setActiveNote(null));
  }, [activeNoteId]);

  const handleSelectNote = useCallback((id: string) => {
    setActiveNoteId(id);
    setMobileView('editor');
  }, []);

  const handleCreateNote = async () => {
    const newNote = await noteApi.create();
    setNotes((prev) => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
    setMobileView('editor');
    loadNotes().catch(() => {});
  };

  const handleDeleteNote = async (id: string) => {
    await noteApi.delete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeNoteId === id) {
      setActiveNoteId(null);
      setMobileView('list');
    }
  };

  const handleUpdateNoteLocally = (updatedNote: Note) => {
    setNotes((prev) =>
      [...prev.map((n) => (n.id === updatedNote.id ? updatedNote : n))].sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }),
    );
    setActiveNote(updatedNote);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-black font-sans text-zinc-100">
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
        />
      </div>

      {/* Editor: hidden on phone when in list view */}
      <main
        className={`${mobileView === 'list' ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 flex-col overflow-hidden bg-zinc-900/30`}
      >
        {activeNote ? (
          <EditorCanvas
            note={activeNote}
            onUpdate={handleUpdateNoteLocally}
            onDelete={() => handleDeleteNote(activeNote.id)}
            onBack={() => setMobileView('list')}
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
