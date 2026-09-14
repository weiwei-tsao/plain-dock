import { expect, test } from '@playwright/test';

import { login } from './helpers';

test('logs in with APP_PASSWORD and reaches the main page', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('button', { name: 'New note', exact: true })).toBeVisible();
});
