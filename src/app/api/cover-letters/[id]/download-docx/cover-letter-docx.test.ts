import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { CoverLetterPdfFields } from '@/lib/cover-letter-pdf-html'
import { COVER_LETTER_DOCX_LIMITS, CoverLetterDocxTooLargeError, buildCoverLetterDocx } from './cover-letter-docx'

/**
 * The cover letter's Word file (cover-letter-export-translate, US-002), read
 * back the way Word reads it: `word/document.xml` out of the zip. Every part
 * is a paragraph, in the PDF's order; rich text keeps bold, italic and Word
 * list numbering; accents survive; empty parts are left out.
 */

const CURRENT_DATE = 'October 25, 2026'

const FULL_LETTER: CoverLetterPdfFields = {
  sender_name: 'Zoë Müller',
  recipient_name: 'Jürgen Weiß',
  recipient_title: 'Leiter Entwicklung',
  company_name: 'Größe & Söhne AG',
  company_address: 'Bahnhofstraße 1\n8001 Zürich',
  job_title: 'Ingénieur logiciel',
  greeting: 'Sehr geehrter Herr Weiß,',
  opening_paragraph:
    '<p>Je postule avec <strong>conviction</strong> et <em>un réel intérêt</em> – « vraiment ».</p>' +
    '<ol><li>Première raison</li><li>Deuxième raison</li></ol>',
  body_paragraphs: ['<p>Corps un : l’équipe.</p>', '<div>Corps deux</div><ul><li>Puce</li></ul>', '<p>Corps trois</p>'],
  closing_paragraph: '<p>Merci de votre attention.</p>',
  sign_off: 'Mit freundlichen Grüßen,',
}

interface ReadParagraph {
  text: string
  runs: { text: string; bold: boolean; italic: boolean }[]
  numId?: string
  level?: string
  spacingAfter?: number
}

const unescapeXml = (text: string) =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

async function readDocx(buffer: Buffer): Promise<{ paragraphs: ReadParagraph[]; numbering: string; xml: string }> {
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml')!.async('string')
  const numbering = (await zip.file('word/numbering.xml')?.async('string')) ?? ''
  const paragraphs = [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map(([, body]): ReadParagraph => {
    const runs = [...body.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map(([, run]) => ({
      text: [...run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:br\/>/g)]
        .map((match) => (match[0] === '<w:br/>' ? '\n' : unescapeXml(match[1])))
        .join(''),
      bold: /<w:b\/>/.test(run),
      italic: /<w:i\/>/.test(run),
    }))
    const after = /<w:spacing [^>]*w:after="(\d+)"/.exec(body)
    return {
      text: runs.map((run) => run.text).join(''),
      runs,
      numId: /<w:numId w:val="(\d+)"\/>/.exec(body)?.[1],
      level: /<w:ilvl w:val="(\d+)"\/>/.exec(body)?.[1],
      spacingAfter: after ? Number(after[1]) : undefined,
    }
  })
  return { paragraphs, numbering, xml }
}

const build = (coverLetter: CoverLetterPdfFields) => buildCoverLetterDocx({ coverLetter, currentDate: CURRENT_DATE })

describe('buildCoverLetterDocx: a valid Word file', () => {
  it('is a zip holding the parts Word needs', async () => {
    const buffer = await build(FULL_LETTER)
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK')
    const zip = await JSZip.loadAsync(buffer)
    for (const path of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml']) {
      expect(zip.file(path), path).not.toBeNull()
    }
  })

  it("is laid out on the PDF's US Letter page with its 64 px margins, in Georgia", async () => {
    const zip = await JSZip.loadAsync(await build(FULL_LETTER))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toMatch(/<w:pgSz w:w="12240" w:h="15840"/)
    expect(xml).toMatch(/<w:pgMar w:top="960" w:right="960" w:bottom="960" w:left="960"/)
    const styles = await zip.file('word/styles.xml')!.async('string')
    expect(styles).toContain('w:ascii="Georgia"')
  })
})

describe('buildCoverLetterDocx: every part, in order, each a real paragraph', () => {
  it('writes sender; date; recipient block; subject; greeting; opening; each body paragraph; closing; sign-off; signature', async () => {
    const { paragraphs } = await readDocx(await build(FULL_LETTER))
    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual([
      'Zoë Müller',
      CURRENT_DATE,
      'Jürgen Weiß',
      'Leiter Entwicklung',
      'Größe & Söhne AG',
      'Bahnhofstraße 1\n8001 Zürich',
      'Re: Application for Ingénieur logiciel',
      'Sehr geehrter Herr Weiß,',
      'Je postule avec conviction et un réel intérêt – « vraiment ».',
      'Première raison',
      'Deuxième raison',
      'Corps un : l’équipe.',
      'Corps deux',
      'Puce',
      'Corps trois',
      'Merci de votre attention.',
      'Mit freundlichen Grüßen,',
      'Zoë Müller',
    ])
  })

  it('keeps the sender and the subject bold, as the PDF does', async () => {
    const { paragraphs } = await readDocx(await build(FULL_LETTER))
    expect(paragraphs[0].runs.every((run) => run.bold)).toBe(true)
    expect(paragraphs.find((paragraph) => paragraph.text.startsWith('Re: '))!.runs.every((run) => run.bold)).toBe(true)
    expect(paragraphs[paragraphs.length - 1].runs.every((run) => run.bold)).toBe(true)
  })

  it("spaces the parts by the template's margins, the sign-off block 32 px below the closing", async () => {
    const { paragraphs } = await readDocx(await build(FULL_LETTER))
    const after = (text: string) => paragraphs.find((paragraph) => paragraph.text === text)!.spacingAfter
    expect(after('Zoë Müller')).toBe(60) // 4 px
    expect(after(CURRENT_DATE)).toBe(360) // 24 px
    expect(after('Jürgen Weiß')).toBe(0)
    expect(after('Sehr geehrter Herr Weiß,')).toBe(240) // 16 px
    expect(after('Merci de votre attention.')).toBe(480) // max(24 px, the sign-off's 32 px)
    expect(after('Mit freundlichen Grüßen,')).toBe(480)
  })
})

describe('buildCoverLetterDocx: rich text keeps its meaning', () => {
  it('writes bold and italic runs', async () => {
    const { paragraphs } = await readDocx(await build(FULL_LETTER))
    const opening = paragraphs.find((paragraph) => paragraph.text.startsWith('Je postule'))!
    expect(opening.runs.find((run) => run.text === 'conviction')).toMatchObject({ bold: true, italic: false })
    expect(opening.runs.find((run) => run.text === 'un réel intérêt')).toMatchObject({ bold: false, italic: true })
    expect(opening.runs.find((run) => run.text === 'Je postule avec ')).toMatchObject({ bold: false, italic: false })
  })

  it('writes lists as Word lists: a numbered list and a bulleted one, each its own', async () => {
    const { paragraphs, numbering } = await readDocx(await build(FULL_LETTER))
    const first = paragraphs.find((paragraph) => paragraph.text === 'Première raison')!
    const second = paragraphs.find((paragraph) => paragraph.text === 'Deuxième raison')!
    const bullet = paragraphs.find((paragraph) => paragraph.text === 'Puce')!
    expect(first.numId).toBeDefined()
    expect(second.numId).toBe(first.numId)
    expect(first.level).toBe('0')
    expect(bullet.numId).toBeDefined()
    expect(bullet.numId).not.toBe(first.numId)
    expect(paragraphs.filter((paragraph) => paragraph.numId !== undefined)).toHaveLength(3)

    const abstractOf = (numId: string) =>
      new RegExp(`<w:num w:numId="${numId}"><w:abstractNumId w:val="(\\d+)"/>`).exec(numbering)![1]
    const firstLevelFormat = (abstractId: string) =>
      new RegExp(`<w:abstractNum [^>]*w:abstractNumId="${abstractId}"[\\s\\S]*?<w:numFmt w:val="(\\w+)"/>`).exec(numbering)![1]
    expect(firstLevelFormat(abstractOf(first.numId!))).toBe('decimal')
    expect(firstLevelFormat(abstractOf(bullet.numId!))).toBe('bullet')
  })

  it('restarts each numbered list at 1', async () => {
    const { paragraphs, numbering } = await readDocx(
      await build({
        ...FULL_LETTER,
        opening_paragraph: '<ol><li>A1</li><li>A2</li></ol>',
        body_paragraphs: ['<ol><li>B1</li></ol>'],
      }),
    )
    const a = paragraphs.find((paragraph) => paragraph.text === 'A1')!.numId!
    const b = paragraphs.find((paragraph) => paragraph.text === 'B1')!.numId!
    expect(a).not.toBe(b)
    for (const numId of [a, b]) {
      expect(numbering).toMatch(new RegExp(`<w:num w:numId="${numId}">[\\s\\S]*?<w:startOverride w:val="1"/>`))
    }
  })

  it('writes a nested list one level deeper', async () => {
    const { paragraphs } = await readDocx(
      await build({ ...FULL_LETTER, opening_paragraph: '<ul><li>Parent<ul><li>Child</li></ul></li></ul>' }),
    )
    expect(paragraphs.find((paragraph) => paragraph.text === 'Parent')!.level).toBe('0')
    expect(paragraphs.find((paragraph) => paragraph.text === 'Child')!.level).toBe('1')
  })

  it("splits the editor's div-per-line markup into paragraphs, an empty line into an empty paragraph", async () => {
    const { paragraphs } = await readDocx(
      await build({ ...FULL_LETTER, opening_paragraph: '<div>Line A</div><div><br></div><div>Line C</div>' }),
    )
    const at = paragraphs.findIndex((paragraph) => paragraph.text === 'Line A')
    expect(paragraphs.slice(at, at + 3).map((paragraph) => paragraph.text)).toEqual(['Line A', '', 'Line C'])
  })
})

describe('buildCoverLetterDocx: characters', () => {
  it('keeps accents and typographic characters intact: é, ü, ß, ’, « »', async () => {
    const { paragraphs, xml } = await readDocx(
      await build({ ...FULL_LETTER, closing_paragraph: '<p>é ü ß ’ « » &eacute;&rsquo;</p>' }),
    )
    expect(paragraphs.some((paragraph) => paragraph.text === 'é ü ß ’ « » é’')).toBe(true)
    expect(xml).toContain('é ü ß ’ « »')
  })

  it('writes markup characters a user typed as text, XML-escaped', async () => {
    const { paragraphs } = await readDocx(
      await build({ ...FULL_LETTER, greeting: 'Dear <b>&"\'', opening_paragraph: '<p>&lt;script&gt;x&lt;/script&gt;</p>' }),
    )
    expect(paragraphs.map((paragraph) => paragraph.text)).toContain('Dear <b>&"\'')
    expect(paragraphs.map((paragraph) => paragraph.text)).toContain('<script>x</script>')
  })

  it('drops characters XML cannot carry, so Word still opens the file', async () => {
    const { xml, paragraphs } = await readDocx(
      await build({ ...FULL_LETTER, sender_name: 'Ada\u0001\u0008 Lovelace￿', closing_paragraph: '<p>Lone \uD800 surrogate</p>' }),
    )
    expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/)
    expect(paragraphs[0].text).toBe('Ada Lovelace')
    expect(paragraphs.map((paragraph) => paragraph.text)).toContain('Lone surrogate')
  })
})

describe('buildCoverLetterDocx: XML-safe output (SEC-017)', () => {
  it('writes no XML-invalid character, even one that arrives as a character reference', async () => {
    const zip = await JSZip.loadAsync(
      await build({
        ...FULL_LETTER,
        opening_paragraph: '<p>a&#1;b&#x1F;c&#xFFFE;d&#xFFFF;e&#8;f</p>',
        body_paragraphs: ['<p style="font-family: x&#1;y">g</p>', '<span style="font-family: &#x1F;Font">h</span>'],
        closing_paragraph: '<textarea>&#x1;i</textarea>',
      }),
    )
    for (const path of Object.keys(zip.files).filter((name) => name.endsWith('.xml'))) {
      const xml = await zip.file(path)!.async('string')
      expect(xml, path).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/)
    }
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('>abcdef<')
  })

  it('clamps an absurd inline size for the run and for the line it sets, so every value is a finite integer', async () => {
    const { xml } = await readDocx(
      await build({
        ...FULL_LETTER,
        opening_paragraph: `<p><span style="font-size: ${'9'.repeat(300)}px">huge</span></p>`,
        closing_paragraph: '<p><span style="font-size: 0.0001px">tiny</span></p>',
      }),
    )
    const values = [...xml.matchAll(/w:(?:line|val|after|sz)="([^"]*)"/g)].map((match) => match[1])
    const numeric = values.filter((value) => /^[-+\d.eE]+$/.test(value))
    expect(numeric.length).toBeGreaterThan(0)
    for (const value of numeric) expect(value, value).toMatch(/^\d+$/)
    const sizes = [...xml.matchAll(/<w:sz w:val="(\d+)"\/>/g)].map((match) => Number(match[1]))
    expect(Math.max(...sizes)).toBe(3276)
    expect(Math.min(...sizes)).toBe(2)
    const lines = [...xml.matchAll(/w:line="(\d+)"/g)].map((match) => Number(match[1]))
    expect(Math.max(...lines)).toBeLessThanOrEqual(Math.round((3276 / 1.5) * 1.625 * 15))
  })
})

describe('buildCoverLetterDocx: bounded work (SEC-016)', () => {
  const flood = (field: string): CoverLetterPdfFields => ({
    ...FULL_LETTER,
    opening_paragraph: field,
    closing_paragraph: field,
    body_paragraphs: Array(8).fill(field),
  })

  it.each([
    ['tiny paragraphs', '<p>x'.repeat(4_990)],
    ['list items', '<ul>' + '<li>x'.repeat(3_990)],
    ['formatted runs in few paragraphs', '<p>' + '<b>x</b>y'.repeat(2_200) + '</p>'],
    ['line breaks in few paragraphs', '<p>' + 'x<br>'.repeat(3_990) + '</p>'],
  ])('refuses a flood of %s quickly, before building it', async (_case, field) => {
    const started = performance.now()
    await expect(build(flood(field))).rejects.toBeInstanceOf(CoverLetterDocxTooLargeError)
    expect(performance.now() - started).toBeLessThan(200)
  })

  it('refuses only above the limits: just under them, the letter builds', async () => {
    const perField = Math.floor((COVER_LETTER_DOCX_LIMITS.paragraphs - 20) / 10)
    const { paragraphs } = await readDocx(await build(flood('<p>x'.repeat(perField))))
    expect(paragraphs.filter((paragraph) => paragraph.text === 'x')).toHaveLength(perField * 10)
  })

  it('builds deeply nested markup quickly, with its text', async () => {
    const started = performance.now()
    const { paragraphs } = await readDocx(await build(flood('<ul><li>'.repeat(2_499) + 'deep')))
    expect(performance.now() - started).toBeLessThan(500)
    expect(paragraphs.filter((paragraph) => paragraph.text === 'deep')).toHaveLength(10)
  })
})

describe('buildCoverLetterDocx: empty parts are left out', () => {
  it('writes no paragraph for a part with nothing to show', async () => {
    const { paragraphs } = await readDocx(
      await build({
        sender_name: '',
        recipient_name: null,
        recipient_title: 'Ignored without recipient or company',
        company_name: null,
        company_address: null,
        job_title: '',
        greeting: 'Hello,',
        opening_paragraph: '<p> </p>',
        body_paragraphs: ['', '<div><br></div>', '<p>Only body</p>', 42, null] as unknown as CoverLetterPdfFields['body_paragraphs'],
        closing_paragraph: null,
        sign_off: 'Bye,',
      }),
    )
    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual([CURRENT_DATE, 'Hello,', 'Only body', 'Bye,'])
  })

  it("writes the PDF's defaults for an empty greeting and sign-off", async () => {
    const { paragraphs } = await readDocx(await build({ ...FULL_LETTER, greeting: '', sign_off: '' }))
    const texts = paragraphs.map((paragraph) => paragraph.text)
    expect(texts).toContain('Dear Hiring Manager,')
    expect(texts).toContain('Sincerely,')
  })

  it('collapses whitespace in plain parts as the PDF does, but keeps the address lines', async () => {
    const { paragraphs } = await readDocx(
      await build({ ...FULL_LETTER, greeting: '  Dear \n  team,  ', company_address: '  Street 1 \n\n  City  ' }),
    )
    const texts = paragraphs.map((paragraph) => paragraph.text)
    expect(texts).toContain('Dear team,')
    expect(texts).toContain('Street 1\n\nCity')
  })
})
