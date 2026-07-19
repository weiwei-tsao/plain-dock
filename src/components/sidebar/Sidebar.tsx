'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { Folder, Note } from '@/types';
import {
  Search,
  Plus,
  Pin,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Folder as FolderIcon,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import PlainDockIcon from '@/components/ui/PlainDockIcon';
import { deriveTitleFromText } from '@/lib/note-title';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';

interface SidebarProps {
  notes: Note[];
  folders: Folder[];
  activeFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
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

// Titles are persisted server-side on save (see PUT /api/notes/[id]); deriving
// here is only a fallback for notes stored before that policy existed.
function displayParts(note: Note): { title: string; preview: string } {
  return {
    title: note.title || deriveTitleFromText(note.textContent) || 'Untitled',
    preview: note.textContent,
  };
}

const Sidebar: React.FC<SidebarProps> = ({
  notes,
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
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
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
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

  const submitNewFolder = async () => {
    const name = newFolderName.trim();
    setIsAddingFolder(false);
    setNewFolderName('');
    if (!name) return;
    try {
      await onCreateFolder(name);
    } catch {
      setErrorToast('Failed to create folder');
      setIsAddingFolder(true);
      setNewFolderName(name);
    }
  };

  const submitRename = async () => {
    const id = editingFolderId;
    const name = editingName.trim();
    setEditingFolderId(null);
    if (!id || !name) return;
    try {
      await onRenameFolder(id, name);
    } catch {
      setErrorToast('Failed to rename folder');
    }
  };

  const folderNotes = activeFolderId ? notes.filter((n) => n.folderId === activeFolderId) : notes;
  const filteredNotes = folderNotes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.textContent.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const indicatorHeight = isRefreshing ? 40 : Math.round(pullY * 0.7);
  const spinnerOpacity = Math.min(pullY / PULL_THRESHOLD, 1);

  return (
    <aside
      className={`relative flex h-full flex-col border-r border-zinc-800 transition-all duration-300 ${isOpen ? 'w-full md:w-56 lg:w-80' : 'w-full md:w-0'}`}
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
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-2 pr-3 pl-9 text-base transition-colors focus:border-zinc-700 focus:outline-none"
            />
          </div>
        </div>

        {/* Folders */}
        <div className="space-y-0.5 border-b border-zinc-800 px-2 pb-3">
          <button
            onClick={() => onSelectFolder(null)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
              activeFolderId === null ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900'
            }`}
          >
            <FolderIcon className="h-4 w-4 shrink-0 text-zinc-500" />
            <span className="min-w-0 flex-1 truncate text-left">All Notes</span>
            <span className="text-[10px] text-zinc-600">{notes.length}</span>
          </button>

          {folders.map((folder) =>
            editingFolderId === folder.id ? (
              <input
                key={folder.id}
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={submitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename();
                  if (e.key === 'Escape') setEditingFolderId(null);
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm focus:outline-none"
              />
            ) : (
              <div key={folder.id} className="group relative">
                <button
                  onClick={() => onSelectFolder(folder.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-14 text-sm transition-colors md:pr-2 ${
                    activeFolderId === folder.id
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:bg-zinc-900'
                  }`}
                >
                  <FolderIcon className="h-4 w-4 shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
                  <span className="hidden text-[10px] text-zinc-600 md:inline md:group-hover:hidden">
                    {notes.filter((n) => n.folderId === folder.id).length}
                  </span>
                </button>
                {/* Actions: always visible on phone (no hover), hover-revealed on md+ */}
                <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 md:hidden md:group-hover:flex">
                  <button
                    onClick={() => {
                      setEditingFolderId(folder.id);
                      setEditingName(folder.name);
                    }}
                    className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                    aria-label={`Rename ${folder.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(folder)}
                    className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-red-400/10 hover:text-red-400"
                    aria-label={`Delete ${folder.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ),
          )}

          {isAddingFolder ? (
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={submitNewFolder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNewFolder();
                if (e.key === 'Escape') {
                  setIsAddingFolder(false);
                  setNewFolderName('');
                }
              }}
              placeholder="Folder name"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm placeholder-zinc-600 focus:outline-none"
            />
          ) : (
            <button
              onClick={() => setIsAddingFolder(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-900 hover:text-zinc-400"
            >
              <FolderPlus className="h-4 w-4 shrink-0" />
              <span>New Folder</span>
            </button>
          )}
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
              {filteredNotes.map((note) => {
                const { title, preview } = displayParts(note);
                return (
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
                          <h3 className="truncate text-sm font-medium">{title}</h3>
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {preview || 'No content...'}
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
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Toggle Button — tablet/desktop only */}
      <button
        onClick={onToggle}
        className={`absolute top-1/2 z-50 hidden -translate-y-1/2 rounded-full border border-zinc-800 bg-zinc-900 p-1 text-zinc-500 shadow-xl transition-colors hover:text-white md:block ${isOpen ? '-right-3' : 'right-0 translate-x-full'}`}
      >
        {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete folder"
        message={`Delete "${deleteTarget?.name}"? Its notes will move to All Notes.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteFolder(deleteTarget.id).catch(() => setErrorToast('Failed to delete folder'));
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast
        open={errorToast !== null}
        message={errorToast ?? ''}
        variant="error"
        onClose={() => setErrorToast(null)}
      />
    </aside>
  );
};

export default Sidebar;
