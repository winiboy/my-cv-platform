import * as Sentry from '@sentry/nextjs'
import Groq from 'groq-sdk'

// Initialize Groq client

export function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing or empty");
  }

  return new Groq({ apiKey });
}


/**
 * Fallback model ids, used when the environment does not pin one.
 *
 * Groq retires hosted models on its own schedule, and a retirement takes every
 * AI tool in the product down at once with `model_not_found`. Reading the ids
 * from the environment makes the next retirement a configuration change rather
 * than a code change and a deploy. These constants only decide the default.
 */
const FALLBACK_BALANCED_MODEL = 'openai/gpt-oss-120b'
const FALLBACK_FAST_MODEL = 'openai/gpt-oss-20b'

/** Where a resolved model id came from. Reported by the health check. */
export type ModelSource = 'env' | 'default'

/** A resolved model id together with its provenance. Contains no secrets. */
export interface ResolvedModel {
  readonly id: string
  readonly source: ModelSource
}

/**
 * Reads a model id from the environment, treating unset and blank as absent so
 * that an empty variable in a `.env` file cannot send an empty model id to the
 * API.
 */
function resolveModel(configured: string | undefined, fallback: string): ResolvedModel {
  const trimmed = configured?.trim()
  return trimmed ? { id: trimmed, source: 'env' } : { id: fallback, source: 'default' }
}

const BALANCED_MODEL = resolveModel(process.env.GROQ_MODEL, FALLBACK_BALANCED_MODEL)
const FAST_MODEL = resolveModel(process.env.GROQ_MODEL_FAST, FALLBACK_FAST_MODEL)

/**
 * The resolved model ids and where each came from.
 *
 * Exposed so `/api/health/ai` can report the effective configuration without
 * re-deriving it — the model ids the health check reports are by construction
 * the ones every AI tool actually uses, not a second opinion about them.
 */
export const MODEL_CONFIGURATION = {
  balanced: BALANCED_MODEL,
  fast: FAST_MODEL,
} as const

/** Default model, overridable with `GROQ_MODEL`. */
export const DEFAULT_MODEL = BALANCED_MODEL.id

// Model options for different use cases
export const MODELS = {
  // Fast and efficient for most tasks, overridable with `GROQ_MODEL_FAST`
  FAST: FAST_MODEL.id,

  // Balanced performance and quality (recommended)
  BALANCED: DEFAULT_MODEL,

  // Best quality for complex tasks
  QUALITY: DEFAULT_MODEL,
} as const

/**
 * How much hidden reasoning the model may spend before writing its answer.
 * Mirrors the Groq API's own values.
 */
export type ReasoningEffort = 'none' | 'default' | 'low' | 'medium' | 'high'

/**
 * The reasoning models bill hidden reasoning against the SAME `max_tokens`
 * budget as the visible answer, so reasoning silently eats the room a caller
 * budgeted for output. When it runs out the JSON is cut mid-object and the
 * caller's `JSON.parse` throws — a truncated body, not an API error, which is
 * why this is worth pinning rather than leaving to the default.
 *
 * Consumption swings enormously by task, so no route's budget can predict it:
 * on a 2500-token grammar check the default effort spent 1470 tokens (64%)
 * before writing anything, leaving 839 for output; on a 15-category analysis
 * it spent 321. Measured against 'low':
 *
 *   grammar-check (2500 budget)  default: reasoning=1470 visible= 839  11 issues
 *                                low:     reasoning=  18 visible=1161  11 issues
 *   analysis      (4000 budget)  default: reasoning= 321 visible=1327  15 cats, score 86
 *                                low:     reasoning=  22 visible=1314  15 cats, score 84
 *
 * Equivalent output, ~38% more room for it, and ~20% faster. This is a
 * deliberate reliability and cost decision, not a tuning preference: the
 * headroom it frees is what keeps long responses from truncating. Callers that
 * genuinely need deeper reasoning can raise it per call.
 */
const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low'

/**
 * Groq rejects `reasoning_effort` with a 400 on models that have no reasoning
 * mode (verified against `groq/compound-mini` and `allam-2-7b`). It reports
 * this only as prose in the error body — there is no distinguishing error code
 * to match on — so the message text is the only available signal.
 */
function isReasoningEffortUnsupported(error: unknown): boolean {
  if (!(error instanceof Groq.APIError) || error.status !== 400) {
    return false
  }
  const body = error.error as { error?: { message?: unknown } } | undefined
  const detail = typeof body?.error?.message === 'string' ? body.error.message : error.message
  return detail.includes('reasoning_effort') && detail.includes('not supported')
}

/**
 * Coarse classification of a provider failure.
 *
 * Every value here is safe to return to a caller: it names the *class* of
 * failure without carrying the provider's message, the API key, or any prompt
 * content. The detail belongs in Sentry, not in an HTTP body.
 */
export type AiFailureReason =
  | 'model_not_found'
  | 'unauthorized'
  | 'rate_limited'
  | 'provider_error'
  | 'network_error'

/**
 * A failed completion, carrying enough non-sensitive structure for the health
 * check to say *why* the provider is unhealthy.
 *
 * The message is deliberately identical to the plain `Error` this replaces:
 * ten routes surface `error.message` to the client, so changing the text would
 * change ten user-visible strings for no reason.
 */
export class AiCompletionError extends Error {
  constructor(
    readonly reason: AiFailureReason,
    readonly model: string,
    readonly providerStatus?: number
  ) {
    super('Failed to generate AI completion')
    this.name = 'AiCompletionError'
  }
}

/**
 * Maps a provider rejection onto a safe reason code.
 *
 * A model retirement surfaces as `model_not_found` — either as the body's
 * error code or as a bare 404 — which is the case this whole health check
 * exists to catch.
 */
function classifyFailure(error: unknown): { reason: AiFailureReason; status?: number } {
  if (!(error instanceof Groq.APIError)) {
    // No HTTP response at all: DNS, TLS, timeout, connection reset.
    return { reason: 'network_error' }
  }

  const status = error.status
  const body = error.error as { error?: { code?: unknown } } | undefined
  if (body?.error?.code === 'model_not_found') {
    return { reason: 'model_not_found', status }
  }

  if (status === 404) return { reason: 'model_not_found', status }
  if (status === 401 || status === 403) return { reason: 'unauthorized', status }
  if (status === 429) return { reason: 'rate_limited', status }
  return { reason: 'provider_error', status }
}

/**
 * Generate a completion using Groq
 */
export async function generateCompletion(
  prompt: string,
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
    reasoningEffort?: ReasoningEffort
    /** Names the calling feature in Sentry so a probe is distinguishable from real traffic. */
    operation?: string
  } = {}
) {
  const {
    model = DEFAULT_MODEL,
    temperature = 0.7,
    maxTokens = 1000,
    reasoningEffort = DEFAULT_REASONING_EFFORT,
    operation = 'generateCompletion',
  } = options

  const groq = getGroqClient()

  const request = {
    messages: [
      {
        role: 'user' as const,
        content: prompt,
      },
    ],
    model,
    temperature,
    max_tokens: maxTokens,
  }

  try {
    let completion
    try {
      completion = await groq.chat.completions.create({
        ...request,
        reasoning_effort: reasoningEffort,
      })
    } catch (error) {
      if (!isReasoningEffortUnsupported(error)) {
        throw error
      }
      // GROQ_MODEL exists so the model can be swapped during a retirement, and
      // only some models accept this parameter. Retrying without it keeps a
      // valid model choice working instead of turning the escape hatch into a
      // second outage; the reasoning budget simply does not apply there.
      completion = await groq.chat.completions.create(request)
    }

    return {
      text: completion.choices[0]?.message?.content || '',
      usage: completion.usage,
    }
  } catch (error) {
    const { reason, status } = classifyFailure(error)

    // The single capture point for all ten consumers. A Groq model retirement
    // broke every AI tool at once and nothing reported it, because the routes
    // only wrote to console.error — invisible in production. Capturing here
    // rather than per route also keeps the next retirement from being a
    // seven-file change.
    //
    // The prompt is deliberately absent: it carries user resume content, which
    // .claude/rules/security.md forbids logging. Only the model id, the
    // operation and the request shape go out.
    Sentry.captureException(error, {
      tags: {
        area: 'ai',
        ai_operation: operation,
        ai_failure_reason: reason,
        ai_model: model,
      },
      extra: { model, operation, providerStatus: status, maxTokens, temperature, reasoningEffort },
    })

    console.error('Groq API error:', error)
    throw new AiCompletionError(reason, model, status)
  }
}
