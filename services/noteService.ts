
import { Note, NotePayload, NoteMode } from '../types';

const STORAGE_KEY = 'plaindock_notes';

export const noteService = {
  async list(): Promise<Note[]> {
    const data = localStorage.getItem(STORAGE_KEY);
    const notes: Note[] = data ? JSON.parse(data) : [];
    // Sort: isPinned desc, updatedAt desc
    return notes.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  },

  async get(id: string): Promise<Note | null> {
    const notes = await this.list();
    return notes.find(n => n.id === id) || null;
  },

  async create(): Promise<Note> {
    const newNote: Note = {
      id: Math.random().toString(36).substring(2, 11),
      title: 'Untitled',
      content: '',
      textContent: '',
      mode: NoteMode.PLAIN,
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const notes = await this.list();
    notes.push(newNote);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    return newNote;
  },

  async update(id: string, payload: NotePayload): Promise<Note> {
    const notes = await this.list();
    const index = notes.findIndex(n => n.id === id);
    if (index === -1) throw new Error('Note not found');

    const updatedNote = {
      ...notes[index],
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    notes[index] = updatedNote;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    return updatedNote;
  },

  async delete(id: string): Promise<void> {
    const notes = await this.list();
    const filtered = notes.filter(n => n.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }
};
