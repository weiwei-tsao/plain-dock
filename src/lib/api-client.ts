import type { Note, NotePayload } from '@/types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const noteApi = {
  async list(): Promise<Note[]> {
    return request<Note[]>('/api/notes');
  },

  async get(id: string): Promise<Note> {
    return request<Note>(`/api/notes/${id}`);
  },

  async create(): Promise<Note> {
    return request<Note>('/api/notes', { method: 'POST' });
  },

  async update(id: string, payload: NotePayload): Promise<Note> {
    return request<Note>(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async delete(id: string): Promise<void> {
    await request(`/api/notes/${id}`, { method: 'DELETE' });
  },
};
