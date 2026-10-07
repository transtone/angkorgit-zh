import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 1,
  use: {
    baseURL: 'http://localhost:1420',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'pnpm --filter @angkorgit/desktop dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
