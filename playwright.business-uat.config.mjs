import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /production-business-path-uat\.spec\.mjs/,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['line']],
  use: {
    baseURL: process.env.UAT_BASE_URL || 'https://www.sulandrahealth.com',
    headless: true,
    ignoreHTTPSErrors: false,
    actionTimeout: 12_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
