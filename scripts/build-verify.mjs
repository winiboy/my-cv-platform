/**
 * `next build` into a separate output directory, for verification runs.
 *
 * A plain `pnpm build` writes into `.next` — the same directory a running
 * `next dev` reads. Doing that while a dev server is up leaves `.next/cache`
 * holding both development and production webpack packs, and the dev server
 * then has to invalidate and rebuild against all of it. Observed in practice:
 * 1.6 GB of mixed cache and a dev server that felt broken rather than merely
 * cold. Nothing warns you, because both commands succeed.
 *
 * `playwright.config.ts` already avoids this by building into `.next-e2e`.
 * This is the same isolation for the build that verification runs use, so
 * checking a change cannot degrade the machine it is checked on.
 *
 * Use `pnpm build` for the real thing — releases and CI, where nothing else is
 * sharing the directory. Use `pnpm build:verify` when a dev server is running.
 *
 * A plain script rather than an inline env assignment: `FOO=bar next build`
 * is not portable to PowerShell, which CLAUDE.md §17 names as the primary
 * shell here, and cross-env would be a new dependency for one line.
 */

import { spawn } from 'node:child_process'

const DIST_DIR = process.env.NEXT_DIST_DIR ?? '.next-verify'

console.log(`[build:verify] building into ${DIST_DIR} (leaving .next untouched)`)

const child = spawn('next', ['build'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_DIST_DIR: DIST_DIR },
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[build:verify] terminated by signal ${signal}`)
    process.exit(1)
  }
  process.exit(code ?? 1)
})

child.on('error', (err) => {
  console.error(`[build:verify] failed to start: ${err.message}`)
  process.exit(1)
})
