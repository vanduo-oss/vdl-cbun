import { defineConfig } from 'vitest/config';

// Default to the `node` environment so DOM-free code (hex-math, chart
// primitives) is proven runtime-agnostic; DOM-dependent spec files opt into
// jsdom with a `// @vitest-environment jsdom` docblock. Shared jsdom stubs are
// installed once via setupFiles (they self-guard on `window`).
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.spec.ts'],
    // tests/e2e/* are Playwright specs (run via `test:e2e`), not vitest.
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
});
