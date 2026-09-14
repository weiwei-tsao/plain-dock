import { expect, test } from '@playwright/test';

import { createNote, login, startsWith, uniqueName } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('creates, renames, moves a note into, and deletes a folder', async ({ page }) => {
  const folderName = uniqueName('E2E Folder');
  await page.getByRole('button', { name: 'New Folder' }).click();
  await page.getByPlaceholder('Folder name').fill(folderName);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: startsWith(folderName) })).toBeVisible();

  await page.getByRole('button', { name: `Folder options for ${folderName}` }).click();
  await page.locator('div.fixed.z-50.inline-flex').getByRole('button', { name: 'Rename' }).click();
  const renamedFolder = `${folderName}-renamed`;
  await page.locator('input:focus').fill(renamedFolder);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: startsWith(renamedFolder) })).toBeVisible();

  const noteTitle = uniqueName('E2E Move Note');
  await createNote(page);
  await page.getByPlaceholder('Untitled').fill(noteTitle);
  await page.locator('button[title="Move to folder"]').click();
  await page
    .locator('div.fixed.z-50.max-h-64')
    .getByRole('button', { name: renamedFolder })
    .click();

  await page.getByRole('button', { name: startsWith(renamedFolder) }).click();
  await expect(page.getByRole('button', { name: startsWith(noteTitle) })).toBeVisible();

  await page.getByRole('button', { name: `Folder options for ${renamedFolder}` }).click();
  await page.locator('div.fixed.z-50.inline-flex').getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: startsWith(renamedFolder) })).toHaveCount(0);

  // Folder deletion moves the note back to All Notes (onDelete: SetNull) — clean it up.
  await page.getByRole('button', { name: startsWith(noteTitle) }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
});
