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
