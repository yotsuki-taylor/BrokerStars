import { defineConfig } from 'vitest/config';

/**
 * Why this file exists at all, when it configures almost nothing.
 *
 * Without it vitest walks up out of `worker/` and finds the GAME's
 * `vite.config.ts` in the repository root — a config that imports `vite` and
 * `@vitejs/plugin-react`, neither of which is a dependency of this package.
 * On a machine where somebody has also run `npm install` at the root that
 * resolves by accident and the tests pass; on a clean checkout that installs
 * only `worker/package-lock.json` — which is what CI does, and what a new
 * contributor does — vitest dies before running a single test.
 *
 * So this is a stop sign rather than a configuration. The Worker is its own
 * package with its own lockfile and its own tsconfig, and it has no business
 * loading the client's build setup: it never renders anything, and the modules
 * it borrows out of `src/` are plain TypeScript with no JSX in them.
 *
 * `.mts` rather than `.ts` because this package has no `"type": "module"` —
 * the root one does, but a config is resolved against the package it sits in,
 * and ESM loaded as CommonJS is a warning today and an error in a future Vite.
 */
export default defineConfig({
  test: {
    // No DOM. Everything here is arithmetic over a row and a signature.
    environment: 'node',
  },
});
