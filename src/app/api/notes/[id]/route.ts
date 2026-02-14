import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { serializeNote } from '@/lib/serialize';

/**
 * Retrieve a single note by ID and return its serialized representation.
 *
 * @param params - A promise that resolves to route parameters; must include `id` (the note's ID)
 * @returns A NextResponse with JSON: the serialized note when found, or a 404 JSON error `{ error: 'Note not found' }`
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }
  return NextResponse.json(serializeNote(note));
}

/**
 * Update an existing note's provided fields by ID.
 *
 * Validates that `mode` (if provided) is 'PLAIN' or 'RICH'. Returns a 400 JSON error when `mode` is invalid and a 404 JSON error when no note with the given `id` exists.
 *
 * @param params - Route parameters object containing `id`, the note's identifier
 * @returns The updated note serialized for API responses
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { title, content, textContent, mode, isPinned } = body;

  // Validate mode
  if (mode !== undefined && mode !== 'PLAIN' && mode !== 'RICH') {
    return NextResponse.json({ error: 'Invalid mode. Must be PLAIN or RICH.' }, { status: 400 });
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

/**
 * Delete the note identified by the route `id` and return a success or error response.
 *
 * @param params - A promise resolving to route parameters containing the `id` of the note to delete.
 * @returns JSON `{ success: true }` when the note is deleted; if no note with the given `id` exists, returns JSON `{ error: 'Note not found' }` with HTTP status 404.
 */
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