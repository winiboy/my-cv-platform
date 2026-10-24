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

/** The stub's cover letter in one language. */
export interface AiTestStubCoverLetterTexts {
  readonly greeting: string
  /** Names the job title it was given, as a provider would. */
  readonly opening: (jobTitle: string) => string
  readonly body: string
  /** An extra body paragraph, written only when the request carries a CV profile. */
  readonly resumeUsed: string
  readonly closing: string
  readonly signOff: string
}

/**
 * The stub's cover letter, one per content language. Test content, never shown
 * to a real user. Each paragraph says it comes from the stub, so a test can
 * tell it from the form's defaults ('Dear Hiring Manager,').
 */
export const AI_TEST_STUB_COVER_LETTER_TEXTS: Readonly<Record<'fr' | 'en' | 'de' | 'it', AiTestStubCoverLetterTexts>> = {
  fr: {
    greeting: 'Madame, Monsieur,',
    opening: (jobTitle) => `Texte IA de test : ouverture de la lettre pour le poste ${jobTitle}.`,
    body: 'Texte IA de test : corps de la lettre.',
    resumeUsed: 'Texte IA de test : le CV a été pris en compte.',
    closing: 'Texte IA de test : conclusion de la lettre.',
    signOff: 'Veuillez agréer mes salutations distinguées,',
  },
  en: {
    greeting: 'Dear Sir or Madam,',
    opening: (jobTitle) => `Test AI text: opening of the letter for the ${jobTitle} role.`,
    body: 'Test AI text: body of the letter.',
    resumeUsed: 'Test AI text: the CV was taken into account.',
    closing: 'Test AI text: closing of the letter.',
    signOff: 'Yours faithfully,',
  },
  de: {
    greeting: 'Sehr geehrte Damen und Herren,',
    opening: (jobTitle) => `KI-Testtext: Einleitung des Anschreibens für die Stelle ${jobTitle}.`,
    body: 'KI-Testtext: Hauptteil des Anschreibens.',
    resumeUsed: 'KI-Testtext: Der Lebenslauf wurde berücksichtigt.',
    closing: 'KI-Testtext: Schluss des Anschreibens.',
    signOff: 'Mit freundlichen Grüßen',
  },
  it: {
    greeting: 'Gentile Responsabile,',
    opening: (jobTitle) => `Testo IA di prova: apertura della lettera per il ruolo ${jobTitle}.`,
    body: 'Testo IA di prova: corpo della lettera.',
    resumeUsed: 'Testo IA di prova: il CV è stato preso in considerazione.',
    closing: 'Testo IA di prova: chiusura della lettera.',
    signOff: 'Cordiali saluti,',
  },
}

/**
 * The query parameter an e2e test puts on a seeded `job_url` to choose what the
 * stubbed offer-page check answers, e.g. `https://www.jobs.ch/x?ai-test-stub-page=404`.
 * Its value is the HTTP status the page "answers", or
 * `AI_TEST_STUB_OFFER_PAGE_TIMEOUT`. Without it, the stub answers that the page
 * could not be checked, and never touches the network.
 */
export const AI_TEST_STUB_OFFER_PAGE_PARAM = 'ai-test-stub-page'

/** The value of `AI_TEST_STUB_OFFER_PAGE_PARAM` that makes the stubbed check time out. */
export const AI_TEST_STUB_OFFER_PAGE_TIMEOUT = 'timeout'
