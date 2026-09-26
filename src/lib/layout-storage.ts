export const FOLDER_WIDTH_MIN = 180;
export const FOLDER_WIDTH_MAX = 320;
export const FOLDER_WIDTH_DEFAULT = 220;

export const NOTES_WIDTH_MIN = 260;
export const NOTES_WIDTH_MAX = 480;
export const NOTES_WIDTH_DEFAULT = 320;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface StoredLayout {
  folderWidth: number;
  notesWidth: number;
  folderCollapsed: boolean;
}

const STORAGE_KEY = 'plaindock:layout';

export function getLayout(): StoredLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.folderWidth !== 'number' ||
      typeof parsed.notesWidth !== 'number' ||
      typeof parsed.folderCollapsed !== 'boolean'
    ) {
      return null;
    }
    return {
      folderWidth: clamp(parsed.folderWidth, FOLDER_WIDTH_MIN, FOLDER_WIDTH_MAX),
      notesWidth: clamp(parsed.notesWidth, NOTES_WIDTH_MIN, NOTES_WIDTH_MAX),
      folderCollapsed: parsed.folderCollapsed,
    };
  } catch {
    return null;
  }
}

export function saveLayout(layout: StoredLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // quota exceeded, private browsing, etc. — layout just won't persist
  }
}

export interface StoredSelection {
  folderId: string | null;
  noteId: string | null;
}

const SELECTION_KEY = 'plaindock:selection';

export function getLastSelection(): StoredSelection | null {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const isId = (v: unknown) => v === null || typeof v === 'string';
    if (!isId(parsed.folderId) || !isId(parsed.noteId)) return null;
    return { folderId: parsed.folderId, noteId: parsed.noteId };
  } catch {
    return null;
  }
}

export function saveLastSelection(selection: StoredSelection): void {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(selection));
  } catch {
    // quota exceeded, private browsing, etc. — selection just won't persist
  }
}

/** Restore the saved selection if it still exists; otherwise fall back to the first note in scope. */
export function pickInitialSelection(
  notes: { id: string; folderId: string | null }[],
  folders: { id: string }[],
  saved: StoredSelection | null,
): StoredSelection {
  const folderId =
    saved?.folderId && folders.some((f) => f.id === saved.folderId) ? saved.folderId : null;
  const scoped = folderId ? notes.filter((n) => n.folderId === folderId) : notes;
  const noteId = scoped.find((n) => n.id === saved?.noteId)?.id ?? scoped[0]?.id ?? null;
  return { folderId, noteId };
}
