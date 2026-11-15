import { defineConfig, devices } from '@playwright/test';

/**
 * Local-only e2e against the ios-dev Supabase project (run via `npm run e2e:dev`).
 * Passkey RP ID is `localhost`, so the origin must be exactly http://localhost:5173.
 */
/** Override with E2E_PORT to run beside another dev server (default 5173). */
const PORT = Number(process.env.E2E_PORT ?? 5173);
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'e2e-dev',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  globalSetup: './e2e-dev/global-setup.ts',
  globalTeardown: './e2e-dev/global-teardown.ts',
  use: { baseURL: ORIGIN },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      // Edge Function CORS only allows http://localhost:5173, so another port needs web security off (local runs only).
      ...(PORT === 5173 ? {} : { launchOptions: { args: ['--disable-web-security'] } }),
    },
  }],
  webServer: {
    // The dev server never needs the Node-side secrets: remove them from its environment.
    command: `env -u DEV_SECRET_KEY -u DEV_DB_URL npm run dev -- --port ${PORT}`,
    url: ORIGIN,
    reuseExistingServer: false,
    // VITE_SW_DEV off: the dev service worker (for local push tests) is not part of the e2e runs.
    env: { VITE_API: 'supabase', VITE_SW_DEV: 'off', VITE_FEATURE_PUSH: 'on' },
  },
});
