import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { serializeNote } from '@/lib/serialize';

// GET /api/notes — List all notes (excluding content for lightweight response)
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

// POST /api/notes — Create a new empty note
export async function POST() {
  const note = await prisma.note.create({ data: {} });
  return NextResponse.json(serializeNote(note), { status: 201 });
}
