import 'server-only';
import type { Note as PrismaNote, Folder as PrismaFolder } from '@prisma/client';
import type { Note, Folder } from '@/types';
import type { NoteMode } from '@/types';

export function serializeNote(note: PrismaNote): Note {
  return {
    ...note,
    mode: note.mode as NoteMode,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export function serializeFolder(folder: PrismaFolder & { _count: { notes: number } }): Folder {
  return {
    id: folder.id,
    name: folder.name,
    noteCount: folder._count.notes,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}
