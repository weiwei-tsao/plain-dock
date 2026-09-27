import { describe, expect, it } from 'vitest';
import {
  pickInitialSelection,
  selectionFromSearch,
  selectionHref,
  selectionToSearch,
} from '@/lib/layout-storage';

const notes = [
  { id: 'pinned', folderId: null },
  { id: 'a1', folderId: 'A' },
  { id: 'a2', folderId: 'A' },
];
const folders = [{ id: 'A' }];

describe('pickInitialSelection', () => {
  it('restores a saved folder and note', () => {
    expect(pickInitialSelection(notes, folders, { folderId: 'A', noteId: 'a2' })).toEqual({
      folderId: 'A',
      noteId: 'a2',
    });
  });

  it('falls back to the first note when nothing is saved', () => {
    expect(pickInitialSelection(notes, folders, null)).toEqual({
      folderId: null,
      noteId: 'pinned',
    });
  });

  it('falls back to the folder’s first note when the saved note is gone', () => {
    expect(pickInitialSelection(notes, folders, { folderId: 'A', noteId: 'deleted' })).toEqual({
      folderId: 'A',
      noteId: 'a1',
    });
  });

  it('falls back to All Notes when the saved folder is gone', () => {
    expect(pickInitialSelection(notes, folders, { folderId: 'gone', noteId: 'a2' })).toEqual({
      folderId: null,
      noteId: 'a2',
    });
  });

  it('returns no note for an empty folder', () => {
    expect(pickInitialSelection(notes, [{ id: 'B' }], { folderId: 'B', noteId: null })).toEqual({
      folderId: 'B',
      noteId: null,
    });
  });
});

describe('selection URL params', () => {
  it('round-trips folder and note', () => {
    const selection = { folderId: 'A', noteId: 'a1' };
    expect(selectionFromSearch(selectionToSearch(selection))).toEqual(selection);
  });

  it('omits empty parts', () => {
    expect(selectionToSearch({ folderId: null, noteId: 'a1' })).toBe('?note=a1');
    expect(selectionToSearch({ folderId: null, noteId: null })).toBe('');
  });

  it('builds links for a note, a note in a folder, and a folder', () => {
    expect(selectionHref({ folderId: null, noteId: 'a1' })).toBe('/?note=a1');
    expect(selectionHref({ folderId: 'A', noteId: 'a1' })).toBe('/?folder=A&note=a1');
    expect(selectionHref({ folderId: 'A', noteId: null })).toBe('/?folder=A');
  });

  it('returns null for a bare URL so the caller can fall back', () => {
    expect(selectionFromSearch('')).toBeNull();
    expect(selectionFromSearch('?other=1')).toBeNull();
  });
});
