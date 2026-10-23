/**
 * The values shared by the server-side AI test stub (`./test-stub.ts`), the
 * Playwright web server config that enables it and the specs that drive it.
 * Kept free of imports so the Playwright process can read them without loading
 * the AI client.
 */

/** The one value of `AI_TEST_STUB` that enables the stub. */
export const AI_TEST_STUB_ENABLED_VALUE = 'local-e2e-only'

/**
 * Directives an e2e test writes into a job description to choose the stub's
 * answer. Without one, the stub succeeds.
 */
export const AI_TEST_STUB_DIRECTIVES = {
  providerError: '[ai-test-stub:provider-error]',
  rateLimited: '[ai-test-stub:rate-limited]',
} as const
