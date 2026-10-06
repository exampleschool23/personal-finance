// Browser tests of the P0 flows (e2e/), against a production build of the app and the test Supabase in
// e2e/fake-supabase.mjs. Build first with `npm run build:production`, then `npm run test:e2e`.
import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { appUrl, supabaseUrl, testAccount } from './e2e/settings.mjs';

// `next start` would read .env.local and the other env files, which hold real keys (the bot token, the service key,
// market data). Every key they name is blanked for the test server, so a run never reaches a real service.
const envFiles = ['.env', '.env.local', '.env.production', '.env.production.local'].filter(file => fs.existsSync(file));
const blanked = Object.fromEntries(envFiles.flatMap(file => fs.readFileSync(file, 'utf8').split('\n')).map(line => line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1]).filter(Boolean).map(key => [key, '']));

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.spec\.mjs/,
  // One database for the run, restored from a snapshot before each test, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.mjs',
  use: {
    baseURL: appUrl,
    storageState: 'e2e/.auth/state.json',
    locale: 'en-US',
    timezoneId: 'Asia/Tashkent',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: [
    {
      command: 'node e2e/fake-supabase.mjs',
      url: supabaseUrl + '/auth/v1/.well-known/jwks.json',
      reuseExistingServer: false,
      env: { E2E_SUPABASE_PORT: new URL(supabaseUrl).port, E2E_EMAIL: testAccount.email, E2E_PASSWORD: testAccount.password, E2E_USER_ID: testAccount.id },
    },
    {
      command: `npx next start -p ${new URL(appUrl).port} -H ${new URL(appUrl).hostname}`,
      url: appUrl + '/sign-in',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...blanked, SUPABASE_URL: supabaseUrl, SUPABASE_PUBLISHABLE_KEY: 'e2e-publishable-key', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_e2e_only', APP_ORIGIN: appUrl, PUBLIC_SIGNUP_ENABLED: 'false' },
    },
  ],
});
