import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { describe, expect, it } from 'vitest'
import type { CoverLetterPdfFields } from '@/lib/cover-letter-pdf-html'
import { COVER_LETTER_MEASUREMENT_TIMEOUT_MS } from '@/lib/ai/cover-letter-one-page'
import { COVER_LETTER_MAX_WORDS, COVER_LETTER_SHORTENED_MAX_WORDS } from '@/lib/ai/prompts'
import {
  measureCoverLetterPageCount,
  renderCoverLetterPdf,
  type RenderCoverLetterPdfInput,
} from './render-cover-letter'

/**
 * The AI routes' one-page check (cover-letter-one-page, US-002, FR-1 and FR-2)
 * against the PDF it stands for: for each letter, the pages
 * `measureCoverLetterPageCount` counts and the pages `renderCoverLetterPdf`
 * prints, in the same local Chromium.
 *
 * The letters are US-001's fixtures, which break across a page in every way
 * the preview's marker was checked on (a straddling line, orphans, widows, an
 * empty line, a large span, a wrapped paragraph, a list, a long recipient
 * address), and letters as the AI writes them.
 *
 * Needs a real browser, which the integration CI job does not install: the
 * suite is skipped where Playwright's Chromium is absent, and runs locally.
 */

const browserInstalled = existsSync(chromium.executablePath())

const lines = (prefix: string, count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(from + index).padStart(3, '0')} I build reliable software with care.`)
const brParagraph = (paragraphLines: string[]) => `<p>${paragraphLines.join('<br>')}</p>`

const SENTENCE =
  'Over the past six years I have designed, built and run data pipelines that serve product teams across three countries.'
/** A paragraph of `words` words, as an AI writes one: plain sentences. */
function prose(words: number): string {
  const all = Array.from({ length: Math.ceil(words / 20) }, () => SENTENCE).join(' ').split(' ')
  return `<p>${all.slice(0, words).join(' ')}</p>`
}

const HEADER: Omit<CoverLetterPdfFields, 'opening_paragraph' | 'body_paragraphs' | 'closing_paragraph'> = {
  sender_name: 'Zoë Lovelace',
  sender_street: 'Rue de Bourg 12',
  sender_postal_locality: '1003 Lausanne',
  sender_phone: '+41 21 555 01 42',
  sender_email: 'zoe@example.ch',
  recipient_name: 'Madame Claire Dupont',
  recipient_title: 'Responsable des ressources humaines',
  company_name: 'Acme SA',
  company_address: 'Avenue de la Gare 10\n1000 Lausanne',
  job_title: 'Software Engineer',
  greeting: 'Dear Hiring Manager,',
  sign_off: 'Sincerely,',
  annexes: null,
}

function input(fields: Partial<CoverLetterPdfFields>): RenderCoverLetterPdfInput {
  const coverLetter: CoverLetterPdfFields = {
    ...HEADER,
    opening_paragraph: null,
    body_paragraphs: [],
    closing_paragraph: null,
    ...fields,
  }
  return {
    coverLetter,
    senderDetails: {
      sender_street: coverLetter.sender_street,
      sender_postal_locality: coverLetter.sender_postal_locality,
      sender_phone: coverLetter.sender_phone,
      sender_email: coverLetter.sender_email,
    },
    currentDate: 'November 13, 2026',
    language: 'en',
    // The limit the AI routes give the measurement; the PDF render gets as long.
    timeoutMs: COVER_LETTER_MEASUREMENT_TIMEOUT_MS,
  }
}

function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

const NO_HEADER = { sender_street: null, sender_postal_locality: null, sender_phone: null, sender_email: null, recipient_name: null, recipient_title: null, company_address: null, annexes: '' }

const FIXTURES: Array<[string, Partial<CoverLetterPdfFields>]> = [
  ['one page', { ...NO_HEADER, body_paragraphs: [brParagraph(lines('A', 10))] }],
  ['two pages', { ...NO_HEADER, body_paragraphs: [brParagraph(lines('A', 45))] }],
  ['three pages, a line straddling page 2\'s end', { ...NO_HEADER, body_paragraphs: [brParagraph(lines('A', 100))] }],
  ['orphans', { ...NO_HEADER, body_paragraphs: [brParagraph(lines('A', 30)), brParagraph(lines('B', 3))] }],
  ['widows', { ...NO_HEADER, body_paragraphs: [brParagraph(lines('A', 28)), brParagraph(lines('B', 4))] }],
  ['an empty line at page 1\'s end', { ...NO_HEADER, body_paragraphs: [brParagraph([...lines('A', 32), '', ...lines('A', 13, 33)])] }],
  [
    'a 24 px span opening page 2',
    {
      ...NO_HEADER,
      body_paragraphs: [
        brParagraph([...lines('A', 32), '<span style="font-size: 24px">A033 A larger line.</span>', ...lines('A', 12, 34)]),
      ],
    },
  ],
  [
    'a wrapped paragraph',
    {
      ...NO_HEADER,
      body_paragraphs: [
        brParagraph(lines('A', 20)),
        `<p>${Array.from({ length: 400 }, (_, index) => `W${String(index + 1).padStart(3, '0')}`).join(' ')}</p>`,
      ],
    },
  ],
  ['a list', { ...NO_HEADER, body_paragraphs: [brParagraph(lines('A', 20)), `<ul>${lines('B', 30).map((line) => `<li>${line}</li>`).join('')}</ul>`] }],
  ['a long recipient address', { ...NO_HEADER, company_address: lines('H', 60).map((line) => line.slice(0, 8)).join('\n'), body_paragraphs: [brParagraph(lines('A', 10))] }],
  ['an AI letter of 230 words, full header', { opening_paragraph: prose(45), body_paragraphs: [prose(70), prose(70)], closing_paragraph: prose(45) }],
  ['an AI letter of 400 words, full header', { opening_paragraph: prose(60), body_paragraphs: [prose(100), prose(100), prose(80)], closing_paragraph: prose(60) }],
  ['an AI letter of 600 words, full header', { opening_paragraph: prose(80), body_paragraphs: [prose(150), prose(150), prose(140)], closing_paragraph: prose(80) }],
]

describe.skipIf(!browserInstalled)('measureCoverLetterPageCount', () => {
  for (const [name, fields] of FIXTURES) {
    it(`counts the pages the PDF prints: ${name}`, async () => {
      const letter = input(fields)
      const started = Date.now()
      const measured = await measureCoverLetterPageCount(letter)
      const elapsed = Date.now() - started
      const printed = pdfPageCount(await renderCoverLetterPdf(letter))
      console.info(`[measure] ${name}: measured ${measured}, printed ${printed}, ${elapsed} ms`)
      expect(measured).toBe(printed)
    }, 60_000)
  }

  it('is deterministic for a given letter', async () => {
    const letter = input(FIXTURES[2][1])
    expect(await measureCoverLetterPageCount(letter)).toBe(await measureCoverLetterPageCount(letter))
  }, 60_000)
})

/**
 * The prompts' word budget (`COVER_LETTER_MAX_WORDS` with two body paragraphs,
 * `COVER_LETTER_SHORTENED_MAX_WORDS` with three) holds in German, the language
 * with the longest words, under a full Swiss header and the default Annexes:
 * the letter is measured, and prints, on one page.
 */
const GERMAN_SENTENCE =
  'In den vergangenen sechs Jahren habe ich Datenpipelines für Produktteams in drei Ländern konzipiert, entwickelt und betrieben, und diese Erfahrung würde ich gerne in Ihre Entwicklungsabteilung einbringen.'

function germanProse(words: number): string {
  const all = Array.from({ length: Math.ceil(words / 10) + 1 }, () => GERMAN_SENTENCE).join(' ').split(' ')
  return `<p>${all.slice(0, words).join(' ')}</p>`
}

/** A German letter of `total` words: 20% opening, 20% closing, the rest shared by `bodies` body paragraphs. */
function germanLetter(total: number, bodies: number): RenderCoverLetterPdfInput {
  const opening = Math.round(total * 0.2)
  const closing = Math.round(total * 0.2)
  const body = Math.round((total - opening - closing) / bodies)
  const coverLetter: CoverLetterPdfFields = {
    sender_name: 'Zoë Lovelace-Montandon',
    sender_street: 'Rue de Bourg 12',
    sender_postal_locality: '1003 Lausanne',
    sender_phone: '+41 21 555 01 42',
    sender_email: 'zoe.lovelace@example.ch',
    recipient_name: 'Frau Claire Dupont',
    recipient_title: 'Leiterin Personal',
    company_name: 'Acme Solutions AG',
    company_address: 'Bahnhofstrasse 10\n8001 Zürich',
    job_title: 'Senior Software Engineer',
    greeting: 'Sehr geehrte Damen und Herren,',
    opening_paragraph: germanProse(opening),
    body_paragraphs: Array.from({ length: bodies }, () => germanProse(body)),
    closing_paragraph: germanProse(closing),
    sign_off: 'Freundliche Grüsse',
    // Never set: the default Annexes block, in German.
    annexes: null,
  }
  return {
    coverLetter,
    senderDetails: {
      sender_street: coverLetter.sender_street,
      sender_postal_locality: coverLetter.sender_postal_locality,
      sender_phone: coverLetter.sender_phone,
      sender_email: coverLetter.sender_email,
    },
    currentDate: '13. November 2026',
    language: 'de',
    timeoutMs: COVER_LETTER_MEASUREMENT_TIMEOUT_MS,
  }
}

describe.skipIf(!browserInstalled)('the one-page word budget, in German', () => {
  for (const [name, total, bodies] of [
    [`the first letter: ${COVER_LETTER_MAX_WORDS} words, 2 body paragraphs`, COVER_LETTER_MAX_WORDS, 2],
    [`the shortened letter: ${COVER_LETTER_SHORTENED_MAX_WORDS} words, 3 body paragraphs`, COVER_LETTER_SHORTENED_MAX_WORDS, 3],
  ] as const) {
    it(`fits on one page: ${name}`, async () => {
      const letter = germanLetter(total, bodies)
      const measured = await measureCoverLetterPageCount(letter)
      const printed = pdfPageCount(await renderCoverLetterPdf(letter))
      console.info(`[budget] ${name}: measured ${measured}, printed ${printed}`)
      expect(measured).toBe(1)
      expect(printed).toBe(1)
    }, 60_000)
  }

  it('runs over at 20 words more than the first letter\'s budget: the budget is near the page, not far below it', async () => {
    const letter = germanLetter(COVER_LETTER_MAX_WORDS + 20, 2)
    const measured = await measureCoverLetterPageCount(letter)
    const printed = pdfPageCount(await renderCoverLetterPdf(letter))
    console.info(`[budget] ${COVER_LETTER_MAX_WORDS + 20} words, 2 body paragraphs: measured ${measured}, printed ${printed}`)
    expect(measured).toBe(printed)
  }, 60_000)
})
