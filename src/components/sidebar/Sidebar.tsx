'use client';

import React from 'react';
import type { Note } from '@/types';
import { Search, Plus, Pin, Layout, ChevronLeft, ChevronRight } from 'lucide-react';

interface SidebarProps {
  notes: Note[];
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  notes,
  activeNoteId,
  onSelectNote,
  onCreateNote,
  searchQuery,
  onSearch,
  isOpen,
  onToggle,
}) => {
  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.textContent.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <aside
      className={`relative flex flex-col border-r border-zinc-800 transition-all duration-300 ${isOpen ? 'w-full md:w-56 lg:w-80' : 'w-0'}`}
    >
      <div
        className={`flex h-full flex-col overflow-hidden ${isOpen ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-zinc-800 p-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <Layout className="h-5 w-5 shrink-0 text-indigo-400" />
            <span className="truncate font-semibold">PlainDock</span>
          </div>
          <button
            onClick={onCreateNote}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-2 pr-3 pl-9 text-sm transition-colors focus:border-zinc-700 focus:outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {filteredNotes.length === 0 ? (
            <div className="mt-10 text-center text-sm text-zinc-600">No notes found</div>
          ) : (
            <div className="space-y-1">
              {filteredNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  className={`group relative w-full rounded-lg p-4 text-left transition-all md:p-3 ${
                    activeNoteId === note.id
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {note.isPinned && <Pin className="h-3 w-3 shrink-0 text-indigo-400" />}
                        <h3 className="truncate text-sm font-medium">{note.title || 'Untitled'}</h3>
                      </div>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {note.textContent || 'No content...'}
                      </p>
                    </div>
                    <span className="mt-1 shrink-0 text-[10px] text-zinc-600">
                      {new Date(note.updatedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toggle Button — tablet/desktop only */}
      <button
        onClick={onToggle}
        className="absolute top-1/2 -right-3 z-50 hidden -translate-y-1/2 rounded-full border border-zinc-800 bg-zinc-900 p-1 text-zinc-500 shadow-xl transition-colors hover:text-white md:block"
      >
        {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    </aside>
  );
};

export default Sidebar;
