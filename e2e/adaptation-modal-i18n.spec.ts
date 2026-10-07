import { test, expect } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Locator, Page } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'

/**
 * The CV adaptation modal speaks the user's language wherever it opens
 * (localize-adaptation-modal-and-templates, US-001).
 *
 * The modal is opened from the resume editor and from Job Search ("Adapter mon
 * CV" and "Créer un CV"), in fr and de, and its input stage, validation
 * messages, preview stage and no-changes message are read for the strings
 * that used to be English there, and for their translations. An en run checks
 * the English wording did not move.
 *
 * Nothing leaves the machine: `/api/jobs`, `/api/jobs/fetch-external` and
 * `/api/ai/adapt-resume-to-job` are answered by `page.route`. The resumes are
 * real rows created for the signed-in user through the service-role client, so
 * the editor really loads. Each page is loaded with `page.goto` and its HTTP
 * status asserted, so a failing server render cannot hide behind the client.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E adaptation modal i18n spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type TestLocale = 'fr' | 'de' | 'en'

interface ModalStrings {
  editorButton: string
  adaptCV: string
  createCV: string
  title: string
  createTitle: string
  helpText: string
  createHelpText: string
  jobDescriptionLabel: string
  jobDescriptionPlaceholder: string
  /** The hint and the counter for an empty description. */
  hintWithEmptyCounter: string
  jobTitleLabel: string
  jobTitlePlaceholder: string
  companyLabelWithOptional: string
  companyPlaceholder: string
  analyze: string
  createSubmit: string
  disclaimer: string
  orDivider: string
  browseHint: string
  browse: string
  close: string
  jobTitleRequired: string
  tooShort: string
  matchScore: string
  summaryTitle: string
  experienceTitle: string
  addSkills: string
  enhanceSkills: string
  current: string
  proposed: string
  noContent: string
  reasoning: string
  confidenceHigh: string
  confidenceMedium: string
  confidenceLow: string
  applyChange: string
  selectAll: string
  deselectAll: string
  cancel: string
  applySelected: string
  noChangesTitle: string
  noChangesMessage: string
  successMessage: string
}

const STRINGS: Record<TestLocale, ModalStrings> = {
  fr: {
    editorButton: "Adapter à l'offre",
    adaptCV: 'Adapter mon CV',
    createCV: 'Créer un CV',
    title: "Adapter le CV à l'offre",
    createTitle: "Créer un CV à partir de l'offre",
    helpText: 'Collez la description complète du poste, et notre IA suggérera des mises à jour ciblées pour votre CV.',
    createHelpText: 'La description du poste a été pré-remplie.',
    jobDescriptionLabel: 'Description du poste *',
    jobDescriptionPlaceholder: 'Collez la description complète du poste ici...',
    hintWithEmptyCounter:
      'Incluez les exigences, responsabilités et qualifications pour de meilleurs résultats. (0/100 caractères minimum)',
    jobTitleLabel: 'Titre du poste *',
    jobTitlePlaceholder: 'ex. : Ingénieur logiciel senior',
    companyLabelWithOptional: 'Entreprise (optionnel)',
    companyPlaceholder: 'ex. : Google',
    analyze: "Analyser et générer l'adaptation",
    createSubmit: 'Analyser et générer un nouveau CV',
    disclaimer: 'Toutes les suggestions sont originales et rédigées dans un langage professionnel.',
    orDivider: 'OU',
    browseHint: "Vous n'avez pas encore de description de poste ?",
    browse: "Parcourir les offres d'emploi",
    close: 'Fermer',
    jobTitleRequired: 'Le titre du poste est obligatoire.',
    tooShort: 'La description du poste doit contenir au moins 100 caractères.',
    matchScore: 'Score de correspondance:',
    summaryTitle: 'Résumé professionnel',
    experienceTitle: "Description de l'expérience",
    addSkills: 'Ajouter des compétences: Design',
    enhanceSkills: 'Enrichir: Recherche',
    current: 'Actuel',
    proposed: 'Proposé',
    noContent: 'Aucun contenu',
    reasoning: 'Justification:',
    confidenceHigh: 'Confiance élevée',
    confidenceMedium: 'Confiance moyenne',
    confidenceLow: 'Confiance faible',
    applyChange: 'Appliquer ce changement',
    selectAll: 'Tout sélectionner',
    deselectAll: 'Tout désélectionner',
    cancel: 'Annuler',
    applySelected: 'Appliquer les changements sélectionnés',
    noChangesTitle: 'Bonne nouvelle !',
    noChangesMessage: 'Votre CV correspond déjà bien à cette description de poste.',
    successMessage: 'CV adapté avec succès. Vérifiez et enregistrez lorsque vous êtes prêt.',
  },
  de: {
    editorButton: 'An Stelle anpassen',
    adaptCV: 'Meinen Lebenslauf anpassen',
    createCV: 'Lebenslauf erstellen',
    title: 'Lebenslauf an Stelle anpassen',
    createTitle: 'Lebenslauf aus Stelle erstellen',
    helpText: 'Fügen Sie die vollständige Stellenbeschreibung ein, und unsere KI wird gezielte Aktualisierungen',
    createHelpText: 'Die Stellenbeschreibung wurde vorausgefüllt.',
    jobDescriptionLabel: 'Stellenbeschreibung *',
    jobDescriptionPlaceholder: 'Fügen Sie die vollständige Stellenbeschreibung hier ein...',
    hintWithEmptyCounter:
      'Fügen Sie Anforderungen, Verantwortlichkeiten und Qualifikationen für beste Ergebnisse hinzu. (0/100 Zeichen Minimum)',
    jobTitleLabel: 'Stellentitel *',
    jobTitlePlaceholder: 'z. B. Senior-Softwareentwickler',
    companyLabelWithOptional: 'Unternehmen (optional)',
    companyPlaceholder: 'z. B. Google',
    analyze: 'Analysieren und Anpassung generieren',
    createSubmit: 'Analysieren und neuen Lebenslauf generieren',
    disclaimer: 'Alle Vorschläge sind original und in professioneller Sprache verfasst.',
    orDivider: 'ODER',
    browseHint: 'Haben Sie noch keine Stellenbeschreibung?',
    browse: 'Stellenangebote durchsuchen',
    close: 'Schließen',
    jobTitleRequired: 'Der Stellentitel ist erforderlich.',
    tooShort: 'Die Stellenbeschreibung muss mindestens 100 Zeichen enthalten.',
    matchScore: 'Übereinstimmungswert:',
    summaryTitle: 'Berufliche Zusammenfassung',
    experienceTitle: 'Beschreibung der Erfahrung',
    addSkills: 'Kompetenzen hinzufügen: Design',
    enhanceSkills: 'Ergänzen: Recherche',
    current: 'Aktuell',
    proposed: 'Vorgeschlagen',
    noContent: 'Kein Inhalt',
    reasoning: 'Begründung:',
    confidenceHigh: 'Hohes Vertrauen',
    confidenceMedium: 'Mittleres Vertrauen',
    confidenceLow: 'Niedriges Vertrauen',
    applyChange: 'Diese Änderung anwenden',
    selectAll: 'Alle auswählen',
    deselectAll: 'Alle abwählen',
    cancel: 'Abbrechen',
    applySelected: 'Ausgewählte Änderungen anwenden',
    noChangesTitle: 'Gute Nachrichten!',
    noChangesMessage: 'Ihr Lebenslauf passt bereits gut zu dieser Stellenbeschreibung.',
    successMessage: 'Lebenslauf erfolgreich angepasst. Überprüfen und speichern Sie, wenn Sie bereit sind.',
  },
  en: {
    editorButton: 'Adapt to Job',
    adaptCV: 'Adapt My CV',
    createCV: 'Create CV',
    title: 'Adapt CV to Job',
    createTitle: 'Create CV from Job',
    helpText: 'Paste the complete job description, and our AI will suggest targeted updates to your CV.',
    createHelpText: 'The job description has been pre-filled.',
    jobDescriptionLabel: 'Job Description *',
    jobDescriptionPlaceholder: 'Paste the full job description here...',
    hintWithEmptyCounter:
      'Include requirements, responsibilities, and qualifications for best results. (0/100 characters minimum)',
    jobTitleLabel: 'Job Title *',
    jobTitlePlaceholder: 'e.g., Senior Software Engineer',
    companyLabelWithOptional: 'Company (optional)',
    companyPlaceholder: 'e.g., Google',
    analyze: 'Analyze & Generate Adaptation',
    createSubmit: 'Analyze and generate new CV',
    disclaimer: 'All suggestions are original and written in professional CV language.',
    orDivider: 'OR',
    browseHint: "Don't have a job description yet?",
    browse: 'Browse Job Listings',
    close: 'Close',
    jobTitleRequired: 'Job title is required.',
    tooShort: 'Job description must be at least 100 characters.',
    matchScore: 'Match Score:',
    summaryTitle: 'Professional Summary',
    experienceTitle: 'Experience Description',
    addSkills: 'Add Skills: Design',
    enhanceSkills: 'Enhance: Recherche',
    current: 'Current',
    proposed: 'Proposed',
    noContent: 'No content',
    reasoning: 'Reasoning:',
    confidenceHigh: 'High Confidence',
    confidenceMedium: 'Medium Confidence',
    confidenceLow: 'Low Confidence',
    applyChange: 'Apply this change',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    cancel: 'Cancel',
    applySelected: 'Apply Selected Changes',
    noChangesTitle: 'Great News!',
    noChangesMessage: "Your CV already aligns well with this job description. We don't recommend any changes at this time.",
    successMessage: 'CV adapted successfully. Review and save when ready.',
  },
}

/**
 * The English the modal drew in fr/de before this story, hard-coded or as a
 * fallback. Matched against the modal's text and its placeholder and
 * accessible-name attributes; none may appear outside en.
 */
const ENGLISH_INPUT_STAGE: RegExp[] = [
  /Adapt CV to Job/,
  /Create CV from Job/,
  /Paste the complete job description/,
  /The job description has been pre-filled/,
  /Job Description/,
  /Paste the full job description here/,
  /Include requirements, responsibilities/,
  /characters minimum/,
  /Job Title/,
  /Senior Software Engineer/,
  /\bCompany\b/,
  /\(optional\)/,
  /e\.g\.,/,
  /Analyze & Generate Adaptation/,
  /Analyze and generate new CV/,
  /All suggestions are original/,
  /\bOR\b/,
  /Don't have a job description yet/,
  /Browse Job Listings/,
  /\bClose\b/,
  /Job title is required/,
  /Job description must be at least/,
]

const ENGLISH_PREVIEW_STAGE: RegExp[] = [
  /Match Score/,
  /Key Gaps/,
  /Strengths/,
  /Professional Summary/,
  /Experience Description/,
  /Add Skills/,
  /Enhance:/,
  /\bCurrent\b/,
  /\bProposed\b/,
  /No content/,
  /Reasoning/,
  /High Confidence/,
  /Medium Confidence/,
  /Low Confidence/,
  /Apply this change/,
  /Select All/,
  /Deselect All/,
  /\bCancel\b/,
  /Apply Selected Changes/,
  /Great News/,
  /already aligns well/,
  /\bClose\b/,
]

/** A description long enough to pass validation, worded so no forbidden English can come from it. */
const DESCRIPTION =
  'Northwind Systems recrute pour Lausanne. Northwind Systems sucht in Lausanne. ' +
  'Northwind Systems: design, recherche, prototypes, Figma, tests, ateliers, Teams, Produkt, Planung.'
const JOB_TITLE = 'Designer'

/** The one job the stubbed `/api/jobs` lists. */
const JOB = {
  id: 'e2e-adaptation-modal-i18n',
  title: 'Product Designer',
  company: 'Northwind Systems',
  location_city: 'Lausanne',
  location_country: 'CH',
  employment_type: 'full-time',
  description: DESCRIPTION,
  posted_date: '2026-01-15',
  application_url: 'https://jobs.example.test/offers/product-designer',
  is_saved: false,
}

/** What the stubbed external fetch returns; the modal is prefilled from it. */
const FETCHED = { jobTitle: JOB_TITLE, company: JOB.company, jobDescription: DESCRIPTION }

/** A patch with one change of each kind and each confidence level. Its data words avoid every forbidden pattern. */
function patchWithChanges(locale: TestLocale) {
  return {
    jobTitle: JOB_TITLE,
    company: JOB.company,
    jobDescription: DESCRIPTION,
    createdAt: '2026-10-07T00:00:00.000Z',
    locale,
    patches: {
      summary: { original: '', proposed: 'Designer UX, Lausanne.', confidence: 'high', reasoning: 'R-1' },
      experienceDescription: {
        original: 'Ateliers.',
        proposed: 'Ateliers, Figma.',
        confidence: 'medium',
        reasoning: 'R-2',
        experienceIndex: 0,
      },
      skillsToAdd: [{ category: 'Design', items: ['Figma'], confidence: 'low', reasoning: 'R-3' }],
      skillsToEnhance: [{ category: 'Recherche', itemsToAdd: ['Tests'], confidence: 'high', reasoning: 'R-4' }],
    },
    analysis: { matchScore: 72, keyGaps: ['Figma'], strengths: ['Ateliers'] },
  }
}

function patchWithoutChanges(locale: TestLocale) {
  return { ...patchWithChanges(locale), patches: {}, analysis: { matchScore: 95, keyGaps: [], strengths: [] } }
}

const FORBIDDEN_CONSOLE = [/document is not defined/i, /hydrat/i, /Minified React error/i, /react/i]

function watchConsole(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (FORBIDDEN_CONSOLE.some((pattern) => pattern.test(text))) problems.push(`console: ${text}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror ${error.name}: ${error.message}`))
  return problems
}

async function createResume(userId: string, title: string): Promise<string> {
  const { data, error } = await admin()
    .from('resumes')
    .insert({ user_id: userId, title, template: 'professional' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not create a resume for the test user: ${error?.message ?? 'no row'}`)
  return data.id as string
}

interface AdaptationStub {
  /** The patch the next `/api/ai/adapt-resume-to-job` call answers with. */
  respondWith: (patch: unknown) => void
  calls: () => number
}

/** Registered before navigation, so the page's first calls are answered. */
async function stubNetwork(page: Page): Promise<AdaptationStub> {
  await page.route(
    (url) => url.pathname === '/api/jobs',
    (route) => route.fulfill({ json: { jobs: [JOB], total: 1, source: 'mock' } })
  )
  await page.route(
    (url) => url.pathname === '/api/jobs/fetch-external',
    (route) => route.fulfill({ json: { success: true, ...FETCHED } })
  )

  let next: unknown = null
  let count = 0
  await page.route(
    (url) => url.pathname === '/api/ai/adapt-resume-to-job',
    async (route) => {
      count += 1
      if (next === null) throw new Error('The adaptation stub was called before a patch was set')
      await route.fulfill({ json: { success: true, patch: next } })
    }
  )
  // The create flow is opened but never submitted here; a call would mean the
  // spec reached a real AI route.
  await page.route(
    (url) => url.pathname === '/api/ai/generate-from-job-description',
    () => {
      throw new Error('The create-from-job generation must not be called by this spec')
    }
  )

  return {
    respondWith: (patch) => {
      next = patch
    },
    calls: () => count,
  }
}

/** The modal panel, found from its heading. */
function modal(page: Page, title: string): Locator {
  return page
    .getByRole('heading', { level: 2, name: title, exact: true })
    .locator('xpath=ancestor::div[contains(@class, "shadow-xl")][1]')
}

/**
 * The modal's visible text, minus what the user typed or the page prefilled,
 * plus the placeholder and accessible-name attributes a user also meets.
 */
async function modalWords(panel: Locator): Promise<string> {
  return panel.evaluate((element) => {
    const clone = element.cloneNode(true) as HTMLElement
    const attributes = Array.from(element.querySelectorAll('[placeholder], [aria-label]')).flatMap((node) => [
      node.getAttribute('placeholder') ?? '',
      node.getAttribute('aria-label') ?? '',
    ])
    clone.querySelectorAll('textarea, input').forEach((node) => node.remove())
    return [clone.textContent ?? '', ...attributes].join('\n')
  })
}

/** German writes "(optional)" exactly as English does, so it is no evidence of a fallback there. */
const SAME_AS_ENGLISH: Partial<Record<TestLocale, string[]>> = { de: [String(/\(optional\)/)] }

async function expectNoEnglish(panel: Locator, patterns: RegExp[], locale: TestLocale): Promise<void> {
  const words = await modalWords(panel)
  const allowed = SAME_AS_ENGLISH[locale] ?? []
  const found = patterns
    .filter((pattern) => !allowed.includes(String(pattern)) && pattern.test(words))
    .map(String)
  expect(found, `English found in the modal:\n${words}`).toEqual([])
}

/** Every visible string of the adapt (purple) input stage. */
async function expectAdaptInputStage(panel: Locator, s: ModalStrings): Promise<void> {
  await expect(panel.getByText(s.helpText)).toBeVisible()
  await expect(panel.getByText(s.jobDescriptionLabel, { exact: true })).toBeVisible()
  await expect(panel.locator('textarea')).toHaveAttribute('placeholder', s.jobDescriptionPlaceholder)
  await expect(panel.getByText(s.jobTitleLabel, { exact: true })).toBeVisible()
  await expect(panel.locator('input[type="text"]').nth(0)).toHaveAttribute('placeholder', s.jobTitlePlaceholder)
  await expect(panel.getByText(s.companyLabelWithOptional, { exact: true })).toBeVisible()
  await expect(panel.locator('input[type="text"]').nth(1)).toHaveAttribute('placeholder', s.companyPlaceholder)
  await expect(panel.getByRole('button', { name: s.analyze, exact: true })).toBeVisible()
  await expect(panel.getByText(s.disclaimer)).toBeVisible()
  await expect(panel.getByText(s.orDivider, { exact: true })).toBeVisible()
  await expect(panel.getByText(s.browseHint)).toBeVisible()
  await expect(panel.getByRole('button', { name: s.browse, exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: s.close, exact: true })).toBeVisible()
}

async function openEditor(page: Page, locale: TestLocale, resumeId: string): Promise<void> {
  const response = await page.goto(`/${locale}/dashboard/resumes/${resumeId}/edit`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('button', { name: STRINGS[locale].editorButton, exact: true })).toBeVisible()
}

async function openJobSearch(page: Page, locale: TestLocale): Promise<void> {
  const response = await page.goto(`/${locale}/dashboard/jobs`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 2, name: JOB.title, exact: true })).toBeVisible()
}

/** Fill the adapt form and reach the preview stage with `patch`. */
async function submitForPreview(panel: Locator, stub: AdaptationStub, s: ModalStrings, patch: unknown): Promise<void> {
  stub.respondWith(patch)
  await panel.locator('textarea').fill(DESCRIPTION)
  await panel.locator('input[type="text"]').nth(0).fill(JOB_TITLE)
  await panel.getByRole('button', { name: s.analyze, exact: true }).click()
  await expect(panel.getByText(s.matchScore, { exact: true })).toBeVisible()
}

for (const locale of ['fr', 'de'] as const) {
  const s = STRINGS[locale]

  test(`${locale} resume editor: the modal, its validation, its preview and the success alert are localized`, async ({ page, authedUser }) => {
    const problems = watchConsole(page)
    const stub = await stubNetwork(page)
    const resumeId = await createResume(authedUser.id, `Adaptation modal i18n, editor ${locale}`)

    await openEditor(page, locale, resumeId)
    await page.getByRole('button', { name: s.editorButton, exact: true }).click()
    const panel = modal(page, s.title)

    // Input stage.
    await expectAdaptInputStage(panel, s)
    await expect(panel.getByText(s.hintWithEmptyCounter, { exact: true })).toBeVisible()
    await expectNoEnglish(panel, ENGLISH_INPUT_STAGE, locale)

    // Validation: too short first, then a long enough description without a title.
    await panel.getByRole('button', { name: s.analyze, exact: true }).click()
    await expect(panel.getByText(s.tooShort, { exact: true })).toBeVisible()
    await panel.locator('textarea').fill(DESCRIPTION)
    await expect(panel.getByText(`(${DESCRIPTION.length}/100`)).toBeVisible()
    await panel.getByRole('button', { name: s.analyze, exact: true }).click()
    await expect(panel.getByText(s.jobTitleRequired, { exact: true })).toBeVisible()
    await expectNoEnglish(panel, ENGLISH_INPUT_STAGE, locale)
    expect(stub.calls()).toBe(0)

    // Preview stage with one change of each kind.
    await submitForPreview(panel, stub, s, patchWithChanges(locale))
    await expect(panel.getByRole('heading', { level: 4, name: s.summaryTitle, exact: true })).toBeVisible()
    await expect(panel.getByRole('heading', { level: 4, name: s.experienceTitle, exact: true })).toBeVisible()
    await expect(panel.getByRole('heading', { level: 4, name: s.addSkills, exact: true })).toBeVisible()
    await expect(panel.getByRole('heading', { level: 4, name: s.enhanceSkills, exact: true })).toBeVisible()
    await expect(panel.getByText(s.confidenceHigh, { exact: true })).toHaveCount(2)
    await expect(panel.getByText(s.confidenceMedium, { exact: true })).toHaveCount(1)
    await expect(panel.getByText(s.confidenceLow, { exact: true })).toHaveCount(1)
    await expect(panel.getByText(s.current, { exact: true })).toHaveCount(2)
    await expect(panel.getByText(s.proposed, { exact: true })).toHaveCount(2)
    await expect(panel.getByText(s.noContent, { exact: true })).toHaveCount(1)
    await expect(panel.getByText(s.reasoning, { exact: true })).toHaveCount(4)
    await expect(panel.getByText(s.applyChange, { exact: true })).toHaveCount(4)
    await expect(panel.getByRole('button', { name: s.selectAll, exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: s.deselectAll, exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: s.cancel, exact: true })).toBeVisible()
    // High-confidence changes are preselected: the summary and the enhancement.
    await expect(panel.getByRole('button', { name: `${s.applySelected} (2)`, exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: s.close, exact: true })).toBeVisible()
    await expectNoEnglish(panel, ENGLISH_PREVIEW_STAGE, locale)

    // Applying shows the editor's localized success alert.
    const dialog = page.waitForEvent('dialog')
    await panel.getByRole('button', { name: `${s.applySelected} (2)`, exact: true }).click()
    const alert = await dialog
    expect(alert.message()).toBe(s.successMessage)
    await alert.dismiss()
    await expect(page.getByRole('heading', { level: 2, name: s.title, exact: true })).toHaveCount(0)

    // No-changes preview.
    await page.getByRole('button', { name: s.editorButton, exact: true }).click()
    await submitForPreview(panel, stub, s, patchWithoutChanges(locale))
    await expect(panel.getByRole('heading', { level: 3, name: s.noChangesTitle, exact: true })).toBeVisible()
    await expect(panel.getByText(s.noChangesMessage)).toBeVisible()
    await expect(panel.getByRole('button', { name: s.selectAll, exact: true })).toHaveCount(0)
    await expect(panel.getByRole('button', { name: `${s.applySelected} (0)`, exact: true })).toBeDisabled()
    await expectNoEnglish(panel, ENGLISH_PREVIEW_STAGE, locale)

    // The close button is reachable by its localized name and closes the modal.
    await panel.getByRole('button', { name: s.close, exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: s.title, exact: true })).toHaveCount(0)

    expect(stub.calls()).toBe(2)
    expect(problems).toEqual([])
  })

  test(`${locale} Job Search: "${s.adaptCV}" and "${s.createCV}" open a localized modal`, async ({ page, authedUser }) => {
    const problems = watchConsole(page)
    const stub = await stubNetwork(page)
    // One CV, so "adapt" goes straight to the modal without the selector.
    await createResume(authedUser.id, `Adaptation modal i18n, job search ${locale}`)

    await openJobSearch(page, locale)

    // Adapt an existing CV.
    await page.getByRole('button', { name: s.adaptCV, exact: true }).click()
    const adaptPanel = modal(page, s.title)
    await expectAdaptInputStage(adaptPanel, s)
    await expect(adaptPanel.locator('textarea')).toHaveValue(DESCRIPTION)
    await expectNoEnglish(adaptPanel, ENGLISH_INPUT_STAGE, locale)

    await adaptPanel.locator('input[type="text"]').nth(0).fill('')
    await adaptPanel.getByRole('button', { name: s.analyze, exact: true }).click()
    await expect(adaptPanel.getByText(s.jobTitleRequired, { exact: true })).toBeVisible()
    await expectNoEnglish(adaptPanel, ENGLISH_INPUT_STAGE, locale)

    await submitForPreview(adaptPanel, stub, s, patchWithChanges(locale))
    await expect(adaptPanel.getByRole('heading', { level: 4, name: s.summaryTitle, exact: true })).toBeVisible()
    await expectNoEnglish(adaptPanel, ENGLISH_PREVIEW_STAGE, locale)
    await adaptPanel.getByRole('button', { name: s.cancel, exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: s.title, exact: true })).toHaveCount(0)

    // Create a new CV from the job.
    await page.getByRole('button', { name: s.createCV, exact: true }).click()
    const createPanel = modal(page, s.createTitle)
    await expect(createPanel.getByText(s.createHelpText)).toBeVisible()
    await expect(createPanel.getByText(s.jobDescriptionLabel, { exact: true })).toBeVisible()
    await expect(createPanel.getByText(s.companyLabelWithOptional, { exact: true })).toBeVisible()
    await expect(createPanel.locator('input[type="text"]').nth(0)).toHaveAttribute('placeholder', s.jobTitlePlaceholder)
    await expect(createPanel.locator('input[type="text"]').nth(1)).toHaveAttribute('placeholder', s.companyPlaceholder)
    await expect(createPanel.getByText(`(${DESCRIPTION.length}/100`)).toBeVisible()
    await expect(createPanel.getByRole('button', { name: s.createSubmit, exact: true })).toBeVisible()
    await expect(createPanel.getByText(s.disclaimer)).toBeVisible()
    await expect(createPanel.getByRole('button', { name: s.close, exact: true })).toBeVisible()
    await expectNoEnglish(createPanel, ENGLISH_INPUT_STAGE, locale)

    await createPanel.locator('textarea').fill('')
    await createPanel.getByRole('button', { name: s.createSubmit, exact: true }).click()
    await expect(createPanel.getByText(s.tooShort, { exact: true })).toBeVisible()
    await expectNoEnglish(createPanel, ENGLISH_INPUT_STAGE, locale)

    await createPanel.getByRole('button', { name: s.close, exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: s.createTitle, exact: true })).toHaveCount(0)

    expect(stub.calls()).toBe(1)
    expect(problems).toEqual([])
  })
}

test('en: the modal reads exactly as before, from the editor and from Job Search', async ({ page, authedUser }) => {
  const problems = watchConsole(page)
  const stub = await stubNetwork(page)
  const s = STRINGS.en
  const resumeId = await createResume(authedUser.id, 'Adaptation modal i18n, en')

  await openEditor(page, 'en', resumeId)
  await page.getByRole('button', { name: s.editorButton, exact: true }).click()
  const panel = modal(page, s.title)
  await expectAdaptInputStage(panel, s)
  await expect(panel.getByText(s.hintWithEmptyCounter, { exact: true })).toBeVisible()

  await panel.getByRole('button', { name: s.analyze, exact: true }).click()
  await expect(panel.getByText(s.tooShort, { exact: true })).toBeVisible()
  await panel.locator('textarea').fill(DESCRIPTION)
  await panel.getByRole('button', { name: s.analyze, exact: true }).click()
  await expect(panel.getByText(s.jobTitleRequired, { exact: true })).toBeVisible()

  await submitForPreview(panel, stub, s, patchWithChanges('en'))
  for (const heading of [s.summaryTitle, s.experienceTitle, s.addSkills, s.enhanceSkills]) {
    await expect(panel.getByRole('heading', { level: 4, name: heading, exact: true })).toBeVisible()
  }
  await expect(panel.getByText(s.noContent, { exact: true })).toHaveCount(1)
  await expect(panel.getByText(s.confidenceHigh, { exact: true })).toHaveCount(2)
  await expect(panel.getByText(s.confidenceMedium, { exact: true })).toHaveCount(1)
  await expect(panel.getByText(s.confidenceLow, { exact: true })).toHaveCount(1)
  await expect(panel.getByRole('button', { name: `${s.applySelected} (2)`, exact: true })).toBeVisible()

  const dialog = page.waitForEvent('dialog')
  await panel.getByRole('button', { name: `${s.applySelected} (2)`, exact: true }).click()
  const alert = await dialog
  expect(alert.message()).toBe(s.successMessage)
  await alert.dismiss()

  await page.getByRole('button', { name: s.editorButton, exact: true }).click()
  await submitForPreview(panel, stub, s, patchWithoutChanges('en'))
  await expect(panel.getByRole('heading', { level: 3, name: s.noChangesTitle, exact: true })).toBeVisible()
  await expect(panel.getByText(s.noChangesMessage, { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: s.close, exact: true }).click()

  await openJobSearch(page, 'en')
  await page.getByRole('button', { name: s.createCV, exact: true }).click()
  const createPanel = modal(page, s.createTitle)
  await expect(createPanel.getByText(s.createHelpText)).toBeVisible()
  await expect(createPanel.getByRole('button', { name: s.createSubmit, exact: true })).toBeVisible()
  await expect(createPanel.locator('input[type="text"]').nth(1)).toHaveAttribute('placeholder', s.companyPlaceholder)

  expect(stub.calls()).toBe(2)
  expect(problems).toEqual([])
})
