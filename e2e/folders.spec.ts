import { expect, test } from '@playwright/test';

import { createNote, deleteActiveNote, login, startsWith, uniqueName } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('creates, renames, moves a note into, and deletes a folder', async ({ page }) => {
  const folderName = uniqueName('E2E Folder');
  await page.getByRole('button', { name: 'New Folder' }).click();
  await page.getByPlaceholder('Folder name').fill(folderName);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: startsWith(folderName) })).toBeVisible();

  await page.getByRole('button', { name: `Folder options for ${folderName}` }).click();
  await page.locator('div.fixed.z-50.inline-flex').getByRole('button', { name: 'Rename' }).click();
  const renamedFolder = `${folderName}-renamed`;
  await page.locator('input:focus').fill(renamedFolder);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: startsWith(renamedFolder) })).toBeVisible();

  const noteTitle = uniqueName('E2E Move Note');
  await createNote(page);
  await page.getByPlaceholder('Untitled').fill(noteTitle);
  const moveMenu = page.locator('div.fixed.z-50.max-h-64');
  await expect(
    page.getByRole('button', { name: 'Folder: All Notes. Move to folder' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Move to folder$/ }).click();
  await moveMenu.getByRole('button', { name: renamedFolder }).click();
  // The folder chip reflects the move
  await expect(
    page.getByRole('button', { name: `Folder: ${renamedFolder}. Move to folder` }),
  ).toBeVisible();

  await page.getByRole('link', { name: startsWith(renamedFolder) }).click();
  await expect(page.getByRole('link', { name: startsWith(noteTitle) })).toBeVisible();

  // Moving the open note out of the viewed folder makes the sidebar follow it to All Notes
  await page.getByRole('button', { name: /Move to folder$/ }).click();
  await moveMenu.getByRole('button', { name: 'All Notes' }).click();
  await expect(page).not.toHaveURL(/folder=/);
  await expect(page.getByPlaceholder('Untitled')).toHaveValue(noteTitle);
  await expect(page.getByRole('link', { name: startsWith(noteTitle) })).toBeVisible();

  await page.getByRole('button', { name: `Folder options for ${renamedFolder}` }).click();
  await page.locator('div.fixed.z-50.inline-flex').getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('link', { name: startsWith(renamedFolder) })).toHaveCount(0);

  // The note was already moved back to All Notes above — clean it up.
  await page.getByRole('link', { name: startsWith(noteTitle) }).click();
  await deleteActiveNote(page);
});
