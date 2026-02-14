
export enum NoteMode {
  PLAIN = 'PLAIN',
  RICH = 'RICH'
}

export interface Note {
  id: string;
  title: string;
  content: string;
  textContent: string;
  mode: NoteMode;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SaveState = 'IDLE' | 'SAVING' | 'SAVED' | 'FAILED';

export interface NotePayload {
  title?: string;
  content: string;
  textContent: string;
  mode: NoteMode;
  isPinned?: boolean;
}
