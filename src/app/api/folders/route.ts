import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { serializeFolder } from '@/lib/serialize';

const withCount = { _count: { select: { notes: true } } } as const;

// GET /api/folders — List all folders with note counts, oldest first
export async function GET() {
  const folders = await prisma.folder.findMany({
    include: withCount,
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(folders.map(serializeFolder));
}

// POST /api/folders — Create a folder
export async function POST(request: NextRequest) {
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

  const folder = await prisma.folder.create({
    data: { name: name.trim() },
    include: withCount,
  });
  return NextResponse.json(serializeFolder(folder), { status: 201 });
}
