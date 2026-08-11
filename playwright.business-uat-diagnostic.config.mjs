import { defineConfig } from '@playwright/test';

await import('./scripts/prepare-item7-runtime-diagnostic.mjs');

export default defineConfig({
  testDir:'./tests',
  testMatch:/production-business-path-uat\.spec\.mjs/,
  grep:/Client Intake|DSP Shift|Home Health Referral|Incident/,
  timeout:35_000,
  expect:{timeout:8_000},
  fullyParallel:false,
  workers:1,
  retries:0,
  reporter:[['line']],
  use:{
    baseURL:process.env.UAT_BASE_URL||'https://www.sulandrahealth.com',
    headless:true,
    ignoreHTTPSErrors:false,
    actionTimeout:8_000,
    navigationTimeout:20_000,
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
  },
});
