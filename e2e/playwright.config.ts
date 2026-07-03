import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3195;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }]] : 'list',
  outputDir: './test-results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Seed the DB, then boot the built server on it (AUTH_BYPASS → admin, loopback).
    command: 'tsx e2e/seed.ts && node dist/server/index.js',
    env: {
      NODE_ENV: 'test',
      AUTH_BYPASS: '1',
      DATABASE_URL: 'file:./data/e2e-playwright.db',
      E2E_DB_PATH: './data/e2e-playwright.db',
      PORT: String(PORT),
    },
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 60_000,
    reuseExistingServer: false,
    cwd: repoRoot,
  },
});
