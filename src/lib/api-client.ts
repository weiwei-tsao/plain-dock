import type { Note, NotePayload } from '@/types';

/**
 * Perform an HTTP request and return the parsed JSON response, throwing on non-2xx responses.
 *
 * @param url - The request URL
 * @param options - Fetch options forwarded to `fetch`
 * @returns The response body parsed as JSON typed as `T`
 * @throws An `Error` with the server-provided `error` message or `Request failed: <status>` when the response status is not in the 200–299 range
 */
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
    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
  },
};