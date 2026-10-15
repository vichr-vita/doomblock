import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm run preview:ui',
    url: 'http://127.0.0.1:4173/tests/browser/ui.html',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/*extension.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: '**/*extension.spec.ts',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          executablePath: process.env.DOOMBLOCK_FIREFOX_EXECUTABLE,
        },
      },
    },
    {
      name: 'webkit',
      testIgnore: '**/*extension.spec.ts',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'extension-firefox',
      testMatch: '**/extension.spec.ts',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'extension-chromium',
      testMatch: '**/chrome-extension.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
