import { describe, expect, it } from 'vitest'
import { COVER_LETTER_FIELD_LIMITS, COVER_LETTER_PDF_GUARD } from '@/lib/cover-letter-limits'
import { buildDefaultCoverLetterTitle } from '@/lib/cover-letter-title'
import {
  COVER_LETTER_TRANSLATION_LIMITS,
  CoverLetterTranslationTooLargeError,
  planLetterTranslation,
  translatedCopyTitle,
  translatedTitle,
  type TranslatableLetter,
} from './letter-segments'

/**
 * The markup-preserving translator (cover-letter-export-translate, US-003):
 * what a letter sends to the AI, and how the AI's untrusted reply becomes
 * stored columns with the original's structure and formatting.
 */

const LETTER: TranslatableLetter = {
  greeting: 'Madame, Monsieur,',
  opening_paragraph:
    '<p>Je postule avec <strong>une conviction forte</strong> et <em>un réel intérêt</em>.</p>' +
    '<ol><li>Première raison</li><li>Deuxième <u>raison</u></li></ol>',
  body_paragraphs: ['<p>Corps un : R&amp;D &lt;b&gt; tapé.</p>', '<p>Ligne un<br>Ligne deux</p>'],
  closing_paragraph: '<p>Merci.</p>',
  sign_off: 'Cordialement,',
}

/** The stub's answer: every segment prefixed, markup untouched. */
const prefixed = (segments: readonly string[], prefix = '[DE] ') => segments.map((segment) => `${prefix}${segment}`)

describe('planLetterTranslation', () => {
  it('sends one segment per greeting, paragraph, list item and sign-off, in order, in the mini-markup', () => {
    expect(planLetterTranslation(LETTER).segments).toEqual([
      'Madame, Monsieur,',
      'Je postule avec <b>une conviction forte</b> et <i>un réel intérêt</i>.',
      'Première raison',
      'Deuxième <u>raison</u>',
      'Corps un : R&amp;D &lt;b&gt; tapé.',
      'Ligne un<br>Ligne deux',
      'Merci.',
      'Cordialement,',
    ])
  })

  it('rebuilds every part translated, with the original structure, bold, italic, underline, lists and breaks', () => {
    const plan = planLetterTranslation(LETTER)
    expect(plan.rebuild(prefixed(plan.segments))).toEqual({
      greeting: '[DE] Madame, Monsieur,',
      opening_paragraph:
        '<p>[DE] Je postule avec <strong>une conviction forte</strong> et <em>un réel intérêt</em>.</p>' +
        '<ol><li>[DE] Première raison</li><li>[DE] Deuxième <u>raison</u></li></ol>',
      // Text that reads as markup is removed by the cover-letter-from-job rule,
      // even when the user typed it as text.
      body_paragraphs: ['<p>[DE] Corps un : R&amp;D tapé.</p>', '<p>[DE] Ligne un<br>Ligne deux</p>'],
      closing_paragraph: '<p>[DE] Merci.</p>',
      sign_off: '[DE] Cordialement,',
    })
  })

  it('lets emphasis move with the words that carry it, as a translation reorders them', () => {
    const plan = planLetterTranslation({ ...LETTER, opening_paragraph: '<p>I am <b>very</b> motivated.</p>' })
    const translations = prefixed(plan.segments, '')
    translations[1] = '<b>Sehr</b> motiviert bin ich.'
    expect(plan.rebuild(translations)?.opening_paragraph).toBe('<p><strong>Sehr</strong> motiviert bin ich.</p>')
  })

  it('keeps nested lists nested and separate lists separate', () => {
    const plan = planLetterTranslation({
      ...LETTER,
      opening_paragraph: '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul><ol><li>d</li></ol>',
    })
    expect(plan.rebuild(prefixed(plan.segments, ''))?.opening_paragraph).toBe(
      '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul><ol><li>d</li></ol>'
    )
  })

  it('keeps an empty line, translating nothing for it', () => {
    const plan = planLetterTranslation({ ...LETTER, body_paragraphs: ['<p>Un</p><p><br></p><p>Deux</p>'] })
    expect(plan.segments).toContain('Un')
    expect(plan.segments).toContain('Deux')
    expect(plan.rebuild(prefixed(plan.segments))?.body_paragraphs).toEqual(['<p>[DE] Un</p><p><br></p><p>[DE] Deux</p>'])
  })

  it('leaves missing parts missing: no segment, and the same empty or null column', () => {
    const plan = planLetterTranslation({
      greeting: '',
      opening_paragraph: null,
      body_paragraphs: ['<p>Seul</p>', 42, null],
      closing_paragraph: null,
      sign_off: '   ',
    })
    expect(plan.segments).toEqual(['Seul'])
    expect(plan.rebuild(['Allein'])).toEqual({
      greeting: '',
      opening_paragraph: null,
      body_paragraphs: ['<p>Allein</p>'],
      closing_paragraph: null,
      sign_off: '',
    })
  })

  describe('the reply is untrusted', () => {
    const hostile = [
      '<script>alert(1)</script>Hallo',
      '<img src=x onerror=alert(1)>Bild',
      '<a href="javascript:alert(1)">Link</a>',
      '<b onclick="x()" style="background:url(evil)">fett</b>',
      '<p style="font-family: x;}</style><script>">Absatz</p><ul><li>Liste</li></ul>',
      '<iframe src="https://evil.example"></iframe>Rahmen',
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    ]

    it.each(hostile)('stores %s as escaped text in allowed tags only, never as markup', (reply) => {
      const plan = planLetterTranslation({ ...LETTER, body_paragraphs: ['<p>Corps</p>'] })
      const translations = prefixed(plan.segments, '')
      const bodyIndex = plan.segments.indexOf('Corps')
      translations[bodyIndex] = reply
      // The greeting and sign-off are plain-text columns.
      translations[0] = reply
      translations[translations.length - 1] = `${reply} Gruß`

      const content = plan.rebuild(translations)
      if (content === null) return // a reply left with no text is refused, which is also safe
      const stored = [content.opening_paragraph ?? '', ...content.body_paragraphs, content.closing_paragraph ?? '']
      for (const html of stored) {
        // Only the allowlist's tags, with no attribute at all.
        for (const [, tag] of html.matchAll(/<\/?([a-zA-Z][^\s/>]*)/g)) {
          expect(['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li']).toContain(tag)
        }
        expect(html).not.toMatch(/<[a-z]+\s/i)
        expect(html).not.toMatch(/<script|<img|<a\b|<iframe|javascript:|onerror|onclick|style=/i)
      }
      // The body keeps the original's one paragraph, whatever blocks the reply held.
      expect(content.body_paragraphs).toHaveLength(1)
      expect(content.body_paragraphs[0]).toMatch(/^<p>[\s\S]*<\/p>$/)
      expect(content.body_paragraphs[0]).not.toMatch(/<ul>|<li>/)
      for (const plain of [content.greeting, content.sign_off]) expect(plain).not.toMatch(/[<>]/)
    })

    it('refuses a reply that left any part with no text, so no letter misses a part', () => {
      const plan = planLetterTranslation(LETTER)
      for (let index = 0; index < plan.segments.length; index += 1) {
        const translations = prefixed(plan.segments)
        translations[index] = ['   ', '<b> </b><br>', '&lt;i&gt;', '\u0000\u0007'][index % 4]
        expect(plan.rebuild(translations)).toBeNull()
      }
    })

    it('refuses a reply with the wrong number of translations', () => {
      const plan = planLetterTranslation(LETTER)
      expect(plan.rebuild(prefixed(plan.segments).slice(1))).toBeNull()
    })

    it('removes characters the database cannot store', () => {
      const plan = planLetterTranslation({ ...LETTER, body_paragraphs: ['<p>Corps</p>'] })
      const translations = prefixed(plan.segments, '')
      translations[plan.segments.indexOf('Corps')] = 'Kör\u0000per\u0007 \ud800x'
      expect(plan.rebuild(translations)?.body_paragraphs).toEqual(['<p>Körper x</p>'])
    })

    it('stores a translation much longer than its original whole, never cut', () => {
      // The reviewer's case: a 1,904-character paragraph translated into
      // about 1.8 times its length used to be cut at 2,000 characters.
      const original = `${'Phrase française de test. '.repeat(73)}Fin.`.trim()
      expect(original.length).toBeGreaterThan(1_850)
      expect(original.length).toBeLessThan(2_000)
      const plan = planLetterTranslation({ ...LETTER, body_paragraphs: [`<p>${original}</p>`] })
      const translations = prefixed(plan.segments, '')
      const translated = `${'Ein deutlich längerer deutscher Testsatz, wie üblich. '.repeat(64)}ENDE`
      expect(translated.length).toBeGreaterThan(original.length * 1.75)
      translations[plan.segments.indexOf(original)] = translated

      const body = plan.rebuild(translations)!.body_paragraphs[0]
      expect(body).toBe(`<p>${translated.replace(/\s+/g, ' ').trim()}</p>`)
      expect(body.endsWith('ENDE</p>')).toBe(true)
    })

    it('refuses a rich part that would be over its column limit once written, rather than cut it', () => {
      const plan = planLetterTranslation({ ...LETTER, body_paragraphs: ['<p>Corps</p>'] })
      const translations = prefixed(plan.segments, '')
      translations[plan.segments.indexOf('Corps')] = 'x'.repeat(COVER_LETTER_PDF_GUARD.richTextField)
      expect(plan.rebuild(translations)).toBeNull()

      // Escaping counts: the stored HTML, not the reply, is what the limit bounds.
      translations[plan.segments.indexOf('Corps')] = '&amp;'.repeat(COVER_LETTER_PDF_GUARD.richTextField / 4)
      expect(plan.rebuild(translations)).toBeNull()

      // Just within the limit, it is stored whole.
      const fits = 'y'.repeat(COVER_LETTER_PDF_GUARD.richTextField - '<p></p>'.length)
      translations[plan.segments.indexOf('Corps')] = fits
      expect(plan.rebuild(translations)?.body_paragraphs).toEqual([`<p>${fits}</p>`])
    })

    it.each([
      ['greeting', 0],
      ['sign-off', -1],
    ])('refuses a %s over its column limit, rather than cut it', (_label, at) => {
      const plan = planLetterTranslation(LETTER)
      const translations = prefixed(plan.segments, '')
      const index = at < 0 ? translations.length + at : at
      translations[index] = 'z'.repeat(COVER_LETTER_FIELD_LIMITS.greeting + 1)
      expect(plan.rebuild(translations)).toBeNull()
      translations[index] = 'z'.repeat(COVER_LETTER_FIELD_LIMITS.greeting)
      expect(plan.rebuild(translations)).not.toBeNull()
    })
  })

  it('refuses a letter with more segments than the AI limit', () => {
    const items = Array.from({ length: COVER_LETTER_TRANSLATION_LIMITS.segments }, (_, index) => `<li>${index}</li>`).join('')
    expect(() => planLetterTranslation({ ...LETTER, opening_paragraph: `<ul>${items}</ul>` })).toThrow(
      CoverLetterTranslationTooLargeError
    )
  })

  it('refuses a letter with more text than the AI limit', () => {
    const paragraph = `<p>${'x'.repeat(COVER_LETTER_TRANSLATION_LIMITS.totalCharacters / 2)}</p>`
    expect(() => planLetterTranslation({ ...LETTER, body_paragraphs: [paragraph, paragraph] })).toThrow(
      CoverLetterTranslationTooLargeError
    )
  })
})

describe('translatedTitle', () => {
  it('adds the language suffix', () => {
    expect(translatedTitle('Lettre Zürich', 'de')).toBe('Lettre Zürich (DE)')
    expect(translatedTitle('  Cover  ', 'it')).toBe('Cover (IT)')
    expect(translatedTitle('', 'en')).toBe('(EN)')
  })

  it('cuts a long title so the suffixed title fits the title limit, without splitting a character', () => {
    const title = translatedTitle('é'.repeat(254) + '😀', 'fr')
    expect(title.length).toBeLessThanOrEqual(255)
    expect(title.endsWith('é (FR)')).toBe(true)
  })
})

describe('translatedCopyTitle', () => {
  const JOB = 'Ingénieur logiciel'
  const COMPANY = 'Größe & Söhne AG'
  const LANGUAGES = ['fr', 'en', 'de', 'it'] as const
  const SUFFIXES = ['', ' (EN)', ' (FR)', ' (DE)', ' (IT)'] as const
  const fields = (title: string, job: string | null = JOB, company: string | null = COMPANY) => ({
    title,
    job_title: job,
    company_name: company,
  })

  for (const from of LANGUAGES) {
    for (const suffix of SUFFIXES) {
      it.each(LANGUAGES)(`gives a ${from} default title${suffix ? ` with "${suffix}"` : ''} the %s default, unsuffixed`, (to) => {
        const original = `${buildDefaultCoverLetterTitle(from, JOB, COMPANY)}${suffix}`
        expect(translatedCopyTitle(fields(original), to)).toBe(buildDefaultCoverLetterTitle(to, JOB, COMPANY))
      })
    }
  }

  it('spells out the target wording (FR-5)', () => {
    const original = fields(`Cover Letter - ${JOB} at ${COMPANY}`)
    expect(translatedCopyTitle(original, 'fr')).toBe(`Lettre de motivation - ${JOB} chez ${COMPANY}`)
    expect(translatedCopyTitle(original, 'de')).toBe(`Anschreiben - ${JOB} bei ${COMPANY}`)
    expect(translatedCopyTitle(original, 'it')).toBe(`Lettera di presentazione - ${JOB} presso ${COMPANY}`)
    expect(translatedCopyTitle(fields(`Anschreiben - ${JOB} bei ${COMPANY}`), 'en')).toBe(original.title)
  })

  it.each(LANGUAGES)('keeps a user title and adds the suffix, translating to %s', (to) => {
    const suffix = ` (${to.toUpperCase()})`
    const defaultTitle = buildDefaultCoverLetterTitle('fr', JOB, COMPANY)
    for (const title of [
      'Lettre Zürich',
      `${defaultTitle} (Copy)`,
      `${defaultTitle} (DE) (FR)`,
      defaultTitle.toUpperCase(),
      `${defaultTitle} `,
      // Another letter's job title: not this letter's default.
      buildDefaultCoverLetterTitle('fr', 'Designer', COMPANY),
    ]) {
      expect(translatedCopyTitle(fields(title), to)).toBe(translatedTitle(title, to))
    }
    expect(translatedCopyTitle(fields('Lettre Zürich'), to)).toBe(`Lettre Zürich${suffix}`)
  })

  it('treats a default-looking title as a user title when the job title or company is missing', () => {
    const title = 'Cover Letter -  at '
    expect(translatedCopyTitle(fields(title, '', ''), 'de')).toBe(translatedTitle(title, 'de'))
    const looksDefault = buildDefaultCoverLetterTitle('en', JOB, COMPANY)
    expect(translatedCopyTitle(fields(looksDefault, null, COMPANY), 'de')).toBe(`${looksDefault} (DE)`)
    expect(translatedCopyTitle(fields(looksDefault, JOB, null), 'de')).toBe(`${looksDefault} (DE)`)
  })

  it('keeps the copy within the title limit: an over-long default is cut, with no suffix', () => {
    const job = 'J'.repeat(COVER_LETTER_FIELD_LIMITS.job_title)
    const company = 'C'.repeat(200)
    // An English default that was cut to the limit when the letter was created.
    const original = buildDefaultCoverLetterTitle('en', job, company).slice(0, COVER_LETTER_FIELD_LIMITS.title)
    // A cut original is a user title (FR-6): suffixed and cut by translatedTitle.
    expect(translatedCopyTitle(fields(original, job, company), 'it')).toBe(translatedTitle(original, 'it'))

    // A whole default original whose target pattern is longer than the limit.
    const shortJob = 'J'.repeat(100)
    const longCompany = 'C'.repeat(130)
    const whole = buildDefaultCoverLetterTitle('de', shortJob, longCompany)
    expect(whole.length).toBeLessThanOrEqual(COVER_LETTER_FIELD_LIMITS.title)
    const copy = translatedCopyTitle(fields(whole, shortJob, longCompany), 'it')
    expect(buildDefaultCoverLetterTitle('it', shortJob, longCompany).length).toBeGreaterThan(COVER_LETTER_FIELD_LIMITS.title)
    expect(copy).toHaveLength(COVER_LETTER_FIELD_LIMITS.title)
    expect(copy).toBe(buildDefaultCoverLetterTitle('it', shortJob, longCompany).slice(0, COVER_LETTER_FIELD_LIMITS.title))
    expect(copy).not.toMatch(/ \((EN|FR|DE|IT)\)$/)
  })
})
