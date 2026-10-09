import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ['--no-sandbox'] },
  },
  reporter: 'list',
});
