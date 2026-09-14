import { defineConfig, devices } from '@playwright/test';

// Canvas rendering smoke — Chromium only. The fixtures under tests/e2e/fixtures
// load the BUILT dist ESM directly, so `pnpm build` must run first (CI orders
// the build step before this). The web server is a dependency-free static file
// server (Python's stdlib http.server) rooted at the repo, so the fixtures can
// import `/dist/**` and the locally installed `/node_modules/vue/**` browser
// build (referenced from each fixture's import map).
const PORT = 8797;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/package.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
