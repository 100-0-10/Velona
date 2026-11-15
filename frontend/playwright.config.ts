import { defineConfig } from '@playwright/test';

const backend = process.env.VELONA_BACKEND_URL ?? 'http://127.0.0.1:5082';
const frontend = 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: './e2e', timeout: 45_000, expect: { timeout: 8_000 }, workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  // Keep DOM/network traces, but avoid continuous WebGL screenshot readbacks
  // that stall software GPUs. Explicit visual/pixel captures remain in tests.
  use: { baseURL: frontend, browserName: 'chromium', screenshot: 'only-on-failure', trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: [
    { command: `dotnet run --project ../backend/Velona.Server --no-launch-profile --urls ${backend}`, url: backend + '/health', env: { ASPNETCORE_ENVIRONMENT: 'Development', DOTNET_ENVIRONMENT: 'Development', Persistence__Enabled: process.env.VELONA_E2E_POSTGRES === '1' ? 'true' : 'false' }, reuseExistingServer: false, timeout: 120_000 },
    { command: 'npm run dev -- --port 5174', url: frontend, env: { VELONA_BACKEND_URL: backend }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
