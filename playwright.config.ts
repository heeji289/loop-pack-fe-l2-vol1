import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
      },
    },
  ],
  webServer: {
    // CI는 직전 step에서 이미 production build를 수행하므로 start만 한다 (중복 build 제거).
    command: process.env.CI ? 'pnpm start' : 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    env: { APP_ORIGIN: 'http://localhost:3000' },
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
