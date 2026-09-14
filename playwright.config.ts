import { defineConfig, devices } from '@playwright/test';

// No CI is configured for this repo (see issue #39) — this suite is a local,
// on-demand script only. Run `npm run dev` against a disposable/test
// DATABASE_URL first (tests create and delete their own notes/folders, but
// still write real rows), then run `npm run test:e2e` with the same
// APP_PASSWORD exported. See e2e/README.md for the full setup.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
