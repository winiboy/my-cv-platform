import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit coverage for `GET /api/health/ai`.
 *
 * The seam is the Groq SDK, not `generateCompletion`. Mocking the SDK keeps
 * everything between the route and the network real — the model resolution,
 * the reasoning-effort retry, the failure classification — so the unhealthy
 * assertions below exercise the same code a live retirement would, one layer
 * short of the wire. Mocking `generateCompletion` instead would have made the
 * 503 test assert only that the route can rethrow a value the test invented.
 *
 * Whether the provider is actually reachable is unknowable from a unit test by
 * construction. That is what the scheduled workflow is for.
 */

const createCompletion = vi.fn()

vi.mock('groq-sdk', () => {
  class MockAPIError extends Error {
    constructor(
      readonly status: number,
      readonly error: unknown,
      message: string
    ) {
      super(message)
    }
  }
  class MockGroq {
    static APIError = MockAPIError
    chat = { completions: { create: createCompletion } }
  }
  return { default: MockGroq }
})

const API_KEY = 'gsk-test-key-not-a-real-secret'
/**
 * A second key, differing from `API_KEY` in length as well as in value. The
 * disclosure check below renders the endpoint under both: a body that encodes
 * anything about the key differs between the two renders.
 */
const OTHER_API_KEY = 'gsk-a-substantially-longer-test-key-that-is-also-not-a-real-secret'
const TOKEN = 'health-token-not-a-real-secret'

const OK_COMPLETION = { choices: [{ message: { content: 'ok' } }], usage: { total_tokens: 3 } }

/** The 404 Groq returns once a hosted model is retired. */
async function retiredModelError() {
  const { default: Groq } = (await import('groq-sdk')) as unknown as {
    default: { APIError: new (s: number, e: unknown, m: string) => Error }
  }
  return new Groq.APIError(
    404,
    { error: { code: 'model_not_found', message: 'The model `x` does not exist' } },
    '404 model_not_found'
  )
}

/** Imports the route fresh, so module-level model resolution sees stubbed env. */
async function loadRoute() {
  vi.resetModules()
  return import('./route')
}

function healthRequest(authorization?: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/health/ai', {
    headers: authorization ? { authorization } : {},
  })
}

/**
 * Renders the unauthenticated config body under one API key.
 *
 * Freezes only `Date`, so every render carries the same `checkedAt` and two
 * renders are comparable byte for byte. Timers and microtasks stay real; the
 * `afterEach` below restores `Date`.
 */
async function configBodyFor(apiKey: string): Promise<string> {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'))
  vi.stubEnv('GROQ_API_KEY', apiKey)
  const { GET } = await loadRoute()
  return JSON.stringify(await (await GET(healthRequest())).json())
}

/** The ways this endpoint could disclose something about the configured key. */
const DISCLOSURE = {
  value: 'echoes the key value',
  derivedField: 'carries an apiKey-derived field',
  fingerprint: 'varies with the key, so the key can be fingerprinted from it',
} as const

/**
 * Names every disclosure found across renders of the endpoint under different
 * API keys. Empty means the body reveals nothing about the key.
 *
 * The length half of this used to be `not.toContain(String(key.length))` over
 * the whole serialised body. Freezing `Date` stopped `checkedAt` supplying the
 * digits, but the check stayed coupled to the rest of the body - `gpt-oss-20b`
 * would make a 20-character fixture key fail outright - and it was incomplete:
 * a length leaks without those digits ever appearing, as a masked or hashed
 * form of the key.
 *
 * Comparing renders under keys of differing length tests the actual property
 * instead. Anything derived from the key - the value, its length, a preview, a
 * digest - differs between the renders; a body that derives nothing from it is
 * byte-identical, because `configBodyFor` freezes the clock. No digits, no
 * allowlist of fields to keep up to date, and a field added later is covered
 * without being enumerated.
 */
function keyDisclosures(renders: readonly { key: string; body: string }[]): string[] {
  const found: string[] = []

  for (const { key, body } of renders) {
    if (body.includes(key)) found.push(DISCLOSURE.value)
    if (/apiKey(?!Present)/.test(body)) found.push(DISCLOSURE.derivedField)
  }

  const [first, ...others] = renders
  if (others.some(({ body }) => body !== first.body)) {
    found.push(DISCLOSURE.fingerprint)
  }

  return [...new Set(found)]
}

beforeEach(() => {
  createCompletion.mockReset()
  vi.stubEnv('GROQ_API_KEY', API_KEY)
  vi.stubEnv('GROQ_MODEL', '')
  vi.stubEnv('GROQ_MODEL_FAST', '')
  vi.stubEnv('HEALTH_CHECK_TOKEN', '')
  // generateCompletion logs the provider error before rethrowing; the failure
  // paths below are expected, so keep the run readable.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('unauthenticated configuration check', () => {
  it('reports the resolved configuration as healthy without calling the provider', async () => {
    const { GET } = await loadRoute()

    const response = await GET(healthRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.depth).toBe('config')
    expect(body.config.apiKeyPresent).toBe(true)
    expect(body.config.models.balanced).toEqual({
      id: 'openai/gpt-oss-120b',
      source: 'default',
    })
    expect(body.config.models.fast).toEqual({ id: 'openai/gpt-oss-20b', source: 'default' })
    expect(body).not.toHaveProperty('provider')
    // The free depth must stay free: no tokens spent, no provider dependency.
    expect(createCompletion).not.toHaveBeenCalled()
  })

  it('never discloses the key value, its length, or anything else derived from it', async () => {
    // Length is a fingerprint, so presence is the only fact this endpoint may
    // report about the key.
    expect(OTHER_API_KEY.length).not.toBe(API_KEY.length)

    const renders = [
      { key: API_KEY, body: await configBodyFor(API_KEY) },
      { key: OTHER_API_KEY, body: await configBodyFor(OTHER_API_KEY) },
    ]

    expect(keyDisclosures(renders)).toEqual([])
    // Two identical *failure* bodies would satisfy the comparison above while
    // proving nothing, so confirm both renders are the healthy config report.
    for (const { body } of renders) {
      expect(JSON.parse(body)).toMatchObject({ status: 'ok', config: { apiKeyPresent: true } })
    }
  })

  it('reports env provenance when a model id is pinned', async () => {
    vi.stubEnv('GROQ_MODEL', 'groq/some-replacement-model')
    const { GET } = await loadRoute()

    const body = await (await GET(healthRequest())).json()

    expect(body.config.models.balanced).toEqual({
      id: 'groq/some-replacement-model',
      source: 'env',
    })
    // An unpinned id must still report as a default, not inherit the override.
    expect(body.config.models.fast.source).toBe('default')
  })

  it('is 503 when no API key is configured, because every AI tool is already down', async () => {
    vi.stubEnv('GROQ_API_KEY', '')
    const { GET } = await loadRoute()

    const response = await GET(healthRequest())
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.status).toBe('unhealthy')
    expect(body.reason).toBe('missing_api_key')
    expect(body.config.apiKeyPresent).toBe(false)
  })

  it('forbids caching, so a monitor cannot be served a stale verdict', async () => {
    const { GET } = await loadRoute()

    expect((await GET(healthRequest())).headers.get('cache-control')).toBe('no-store')
  })
})

describe('the key-disclosure check itself', () => {
  /**
   * A guard that cannot fail is not a guard, and the one it replaces could
   * pass for the wrong reason. Each case below takes the real rendered bodies
   * and injects one deliberate leak, so these assert against the endpoint's
   * actual output shape rather than a hand-written imitation of it.
   */
  async function rendersLeaking(leak: (key: string) => string) {
    const renders = []
    for (const key of [API_KEY, OTHER_API_KEY]) {
      const body = await configBodyFor(key)
      renders.push({
        key,
        body: body.replace('"apiKeyPresent":true', `"apiKeyPresent":true,${leak(key)}`),
      })
    }
    return renders
  }

  it('reports nothing for an injection that derives nothing from the key', async () => {
    // The control. Without it, the fingerprint cases below could pass because
    // the renders differ for some other reason, not because of the leak.
    const renders = await rendersLeaking(() => `"inert":true`)

    expect(keyDisclosures(renders)).toEqual([])
  })

  it('catches a body that echoes the key', async () => {
    const renders = await rendersLeaking((key) => `"probe":"${key}"`)

    expect(keyDisclosures(renders)).toContain(DISCLOSURE.value)
  })

  it('catches a body that reports the key length as a number', async () => {
    // The failing assertion this replaces caught this leak only when the
    // digits happened not to collide with the rest of the body.
    const renders = await rendersLeaking((key) => `"keyLength":${key.length}`)

    expect(keyDisclosures(renders)).toContain(DISCLOSURE.fingerprint)
  })

  it('catches a masked key, whose length leaks without any digits at all', async () => {
    // The whole-body digit scan could never have caught this one.
    const renders = await rendersLeaking(
      (key) => `"keyPreview":"${key.slice(0, 4)}${'*'.repeat(key.length - 4)}"`
    )

    expect(keyDisclosures(renders)).toContain(DISCLOSURE.fingerprint)
  })

  it('catches an apiKey-derived field', async () => {
    const renders = await rendersLeaking((key) => `"apiKeyDigest":"${key.length.toString(16)}"`)

    expect(keyDisclosures(renders)).toContain(DISCLOSURE.derivedField)
  })
})

describe('deep check authorisation', () => {
  it('refuses the deep check when HEALTH_CHECK_TOKEN is unset, rather than opening it', async () => {
    // Fail closed. Treating "no token configured" as "no auth needed" would let
    // anyone spend the owner's Groq budget.
    const { GET } = await loadRoute()

    const response = await GET(healthRequest(`Bearer ${TOKEN}`))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.reason).toBe('deep_check_not_configured')
    expect(createCompletion).not.toHaveBeenCalled()
  })

  it('rejects a wrong token', async () => {
    vi.stubEnv('HEALTH_CHECK_TOKEN', TOKEN)
    const { GET } = await loadRoute()

    const response = await GET(healthRequest('Bearer definitely-not-the-token'))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.reason).toBe('invalid_token')
    expect(createCompletion).not.toHaveBeenCalled()
  })

  it('rejects a token that is a prefix of the configured one', async () => {
    // Guards the constant-time comparison against degrading into a
    // startsWith-style match.
    vi.stubEnv('HEALTH_CHECK_TOKEN', TOKEN)
    const { GET } = await loadRoute()

    const response = await GET(healthRequest(`Bearer ${TOKEN.slice(0, -1)}`))

    expect(response.status).toBe(401)
    expect(createCompletion).not.toHaveBeenCalled()
  })

  it('rejects a malformed authorization header', async () => {
    vi.stubEnv('HEALTH_CHECK_TOKEN', TOKEN)
    const { GET } = await loadRoute()

    const response = await GET(healthRequest(TOKEN))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.reason).toBe('invalid_authorization_header')
    expect(createCompletion).not.toHaveBeenCalled()
  })

  it('never echoes the configured token back', async () => {
    vi.stubEnv('HEALTH_CHECK_TOKEN', TOKEN)
    const { GET } = await loadRoute()

    const response = await GET(healthRequest('Bearer wrong'))

    expect(JSON.stringify(await response.json())).not.toContain(TOKEN)
  })
})

describe('authenticated deep check', () => {
  beforeEach(() => {
    vi.stubEnv('HEALTH_CHECK_TOKEN', TOKEN)
  })

  it('performs one minimal completion and reports it healthy', async () => {
    createCompletion.mockResolvedValue(OK_COMPLETION)
    const { GET } = await loadRoute()

    const response = await GET(healthRequest(`Bearer ${TOKEN}`))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.depth).toBe('provider')
    expect(body.provider.status).toBe('ok')
    expect(body.provider.model).toBe('openai/gpt-oss-120b')
    expect(body.provider.responded).toBe(true)
    expect(typeof body.provider.latencyMs).toBe('number')
    expect(body.provider.latencyMs).toBeGreaterThanOrEqual(0)

    expect(createCompletion).toHaveBeenCalledTimes(1)
    // The probe is billed to the owner on every run; keep it minimal.
    expect(createCompletion.mock.calls[0][0]).toMatchObject({
      model: 'openai/gpt-oss-120b',
      max_tokens: 32,
    })
  })

  it('probes the model id pinned in the environment, not the compiled default', async () => {
    // The retirement escape hatch is GROQ_MODEL. A check that probed the
    // compiled default would report healthy while production used a broken id.
    vi.stubEnv('GROQ_MODEL', 'groq/some-replacement-model')
    createCompletion.mockResolvedValue(OK_COMPLETION)
    const { GET } = await loadRoute()

    const body = await (await GET(healthRequest(`Bearer ${TOKEN}`))).json()

    expect(body.provider.model).toBe('groq/some-replacement-model')
    expect(createCompletion.mock.calls[0][0]).toMatchObject({
      model: 'groq/some-replacement-model',
    })
  })

  it('reports 503 when the provider retires the model', async () => {
    // This is the whole point of the feature. A health check that cannot
    // report unhealthy is worse than none.
    createCompletion.mockRejectedValue(await retiredModelError())
    const { GET } = await loadRoute()

    const response = await GET(healthRequest(`Bearer ${TOKEN}`))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.status).toBe('unhealthy')
    expect(body.provider.status).toBe('failed')
    expect(body.provider.reason).toBe('model_not_found')
    expect(typeof body.provider.latencyMs).toBe('number')
  })

  it('reports 503 without leaking the provider error text', async () => {
    createCompletion.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:443'))
    const { GET } = await loadRoute()

    const response = await GET(healthRequest(`Bearer ${TOKEN}`))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.provider.reason).toBe('network_error')
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
    expect(JSON.stringify(body)).not.toContain('10.0.0.5')
  })

  it('does not call the provider when the API key is missing', async () => {
    vi.stubEnv('GROQ_API_KEY', '')
    const { GET } = await loadRoute()

    const response = await GET(healthRequest(`Bearer ${TOKEN}`))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.provider.reason).toBe('missing_api_key')
    expect(createCompletion).not.toHaveBeenCalled()
  })

  it('stays healthy but flags an empty answer rather than raising a false alarm', async () => {
    // An accepted call whose budget the reasoning pass consumed is degraded,
    // not down. A daily false alarm is how a health check gets ignored.
    createCompletion.mockResolvedValue({ choices: [{ message: { content: '   ' } }] })
    const { GET } = await loadRoute()

    const response = await GET(healthRequest(`Bearer ${TOKEN}`))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.provider.responded).toBe(false)
  })
})
