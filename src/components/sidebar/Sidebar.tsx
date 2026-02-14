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
  notes, activeNoteId, onSelectNote, onCreateNote, searchQuery, onSearch, isOpen, onToggle,
}) => {
  const filteredNotes = notes.filter((n) =>
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.textContent.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <aside className={`relative border-r border-zinc-800 flex flex-col transition-all duration-300 ${isOpen ? 'w-80' : 'w-0'}`}>
      <div className={`flex flex-col h-full overflow-hidden ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <Layout className="w-5 h-5 text-indigo-400 shrink-0" />
            <span className="font-semibold truncate">PlainDock</span>
          </div>
          <button
            onClick={onCreateNote}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search (Cmd + /)"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-zinc-700 transition-colors"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {filteredNotes.length === 0 ? (
            <div className="text-center mt-10 text-zinc-600 text-sm">No notes found</div>
          ) : (
            <div className="space-y-1">
              {filteredNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  className={`w-full text-left p-3 rounded-lg transition-all group relative ${
                    activeNoteId === note.id
                      ? 'bg-zinc-800 text-white'
                      : 'hover:bg-zinc-900 text-zinc-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {note.isPinned && <Pin className="w-3 h-3 text-indigo-400 shrink-0" />}
                        <h3 className="font-medium truncate text-sm">
                          {note.title || 'Untitled'}
                        </h3>
                      </div>
                      <p className="text-xs text-zinc-500 truncate mt-1">
                        {note.textContent || 'No content...'}
                      </p>
                    </div>
                    <span className="text-[10px] text-zinc-600 shrink-0 mt-1">
                      {new Date(note.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-1/2 -translate-y-1/2 z-50 bg-zinc-900 border border-zinc-800 rounded-full p-1 hover:text-white text-zinc-500 transition-colors shadow-xl"
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    </aside>
  );
};

export default Sidebar;
