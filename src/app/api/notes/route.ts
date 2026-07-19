import type { NextRequest } from 'next/server';
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

// POST /api/notes — Create a new empty note, optionally inside a folder
export async function POST(request: NextRequest) {
  // An empty body stays valid for backward compatibility (noteApi.create with no
  // folder), but malformed JSON is still a 400 like every other route.
  const raw = await request.text();
  let body: unknown = {};
  if (raw.trim() !== '') {
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }
  const folderId = (body as { folderId?: unknown }).folderId;

  if (folderId != null) {
    if (typeof folderId !== 'string') {
      return NextResponse.json({ error: 'Invalid folderId' }, { status: 400 });
    }
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 400 });
    }
  }

  const note = await prisma.note.create({
    data: typeof folderId === 'string' ? { folderId } : {},
  });
  return NextResponse.json(serializeNote(note), { status: 201 });
}
