import { AiCompletionError } from './client'
import { generateCoverLetter, type CoverLetterGenerator } from './cover-letter-generation'
import type { JobDescriptionToResumeInput } from './prompts'
import { generateResumeFromJobDescription } from './transformations'
import {
  checkOfferPage,
  offerPageCheckForStatus,
  type OfferPageChecker,
} from '@/lib/cover-letter-from-job/offer-availability'
import { JOB_BOARD_ALLOWED_HOSTS } from '@/lib/security/job-board-allowlist'
import { isHostAllowed } from '@/lib/security/safe-fetch'
import {
  AI_TEST_STUB_COVER_LETTER_TEXTS,
  AI_TEST_STUB_DIRECTIVES,
  AI_TEST_STUB_ENABLED_VALUE,
  AI_TEST_STUB_OFFER_PAGE_PARAM,
  AI_TEST_STUB_OFFER_PAGE_TIMEOUT,
} from './test-stub-contract'

export {
  AI_TEST_STUB_COVER_LETTER_TEXTS,
  AI_TEST_STUB_DIRECTIVES,
  AI_TEST_STUB_ENABLED_VALUE,
  AI_TEST_STUB_OFFER_PAGE_PARAM,
  AI_TEST_STUB_OFFER_PAGE_TIMEOUT,
}

/**
 * A server-side stand-in for the AI provider, for the end-to-end suite only
 * (PRD `tasks/prds/cv-from-job-complete.md`, FR-5).
 *
 * WHY
 * Creating a CV from a saved job application calls the AI on the server, where
 * a browser-side `page.route` cannot reach. Without this, the e2e suite could
 * only exercise the provider-failure path, or spend the owner's real provider
 * account on every run.
 *
 * WHEN IT IS ACTIVE - EVERY CONDITION, NOT ANY
 * 1. `AI_TEST_STUB` is exactly `AI_TEST_STUB_ENABLED_VALUE`. Only the Playwright
 *    web server config sets it.
 * 2. The process is not a Vercel deployment (`VERCEL` and `VERCEL_ENV` unset).
 *    Vercel sets both on every build and every function of every deployment,
 *    production and preview alike.
 * 3. The server's Supabase URL is a loopback address. A deployment that stores
 *    real users' data cannot have one.
 * 4. The request itself is local: its host and every forwarded client address
 *    are loopback.
 *
 * WHY NOT `NODE_ENV`
 * The PRD's FR-5 asks for the stub to be ignored when `NODE_ENV` is
 * `production`. The Playwright web server runs `next build && next start`, and
 * Next.js compiles `process.env.NODE_ENV` to the constant `'production'` into
 * every production build (`next/dist/build/define-env.js`), so that rule would
 * keep the stub off in the very server it exists for. Conditions 2 and 3
 * identify a production deployment directly instead. This substitution is
 * recorded as an open owner decision for US-002.
 */

/** The model id the stub reports, so a stub failure is recognisable in logs. */
export const AI_TEST_STUB_MODEL = 'ai-test-stub'

/**
 * The environment the guard reads (`AI_TEST_STUB`, `VERCEL`, `VERCEL_ENV`,
 * `NEXT_PUBLIC_SUPABASE_URL`): `process.env` in the route, a literal in tests.
 */
export type AiTestStubEnvironment = Readonly<Record<string, string | undefined>>

/** The parts of a request the guard reads. */
export interface AiTestStubRequest {
  readonly url: string
  readonly headers: { get(name: string): string | null }
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase())
}

/** A client address from `x-forwarded-for`, which may be IPv4-mapped IPv6. */
function isLoopbackAddress(address: string): boolean {
  const value = address.trim().toLowerCase()
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1'
}

function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname
  } catch {
    return null
  }
}

function isLocalRequest(request: AiTestStubRequest): boolean {
  const urlHost = hostnameOf(request.url)
  if (urlHost === null || !isLoopbackHostname(urlHost)) return false

  const hostHeader = request.headers.get('host')
  if (hostHeader !== null) {
    const host = hostnameOf(hostHeader)
    if (host === null || !isLoopbackHostname(host)) return false
  }

  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor !== null && !forwardedFor.split(',').every(isLoopbackAddress)) return false

  return true
}

/**
 * Whether the stub answers this request instead of the AI provider. Every
 * condition listed on the module must hold.
 */
export function isAiTestStubEnabled(env: AiTestStubEnvironment, request: AiTestStubRequest): boolean {
  if (env.AI_TEST_STUB !== AI_TEST_STUB_ENABLED_VALUE) return false
  if (env.VERCEL || env.VERCEL_ENV) return false

  const supabaseHost = hostnameOf(env.NEXT_PUBLIC_SUPABASE_URL)
  if (supabaseHost === null || !isLoopbackHostname(supabaseHost)) return false

  return isLocalRequest(request)
}

type GenerationResult = Awaited<ReturnType<typeof generateResumeFromJobDescription>>

interface StubTexts {
  readonly summary: (jobTitle: string) => string
  readonly position: string
  readonly company: string
  readonly location: string
  readonly description: string
  readonly achievements: readonly string[]
  readonly skillCategory: string
  readonly skills: readonly string[]
  readonly projectName: string
  readonly projectDescription: string
}

/**
 * Fixed stub answers, one per content language. Test content, never shown to a
 * real user: the stub cannot run outside a local e2e server. Each text says it
 * comes from the stub, so a test can tell it from the sample values.
 */
const STUB_TEXTS: Readonly<Record<'fr' | 'en' | 'de' | 'it', StubTexts>> = {
  fr: {
    summary: (jobTitle) => `<p>Texte IA de test pour le poste <strong>${jobTitle}</strong>.</p>`,
    position: 'Poste IA de test',
    company: 'Entreprise IA de test',
    location: 'Ville IA de test',
    description: '<p>Description IA de test du rôle.</p>',
    achievements: ['Réalisation IA de test 1', 'Réalisation IA de test 2'],
    skillCategory: 'Compétences IA de test',
    skills: ['Compétence IA de test A', 'Compétence IA de test B'],
    projectName: 'Projet IA de test',
    projectDescription: '<p>Description IA de test du projet.</p>',
  },
  en: {
    summary: (jobTitle) => `<p>Test AI text for the <strong>${jobTitle}</strong> role.</p>`,
    position: 'Test AI position',
    company: 'Test AI company',
    location: 'Test AI city',
    description: '<p>Test AI description of the role.</p>',
    achievements: ['Test AI achievement 1', 'Test AI achievement 2'],
    skillCategory: 'Test AI skills',
    skills: ['Test AI skill A', 'Test AI skill B'],
    projectName: 'Test AI project',
    projectDescription: '<p>Test AI description of the project.</p>',
  },
  de: {
    summary: (jobTitle) => `<p>KI-Testtext für die Stelle <strong>${jobTitle}</strong>.</p>`,
    position: 'KI-Testposition',
    company: 'KI-Testunternehmen',
    location: 'KI-Teststadt',
    description: '<p>KI-Testbeschreibung der Rolle.</p>',
    achievements: ['KI-Testerfolg 1', 'KI-Testerfolg 2'],
    skillCategory: 'KI-Testkompetenzen',
    skills: ['KI-Testkompetenz A', 'KI-Testkompetenz B'],
    projectName: 'KI-Testprojekt',
    projectDescription: '<p>KI-Testbeschreibung des Projekts.</p>',
  },
  it: {
    summary: (jobTitle) => `<p>Testo IA di prova per il ruolo <strong>${jobTitle}</strong>.</p>`,
    position: 'Posizione IA di prova',
    company: 'Azienda IA di prova',
    location: 'Città IA di prova',
    description: '<p>Descrizione IA di prova del ruolo.</p>',
    achievements: ['Risultato IA di prova 1', 'Risultato IA di prova 2'],
    skillCategory: 'Competenze IA di prova',
    skills: ['Competenza IA di prova A', 'Competenza IA di prova B'],
    projectName: 'Progetto IA di prova',
    projectDescription: '<p>Descrizione IA di prova del progetto.</p>',
  },
}

function isStubLanguage(value: unknown): value is keyof typeof STUB_TEXTS {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(STUB_TEXTS, value)
}

/**
 * The stub's answer, in the shape `generateResumeFromJobDescription` returns.
 * Deterministic: the same input always gives the same answer or error.
 *
 * The job title is placed in the summary unescaped, as a provider could return
 * it; the caller sanitizes AI output whichever answered.
 */
export const generateStubResumeFromJobDescription: typeof generateResumeFromJobDescription = async (
  input: JobDescriptionToResumeInput
): Promise<GenerationResult> => {
  throwRequestedProviderFailure(input.jobDescription)

  const texts = STUB_TEXTS[isStubLanguage(input.locale) ? input.locale : 'en']
  // Job Search does not know the job title; the real AI takes it from the
  // description, the stub names its own test position instead.
  const jobTitle = input.targetJobTitle || texts.position

  return {
    resumeData: {
      summary: texts.summary(jobTitle),
      experience: [
        {
          position: texts.position,
          company: texts.company,
          location: texts.location,
          startDate: '2021-03',
          endDate: '2024-06',
          current: false,
          description: texts.description,
          // Only a complete-resume request asks for achievements, exactly as
          // the real prompt does.
          ...(input.completeResume || input.targetJobTitle ? { achievements: [...texts.achievements] } : {}),
          visible: true,
        },
      ],
      skills: [{ category: texts.skillCategory, items: [...texts.skills] }],
      projects: [
        {
          name: texts.projectName,
          description: texts.projectDescription,
          technologies: [...texts.skills],
          visible: true,
        },
      ],
    },
    tokensUsed: 0,
  }
}

/**
 * The resume generator for this request: the stub when every guard condition
 * holds, otherwise the real AI. The one place the routes that generate a
 * resume on the server choose between them.
 */
export function resumeGeneratorFor(request: AiTestStubRequest): typeof generateResumeFromJobDescription {
  return isAiTestStubEnabled(process.env, request)
    ? generateStubResumeFromJobDescription
    : generateResumeFromJobDescription
}

/** Throws the provider failure a directive in the job description asks for. */
function throwRequestedProviderFailure(jobDescription: string): void {
  if (jobDescription.includes(AI_TEST_STUB_DIRECTIVES.providerError)) {
    throw new AiCompletionError('provider_error', AI_TEST_STUB_MODEL, 500)
  }
  if (jobDescription.includes(AI_TEST_STUB_DIRECTIVES.rateLimited)) {
    throw new AiCompletionError('rate_limited', AI_TEST_STUB_MODEL, 429)
  }
}

/**
 * The stub's cover letter, in the shape `generateCoverLetter` returns, in the
 * language the request asks for. Deterministic: the same input always gives the
 * same answer or error. A request carrying a CV profile gets one more body
 * paragraph, so a test can tell that the CV reached the generator.
 *
 * The job title is placed in the opening unescaped, as a provider could return
 * it; the caller sanitizes AI output whichever answered.
 */
export const generateStubCoverLetter: CoverLetterGenerator = async (input) => {
  throwRequestedProviderFailure(input.jobDescription)

  const texts = AI_TEST_STUB_COVER_LETTER_TEXTS[isStubLanguage(input.locale) ? input.locale : 'en']
  const hasProfile =
    Boolean(input.resumeSummary) || Boolean(input.resumeExperience?.length) || Boolean(input.resumeSkills?.length)

  return {
    greeting: texts.greeting,
    openingParagraph: texts.opening(input.jobTitle),
    bodyParagraphs: hasProfile ? [texts.body, texts.resumeUsed] : [texts.body],
    closingParagraph: texts.closing,
    signOff: texts.signOff,
  }
}

/**
 * The cover-letter generator for this request: the stub when every guard
 * condition holds, otherwise the real AI.
 */
export function coverLetterGeneratorFor(request: AiTestStubRequest): CoverLetterGenerator {
  return isAiTestStubEnabled(process.env, request) ? generateStubCoverLetter : generateCoverLetter
}

/**
 * The stub's offer-page check (cover-letter-from-job, US-002, FR-5): it never
 * touches the network, so no e2e test reaches a real job board.
 *
 * A URL that is not http(s) on an allowed job board is inconclusive, as the
 * real check would find. On an allowed board, `AI_TEST_STUB_OFFER_PAGE_PARAM`
 * names the status the page "answers", mapped exactly as the real check maps
 * it, or `AI_TEST_STUB_OFFER_PAGE_TIMEOUT`. Without the parameter the check is
 * inconclusive.
 */
export const stubCheckOfferPage: OfferPageChecker = async (jobUrl) => {
  const value = jobUrl?.trim()
  if (!value) return { kind: 'undetermined', cause: 'no-url' }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { kind: 'undetermined', cause: 'invalid-url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { kind: 'undetermined', cause: 'scheme-not-allowed' }
  }
  if (!isHostAllowed(url.hostname, JOB_BOARD_ALLOWED_HOSTS)) {
    return { kind: 'undetermined', cause: 'host-not-allowed' }
  }

  const directive = url.searchParams.get(AI_TEST_STUB_OFFER_PAGE_PARAM)
  if (directive === AI_TEST_STUB_OFFER_PAGE_TIMEOUT) return { kind: 'undetermined', cause: 'timeout' }
  if (directive !== null && /^[1-5]\d\d$/.test(directive)) return offerPageCheckForStatus(Number(directive))
  return { kind: 'undetermined', cause: 'stubbed' }
}

/**
 * The offer-page checker for this request: the stub when every guard condition
 * holds, otherwise the real check.
 */
export function offerPageCheckerFor(request: AiTestStubRequest): OfferPageChecker {
  return isAiTestStubEnabled(process.env, request) ? stubCheckOfferPage : checkOfferPage
}
