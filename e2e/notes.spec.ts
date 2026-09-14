import { expect, test } from '@playwright/test';

import {
  createNote,
  deleteActiveNote,
  login,
  startsWith,
  uniqueName,
  waitForContentSave,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('creates, edits, autosaves, and deletes a note', async ({ page }) => {
  await createNote(page);

  const title = uniqueName('E2E Note');
  const content = 'Hello from Playwright';

  const contentSaved = waitForContentSave(page, content);
  await page.getByPlaceholder('Untitled').fill(title);
  await page.getByPlaceholder('Start typing plain text...').fill(content);
  await contentSaved;

  // Reload to confirm the autosave actually persisted, not just local state.
  // Reselect by title afterward — reload also resets which note the app
  // auto-selects, and that isn't necessarily this one (e.g. a pre-existing
  // pinned note in the disposable DB always sorts first).
  await page.reload();
  await page.getByRole('button', { name: startsWith(title) }).click();
  await expect(page.getByPlaceholder('Untitled')).toHaveValue(title);
  await expect(page.getByPlaceholder('Start typing plain text...')).toHaveValue(content);

  await deleteActiveNote(page);
  await expect(page.getByRole('button', { name: startsWith(title) })).toHaveCount(0);
});

test('switches a note between PLAIN and RICH mode', async ({ page }) => {
  await createNote(page);

  const plainText = 'Some plain text';
  // Switching mode calls persistChange directly, bypassing the debounce
  // timer's clearTimeout — an unfinished plain-content save left pending
  // here would still fire later and can overwrite the mode back to PLAIN
  // once its (stale) request reaches the front of the save queue.
  const plainSaved = waitForContentSave(page, plainText);
  await page.getByPlaceholder('Start typing plain text...').fill(plainText);
  await plainSaved;

  await page.getByRole('button', { name: 'PLAIN', exact: true }).click();
  await expect(page.locator('.ProseMirror')).toContainText(plainText);

  await page.getByRole('button', { name: 'RICH', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Switch' }).click();
  await expect(page.getByPlaceholder('Start typing plain text...')).toHaveValue(plainText);

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
