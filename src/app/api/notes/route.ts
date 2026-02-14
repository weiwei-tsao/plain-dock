import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { serializeNote } from '@/lib/serialize';

/**
 * Retrieve all notes as a lightweight list with their content redacted.
 *
 * Each returned note is ordered by pinned status and update time, and has its `content`
 * replaced with an empty string before serialization.
 *
 * @returns A JSON response containing an array of serialized notes where `content` is an empty string.
 */
export async function GET() {
  const notes = await prisma.note.findMany({
    omit: { content: true },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
  });

  return NextResponse.json(
    notes.map((n) => ({
      ...serializeNote({ ...n, content: '' }),
    })),
  );
}

/**
 * Create a new empty note and return its serialized representation.
 *
 * @returns A JSON response containing the serialized created note. The response uses HTTP status 201.
 */
export async function POST() {
  const note = await prisma.note.create({ data: {} });
  return NextResponse.json(serializeNote(note), { status: 201 });
}