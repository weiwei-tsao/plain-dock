import 'server-only';
import type { Note as PrismaNote } from '@prisma/client';
import type { Note } from '@/types';
import { NoteMode } from '@/types';

export function serializeNote(note: PrismaNote): Note {
  return {
    ...note,
    mode: note.mode as NoteMode,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
