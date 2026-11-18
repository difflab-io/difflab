import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: dirname(fileURLToPath(import.meta.url)),
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    viewport: { width: 1120, height: 640 },
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1120, height: 640 } },
    },
  ],
})
