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
  /**
   * The stubbed cover letter runs over one page (cover-letter-one-page,
   * US-002), so the route asks the stub to shorten it. Without one of the
   * `shorten*` directives below, the shortened letter fits on one page.
   */
  longLetter: '[ai-test-stub:long-letter]',
  /** The shortened letter still runs over one page. */
  shortenTooLong: '[ai-test-stub:shorten-too-long]',
  /** The shortening call fails as the provider would. */
  shortenFails: '[ai-test-stub:shorten-fails]',
  /** The shortening call answers with a letter missing its parts. */
  shortenUnusable: '[ai-test-stub:shorten-unusable]',
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
  /** One body paragraph of the long letter (`AI_TEST_STUB_DIRECTIVES.longLetter`). */
  readonly longBody: string
  /** The opening of the shortened letter, so a test can tell it from the first. */
  readonly shortenedOpening: string
}

/** Body paragraphs of the stub's long letter: well over one page in every language. */
export const AI_TEST_STUB_LONG_LETTER_BODY_PARAGRAPHS = 12

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
    longBody:
      'Texte IA de test : un long paragraphe du corps de la lettre, écrit pour que la lettre dépasse une page imprimée ' +
      'et que la route demande une version plus courte de la même lettre, dans la même langue et la même structure.',
    shortenedOpening: 'Texte IA de test : ouverture de la lettre raccourcie.',
  },
  en: {
    greeting: 'Dear Sir or Madam,',
    opening: (jobTitle) => `Test AI text: opening of the letter for the ${jobTitle} role.`,
    body: 'Test AI text: body of the letter.',
    resumeUsed: 'Test AI text: the CV was taken into account.',
    closing: 'Test AI text: closing of the letter.',
    signOff: 'Yours faithfully,',
    longBody:
      'Test AI text: a long body paragraph of the letter, written so that the letter runs over one printed page ' +
      'and the route asks for a shorter version of the same letter, in the same language and the same structure.',
    shortenedOpening: 'Test AI text: opening of the shortened letter.',
  },
  de: {
    greeting: 'Sehr geehrte Damen und Herren,',
    opening: (jobTitle) => `KI-Testtext: Einleitung des Anschreibens für die Stelle ${jobTitle}.`,
    body: 'KI-Testtext: Hauptteil des Anschreibens.',
    resumeUsed: 'KI-Testtext: Der Lebenslauf wurde berücksichtigt.',
    closing: 'KI-Testtext: Schluss des Anschreibens.',
    signOff: 'Mit freundlichen Grüßen',
    longBody:
      'KI-Testtext: ein langer Absatz im Hauptteil des Anschreibens, geschrieben, damit das Anschreiben über eine ' +
      'gedruckte Seite hinausgeht und die Route eine kürzere Fassung desselben Anschreibens in derselben Sprache anfordert.',
    shortenedOpening: 'KI-Testtext: Einleitung des gekürzten Anschreibens.',
  },
  it: {
    greeting: 'Gentile Responsabile,',
    opening: (jobTitle) => `Testo IA di prova: apertura della lettera per il ruolo ${jobTitle}.`,
    body: 'Testo IA di prova: corpo della lettera.',
    resumeUsed: 'Testo IA di prova: il CV è stato preso in considerazione.',
    closing: 'Testo IA di prova: chiusura della lettera.',
    signOff: 'Cordiali saluti,',
    longBody:
      'Testo IA di prova: un lungo paragrafo del corpo della lettera, scritto perché la lettera superi una pagina ' +
      'stampata e la route chieda una versione più breve della stessa lettera, nella stessa lingua e struttura.',
    shortenedOpening: 'Testo IA di prova: apertura della lettera abbreviata.',
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

/**
 * The query parameter that gives the stubbed offer page a schema.org
 * `JobPosting` naming the hiring organization's address
 * (cover-letter-recipient-address-from-offer, US-001), when its value is
 * `AI_TEST_STUB_OFFER_PAGE_WITH_ADDRESS` and `AI_TEST_STUB_OFFER_PAGE_PARAM`
 * names a success status, e.g.
 * `https://www.jobs.ch/x?ai-test-stub-page=200&ai-test-stub-page-address=job-posting`.
 * The stub reads that page with the real parser; without the parameter its
 * page has no address.
 */
export const AI_TEST_STUB_OFFER_PAGE_ADDRESS_PARAM = 'ai-test-stub-page-address'

/** The value of `AI_TEST_STUB_OFFER_PAGE_ADDRESS_PARAM` that puts the address on the page. */
export const AI_TEST_STUB_OFFER_PAGE_WITH_ADDRESS = 'job-posting'

/**
 * The address on the stubbed page. Swiss, with the country given as `CH`, so
 * the stored address is the street, then the postcode and locality, and no
 * country line.
 */
export const AI_TEST_STUB_OFFER_PAGE_ADDRESS = {
  streetAddress: 'Avenue de la Gare 10',
  postalCode: '1003',
  addressLocality: 'Lausanne',
  addressCountry: 'CH',
} as const

/**
 * The address the stubbed cover-letter generator "reads" from the offer's text
 * when the prompt asks for one (cover-letter-recipient-address-from-offer,
 * US-002). It answers it whatever the text says, as an AI that invents one
 * would: the route stores it only when the offer's text contains it. Distinct
 * from `AI_TEST_STUB_OFFER_PAGE_ADDRESS`, so a test can tell the two sources
 * apart.
 */
export const AI_TEST_STUB_OFFER_TEXT_ADDRESS = {
  streetAddress: 'Rue du Lac 5',
  postalCode: '1201',
  addressLocality: 'Genève',
  addressCountry: 'CH',
} as const

/**
 * What the stubbed cover-letter translation writes before every segment it
 * "translates", e.g. `[DE] ` for German: deterministic, and visibly not the
 * original. A segment carrying one of `AI_TEST_STUB_DIRECTIVES` fails the
 * whole translation as the provider would.
 */
export function aiTestStubTranslationPrefix(targetLanguage: 'fr' | 'en' | 'de' | 'it'): string {
  return `[${targetLanguage.toUpperCase()}] `
}
