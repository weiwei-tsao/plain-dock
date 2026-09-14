import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { createNote, login, startsWith, uniqueName } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

async function deleteActiveNote(page: Page) {
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
}

test('creates, edits, autosaves, and deletes a note', async ({ page }) => {
  await createNote(page);

  const title = uniqueName('E2E Note');
  const content = 'Hello from Playwright';
  await page.getByPlaceholder('Untitled').fill(title);
  await page.getByPlaceholder('Start typing plain text...').fill(content);

  await expect(page.getByText('SAVED')).toBeVisible();

  // Reload to confirm the autosave actually persisted, not just local state.
  await page.reload();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue(title);
  await expect(page.getByPlaceholder('Start typing plain text...')).toHaveValue(content);

  await deleteActiveNote(page);
  await expect(page.getByRole('button', { name: startsWith(title) })).toHaveCount(0);
});

test('switches a note between PLAIN and RICH mode', async ({ page }) => {
  await createNote(page);
  await page.getByPlaceholder('Start typing plain text...').fill('Some plain text');

  await page.getByRole('button', { name: 'PLAIN', exact: true }).click();
  await expect(page.locator('.ProseMirror')).toContainText('Some plain text');

  await page.getByRole('button', { name: 'RICH', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Switch' }).click();
  await expect(page.getByPlaceholder('Start typing plain text...')).toHaveValue('Some plain text');

  await deleteActiveNote(page);
});

test('sanitizes pasted HTML while in RICH mode', async ({ page }) => {
  await createNote(page);
  await page.getByRole('button', { name: 'PLAIN', exact: true }).click();

  const proseMirror = page.locator('.ProseMirror');
  await proseMirror.click();
  await proseMirror.evaluate((el, html) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/html', html);
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }),
    );
  }, '<h2>Hello</h2><script>alert(1)</script><b>World</b>');

  await expect(proseMirror).toContainText('Hello');
  await expect(proseMirror).toContainText('World');
  await expect(proseMirror.locator('script')).toHaveCount(0);
  expect(await proseMirror.innerHTML()).not.toContain('<script');

  await deleteActiveNote(page);
});
