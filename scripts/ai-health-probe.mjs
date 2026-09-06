/**
 * Provider health probe for the scheduled `AI provider health` workflow.
 *
 * Groq retires hosted models on its own schedule. When it last did, every AI
 * tool in the product returned 500 for an unknown period and nothing detected
 * it — not the unit suite, not the integration suite, not E2E, not CI. None of
 * those layers can: they all mock or avoid the provider, deliberately. The
 * owner found it by clicking a button.
 *
 * This is the layer that looks at the real provider. It runs on a schedule
 * rather than per PR, because it checks the world rather than the code.
 *
 * Two modes:
 *
 * 1. `AI_HEALTH_URL` set — calls the deployed `/api/health/ai` deep check.
 *    Preferred: it exercises the real application with the real production
 *    configuration, which is where a retirement actually bites.
 * 2. Otherwise — calls Groq directly with the model id the application would
 *    use. Catches provider-side breakage even before anything is deployed.
 *
 * Exits 0 when healthy and 1 when not. It never prints the API key, and only
 * the provider's own status and error code reach the log.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const GROQ_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions'

/** Matches the endpoint's own budget; see the note on PROBE_MAX_TOKENS there. */
const PROBE_MAX_TOKENS = 32
const PROBE_PROMPT = 'Reply with the single word: ok'

/** A hung provider must not hang the workflow until GitHub's job timeout. */
const REQUEST_TIMEOUT_MS = 30_000

const CLIENT_SOURCE_PATH = fileURLToPath(new URL('../src/lib/ai/client.ts', import.meta.url))

/**
 * Reads the compiled fallback model id out of `src/lib/ai/client.ts`.
 *
 * Copying the id into this script instead would recreate exactly the
 * duplication that made the last retirement a three-file change, and this
 * script would then go on reporting healthy about a model the app no longer
 * uses. `src/lib/ai/client.test.ts` asserts this parse still resolves, so a
 * rename breaks a test rather than silently disabling the probe.
 *
 * @param {string} clientSource contents of src/lib/ai/client.ts
 * @returns {string} the fallback balanced model id
 */
export function readFallbackBalancedModel(clientSource) {
  const match = /const FALLBACK_BALANCED_MODEL = '([^']+)'/.exec(clientSource)
  if (!match) {
    throw new Error(
      'Could not read FALLBACK_BALANCED_MODEL from src/lib/ai/client.ts. The probe ' +
        'must not guess a model id — update scripts/ai-health-probe.mjs to match.'
    )
  }
  return match[1]
}

/**
 * Resolves the model the application would use, mirroring `resolveModel` in
 * `src/lib/ai/client.ts`: a blank override counts as absent.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string} clientSource
 * @returns {{ id: string, source: 'env' | 'default' }}
 */
export function resolveProbeModel(env, clientSource) {
  const configured = env.GROQ_MODEL?.trim()
  return configured
    ? { id: configured, source: 'env' }
    : { id: readFallbackBalancedModel(clientSource), source: 'default' }
}

/** @param {string} message */
function fail(message) {
  console.error(`::error::${message}`)
  return 1
}

/**
 * Calls the deployed deep check and trusts its status code, which is the
 * contract that endpoint documents.
 *
 * @param {string} url
 * @param {string | undefined} token
 * @returns {Promise<number>} process exit code
 */
async function probeDeployedEndpoint(url, token) {
  if (!token) {
    return fail(
      'AI_HEALTH_URL is set but HEALTH_CHECK_TOKEN is not. The deep check fails ' +
        'closed, so without the token this probe can only ever report 401.'
    )
  }

  console.log(`Probing deployed health check at ${new URL(url).origin}/api/health/ai`)

  let response
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    return fail(`Health endpoint unreachable: ${error instanceof Error ? error.name : 'error'}`)
  }

  // The endpoint's body carries no secrets by design, so it is safe to log in
  // full and it is the most useful thing in the run log.
  const body = await response.text()
  console.log(`HTTP ${response.status}`)
  console.log(body)

  if (response.status === 200) {
    console.log('AI provider is healthy.')
    return 0
  }

  return fail(`AI health check returned HTTP ${response.status}. The AI tools are degraded.`)
}

/**
 * Calls Groq directly with the model the application would use.
 *
 * @param {string} apiKey
 * @param {{ id: string, source: 'env' | 'default' }} model
 * @returns {Promise<number>} process exit code
 */
async function probeProviderDirectly(apiKey, model) {
  console.log(`Probing Groq directly with model "${model.id}" (from ${model.source}).`)

  let response
  try {
    response = await fetch(GROQ_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: 'user', content: PROBE_PROMPT }],
        max_tokens: PROBE_MAX_TOKENS,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    return fail(`Groq unreachable: ${error instanceof Error ? error.name : 'error'}`)
  }

  if (response.ok) {
    console.log(`Groq accepted model "${model.id}". AI provider is healthy.`)
    return 0
  }

  // Report the provider's own code, not the whole body: it is the actionable
  // part and it cannot contain the key.
  let code = 'unknown'
  try {
    const payload = await response.json()
    code = payload?.error?.code ?? payload?.error?.type ?? 'unknown'
  } catch {
    // A non-JSON error body tells us nothing extra; the status carries it.
  }

  if (response.status === 404 || code === 'model_not_found') {
    return fail(
      `Groq no longer serves model "${model.id}" (HTTP ${response.status}, ${code}). ` +
        'This is a model retirement: every AI tool in the app is returning 500. ' +
        'Pick a current id from https://console.groq.com/docs/models and set GROQ_MODEL.'
    )
  }

  return fail(`Groq rejected the probe: HTTP ${response.status} (${code}).`)
}

async function main() {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  const healthUrl = process.env.AI_HEALTH_URL?.trim()
  const token = process.env.HEALTH_CHECK_TOKEN?.trim()

  if (healthUrl) {
    return probeDeployedEndpoint(healthUrl, token)
  }

  if (!apiKey) {
    // The workflow gates on this too. Guarding here as well keeps the script
    // honest when run by hand: it must never exit 0 without checking anything.
    return fail('GROQ_API_KEY is not set. Nothing was checked.')
  }

  const model = resolveProbeModel(process.env, readFileSync(CLIENT_SOURCE_PATH, 'utf8'))
  return probeProviderDirectly(apiKey, model)
}

// Only run when executed directly, so the resolution helpers above stay
// importable by the unit suite.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
