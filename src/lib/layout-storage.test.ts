import { describe, expect, it } from 'vitest';
import { pickInitialSelection } from '@/lib/layout-storage';

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
