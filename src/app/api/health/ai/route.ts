import { createHash, timingSafeEqual } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'

import {
  AiCompletionError,
  MODEL_CONFIGURATION,
  generateCompletion,
  type AiFailureReason,
  type ResolvedModel,
} from '@/lib/ai/client'

/**
 * `node:crypto` is used for the constant-time token comparison, so this cannot
 * run on the edge runtime.
 */
export const runtime = 'nodejs'

/**
 * A health check that is cached is not a health check. Reading the
 * `Authorization` header already opts out of static rendering; this states the
 * intent so a future refactor cannot quietly restore caching.
 */
export const dynamic = 'force-dynamic'

/**
 * Just enough budget for a one-word answer. The probe exists to prove the
 * provider answers, not to produce anything, and it is billed to the owner's
 * Groq account on every run.
 *
 * 32 rather than 16, measured against `openai/gpt-oss-120b` at the default
 * `reasoning_effort: 'low'`:
 *
 *   budget=16  finish=length  completion_tokens=16  reasoning=8  content=""
 *   budget=32  finish=stop    completion_tokens=18  reasoning=8  content="ok"
 *
 * The reasoning pass alone spends 8 of the budget, so at 16 the answer is
 * always truncated away and `responded` below is permanently false — a field
 * that can never be true is worse than no field. The tighter cap saved nothing
 * for it: Groq bills the 18 tokens actually used, not the cap.
 */
const PROBE_MAX_TOKENS = 32

/** Trivial and content-free: nothing here is user data. */
const PROBE_PROMPT = 'Reply with the single word: ok'

/** Uptime monitors and proxies must never serve a stale verdict. */
const NO_STORE = { 'Cache-Control': 'no-store' } as const

/** Reasons the deep check can be refused. None of them disclose the token. */
type RefusalReason =
  | 'deep_check_not_configured'
  | 'invalid_authorization_header'
  | 'invalid_token'

interface ConfigReport {
  /** Presence only. The value and even its length are never reported. */
  readonly apiKeyPresent: boolean
  readonly models: {
    readonly balanced: ResolvedModel
    readonly fast: ResolvedModel
  }
}

type AuthOutcome =
  | { kind: 'anonymous' }
  | { kind: 'authorized' }
  | { kind: 'refused'; reason: RefusalReason }

/**
 * Compares a presented token against the configured one in constant time.
 *
 * Both sides are hashed first so the compared buffers are always 32 bytes:
 * `timingSafeEqual` throws on a length mismatch, and an early length check
 * would leak the configured token's length through timing. Hashing removes
 * both problems.
 */
function matchesConfiguredToken(presented: string, configured: string): boolean {
  const a = createHash('sha256').update(presented, 'utf8').digest()
  const b = createHash('sha256').update(configured, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/**
 * Decides which depth of check the caller may have.
 *
 * No `Authorization` header means the caller gets the free configuration
 * check. A header means they are asking for the paid provider call, and must
 * prove it.
 */
function authorize(request: NextRequest): AuthOutcome {
  const header = request.headers.get('authorization')
  if (!header) {
    return { kind: 'anonymous' }
  }

  const configured = process.env.HEALTH_CHECK_TOKEN?.trim()
  if (!configured) {
    // Fail closed. With no token configured there is no correct credential, so
    // the deep check is unavailable rather than open to anyone who asks — it
    // spends the owner's Groq budget.
    return { kind: 'refused', reason: 'deep_check_not_configured' }
  }

  const bearer = /^Bearer\s+(\S+)$/i.exec(header.trim())
  if (!bearer) {
    return { kind: 'refused', reason: 'invalid_authorization_header' }
  }

  return matchesConfiguredToken(bearer[1], configured)
    ? { kind: 'authorized' }
    : { kind: 'refused', reason: 'invalid_token' }
}

/**
 * Reads the effective AI configuration.
 *
 * The model ids come from the same constants every AI tool uses, so this
 * cannot report a configuration the application does not actually have.
 */
function readConfig(): ConfigReport {
  return {
    apiKeyPresent: Boolean(process.env.GROQ_API_KEY?.trim()),
    models: {
      balanced: MODEL_CONFIGURATION.balanced,
      fast: MODEL_CONFIGURATION.fast,
    },
  }
}

/**
 * GET /api/health/ai
 *
 * Reports whether the AI provider is usable. Groq retires hosted models on its
 * own schedule, and a retirement takes every AI tool down at once with a
 * failure no test layer can see — the last one was found by a user clicking a
 * button. This endpoint is the layer that sees it.
 *
 * Two depths, because a live check costs tokens:
 *
 * - **Unauthenticated** — configuration only. Reports whether an API key is
 *   present (never the value, never its length) and which model ids resolve,
 *   with their provenance. Makes no provider call and costs nothing.
 * - **Authenticated** with `Authorization: Bearer <HEALTH_CHECK_TOKEN>` —
 *   additionally performs one minimal real completion and reports latency and
 *   the model actually used.
 *
 * Status codes are the contract; an uptime monitor watches those, not the body:
 *
 * - `200` the checked depth is healthy
 * - `503` the API key is missing, or the provider rejected the call (a retired
 *   model lands here)
 * - `401` a bearer token was supplied but is wrong, malformed, or the deep
 *   check is not configured
 *
 * The body never carries the API key, a provider stack trace, or the
 * provider's own error text — only a short reason code. The detail goes to
 * Sentry from `generateCompletion`.
 */
export async function GET(request: NextRequest) {
  const checkedAt = new Date().toISOString()
  const config = readConfig()
  const auth = authorize(request)

  if (auth.kind === 'refused') {
    return NextResponse.json(
      { status: 'unauthorized', checkedAt, depth: 'none', reason: auth.reason },
      { status: 401, headers: NO_STORE }
    )
  }

  if (auth.kind === 'anonymous') {
    // Without a key every AI tool is already broken, so this is unhealthy even
    // though nothing was asked of the provider.
    const healthy = config.apiKeyPresent
    return NextResponse.json(
      {
        status: healthy ? 'ok' : 'unhealthy',
        checkedAt,
        depth: 'config',
        config,
        ...(healthy ? {} : { reason: 'missing_api_key' }),
      },
      { status: healthy ? 200 : 503, headers: NO_STORE }
    )
  }

  const model = MODEL_CONFIGURATION.balanced.id

  if (!config.apiKeyPresent) {
    // Short-circuit rather than let the client constructor throw: the answer is
    // already known and calling out would only produce a worse error.
    return NextResponse.json(
      {
        status: 'unhealthy',
        checkedAt,
        depth: 'provider',
        config,
        provider: { status: 'failed', model, latencyMs: 0, reason: 'missing_api_key' },
      },
      { status: 503, headers: NO_STORE }
    )
  }

  const startedAt = Date.now()

  try {
    // Deliberately the same code path production uses, including the
    // reasoning-effort retry. A probe that called the SDK directly would prove
    // the provider works while saying nothing about whether the app can reach
    // it, which is the only question worth asking here.
    const result = await generateCompletion(PROBE_PROMPT, {
      model,
      maxTokens: PROBE_MAX_TOKENS,
      temperature: 0,
      operation: 'health-check',
    })

    return NextResponse.json(
      {
        status: 'ok',
        checkedAt,
        depth: 'provider',
        config,
        provider: {
          status: 'ok',
          model,
          latencyMs: Date.now() - startedAt,
          // An accepted call that returns empty content is a working provider
          // whose budget the reasoning pass consumed - degraded, not down, so
          // it is reported without failing the check. A daily false alarm is
          // how a health check gets ignored.
          responded: result.text.trim().length > 0,
        },
      },
      { status: 200, headers: NO_STORE }
    )
  } catch (error) {
    const reason: AiFailureReason =
      error instanceof AiCompletionError ? error.reason : 'provider_error'

    return NextResponse.json(
      {
        status: 'unhealthy',
        checkedAt,
        depth: 'provider',
        config,
        provider: { status: 'failed', model, latencyMs: Date.now() - startedAt, reason },
      },
      { status: 503, headers: NO_STORE }
    )
  }
}
