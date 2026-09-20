import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Unit-test configuration.
 *
 * Scope is pure, deterministic functions plus components rendered to a string
 * with `react-dom/server`. Tests live beside the module they cover as
 * `<module>.test.ts`.
 *
 * `environment: 'node'` is not a limitation here, it is the subject: the server
 * render is precisely what has no DOM, and a jsdom environment would hide the
 * failures these tests exist to catch. A component test that needs to mount,
 * click or hydrate does need a DOM, and that belongs in a separate project
 * entry rather than in a global change to this one.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Agent worktrees under .claude/ hold a full duplicate copy of src/.
    // Without this, every test would be collected and run twice.
    //
    // *.integration.test.ts is excluded because it needs a running Supabase
    // stack; it has its own config in vitest.integration.config.mts. Without
    // this exclusion `pnpm test` would collect it and fail on a machine that
    // has no database, breaking the required CI check.
    exclude: [
      '**/node_modules/**',
      '.claude/**',
      '.next/**',
      'src/**/*.integration.test.ts',
    ],
    clearMocks: true,
  },
  // tsconfig.json sets `jsx: "preserve"` because Next.js compiles JSX itself.
  // Vite would otherwise leave JSX untransformed and refuse to import any
  // .tsx module, so tests that server-render a component get the same
  // automatic runtime Next.js uses.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
