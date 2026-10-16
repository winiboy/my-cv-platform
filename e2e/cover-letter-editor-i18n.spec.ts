import { test, expect } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Locator, Page } from '@playwright/test'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'
import en from '../src/locales/en/common.json'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'

/**
 * The cover-letter editor's recipient, opening, body, closing and signature
 * sections speak the page's language (fill-translation-gaps, US-001).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * `getTranslations` does not merge en into the other locales, and every
 * section component falls back to a hard-coded English string when its key is
 * missing. A missing key therefore never fails a build or a unit test: the page
 * just quietly renders English. Only the rendered editor shows which text won.
 *
 * WHAT IS ASSERTED
 *
 * In fr and de, the section nav shows the locale's label for every section, the
 * rich text toolbars name the system font in the locale, and
 * each section's text, placeholders and tooltips contain none of
 * the English fallbacks the components hard-code, and do contain the locale's
 * own strings. The body section is read twice: empty, then with one paragraph,
 * because its empty state and its paragraph controls never render together.
 *
 * The letter stores the English sign-off "Sincerely," - what every letter got
 * at creation before this story. That is user content: the select must keep
 * showing it as the selected value next to the localized options, and the row
 * must be left untouched. An en run checks the English nav labels, system font
 * label and sign-off options did not move.
 *
 * The letter is a real row created for the signed-in user through the
 * service-role client, and the page load's HTTP status is asserted, so a
 * failing server render cannot hide behind the client.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter editor i18n spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** The English sign-off a letter stored before the options were localized. */
const STORED_SIGN_OFF = 'Sincerely,'

/**
 * The English fallbacks hard-coded in `cover-letter-sections/*.tsx`, copied
 * from the components rather than read from en/common.json: what has to be
 * absent is the text those components render when a key is missing.
 */
const ENGLISH_FALLBACKS = {
  recipient: [
    'Recipient Information',
    'Recipient Name',
    'e.g., John Smith',
    'Recipient Title',
    'e.g., Hiring Manager',
    'Company Name',
    'e.g., Acme Corp',
    'Company Address',
    '123 Main St\nCity, State 12345',
  ],
  opening: [
    'Opening',
    'Greeting',
    'Dear Hiring Manager,',
    'Opening Paragraph',
    'Introduce yourself and explain why you are writing. Mention the position and how you learned about it.',
    'Write your opening paragraph...',
  ],
  body: [
    'Body Paragraphs',
    'Explain why you are a good fit for the role. Highlight relevant experience and achievements.',
    'Add Paragraph',
    'No body paragraphs yet',
    'Add Your First Paragraph',
    'Paragraph',
    'Remove paragraph',
    'Write your paragraph...',
    'Move up',
  ],
  closing: [
    'Closing',
    'Closing Paragraph',
    'Express your enthusiasm and include a call to action. Thank the reader for their consideration.',
    'Write your closing paragraph...',
  ],
  signature: ['Signature', 'Sign-off', 'Your Name', 'Your full name'],
} as const

type SectionId = keyof typeof ENGLISH_FALLBACKS
type EditorDict = typeof en.coverLetters.editor
type Dict = typeof en

const LOCALES = { fr, de } as const satisfies Record<string, Dict>

/**
 * Every string the section renders where a user can read it: text nodes, plus
 * the placeholder, tooltip and accessible-name attributes. The rich text
 * editor's placeholder is a `data-placeholder` drawn by CSS.
 */
async function renderedStrings(pane: Locator): Promise<string[]> {
  return pane.evaluate((root) => {
    const strings: string[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim()
      if (text) strings.push(text)
    }
    for (const element of Array.from(root.querySelectorAll('*'))) {
      for (const attribute of ['placeholder', 'data-placeholder', 'title', 'aria-label']) {
        const value = element.getAttribute(attribute)
        if (value) strings.push(value)
      }
    }
    return strings
  })
}

/**
 * Asserts the section shows `expected` and none of its English fallbacks.
 * A fallback identical to the locale's own wording ("Signature" in fr) is
 * legitimately visible and is not counted.
 */
async function expectLocalized(
  pane: Locator,
  section: SectionId,
  editor: EditorDict,
  expected: readonly string[],
): Promise<void> {
  const own = new Set(Object.values(editor[section]).filter((v) => typeof v === 'string'))
  const fallbacks: readonly string[] = ENGLISH_FALLBACKS[section]
  const forbidden = fallbacks.filter((text) => !own.has(text))
  const strings = await renderedStrings(pane)

  expect(strings.filter((text) => forbidden.includes(text))).toEqual([])
  for (const text of expected) {
    expect(strings, `${section} renders "${text}"`).toContain(text)
  }
}

async function insertLetter(userId: string): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: userId,
      title: 'E2E editor i18n',
      // Empty content, so every placeholder and the body's empty state render.
      greeting: '',
      body_paragraphs: [],
      sign_off: STORED_SIGN_OFF,
    })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

async function openEditor(page: Page, locale: string, letterId: string): Promise<Locator> {
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
  // The editor pane is the scroll container between the section nav and the
  // preview; the preview renders the letter's stored text, which is data.
  return page.locator('div.overflow-y-auto.p-6')
}

async function showSection(page: Page, pane: Locator, dict: Dict, section: SectionId) {
  const editor = dict.coverLetters.editor
  await page
    .getByRole('button', { name: editor.sections[section], exact: true })
    .click()
  await expect(pane.getByRole('heading', { level: 3, name: editor[section].title })).toBeVisible()
}

/** The editor's section nav, in the order `cover-letter-editor.tsx` lists it. */
const NAV_SECTIONS = ['resume', 'job', 'recipient', 'opening', 'body', 'closing', 'signature'] as const

/** The English labels hard-coded in `SECTIONS` of `cover-letter-editor.tsx`. */
const ENGLISH_NAV_LABELS = [
  'Linked CV',
  'Linked Job',
  'Recipient',
  'Opening',
  'Body',
  'Closing',
  'Signature',
] as const

function sectionNav(page: Page, dict: Dict): Locator {
  return page.locator('nav').filter({
    has: page.getByRole('button', { name: dict.coverLetters.editor.sections.recipient, exact: true }),
  })
}

/**
 * Every rich text toolbar in the section offers the system font under `label`,
 * and none under the English name hard-coded in `AVAILABLE_FONTS`.
 */
async function expectSystemFontLabel(pane: Locator, dict: Dict, label: string): Promise<void> {
  const toolbar = dict.resumes.editor.richTextToolbar
  const fontSelects = pane.getByRole('combobox', { name: toolbar.font, exact: true })
  const count = await fontSelects.count()
  expect(count).toBeGreaterThan(0)

  for (let index = 0; index < count; index++) {
    const optionTexts = await fontSelects.nth(index).locator('option').allTextContents()
    expect(optionTexts).toContain(label)
    if (label !== 'System Default') {
      expect(optionTexts).not.toContain('System Default')
    }
  }
}

function signOffOptions(dict: Dict): string[] {
  return Object.values(dict.coverLetters.editor.signature.signOffOptions)
}

for (const [locale, dict] of Object.entries(LOCALES)) {
  test(`the cover letter editor shows no English in ${locale}`, async ({
    page,
    authedUser,
  }) => {
    const letterId = await insertLetter(authedUser.id)
    const pane = await openEditor(page, locale, letterId)
    const editor = dict.coverLetters.editor

    // Every nav label is the locale's own; an English label identical to the
    // locale's wording ("Signature" in fr) is legitimate and not counted.
    const navLabels = NAV_SECTIONS.map((id) => editor.sections[id])
    const nav = sectionNav(page, dict).getByRole('button')
    await expect(nav).toHaveText(navLabels)
    const navTexts = await nav.allTextContents()
    expect(
      navTexts.filter((text) =>
        (ENGLISH_NAV_LABELS as readonly string[]).includes(text) && !navLabels.includes(text),
      ),
    ).toEqual([])

    await showSection(page, pane, dict, 'recipient')
    const { recipient } = editor
    await expectLocalized(pane, 'recipient', editor, [
      recipient.title,
      recipient.nameLabel,
      recipient.namePlaceholder,
      recipient.titleLabel,
      recipient.titlePlaceholder,
      recipient.companyLabel,
      recipient.companyPlaceholder,
      recipient.addressLabel,
      recipient.addressPlaceholder,
    ])

    await showSection(page, pane, dict, 'opening')
    const { opening } = editor
    await expectLocalized(pane, 'opening', editor, [
      opening.title,
      opening.greetingLabel,
      opening.greetingPlaceholder,
      opening.paragraphLabel,
      opening.paragraphHint,
      opening.paragraphPlaceholder,
    ])
    const systemFont = dict.resumes.editor.richTextToolbar.systemDefault
    await expectSystemFontLabel(pane, dict, systemFont)

    await showSection(page, pane, dict, 'body')
    const { body } = editor
    await expectLocalized(pane, 'body', editor, [
      body.title,
      body.hint,
      body.addParagraph,
      body.emptyState,
      body.addFirst,
    ])
    await pane.getByRole('button', { name: body.addFirst, exact: true }).click()
    await expect(pane.locator('#body-paragraph-0')).toBeVisible()
    await expectLocalized(pane, 'body', editor, [
      body.title,
      body.hint,
      body.addParagraph,
      body.paragraphLabel,
      body.paragraphPlaceholder,
      body.removeParagraph,
      body.moveUp,
    ])
    await expectSystemFontLabel(pane, dict, systemFont)

    await showSection(page, pane, dict, 'closing')
    const { closing } = editor
    await expectLocalized(pane, 'closing', editor, [
      closing.title,
      closing.paragraphLabel,
      closing.paragraphHint,
      closing.paragraphPlaceholder,
    ])
    await expectSystemFontLabel(pane, dict, systemFont)

    await showSection(page, pane, dict, 'signature')
    const { signature } = editor
    await expectLocalized(pane, 'signature', editor, [
      signature.title,
      signature.signOffLabel,
      signature.nameLabel,
      signature.namePlaceholder,
    ])

    // The stored English sign-off stays selected, ahead of the localized list.
    const select = pane.locator('select')
    await expect(select).toHaveValue(STORED_SIGN_OFF)
    await expect(select.locator('option')).toHaveText([STORED_SIGN_OFF, ...signOffOptions(dict)])

    // Rendering the editor does not rewrite the stored sign-off.
    const { data, error } = await admin()
      .from('cover_letters')
      .select('sign_off')
      .eq('id', letterId)
      .single()
    expect(error, error?.message).toBeNull()
    expect(data?.sign_off).toBe(STORED_SIGN_OFF)
  })
}

test('the cover letter editor keeps the English nav labels, font label and sign-off options in en', async ({
  page,
  authedUser,
}) => {
  const letterId = await insertLetter(authedUser.id)
  const pane = await openEditor(page, 'en', letterId)

  await expect(sectionNav(page, en).getByRole('button')).toHaveText([...ENGLISH_NAV_LABELS])

  await showSection(page, pane, en, 'opening')
  await expectSystemFontLabel(pane, en, 'System Default')

  await showSection(page, pane, en, 'signature')

  const select = pane.locator('select')
  await expect(select).toHaveValue(STORED_SIGN_OFF)
  await expect(select.locator('option')).toHaveText([
    'Sincerely,',
    'Best regards,',
    'Kind regards,',
    'Yours faithfully,',
    'Respectfully,',
    'With appreciation,',
  ])
})
