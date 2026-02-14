import 'server-only';
import type { Note as PrismaNote } from '@prisma/client';
import type { Note } from '@/types';
import type { NoteMode } from '@/types';

/**
 * Convert a PrismaNote record into the public `Note` shape for client use.
 *
 * Maps the database record to a `Note`, casting `mode` to `NoteMode` and converting
 * `createdAt` and `updatedAt` to ISO 8601 string representations.
 *
 * @param note - The PrismaNote instance to serialize
 * @returns A `Note` object with `mode` as `NoteMode` and ISO string timestamps for `createdAt` and `updatedAt`
 */
export function serializeNote(note: PrismaNote): Note {
  return {
    ...note,
    mode: note.mode as NoteMode,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}