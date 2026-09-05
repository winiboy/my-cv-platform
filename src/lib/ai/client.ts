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

/**
 * Reads a model id from the environment, treating unset and blank as absent so
 * that an empty variable in a `.env` file cannot send an empty model id to the
 * API.
 */
function resolveModel(configured: string | undefined, fallback: string): string {
  const trimmed = configured?.trim()
  return trimmed ? trimmed : fallback
}

/** Default model, overridable with `GROQ_MODEL`. */
export const DEFAULT_MODEL = resolveModel(process.env.GROQ_MODEL, FALLBACK_BALANCED_MODEL)

// Model options for different use cases
export const MODELS = {
  // Fast and efficient for most tasks, overridable with `GROQ_MODEL_FAST`
  FAST: resolveModel(process.env.GROQ_MODEL_FAST, FALLBACK_FAST_MODEL),

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
 * Generate a completion using Groq
 */
export async function generateCompletion(
  prompt: string,
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
    reasoningEffort?: ReasoningEffort
  } = {}
) {
  const {
    model = DEFAULT_MODEL,
    temperature = 0.7,
    maxTokens = 1000,
    reasoningEffort = DEFAULT_REASONING_EFFORT,
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
    console.error('Groq API error:', error)
    throw new Error('Failed to generate AI completion')
  }
}
