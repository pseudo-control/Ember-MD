import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  globalTimeout: 1_800_000,  // 30 minutes — full suite includes MD sim (3 min) + benchmark (50s) + docking (35s)
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
});
