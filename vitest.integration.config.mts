import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Integration-test configuration.
 *
 * These tests exercise real route handlers against the real local Supabase
 * stack: real SQL, real auth, real RLS. They are separate from the unit suite
 * because they need a running database, take orders of magnitude longer, and
 * are destructive — they create and delete users.
 *
 * Start the stack first:
 *
 *   pnpm supabase start
 *   pnpm test:integration
 *
 * src/test/integration/supabase.ts refuses to run against a non-local host.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '.claude/**', '.next/**'],
    clearMocks: true,
    // Network round trips to the local stack; the unit suite's implicit 5s is
    // too tight for user creation plus sign-in.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
