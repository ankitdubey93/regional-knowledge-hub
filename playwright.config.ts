import { defineConfig } from '@playwright/test';
import { API, E2E_ENV, WEB } from './e2e/env';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: WEB, channel: 'chrome' },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'mobile-light',
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
      use: { viewport: { width: 375, height: 812 }, colorScheme: 'light' },
    },
    {
      name: 'mobile-dark',
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
      use: { viewport: { width: 375, height: 812 }, colorScheme: 'dark' },
    },
    {
      name: 'desktop-light',
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
    },
    {
      name: 'desktop-dark',
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
    },
  ],
  webServer: [
    {
      command:
        'node --import tsx scripts/e2e-db.ts && node --import tsx scripts/migrate.ts && node --import tsx scripts/seed-facts.ts && node --import tsx scripts/seed-curriculum.ts && node --import tsx src/index.ts',
      cwd: 'server',
      url: `${API}/api/health`,
      env: E2E_ENV,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite --port 5192 --strictPort',
      cwd: 'client',
      url: WEB,
      env: { CHUB_API_ORIGIN: API },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
