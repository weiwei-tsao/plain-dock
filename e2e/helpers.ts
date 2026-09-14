import type { Page } from '@playwright/test';

export async function login(page: Page) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    throw new Error('APP_PASSWORD env var is required to run the e2e suite — see e2e/README.md');
  }

  await page.goto('/login');
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('/');
}

// Clicking "New note" briefly shows the previous note's editor (or a loading
// skeleton) before the new note's GET resolves and its empty inputs mount —
// filling immediately after the click can land on the about-to-unmount old
// instance instead. Waiting for the create response, then the detail GET for
// that specific ID, closes the race — matching on any note GET isn't enough
// since an already-active note's own detail GET can still be in flight.
export async function createNote(page: Page): Promise<string> {
  const [postResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().endsWith('/api/notes'),
    ),
    page.getByRole('button', { name: 'New note', exact: true }).click(),
  ]);
  const { id } = (await postResponse.json()) as { id: string };
  await page.waitForResponse(
    (res) => res.request().method() === 'GET' && res.url().endsWith(`/api/notes/${id}`),
  );
  return id;
}

export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// Matches an accessible name that starts with `text` — used instead of a
// plain substring RegExp because several accessible names embed a note or
// folder's own name as a prefix of a longer string (e.g. a folder's row name
// is "<name> <count>", while its "Folder options for <name>" button also
// contains <name> as a substring, but never as a prefix).
export function startsWith(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
}
