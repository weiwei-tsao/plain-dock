import type { Page, Response } from '@playwright/test';

// The main page mounts on a hardcoded 'list'/'desktop' initial state and
// only settles into its real state (e.g. auto-selecting an existing note,
// switching to the editor panel) once its initial fetches resolve and React
// processes them. Waiting for a specific response's network event isn't
// enough — there's still a gap before the resulting state update renders —
// so wait for the network to go fully quiet instead, covering the initial
// notes/folders fetch and whatever note-detail fetch an auto-selection
// triggers, plus settling time past it.
export async function login(page: Page) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    throw new Error('APP_PASSWORD env var is required to run the e2e suite — see e2e/README.md');
  }

  await page.goto('/login');
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('/');
  await page.waitForLoadState('networkidle');
}

// Waits for the PUT that actually persists this exact content, rather than a
// generic SAVED status flash — title and content edits share one debounce
// timer, so under a slow run an earlier field's save can resolve first and
// flip the status while this one is still pending.
export function waitForContentSave(page: Page, content: string) {
  return page.waitForResponse(async (res) => {
    if (res.request().method() !== 'PUT' || !/\/api\/notes\/[^/]+$/.test(res.url())) return false;
    try {
      const body = (await res.json()) as { content?: string };
      return body.content === content;
    } catch {
      return false;
    }
  });
}

export async function deleteActiveNote(page: Page) {
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === 'DELETE' && /\/api\/notes\/[^/]+$/.test(res.url()),
    ),
    page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click(),
  ]);
}

// Clicking "New note" briefly shows the previous note's editor (or a loading
// skeleton) before the new note's GET resolves and its empty inputs mount —
// filling immediately after the click can land on the about-to-unmount old
// instance instead. Waiting for the create response, then the detail GET for
// that specific ID, closes the race — matching on any note GET isn't enough
// since an already-active note's own detail GET can still be in flight.
export async function createNote(page: Page): Promise<string> {
  // Collect every note-detail GET from before the click, not just from after
  // we learn the new note's ID — on a fast round-trip, that GET can complete
  // while we're still awaiting the POST body, and a waitForResponse armed
  // only afterward would miss it and hang until its own timeout.
  const seenDetailGets: Response[] = [];
  const collectDetailGets = (res: Response) => {
    if (res.request().method() === 'GET' && /\/api\/notes\/[^/]+$/.test(res.url())) {
      seenDetailGets.push(res);
    }
  };
  page.on('response', collectDetailGets);

  try {
    const [postResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.request().method() === 'POST' && res.url().endsWith('/api/notes'),
      ),
      page.getByRole('button', { name: 'New note', exact: true }).click(),
    ]);
    const { id } = (await postResponse.json()) as { id: string };

    if (!seenDetailGets.some((res) => res.url().endsWith(`/api/notes/${id}`))) {
      await page.waitForResponse(
        (res) => res.request().method() === 'GET' && res.url().endsWith(`/api/notes/${id}`),
      );
    }
    return id;
  } finally {
    page.off('response', collectDetailGets);
  }
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
