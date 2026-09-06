import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createCompletion = vi.fn()
const captureException = vi.fn()

/** Stubbed so the capture payload can be inspected without a Sentry DSN. */
vi.mock('@sentry/nextjs', () => ({ captureException }))

/**
 * Stubs the SDK so the reasoning-effort contract can be asserted deterministically,
 * without a network call or an API key.
 */
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

/** Builds the 400 Groq returns for models without a reasoning mode. */
async function unsupportedReasoningError() {
  const { default: Groq } = (await import('groq-sdk')) as unknown as {
    default: { APIError: new (s: number, e: unknown, m: string) => Error }
  }
  return new Groq.APIError(
    400,
    { error: { message: '`reasoning_effort` is not supported with this model' } },
    '400 `reasoning_effort` is not supported with this model'
  )
}

const OK_RESPONSE = { choices: [{ message: { content: 'ok' } }], usage: { total_tokens: 1 } }

/**
 * Guards against reintroducing a Groq model id that the provider has retired.
 *
 * Groq removed the Llama 3.x hosted models. Because every AI tool routes
 * through a model id, a single retired literal anywhere in `src/` takes the
 * whole feature set down with `model_not_found` at runtime — a failure no type
 * check or build can see. This test is the cheap layer that does see it.
 */

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** Model ids Groq has retired. Present here only as data for the scan. */
const RETIRED_MODEL_IDS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']

/**
 * Catches retired ids beyond the two named above: any string literal opening
 * with a bare `llama-<digit>` id. Deliberately does not match the still-current
 * `meta-llama/llama-prompt-guard-*` models, whose literals begin `meta-llama/`.
 */
const BARE_LLAMA_MODEL_LITERAL = /['"`]llama-\d/

/**
 * This file necessarily contains the forbidden ids as scan data, so it excludes
 * itself. Nothing else in `src/` is exempt.
 */
const SELF = 'lib/ai/client.test.ts'

const SCANNED_EXTENSIONS = ['.ts', '.tsx']

function collectSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectSourceFiles(full, found)
    } else if (SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      found.push(full)
    }
  }
  return found
}

function scanSources(): { path: string; content: string }[] {
  return collectSourceFiles(SRC_ROOT)
    .map((path) => ({
      path: relative(SRC_ROOT, path).split(sep).join('/'),
      content: readFileSync(path, 'utf8'),
    }))
    .filter((file) => file.path !== SELF)
}

describe('retired Groq model guard', () => {
  const files = scanSources()

  it('scans the real source tree', () => {
    // Positive control: without this, a walk that silently returned nothing
    // would let every assertion below pass vacuously.
    expect(files.length).toBeGreaterThan(50)
    expect(files.some((f) => f.path === 'lib/ai/client.ts')).toBe(true)
    expect(files.some((f) => f.content.includes('getGroqClient'))).toBe(true)
  })

  it.each(RETIRED_MODEL_IDS)('has no reference to the retired model %s', (modelId) => {
    const offenders = files.filter((f) => f.content.includes(modelId)).map((f) => f.path)
    expect(
      offenders,
      `Groq has retired "${modelId}". Set GROQ_MODEL / GROQ_MODEL_FAST or update the ` +
        `fallbacks in src/lib/ai/client.ts instead of hardcoding a model id.`
    ).toEqual([])
  })

  it('has no bare llama-<version> model literal', () => {
    const offenders = files
      .filter((f) => BARE_LLAMA_MODEL_LITERAL.test(f.content))
      .map((f) => f.path)
    expect(
      offenders,
      'Groq retired the bare Llama model ids. Model ids belong in MODELS in ' +
        'src/lib/ai/client.ts, sourced from GROQ_MODEL / GROQ_MODEL_FAST.'
    ).toEqual([])
  })

  it('routes the shared model constant instead of duplicating literals', () => {
    // The outage spanned three files because two routes had copied the id
    // rather than importing it. Keep those call sites on the shared constant.
    const callSites = [
      'app/api/ai/translate-text/route.ts',
      'app/api/jobs/fetch-external/route.ts',
    ]
    for (const path of callSites) {
      const file = files.find((f) => f.path === path)
      expect(file, `${path} should exist`).toBeDefined()
      expect(file!.content, `${path} should import the shared model constant`).toMatch(
        /from ["']@\/lib\/ai\/client["']/
      )
      expect(file!.content).toContain('MODELS.BALANCED')
    }
  })
})

describe('model configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('falls back to the supported defaults when no override is set', async () => {
    vi.stubEnv('GROQ_MODEL', '')
    vi.stubEnv('GROQ_MODEL_FAST', '')
    vi.resetModules()

    const { DEFAULT_MODEL, MODELS } = await import('./client')

    expect(DEFAULT_MODEL).toBe('openai/gpt-oss-120b')
    expect(MODELS.BALANCED).toBe('openai/gpt-oss-120b')
    expect(MODELS.QUALITY).toBe('openai/gpt-oss-120b')
    expect(MODELS.FAST).toBe('openai/gpt-oss-20b')
  })

  it('takes model ids from the environment so a retirement is a config change', async () => {
    vi.stubEnv('GROQ_MODEL', 'qwen/qwen3.8-27b')
    vi.stubEnv('GROQ_MODEL_FAST', 'groq/compound-mini')
    vi.resetModules()

    const { DEFAULT_MODEL, MODELS } = await import('./client')

    expect(DEFAULT_MODEL).toBe('qwen/qwen3.8-27b')
    expect(MODELS.BALANCED).toBe('qwen/qwen3.8-27b')
    expect(MODELS.QUALITY).toBe('qwen/qwen3.8-27b')
    expect(MODELS.FAST).toBe('groq/compound-mini')
  })

  it('ignores a blank override rather than sending an empty model id', async () => {
    vi.stubEnv('GROQ_MODEL', '   ')
    vi.resetModules()

    const { DEFAULT_MODEL } = await import('./client')

    expect(DEFAULT_MODEL).toBe('openai/gpt-oss-120b')
  })
})

/**
 * The scheduled provider probe reads the fallback model id out of this file's
 * source rather than copying it, because a copy is exactly what made the last
 * retirement a three-file change. That parse is only safe if something fails
 * when it stops resolving — otherwise a rename would silently turn the probe
 * into a check of the wrong model.
 */
describe('CI probe reads the fallback model id from source', () => {
  it('resolves the same id the module exports', async () => {
    const { readFallbackBalancedModel, resolveProbeModel } = await import(
      '../../../scripts/ai-health-probe.mjs'
    )
    const source = readFileSync(fileURLToPath(new URL('./client.ts', import.meta.url)), 'utf8')

    vi.stubEnv('GROQ_MODEL', '')
    vi.resetModules()
    const { DEFAULT_MODEL } = await import('./client')

    expect(readFallbackBalancedModel(source)).toBe(DEFAULT_MODEL)
    expect(resolveProbeModel({}, source)).toEqual({ id: DEFAULT_MODEL, source: 'default' })
    // A pinned id must win, as it does in the application.
    expect(resolveProbeModel({ GROQ_MODEL: 'groq/pinned' }, source)).toEqual({
      id: 'groq/pinned',
      source: 'env',
    })
    // A blank override counts as absent, matching resolveModel.
    expect(resolveProbeModel({ GROQ_MODEL: '  ' }, source).source).toBe('default')

    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('fails loudly rather than guessing when the constant is gone', async () => {
    const { readFallbackBalancedModel } = await import('../../../scripts/ai-health-probe.mjs')

    expect(() => readFallbackBalancedModel('const SOMETHING_ELSE = 1')).toThrow(
      /FALLBACK_BALANCED_MODEL/
    )
  })
})

describe('reasoning effort', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', 'test-key-not-a-real-secret')
    createCompletion.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("defaults to 'low' so reasoning cannot eat the caller's output budget", async () => {
    // The models bill reasoning against max_tokens. At the default effort a
    // 2500-token grammar check spent 1470 on reasoning and truncated its JSON.
    createCompletion.mockResolvedValue(OK_RESPONSE)
    const { generateCompletion } = await import('./client')

    await generateCompletion('prompt', { maxTokens: 2500 })

    expect(createCompletion).toHaveBeenCalledTimes(1)
    expect(createCompletion.mock.calls[0][0]).toMatchObject({
      reasoning_effort: 'low',
      max_tokens: 2500,
    })
  })

  it('lets a caller raise the effort per call', async () => {
    createCompletion.mockResolvedValue(OK_RESPONSE)
    const { generateCompletion } = await import('./client')

    await generateCompletion('prompt', { reasoningEffort: 'high' })

    expect(createCompletion.mock.calls[0][0]).toMatchObject({ reasoning_effort: 'high' })
  })

  it('retries without the parameter on a model that does not support it', async () => {
    // GROQ_MODEL exists so the model can be swapped mid-outage. Some models
    // reject reasoning_effort outright, and that must not become a new outage.
    createCompletion
      .mockRejectedValueOnce(await unsupportedReasoningError())
      .mockResolvedValueOnce(OK_RESPONSE)
    const { generateCompletion } = await import('./client')

    const result = await generateCompletion('prompt')

    expect(result.text).toBe('ok')
    expect(createCompletion).toHaveBeenCalledTimes(2)
    expect(createCompletion.mock.calls[0][0]).toHaveProperty('reasoning_effort')
    expect(createCompletion.mock.calls[1][0]).not.toHaveProperty('reasoning_effort')
  })

  it('reports the failure to Sentry with the model and operation, but never the prompt', async () => {
    // A Groq model retirement broke every AI tool at once and nothing noticed,
    // because the routes only wrote to console.error. This is the one capture
    // point that covers all ten consumers.
    const { default: Groq } = (await import('groq-sdk')) as unknown as {
      default: { APIError: new (s: number, e: unknown, m: string) => Error }
    }
    const providerError = new Groq.APIError(
      404,
      { error: { code: 'model_not_found', message: 'The model `x` does not exist' } },
      '404 model_not_found'
    )
    createCompletion.mockRejectedValue(providerError)
    captureException.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { generateCompletion } = await import('./client')

    const PROMPT = 'SECRET RESUME CONTENT: Jane Doe, jane@example.com'
    await expect(
      generateCompletion(PROMPT, { model: 'retired/model', operation: 'grammar-check' })
    ).rejects.toThrow()

    expect(captureException).toHaveBeenCalledTimes(1)
    const [captured, context] = captureException.mock.calls[0]
    expect(captured).toBe(providerError)
    expect(context.tags).toMatchObject({
      area: 'ai',
      ai_operation: 'grammar-check',
      ai_failure_reason: 'model_not_found',
      ai_model: 'retired/model',
    })
    expect(context.extra).toMatchObject({ model: 'retired/model', providerStatus: 404 })

    // The prompt carries user resume content, which .claude/rules/security.md
    // forbids logging. Assert against the whole payload, not just the fields
    // this test happens to know about.
    expect(JSON.stringify(context)).not.toContain('SECRET RESUME CONTENT')
    expect(JSON.stringify(context)).not.toContain('jane@example.com')
  })

  it('classifies a retired model so the health check can say why it is down', async () => {
    const { default: Groq } = (await import('groq-sdk')) as unknown as {
      default: { APIError: new (s: number, e: unknown, m: string) => Error }
    }
    createCompletion.mockRejectedValue(
      new Groq.APIError(404, { error: { code: 'model_not_found' } }, '404 model_not_found')
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { generateCompletion, AiCompletionError } = await import('./client')

    const error = await generateCompletion('prompt', { model: 'retired/model' }).catch(
      (e: unknown) => e
    )

    expect(error).toBeInstanceOf(AiCompletionError)
    expect(error).toMatchObject({ reason: 'model_not_found', providerStatus: 404 })
    // The message ten routes already surface to users must not have changed.
    expect((error as Error).message).toBe('Failed to generate AI completion')
  })

  it('does not retry or mask an unrelated failure', async () => {
    const { default: Groq } = (await import('groq-sdk')) as unknown as {
      default: { APIError: new (s: number, e: unknown, m: string) => Error }
    }
    createCompletion.mockRejectedValue(
      new Groq.APIError(
        404,
        { error: { message: 'The model `x` does not exist or you do not have access to it.' } },
        '404 model_not_found'
      )
    )
    const { generateCompletion } = await import('./client')

    await expect(generateCompletion('prompt')).rejects.toThrow(
      'Failed to generate AI completion'
    )
    expect(createCompletion).toHaveBeenCalledTimes(1)
  })
})
