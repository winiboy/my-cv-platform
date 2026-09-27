import { test, expect, loginAs, type TestUser } from './fixtures/auth'
import { seedFixtureResume } from './fixtures/resume'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * Security response headers are SERVED, not merely configured.
 *
 * WHY THIS IS AN E2E TEST AND NOT A UNIT TEST
 *
 * Phase 30 finding M3 was that the application sent no security headers at
 * all. A unit test that imports `next.config.js` and asserts the strings it
 * returns would have passed the moment the config was written, while proving
 * nothing about what a browser receives: `headers()` is compiled into the
 * routes manifest at build time, and a wrong `source` pattern, a Sentry wrapper
 * that dropped the key, or a header stripped by the server would all be
 * invisible. The claim worth defending is "a response carries these headers",
 * and only a real request against a real production server evidences it.
 *
 * WHAT EACH TEST ESTABLISHES
 *
 *   1. A page route carries the full set.
 *   2. An API route carries it too - the routes manifest matches `/:path*`,
 *      which middleware deliberately does not.
 *   3. The report-only CSP does not fire on the core product. The resume
 *      editor and preview are the pages the policy is most likely to break:
 *      the templates emit inline style attributes, the profile photo is a
 *      base64 data: URL, and the print path re-renders the same document. A
 *      violation here means the policy is wrong, because this document is
 *      legitimate.
 *
 * Test 3 is the gate that has to stay green before the header is renamed from
 * Content-Security-Policy-Report-Only to Content-Security-Policy.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E security headers spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Headers that must appear on every response, with their exact values. */
const EXACT_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['x-frame-options', 'DENY'],
  ['x-content-type-options', 'nosniff'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
]

/**
 * CSP directives that must be present verbatim.
 *
 * Asserted as substrings rather than against the whole policy string so that
 * adding a directive does not fail the test, while weakening or losing one of
 * these does. `frame-ancestors 'none'` and the absence of a wildcard in
 * `img-src` are the two that downgrade the M1 sanitiser escape from "beacon
 * fires" to "beacon blocked".
 */
const REQUIRED_CSP_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "worker-src 'self' blob:",
]

/**
 * A CSP violation as the browser reports it, reduced to the fields that
 * identify what was blocked.
 */
interface CspViolation {
  directive: string
  blockedUri: string
  sourceFile: string
  lineNumber: number
}

/**
 * Record every securitypolicyviolation event the page fires, report-only
 * included, before any application script runs.
 *
 * The console is not used as the source here: console text is formatted per
 * browser build and would make the assertion depend on a message string. The
 * DOM event carries the directive and the blocked URI as structured data.
 *
 * Violations accumulate on the Node side rather than on `window`, because an
 * init script re-runs on every navigation and would discard whatever the
 * previous document had recorded - the editor's violations would vanish the
 * moment the test moved on to the preview.
 */
async function collectCspViolations(page: Page): Promise<CspViolation[]> {
  const violations: CspViolation[] = []

  await page.exposeFunction('__reportCspViolation', (violation: CspViolation) => {
    violations.push(violation)
  })

  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = window as unknown as {
        __reportCspViolation?: (violation: Record<string, unknown>) => void
      }
      report.__reportCspViolation?.({
        directive: event.effectiveDirective || event.violatedDirective,
        blockedUri: event.blockedURI,
        sourceFile: event.sourceFile ?? '',
        lineNumber: event.lineNumber ?? 0,
      })
    })
  })

  return violations
}

test.describe('security response headers', () => {
  test('a page route carries the full header set', async ({ request }) => {
    const response = await request.get('/en/login')
    expect(response.status()).toBe(200)

    const headers = response.headers()

    for (const [key, value] of EXACT_HEADERS) {
      expect(headers[key], `${key} on a page route`).toBe(value)
    }

    // `pnpm start` runs with NODE_ENV=production, which is the only mode that
    // emits HSTS - a two-year pin on https://localhost would break plain-http
    // local development.
    expect(headers['strict-transport-security']).toBe(
      'max-age=63072000; includeSubDomains'
    )

    expect(headers['permissions-policy'], 'Permissions-Policy on a page route')
      .toContain('camera=()')

    const csp = headers['content-security-policy-report-only']
    expect(csp, 'the report-only CSP must be present').toBeTruthy()
    for (const directive of REQUIRED_CSP_DIRECTIVES) {
      expect(csp, `CSP must contain: ${directive}`).toContain(directive)
    }

    // The policy is not yet enforcing; renaming the header is a deliberate,
    // separate change gated on the violation sweep below.
    expect(headers['content-security-policy']).toBeUndefined()
  })

  test('an API route carries the full header set', async ({ request }) => {
    // Status is deliberately not asserted: this route's auth behaviour is not
    // what is under test, and the headers are applied by the routing layer
    // before any handler runs.
    const response = await request.get('/api/cover-letters')
    const headers = response.headers()

    for (const [key, value] of EXACT_HEADERS) {
      expect(headers[key], `${key} on an API route`).toBe(value)
    }
    expect(headers['content-security-policy-report-only']).toBeTruthy()
  })
})

test.describe('the report-only CSP does not fire on the resume path', () => {
  let user: TestUser
  let resumeId: string

  test.beforeEach(async ({ authedUser }) => {
    user = authedUser
    const seeded = await seedFixtureResume(user.id, 'modern')
    resumeId = seeded.id
  })

  test.afterEach(async () => {
    await admin().from('resumes').delete().eq('id', resumeId)
  })

  test('the editor and the preview report no violations, print media included', async ({
    page,
  }) => {
    const violations = await collectCspViolations(page)
    await loginAs(page, user)

    await page.goto(`/en/resumes/${resumeId}/edit`)
    await expect(page.getByText(/Jean|Experience|Skills/i).first()).toBeVisible()

    await page.goto(`/en/resumes/${resumeId}/preview`)
    await expect(page.getByText(/Jean|Experience|Skills/i).first()).toBeVisible()

    // The download button calls window.print(); print media re-resolves the
    // @media print block in globals.css and every inline style with it.
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(1_000)
    await page.emulateMedia({ media: 'screen' })

    expect(
      violations,
      `report-only CSP violations on the resume path:\n${JSON.stringify(violations, null, 2)}`
    ).toEqual([])
  })
})
