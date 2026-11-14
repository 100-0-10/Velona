import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'protocol.spec.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: {
    command: 'dotnet run --project ../backend/Velona.Server --no-launch-profile --urls http://127.0.0.1:5082',
    cwd: '..', url: 'http://127.0.0.1:5082/health', timeout: 60_000,
    env: { ASPNETCORE_ENVIRONMENT: 'Development', Persistence__Enabled: 'false' }, reuseExistingServer: false,
  },
});
