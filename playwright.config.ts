import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // Each test starts a browser with its own profile. One worker keeps the run stable.
  workers: 1,
  timeout: 30_000,
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['github']],
  globalSetup: './tests/e2e/global-setup.ts',
});
