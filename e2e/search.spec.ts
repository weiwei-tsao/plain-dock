import { expect, test } from '@playwright/test';

import { createNote, login, uniqueName } from './helpers';

test.describe('search highlighting', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('highlights matches in the notes list', async ({ page }) => {
    const title = uniqueName('zzsearch');
    await createNote(page);
    await page.getByPlaceholder('Untitled').fill(title);

    await page.locator('#notes-search-input').fill('zzsearch');
    await expect(page.locator('mark', { hasText: 'zzsearch' })).toBeVisible();

    await page.locator('#notes-search-input').fill('');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  });
});

test.describe('Cmd/Ctrl+K on desktop', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('focuses the search input', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('#notes-search-input')).toBeFocused();
  });
});

test.describe('Cmd/Ctrl+K on tablet', () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // Regression for #40 — the shortcut used to focus a search input hidden
  // behind the still-open folder overlay.
  test('closes the folder overlay before focusing search', async ({ page }) => {
    await page.getByRole('button', { name: 'Toggle folders' }).click();
    const overlayBackdrop = page.locator('div.fixed.inset-0.z-40');
    await expect(overlayBackdrop).toBeVisible();

    await page.keyboard.press('Control+k');
    await expect(overlayBackdrop).toHaveCount(0);
    await expect(page.locator('#notes-search-input')).toBeFocused();
  });
});

test.describe('Cmd/Ctrl+K on mobile', () => {
  test.use({ viewport: { width: 500, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('switches from the editor panel to the list panel before focusing search', async ({
    page,
  }) => {
    const searchInput = page.locator('#notes-search-input');
    let createdNoteId: string | null = null;
    if (await searchInput.isVisible()) {
      // Already on the list panel (no note was auto-selected) — create one to
      // reach the editor panel this test needs to start from.
      createdNoteId = await createNote(page);
    }
    await expect(searchInput).toBeHidden();

    await page.keyboard.press('Control+k');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeFocused();

    // The app only auto-deletes an empty note on in-app navigation, which
    // pressing Ctrl+K doesn't trigger — clean up directly via the API instead.
    if (createdNoteId) {
      await page.request.delete(`/api/notes/${createdNoteId}`);
    }
  });
});
