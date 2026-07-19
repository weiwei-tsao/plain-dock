import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { serializeFolder } from '@/lib/serialize';

const withCount = { _count: { select: { notes: true } } } as const;

// PUT /api/folders/:id — Rename a folder
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = (body as { name?: unknown }).name;
  if (typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
  }

  const existing = await prisma.folder.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  const folder = await prisma.folder.update({
    where: { id },
    data: { name: name.trim() },
    include: withCount,
  });
  return NextResponse.json(serializeFolder(folder));
}

// DELETE /api/folders/:id — Delete a folder; its notes return to All Notes via ON DELETE SET NULL
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const existing = await prisma.folder.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  await prisma.folder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
