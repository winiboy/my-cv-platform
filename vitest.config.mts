import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Unit-test configuration.
 *
 * Scope is deliberately narrow: pure, deterministic functions only. Tests live
 * beside the module they cover as `<module>.test.ts`.
 *
 * `environment: 'node'` is correct while this suite covers pure logic. Adding
 * React component tests later requires a DOM environment and a separate
 * project entry rather than changing this one globally.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Agent worktrees under .claude/ hold a full duplicate copy of src/.
    // Without this, every test would be collected and run twice.
    exclude: ['**/node_modules/**', '.claude/**', '.next/**'],
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
