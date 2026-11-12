import { defineConfig, devices } from '@playwright/test';

/**
 * Local-only e2e against the ios-dev Supabase project (run via `npm run e2e:dev`).
 * Passkey RP ID is `localhost`, so the origin must be exactly http://localhost:5173.
 */
export default defineConfig({
  testDir: 'e2e-dev',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  globalSetup: './e2e-dev/global-setup.ts',
  globalTeardown: './e2e-dev/global-teardown.ts',
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The dev server never needs the Node-side secrets: remove them from its environment.
    command: 'env -u DEV_SECRET_KEY -u DEV_DB_URL npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    // VITE_SW_DEV off: the dev service worker (for local push tests) is not part of the e2e runs.
    env: { VITE_API: 'supabase', VITE_SW_DEV: 'off' },
  },
});
