import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { serializeNote } from '@/lib/serialize';
import { deriveTitleFromText } from '@/lib/note-title';

// GET /api/notes/:id — Get full note detail (including content)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }
  return NextResponse.json(serializeNote(note));
}

// PUT /api/notes/:id — Update note
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, content, textContent, mode, isPinned, folderId } = body;

  // Validate mode
  if (mode !== undefined && mode !== 'PLAIN' && mode !== 'RICH') {
    return NextResponse.json({ error: 'Invalid mode. Must be PLAIN or RICH.' }, { status: 400 });
  }

  // folderId three-state: omitted = unchanged, null = move to All Notes, string = move to folder
  if (folderId !== undefined && folderId !== null) {
    if (typeof folderId !== 'string') {
      return NextResponse.json({ error: 'Invalid folderId' }, { status: 400 });
    }
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 400 });
    }
  }

  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  // Title policy: a note with content must not persist with an empty title —
  // derive one from the text content so the stored title is always identifiable.
  const finalTitle = typeof title === 'string' ? title : existing.title;
  const finalText = typeof textContent === 'string' ? textContent : existing.textContent;
  const derivedTitle =
    finalTitle.trim() === '' && finalText.trim() !== ''
      ? { title: deriveTitleFromText(finalText) }
      : {};

  const note = await prisma.note.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(textContent !== undefined && { textContent }),
      ...(mode !== undefined && { mode }),
      ...(isPinned !== undefined && { isPinned }),
      ...(folderId !== undefined && { folderId }),
      ...derivedTitle,
    },
  });

  return NextResponse.json(serializeNote(note));
}

// DELETE /api/notes/:id — Delete note
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  await prisma.note.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
