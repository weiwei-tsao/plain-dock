'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { Note } from '@/types';
import { Search, Plus, Pin, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import PlainDockIcon from '@/components/ui/PlainDockIcon';

interface SidebarProps {
  notes: Note[];
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onRefresh: () => Promise<void>;
}

const PULL_THRESHOLD = 50;

const Sidebar: React.FC<SidebarProps> = ({
  notes,
  activeNoteId,
  onSelectNote,
  onCreateNote,
  searchQuery,
  onSearch,
  isOpen,
  onToggle,
  onRefresh,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullY, setPullY] = useState(0);
  const touchStartY = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Non-passive listener so we can call preventDefault and block native overscroll
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const onMove = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy > 0) {
        e.preventDefault();
        setPullY(Math.min(dy * 0.45, 64));
      }
    };

    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = async () => {
    if (pullY >= PULL_THRESHOLD) {
      setPullY(0);
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    } else {
      setPullY(0);
    }
  };

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.textContent.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const indicatorHeight = isRefreshing ? 40 : Math.round(pullY * 0.7);
  const spinnerOpacity = Math.min(pullY / PULL_THRESHOLD, 1);

  return (
    <aside
      className={`relative flex h-full flex-col overflow-hidden border-r border-zinc-800 transition-all duration-300 ${isOpen ? 'w-full md:w-56 lg:w-80' : 'w-full md:w-0'}`}
    >
      <div
        className={`flex h-full flex-col overflow-hidden ${isOpen ? 'opacity-100' : 'opacity-100 md:opacity-0'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-zinc-800 p-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <PlainDockIcon className="h-5 w-5 shrink-0 text-indigo-400" />
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

        {/* Pull-to-refresh indicator — sits between search and list */}
        <div
          className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
          style={{ height: indicatorHeight }}
        >
          <Loader2
            className={`h-4 w-4 text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`}
            style={{ opacity: isRefreshing ? 1 : spinnerOpacity }}
          />
        </div>

        {/* List */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
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
