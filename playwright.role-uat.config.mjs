await import('./scripts/prepare-production-role-uat-current.mjs');

const baseURL = process.env.UAT_BASE_URL || 'https://www.sulandrahealth.com';

export default {
  testDir: './tests',
  testMatch: /production-role-uat\.spec\.mjs/,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  retries: 1,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: false,
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
};
