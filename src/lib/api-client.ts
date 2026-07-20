import type { Folder, Note, NotePayload } from '@/types';

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

  async create(folderId?: string | null): Promise<Note> {
    return request<Note>('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(folderId ? { folderId } : {}),
    });
  },

  async update(id: string, payload: Partial<NotePayload>): Promise<Note> {
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

export const folderApi = {
  async list(): Promise<Folder[]> {
    return request<Folder[]>('/api/folders');
  },

  async create(name: string): Promise<Folder> {
    return request<Folder>('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  },

  async rename(id: string, name: string): Promise<Folder> {
    return request<Folder>(`/api/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  },

  async remove(id: string): Promise<void> {
    await request(`/api/folders/${id}`, { method: 'DELETE' });
  },
};
