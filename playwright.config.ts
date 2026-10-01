import { defineConfig, devices } from '@playwright/test';

/**
 * E2E (master prompt §15): participant flows for every type on Pixel 5 and iPhone 13 viewports, DE and EN,
 * with the add-in harness as presenter. Runs against the production build: `pnpm build && pnpm test:e2e`.
 * Set PW_CHROMIUM_EXECUTABLE to use a preinstalled Chromium instead of `npx playwright install chromium`.
 */
const PORT = 3999;
const executablePath = process.env.PW_CHROMIUM_EXECUTABLE;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'pixel5-de', use: { ...devices['Pixel 5'], locale: 'de-AT', launchOptions } },
    { name: 'pixel5-en', use: { ...devices['Pixel 5'], locale: 'en-GB', launchOptions } },
    { name: 'iphone13-de', use: { ...devices['iPhone 13'], browserName: 'chromium', locale: 'de-AT', launchOptions } },
    { name: 'iphone13-en', use: { ...devices['iPhone 13'], browserName: 'chromium', locale: 'en-GB', launchOptions } },
  ],
  webServer: {
    command: 'node apps/server/dist/index.js',
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      APP_DOMAIN: `localhost:${PORT}`,
      PUBLIC_BASE_URL: `http://localhost:${PORT}`,
      EXPORT_TOKEN_SECRET: 'e2e-export-token-secret-e2e-export-token',
      PARTICIPANT_HASH_SALT: 'e2e-participant-salt',
      PGLITE_DIR: 'memory://',
      LOG_LEVEL: 'warn',
      // Plain HTTP even when a local-mode .env (DEV_CERTS=true) exists.
      DEV_CERTS: 'false',
      TLS_CERT_FILE: '',
      TLS_KEY_FILE: '',
    },
  },
});
