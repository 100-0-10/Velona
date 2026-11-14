import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', timeout: 45_000, expect: { timeout: 8_000 }, workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure', launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: [
    { command: 'dotnet run --project ../backend/Velona.Server --no-launch-profile --urls http://127.0.0.1:5080', url: 'http://127.0.0.1:5080/health', env: { ASPNETCORE_ENVIRONMENT: 'Development', DOTNET_ENVIRONMENT: 'Development', Persistence__Enabled: process.env.VELONA_E2E_POSTGRES === '1' ? 'true' : 'false' }, reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: 'npm run dev -- --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
});
