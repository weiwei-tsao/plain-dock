'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Folder, Note } from '@/types';
import {
  ChevronLeft,
  Folder as FolderIcon,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';

interface FolderSidebarProps {
  notes: Note[];
  folders: Folder[];
  activeFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  variant: 'pane' | 'mobile-fullscreen';
  onBack?: () => void;
}

const FolderSidebar: React.FC<FolderSidebarProps> = ({
  notes,
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  variant,
  onBack,
}) => {
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  // List area scrolls (overflow-y-auto below), which would clip an absolutely
  // positioned dropdown near the bottom — portal to <body> and position from
  // the trigger's rect instead, same fix as EditorCanvas's overflow menu.
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

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

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black">
      {variant === 'mobile-fullscreen' && (
        <div className="flex items-center gap-2 border-b border-zinc-800 p-4">
          <button
            onClick={() => onBack?.()}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Notes</span>
          </button>
          <span className="flex-1 text-center font-semibold">Folders</span>
          <span className="w-14 shrink-0" />
        </div>
      )}

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
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
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-9 text-sm transition-colors ${
                  activeFolderId === folder.id
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <FolderIcon className="h-4 w-4 shrink-0 text-zinc-500" />
                <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
              </button>
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                  setMenuFolderId((v) => (v === folder.id ? null : folder.id));
                }}
                className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                title={`Folder options for ${folder.name}`}
                aria-label={`Folder options for ${folder.name}`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          ),
        )}

        {menuFolderId &&
          menuPos &&
          (() => {
            const folder = folders.find((f) => f.id === menuFolderId);
            if (!folder) return null;
            return createPortal(
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuFolderId(null)} />
                <div
                  className="fixed z-50 inline-flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl"
                  style={{ top: menuPos.top, right: menuPos.right }}
                >
                  <button
                    onClick={() => {
                      setEditingFolderId(folder.id);
                      setEditingName(folder.name);
                      setMenuFolderId(null);
                    }}
                    title="Rename"
                    aria-label="Rename"
                    className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setDeleteTarget(folder);
                      setMenuFolderId(null);
                    }}
                    title="Delete"
                    aria-label="Delete"
                    className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-red-400/10 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>,
              document.body,
            );
          })()}

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
    </div>
  );
};

export default FolderSidebar;
