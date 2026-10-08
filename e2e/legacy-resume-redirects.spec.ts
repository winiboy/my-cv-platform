import { test, expect } from './fixtures/auth'
import { seedFixtureResume } from './fixtures/resume'
import { test as base, expect as baseExpect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * The retired /:locale/resumes/* URLs redirect permanently to the dashboard.
 *
 * The legacy tree was deleted; `redirects()` in next.config.js is all that
 * keeps old bookmarks working. Every hop is requested with `maxRedirects: 0`
 * because following the redirect would hide what matters: a 307 or a 404 that
 * a later hop papers over would look identical to a correct 308 once the
 * browser lands somewhere plausible.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E legacy resume redirects spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const LOCALES = ['fr', 'en', 'de', 'it'] as const

/**
 * A well-formed id that no row has. The redirect is resolved by the routing
 * layer before any page reads the database, so the anonymous checks need no
 * seeded data.
 */
const UNSEEDED_ID = '00000000-0000-4000-8000-000000000000'

interface LegacyRoute {
  legacy: (locale: string, id: string) => string
  live: (locale: string, id: string) => string
}

const ROUTES: readonly LegacyRoute[] = [
  {
    legacy: (l) => `/${l}/resumes`,
    live: (l) => `/${l}/dashboard/resumes`,
  },
  {
    legacy: (l) => `/${l}/resumes/new`,
    live: (l) => `/${l}/dashboard/resumes/new`,
  },
  {
    legacy: (l) => `/${l}/resumes/from-job`,
    live: (l) => `/${l}/dashboard/jobs`,
  },
  {
    legacy: (l, id) => `/${l}/resumes/${id}/edit`,
    live: (l, id) => `/${l}/dashboard/resumes/${id}/edit`,
  },
  {
    legacy: (l, id) => `/${l}/resumes/${id}/preview`,
    live: (l, id) => `/${l}/dashboard/resumes/${id}/preview`,
  },
]

/**
 * Resolve a middleware `Location` header. Next serves a same-origin
 * `NextResponse.redirect` as a relative path, so it is resolved against the
 * server rather than parsed as an absolute URL. A missing header fails here
 * instead of resolving silently to the base URL.
 */
function resolveLocation(location: string | undefined, baseURL: string | undefined): URL {
  if (!location) throw new Error('expected a Location header on the redirect')
  return new URL(location, baseURL)
}

base.describe('legacy resume URLs answer a permanent redirect', () => {
  for (const locale of LOCALES) {
    for (const route of ROUTES) {
      const from = route.legacy(locale, UNSEEDED_ID)
      const to = route.live(locale, UNSEEDED_ID)

      base(`${from} -> 308 ${to}`, async ({ request }) => {
        const response = await request.get(from, { maxRedirects: 0 })

        baseExpect(response.status(), `${from} must redirect permanently`).toBe(308)
        baseExpect(response.headers()['location'], `${from} must point at ${to}`).toBe(to)
      })
    }
  }

  base('a segment that is not a supported locale is left to middleware', async ({
    request,
    baseURL,
  }) => {
    // The `fr|en|de|it` constraint is what stops `/:locale/resumes` from
    // matching any first segment. Without it, /xx/resumes would be sent
    // straight to /xx/dashboard/resumes instead of being locale-prefixed.
    const response = await request.get('/xx/resumes', { maxRedirects: 0 })

    baseExpect(response.status(), 'middleware locale prefixing answers 307, not 308').toBe(307)
    baseExpect(resolveLocation(response.headers()['location'], baseURL).pathname).toBe(
      '/en/xx/resumes'
    )
  })
})

base.describe('signed out, the redirect lands on the dashboard login gate', () => {
  for (const route of ROUTES) {
    const from = route.legacy('en', UNSEEDED_ID)
    const to = route.live('en', UNSEEDED_ID)

    base(`${from} -> ${to} -> /en/login`, async ({ request, baseURL }) => {
      const first = await request.get(from, { maxRedirects: 0 })
      baseExpect(first.status()).toBe(308)
      baseExpect(first.headers()['location']).toBe(to)

      // The second hop is the middleware's existing protected-route redirect,
      // unchanged: a 307 to the login page carrying the destination.
      const second = await request.get(to, { maxRedirects: 0 })
      baseExpect(second.status(), `${to} must be gated for an anonymous visitor`).toBe(307)

      const login = resolveLocation(second.headers()['location'], baseURL)
      baseExpect(login.pathname).toBe('/en/login')
      baseExpect(login.searchParams.get('callbackUrl')).toBe(to)
    })
  }
})

test.describe('signed in, every legacy URL reaches its live page', () => {
  let resumeId: string

  test.beforeEach(async ({ authedUser }) => {
    const seeded = await seedFixtureResume(authedUser.id, 'modern')
    resumeId = seeded.id
  })

  test.afterEach(async () => {
    await admin().from('resumes').delete().eq('id', resumeId)
  })

  test('all five legacy paths land on a live page with HTTP 200', async ({ page }) => {
    for (const route of ROUTES) {
      const from = route.legacy('en', resumeId)
      const to = route.live('en', resumeId)

      const response = await page.goto(from)

      expect(response, `${from} must produce a response`).not.toBeNull()
      expect(response!.status(), `${from} must end on a served page`).toBe(200)
      expect(new URL(page.url()).pathname, `${from} must land on ${to}`).toBe(to)
    }
  })
})
