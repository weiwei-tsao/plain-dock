import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { serializeNote } from '@/lib/serialize';

// GET /api/notes/:id — Get full note detail (including content)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }
  return NextResponse.json(serializeNote(note));
}

// PUT /api/notes/:id — Update note
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { title, content, textContent, mode, isPinned } = body;

  // Validate mode
  if (mode !== undefined && mode !== 'PLAIN' && mode !== 'RICH') {
    return NextResponse.json(
      { error: 'Invalid mode. Must be PLAIN or RICH.' },
      { status: 400 },
    );
  }

  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  const note = await prisma.note.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(textContent !== undefined && { textContent }),
      ...(mode !== undefined && { mode }),
      ...(isPinned !== undefined && { isPinned }),
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
