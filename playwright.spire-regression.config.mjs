import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /00-spire-selected-home-regression\.spec\.mjs/,
  timeout: 20_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line']],
  use: {
    baseURL: process.env.UAT_BASE_URL || 'https://www.sulandrahealth.com',
    headless: true,
    ignoreHTTPSErrors: false,
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
