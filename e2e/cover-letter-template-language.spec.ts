import JSZip from 'jszip'
import { test, expect } from './fixtures/auth'
import type { Download, Locator, Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import { readPdf } from './fixtures/pdf'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'

/**
 * A cover letter's date line, subject line and default greeting and sign-off
 * follow the letter's own language in its PDF and Word files
 * (cover-letter-template-language, US-001).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The language is detected from the letter's text, and when it cannot be
 * told, the page's locale decides: the editor sends it with the download
 * request. Only a real download from a localized page shows both halves.
 *
 * WHAT IS ASSERTED, for the PDF and the Word file of each letter
 *
 *   - A French letter opened under /de, and a German one under /fr: the date,
 *     the subject and the empty greeting and sign-off are the letter's
 *     language's, not the page's.
 *   - A letter too short to tell, opened under /de: the parts follow the
 *     page, and a stored greeting is printed as stored.
 *   - An English letter opened under /fr: today's English wording, exactly.
 *   - The PDF and the Word file show the same text for these four parts.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E cover letter template language')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const LOCALES = { fr, de } as const
type TestLocale = keyof typeof LOCALES

const LETTER_TITLE = 'Lettre langue'

interface LetterCase {
  name: string
  /** The page the letter is opened and downloaded from. */
  page: TestLocale
  letter: Record<string, unknown>
  /**
   * The four parts both files must print, in this order: the date line, in
   * `dateLocale`, then the subject, the greeting and the sign-off.
   */
  expected: { dateLocale: string; subject: string; greeting: string; signOff: string }
}

/**
 * `date`'s date line in `dateLocale`, formatted as the server formats it:
 * same machine, same time zone.
 */
const dateLine = (dateLocale: string, date: Date) =>
  new Intl.DateTimeFormat(dateLocale, { month: 'long', day: 'numeric', year: 'numeric' }).format(date)

const CASES: LetterCase[] = [
  {
    name: 'a French letter opened under /de prints French parts',
    page: 'de',
    letter: {
      job_title: 'Ingénieur logiciel',
      greeting: '',
      sign_off: '',
      opening_paragraph:
        "<p>Je vous écris pour vous présenter ma candidature au poste d'ingénieur logiciel. Avec cinq ans d'expérience dans une équipe agile, je suis convaincu que mon profil correspond à vos besoins.</p>",
      body_paragraphs: ["<p>Au sein de mon équipe actuelle, je suis responsable de la chaîne d'export et des tests.</p>"],
      closing_paragraph: '<p>Je vous remercie pour votre attention et reste à votre disposition.</p>',
    },
    expected: {
      dateLocale: 'fr-FR',
      subject: 'Objet : Candidature au poste de Ingénieur logiciel',
      greeting: 'Madame, Monsieur,',
      signOff: 'Veuillez agréer mes salutations distinguées,',
    },
  },
  {
    name: 'a German letter opened under /fr prints German parts',
    page: 'fr',
    letter: {
      job_title: 'Softwareentwickler',
      greeting: '',
      sign_off: '',
      opening_paragraph:
        '<p>Mit großem Interesse habe ich Ihre Anzeige gelesen und bewerbe mich für die Stelle als Softwareentwickler.</p>',
      body_paragraphs: [
        '<p>In meiner bisherigen Erfahrung bei einer Firma habe ich die Aufgaben im Team mit Freude übernommen.</p>',
      ],
      closing_paragraph: '<p>Ich bin sicher, dass ich auch Ihre Erwartungen erfülle, und freue mich auf ein Gespräch.</p>',
    },
    expected: {
      dateLocale: 'de-DE',
      subject: 'Betreff: Bewerbung als Softwareentwickler',
      greeting: 'Sehr geehrte Damen und Herren,',
      signOff: 'Mit freundlichen Grüßen,',
    },
  },
  {
    name: 'a letter too short to tell follows the page, keeping its stored greeting',
    page: 'de',
    letter: {
      job_title: 'Designer',
      greeting: 'Bonjour Madame,',
      sign_off: '',
      opening_paragraph: '<p>Merci.</p>',
      body_paragraphs: [],
      closing_paragraph: null,
    },
    expected: {
      dateLocale: 'de-DE',
      subject: 'Betreff: Bewerbung als Designer',
      greeting: 'Bonjour Madame,',
      signOff: 'Mit freundlichen Grüßen,',
    },
  },
  {
    name: 'an English letter opened under /fr keeps the English wording',
    page: 'fr',
    letter: {
      job_title: 'Software Engineer',
      greeting: '',
      sign_off: '',
      opening_paragraph:
        '<p>I am writing to apply for the position of software engineer at your company. With five years of experience in the field, I am confident that my skills will be an asset to your team.</p>',
      body_paragraphs: [],
      closing_paragraph: '<p>Thank you for your time and consideration.</p>',
    },
    expected: {
      dateLocale: 'en-US',
      subject: 'Re: Application for Software Engineer',
      greeting: 'Dear Hiring Manager,',
      signOff: 'Sincerely,',
    },
  },
]

async function insertLetter(userId: string, fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin()
    .from('cover_letters')
    .insert({
      user_id: userId,
      title: LETTER_TITLE,
      sender_name: 'Zoë Lovelace',
      company_name: 'Acme SA',
      ...fields,
    })
    .select('id')
    .single()
  expect(error, error?.message).toBeNull()
  return (data as { id: string }).id
}

async function downloadedBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

/** Clicks an editor download button and returns the saved file's bytes. */
async function download(page: Page, button: Locator): Promise<Buffer> {
  const downloading = page.waitForEvent('download', { timeout: 60_000 })
  await button.click()
  return downloadedBytes(await downloading)
}

const unescapeXml = (text: string) =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** The text of each paragraph of `word/document.xml`, as Word reads them. */
async function wordParagraphs(docx: Buffer): Promise<string[]> {
  expect(docx.subarray(0, 2).toString('latin1'), 'a .docx is a zip').toBe('PK')
  const xml = await (await JSZip.loadAsync(docx)).file('word/document.xml')!.async('string')
  return [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map(([, body]) =>
    [...body.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => unescapeXml(match[1])).join(''),
  )
}

/** Whitespace removed: where pdf.js splits a line into items is not the letter's business. */
const squash = (text: string) => text.replace(/\s+/g, '')

for (const { name, page: locale, letter, expected } of CASES) {
  test(name, async ({ page, authedUser }) => {
    const startedAt = new Date()
    const letterId = await insertLetter(authedUser.id, letter)
    const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
    expect(response?.status()).toBe(200)
    const messages = LOCALES[locale].coverLetters
    const pdfButton = page.getByRole('button', { name: messages.downloadPDF, exact: true })
    const wordButton = page.getByRole('button', { name: messages.downloadWord, exact: true })
    await expect(pdfButton).toBeVisible()

    const pdf = await download(page, pdfButton)
    await test.info().attach('cover-letter.pdf', { body: pdf, contentType: 'application/pdf' })
    const docx = await download(page, wordButton)
    await test.info().attach('cover-letter.docx', {
      body: docx,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    // The date line of the day the test started, or of the day it ended if it
    // ran across midnight: each file is dated when the server built it.
    const dateLines = [startedAt, new Date()].map((date) => dateLine(expected.dateLocale, date))
    const partsDated = (printed: (line: string) => boolean) => [
      dateLines.find(printed) ?? dateLines[0],
      expected.subject,
      expected.greeting,
      expected.signOff,
    ]

    // Word: each part is a paragraph of its own, exactly, in the letter's order.
    const paragraphs = await wordParagraphs(docx)
    const wordParts = partsDated((line) => paragraphs.includes(line))
    const indexes = wordParts.map((part) => paragraphs.indexOf(part))
    expect(indexes.every((index) => index >= 0), `${wordParts.join(' | ')} in ${paragraphs.join(' | ')}`).toBe(true)
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes)

    // PDF: the same four texts, in the same order.
    const read = await readPdf(pdf)
    const text = squash(read.pages.map((pdfPage) => pdfPage.text).join(' '))
    let from = 0
    for (const part of partsDated((line) => text.includes(squash(line)))) {
      const at = text.indexOf(squash(part), from)
      expect(at, `"${part}" is missing, or out of order, in the PDF: ${text}`).toBeGreaterThanOrEqual(0)
      from = at + squash(part).length
    }

    // A localized letter carries no English part in either file.
    if (expected.signOff !== 'Sincerely,') {
      for (const english of ['Re:Applicationfor', 'DearHiringManager', 'Sincerely,']) {
        expect(text).not.toContain(english)
        expect(squash(paragraphs.join(' '))).not.toContain(english)
      }
    }
  })
}
