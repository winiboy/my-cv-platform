import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { CoverLetterPdfFields } from '@/lib/cover-letter-pdf-html'
import { effectiveSenderDetails, type CoverLetterSenderDetails } from '@/lib/cover-letter-sender'
import { swissLetterParts, type SwissLetterPart } from '@/lib/cover-letter-swiss-letter'
import {
  COVER_LETTER_DOCX_GEOMETRY_TWIPS,
  COVER_LETTER_DOCX_LIMITS,
  COVER_LETTER_DOCX_LINE_TWIPS,
  CoverLetterDocxTooLargeError,
  buildCoverLetterDocx,
} from './cover-letter-docx'

/**
 * The cover letter's Word file (cover-letter-swiss-format, US-004), read back
 * the way Word reads it: `word/document.xml` out of the zip. It is the Swiss
 * A4 letter of `swissLetterParts`: the same parts, in the same order, with
 * the same text as the preview and the PDF; the sender at the top margin, the
 * recipient in a frame anchored to the page at the window zone (the XML
 * values Word 16 was measured to place at 50 mm × 110 mm);
 * rich text keeps bold, italic and Word list numbering; accents survive;
 * empty parts are left out.
 */

const CURRENT_DATE = 'October 25, 2026'

const FULL_LETTER: CoverLetterPdfFields = {
  sender_name: 'Zoë Müller',
  sender_street: 'Avenue de Rumine 7',
  sender_postal_locality: '1003 Lausanne',
  sender_phone: '+41 21 555 01 42',
  sender_email: 'zoe.mueller@example.ch',
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
  annexes: 'Lebenslauf\nArbeitszeugnis Zürich',
}

const LINE = COVER_LETTER_DOCX_LINE_TWIPS
const GEOMETRY = COVER_LETTER_DOCX_GEOMETRY_TWIPS

interface ReadParagraph {
  text: string
  runs: { text: string; bold: boolean; italic: boolean }[]
  numId?: string
  level?: string
  spacingBefore?: number
  spacingAfter?: number
  line?: number
  lineRule?: string
  framePr?: string
  indentLeft?: number
  indentRight?: number
  alignment?: string
}

const unescapeXml = (text: string) =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

const numberAttribute = (xml: string, element: string, attribute: string): number | undefined => {
  const match = new RegExp(`<w:${element} [^>]*w:${attribute}="(\\d+)"`).exec(xml)
  return match ? Number(match[1]) : undefined
}

async function readDocx(buffer: Buffer): Promise<{ paragraphs: ReadParagraph[]; numbering: string; xml: string; styles: string }> {
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml')!.async('string')
  const numbering = (await zip.file('word/numbering.xml')?.async('string')) ?? ''
  const styles = await zip.file('word/styles.xml')!.async('string')
  const paragraphs = [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map(([, body]): ReadParagraph => {
    const runs = [...body.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map(([, run]) => ({
      text: [...run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:br\/>/g)]
        .map((match) => (match[0] === '<w:br/>' ? '\n' : unescapeXml(match[1])))
        .join(''),
      bold: /<w:b\/>/.test(run),
      italic: /<w:i\/>/.test(run),
    }))
    return {
      text: runs.map((run) => run.text).join(''),
      runs,
      numId: /<w:numId w:val="(\d+)"\/>/.exec(body)?.[1],
      level: /<w:ilvl w:val="(\d+)"\/>/.exec(body)?.[1],
      spacingBefore: numberAttribute(body, 'spacing', 'before'),
      spacingAfter: numberAttribute(body, 'spacing', 'after'),
      line: numberAttribute(body, 'spacing', 'line'),
      lineRule: /<w:spacing [^>]*w:lineRule="(\w+)"/.exec(body)?.[1],
      framePr: /<w:framePr [^>]*\/>/.exec(body)?.[0],
      indentLeft: numberAttribute(body, 'ind', 'left'),
      indentRight: numberAttribute(body, 'ind', 'right'),
      alignment: /<w:jc w:val="(\w+)"\/>/.exec(body)?.[1],
    }
  })
  return { paragraphs, numbering, xml, styles }
}

const storedDetails = (letter: CoverLetterPdfFields): CoverLetterSenderDetails => effectiveSenderDetails(letter, null)

const build = (coverLetter: CoverLetterPdfFields, senderDetails: CoverLetterSenderDetails = storedDetails(coverLetter)) =>
  buildCoverLetterDocx({ coverLetter, senderDetails, currentDate: CURRENT_DATE, language: 'en' })

const byText = (paragraphs: ReadParagraph[], text: string) => {
  const found = paragraphs.find((paragraph) => paragraph.text === text)
  if (!found) throw new Error(`No paragraph "${text}" in ${JSON.stringify(paragraphs.map((paragraph) => paragraph.text))}`)
  return found
}

/**
 * The paragraph texts a part prints as, from `swissLetterParts` itself: one
 * paragraph per block, its lines joined by line breaks; the Annexes label and
 * list as two. Rich parts here are a single `<p>` of plain text.
 */
function expectedTexts(part: SwissLetterPart): string[] {
  switch (part.kind) {
    case 'sender':
      return [part.lines.join('\n')]
    case 'recipient':
      return [part.lines.map((line) => line.text).join('\n')]
    case 'opening':
    case 'body':
    case 'closing':
      return [part.html.replace(/<[^>]+>/g, '')]
    case 'annexes':
      return [part.label, part.text]
    default:
      return [part.text]
  }
}

describe('buildCoverLetterDocx: a valid Word file', () => {
  it('is a zip holding the parts Word needs', async () => {
    const buffer = await build(FULL_LETTER)
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK')
    const zip = await JSZip.loadAsync(buffer)
    for (const path of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml']) {
      expect(zip.file(path), path).not.toBeNull()
    }
  })

  it('is an A4 page with the FR-2 margins, in Georgia 11 pt, colour #1F2937', async () => {
    const { xml, styles } = await readDocx(await build(FULL_LETTER))
    expect(xml).toMatch(/<w:pgSz w:w="11906" w:h="16838"/)
    expect(xml).toMatch(/<w:pgMar w:top="1020" w:right="1134" w:bottom="850" w:left="1417"/)
    expect(styles).toContain('w:ascii="Georgia"')
    expect(styles).toMatch(/<w:docDefaults>[\s\S]*<w:sz w:val="22"\/>[\s\S]*<\/w:docDefaults>/)
    expect(styles).toMatch(/<w:docDefaults>[\s\S]*<w:color w:val="1F2937"\/>[\s\S]*<\/w:docDefaults>/)
  })

  it('sets every paragraph at least the 1.3 line height of 11 pt, 286 twips', async () => {
    const { paragraphs } = await readDocx(await build(FULL_LETTER))
    expect(LINE).toBe(286)
    for (const paragraph of paragraphs) {
      expect(paragraph.line, paragraph.text).toBe(286)
      expect(paragraph.lineRule, paragraph.text).toBe('atLeast')
    }
  })
})

describe('buildCoverLetterDocx: the parts of swissLetterParts, in order', () => {
  const SIMPLE_LETTER: CoverLetterPdfFields = {
    ...FULL_LETTER,
    opening_paragraph: '<p>Opening</p>',
    body_paragraphs: ['<p>Body one</p>', '<p>Body two</p>'],
    closing_paragraph: '<p>Closing</p>',
  }

  it('writes exactly the texts swissLetterParts gives, in its order', async () => {
    const { paragraphs } = await readDocx(await build(SIMPLE_LETTER))
    const parts = swissLetterParts(SIMPLE_LETTER, { senderDetails: storedDetails(SIMPLE_LETTER), date: CURRENT_DATE, language: 'en' })
    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual(parts.flatMap(expectedTexts))
  })

  it('writes sender; recipient; place and date; subject; greeting; opening; body; closing; sign-off; signature; annexes', async () => {
    const { paragraphs } = await readDocx(await build(FULL_LETTER))
    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual([
      'Zoë Müller\nAvenue de Rumine 7\n1003 Lausanne\n+41 21 555 01 42\nzoe.mueller@example.ch',
      'Jürgen Weiß\nLeiter Entwicklung\nGröße & Söhne AG\nBahnhofstraße 1\n8001 Zürich',
      `Lausanne, ${CURRENT_DATE}`,
      'Application for Ingénieur logiciel',
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
      'Enclosures',
      'Lebenslauf\nArbeitszeugnis Zürich',
    ])
  })

  it('prints the sender details the route resolved, the linked CV fallback included', async () => {
    const letter = { ...FULL_LETTER, sender_phone: null, sender_postal_locality: null }
    const senderDetails = effectiveSenderDetails(letter, { phone: '+41 44 555 01 99', location: '8001 Zürich' })
    const { paragraphs } = await readDocx(await build(letter, senderDetails))
    expect(paragraphs[0].text).toBe('Zoë Müller\nAvenue de Rumine 7\n8001 Zürich\n+41 44 555 01 99\nzoe.mueller@example.ch')
    expect(paragraphs[2].text).toBe(`Zürich, ${CURRENT_DATE}`)
  })

  it('makes only the subject bold, as the PDF does', async () => {
    const { paragraphs } = await readDocx(await build(SIMPLE_LETTER))
    const bold = paragraphs.filter((paragraph) => paragraph.runs.some((run) => run.bold))
    expect(bold.map((paragraph) => paragraph.text)).toEqual(['Application for Ingénieur logiciel'])
    expect(bold[0].runs.every((run) => run.bold)).toBe(true)
  })
})

describe('buildCoverLetterDocx: FR-2 positions', () => {
  // The window zone's bottom, six lines below its top: (50 − 18) mm + 6 × 286.
  const WINDOW_BOTTOM = 1815 + 6 * LINE
  const SENDER_LINES = 5

  it('puts the sender in the flow at the top margin, left, its right edge 5 mm left of the window', async () => {
    const { paragraphs } = await readDocx(await build(FULL_LETTER))
    const sender = paragraphs[0]
    expect(sender.text.split('\n')).toHaveLength(SENDER_LINES)
    expect(sender.framePr).toBeUndefined()
    expect(sender.spacingBefore).toBe(0)
    expect(sender.indentLeft).toBe(0)
    // 190 mm (10772) − 105 mm (5953): its right edge at 105 mm.
    expect(sender.indentRight).toBe(4819)
    expect(GEOMETRY.pageWidth - GEOMETRY.marginRight - sender.indentRight!).toBe(Math.round((105 * 1440) / 25.4))
  })

  it('places the recipient in a frame anchored to the page at 110 mm × 50 mm, 80 mm wide, never by spaces', async () => {
    const { paragraphs, xml } = await readDocx(await build(FULL_LETTER))
    const recipient = paragraphs[1]
    expect(recipient.text.startsWith('Jürgen Weiß')).toBe(true)
    const frame = recipient.framePr!
    expect(frame).toBeDefined()
    expect(frame).toContain(`w:x="${Math.round((110 * 1440) / 25.4)}"`)
    expect(frame).toContain('w:x="6236"')
    expect(frame).toContain(`w:y="${Math.round((50 * 1440) / 25.4)}"`)
    expect(frame).toContain('w:y="2835"')
    // min(85, 190 − 110) = 80 mm: 10772 − 6236.
    expect(frame).toContain('w:w="4536"')
    expect(frame).toContain('w:hAnchor="page"')
    expect(frame).toContain('w:vAnchor="page"')
    expect(frame).toContain('w:hRule="auto"')
    // The flow ignores the frame: with any other wrapping Word moves the next
    // paragraph below the frame and adds its space before on top.
    expect(frame).toContain('w:wrap="through"')
    expect(recipient.spacingBefore).toBe(0)
    expect(recipient.indentLeft).toBeUndefined()
    expect(recipient.runs.every((run) => !/^[ \t ]/.test(run.text))).toBe(true)
    expect(xml).not.toContain('<w:tab/>')
    expect(paragraphs.filter((paragraph) => paragraph.framePr !== undefined)).toHaveLength(1)
  })

  it('starts the place-and-date line at the left margin, one line below the six-line window zone', async () => {
    const { paragraphs } = await readDocx(await build(FULL_LETTER))
    const placeDate = byText(paragraphs, `Lausanne, ${CURRENT_DATE}`)
    // From the sender's last line down to the window bottom, then one line.
    expect(placeDate.spacingBefore).toBe(WINDOW_BOTTOM - SENDER_LINES * LINE + LINE)
    expect(placeDate.spacingBefore).toBe(2387)
    expect(placeDate.indentLeft).toBeUndefined()
    expect(placeDate.framePr).toBeUndefined()
  })

  it('starts it one line below a recipient block longer than the window zone', async () => {
    const { paragraphs } = await readDocx(
      await build({ ...FULL_LETTER, company_address: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5' }),
    )
    expect(paragraphs[1].text.split('\n')).toHaveLength(8)
    expect(byText(paragraphs, `Lausanne, ${CURRENT_DATE}`).spacingBefore).toBe(1815 + 8 * LINE - SENDER_LINES * LINE + LINE)
  })

  it('without a recipient block, starts it one line below the window zone all the same', async () => {
    const { paragraphs } = await readDocx(
      await build({ ...FULL_LETTER, recipient_name: null, recipient_title: null, company_name: null, company_address: null }),
    )
    expect(paragraphs[1].text).toBe(`Lausanne, ${CURRENT_DATE}`)
    expect(paragraphs[1].spacingBefore).toBe(WINDOW_BOTTOM - SENDER_LINES * LINE + LINE)
  })

  it('without a sender block, places the recipient in the window zone as the first paragraph, by space before and indent', async () => {
    const letter = {
      ...FULL_LETTER,
      sender_name: '',
      sender_street: null,
      sender_postal_locality: null,
      sender_phone: null,
      sender_email: null,
    }
    const { paragraphs } = await readDocx(await build(letter))
    // Word drops the space before of a paragraph following a frame at the top
    // of the page, but keeps the document's first paragraph's.
    expect(paragraphs.some((paragraph) => paragraph.framePr !== undefined)).toBe(false)
    const recipient = paragraphs[0]
    expect(recipient.text.startsWith('Jürgen Weiß')).toBe(true)
    // 50 mm (2835) − the 18 mm top margin (1020); 110 mm (6236) − the 25 mm left margin (1417).
    expect(recipient.spacingBefore).toBe(GEOMETRY.windowTop)
    expect(GEOMETRY.marginTop + recipient.spacingBefore!).toBe(2835)
    expect(recipient.indentLeft).toBe(4819)
    expect(GEOMETRY.marginLeft + recipient.indentLeft!).toBe(6236)
    expect(recipient.indentRight).toBe(0)
    // The recipient block has 5 lines: one more to the window bottom, then one line.
    expect(byText(paragraphs, CURRENT_DATE).spacingBefore).toBe((6 - 5) * LINE + LINE)
  })

  it('spaces the flow parts by SWISS_LETTER_SPACE_BEFORE_LINES, as the PDF margin-top', async () => {
    const { paragraphs } = await readDocx(await build(FULL_LETTER))
    const before = (text: string) => byText(paragraphs, text).spacingBefore
    expect(before('Application for Ingénieur logiciel')).toBe(2 * LINE)
    expect(before('Sehr geehrter Herr Weiß,')).toBe(LINE)
    expect(before('Je postule avec conviction et un réel intérêt – « vraiment ».')).toBe(LINE)
    expect(before('Corps un : l’équipe.')).toBe(LINE)
    expect(before('Merci de votre attention.')).toBe(LINE)
    expect(before('Mit freundlichen Grüßen,')).toBe(LINE)
    // The handwritten signature's space: 2.5 lines.
    expect(paragraphs[paragraphs.length - 3].spacingBefore).toBe(Math.round(2.5 * LINE))
    expect(before('Enclosures')).toBe(LINE)
    expect(before('Lebenslauf\nArbeitszeugnis Zürich')).toBe(0)
    for (const paragraph of paragraphs) expect(paragraph.spacingAfter, paragraph.text).toBe(0)
  })
})

describe('buildCoverLetterDocx: the Annexes block', () => {
  it('is last: its label, then the list with its own line breaks', async () => {
    const { paragraphs } = await readDocx(await build({ ...FULL_LETTER, annexes: '  Lebenslauf \n\n Diplome  ' }))
    expect(paragraphs.slice(-2).map((paragraph) => paragraph.text)).toEqual(['Enclosures', 'Lebenslauf\n\nDiplome'])
  })

  it('prints the default list in the letter language when never set (null)', async () => {
    const { paragraphs } = await readDocx(await build({ ...FULL_LETTER, annexes: null }))
    expect(paragraphs.slice(-2).map((paragraph) => paragraph.text)).toEqual(['Enclosures', 'CV, references, diplomas'])
  })

  it("prints no Annexes block when cleared on purpose ('')", async () => {
    const { paragraphs } = await readDocx(await build({ ...FULL_LETTER, annexes: '' }))
    expect(paragraphs.map((paragraph) => paragraph.text)).not.toContain('Enclosures')
    expect(paragraphs[paragraphs.length - 1].text).toBe('Zoë Müller')
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

  it('left-aligns rich text, as the PDF does, unless the text asks otherwise', async () => {
    const { paragraphs } = await readDocx(
      await build({ ...FULL_LETTER, closing_paragraph: '<p style="text-align: justify">Justified</p><p style="text-align: center">Centered</p>' }),
    )
    expect(byText(paragraphs, 'Corps trois').alignment).toBe('left')
    expect(byText(paragraphs, 'Justified').alignment).toBe('both')
    expect(byText(paragraphs, 'Centered').alignment).toBe('center')
  })

  it('writes lists as Word lists: a numbered list and a bulleted one, each its own', async () => {
    const { paragraphs, numbering } = await readDocx(await build(FULL_LETTER))
    const first = byText(paragraphs, 'Première raison')
    const second = byText(paragraphs, 'Deuxième raison')
    const bullet = byText(paragraphs, 'Puce')
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

  it("spaces a list by the print stylesheet's 0.5rem (120 twips), nested lists included", async () => {
    const { paragraphs } = await readDocx(await build(FULL_LETTER))
    expect(byText(paragraphs, 'Première raison').spacingBefore).toBe(120)
    expect(byText(paragraphs, 'Deuxième raison').spacingBefore).toBe(0)
    expect(byText(paragraphs, 'Puce').spacingBefore).toBe(120)
    expect(byText(paragraphs, 'Corps trois').spacingBefore).toBe(LINE)

    const nested = await readDocx(
      await build({ ...FULL_LETTER, opening_paragraph: '<p>Intro</p><ul><li>Parent<ul><li>Child</li></ul></li><li>Next</li></ul><p>After</p>' }),
    )
    expect(byText(nested.paragraphs, 'Parent').spacingBefore).toBe(120)
    expect(byText(nested.paragraphs, 'Child').spacingBefore).toBe(120)
    expect(byText(nested.paragraphs, 'Next').spacingBefore).toBe(120)
    expect(byText(nested.paragraphs, 'After').spacingBefore).toBe(120)
  })

  it('restarts each numbered list at 1', async () => {
    const { paragraphs, numbering } = await readDocx(
      await build({
        ...FULL_LETTER,
        opening_paragraph: '<ol><li>A1</li><li>A2</li></ol>',
        body_paragraphs: ['<ol><li>B1</li></ol>'],
      }),
    )
    const a = byText(paragraphs, 'A1').numId!
    const b = byText(paragraphs, 'B1').numId!
    expect(a).not.toBe(b)
    for (const numId of [a, b]) {
      expect(numbering).toMatch(new RegExp(`<w:num w:numId="${numId}">[\\s\\S]*?<w:startOverride w:val="1"/>`))
    }
  })

  it('writes a nested list one level deeper', async () => {
    const { paragraphs } = await readDocx(
      await build({ ...FULL_LETTER, opening_paragraph: '<ul><li>Parent<ul><li>Child</li></ul></li></ul>' }),
    )
    expect(byText(paragraphs, 'Parent').level).toBe('0')
    expect(byText(paragraphs, 'Child').level).toBe('1')
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
  it('keeps the Unicode of the new fields exactly: Zürich, 1003 Lausanne, +41 21 555 01 42, and a user ß', async () => {
    const letter = { ...FULL_LETTER, sender_street: 'Weißstrasse 5', sender_postal_locality: '8001 Zürich' }
    const { paragraphs, xml } = await readDocx(await build(letter))
    expect(paragraphs[0].text).toBe('Zoë Müller\nWeißstrasse 5\n8001 Zürich\n+41 21 555 01 42\nzoe.mueller@example.ch')
    expect(paragraphs[2].text).toBe(`Zürich, ${CURRENT_DATE}`)
    for (const text of ['Zürich', '+41 21 555 01 42', 'Weißstrasse 5', 'Arbeitszeugnis Zürich']) expect(xml).toContain(text)

    const lausanne = await readDocx(await build(FULL_LETTER))
    expect(lausanne.xml).toContain('>1003 Lausanne<')
  })

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
      await build({
        ...FULL_LETTER,
        sender_name: 'Ada\u0001\u0008 Lovelace￿',
        sender_street: 'Rue\u0002 7',
        annexes: 'CV\u0003\nDiplômes',
        closing_paragraph: '<p>Lone \uD800 surrogate</p>',
      }),
    )
    expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/)
    expect(paragraphs[0].text.split('\n').slice(0, 2)).toEqual(['Ada Lovelace', 'Rue 7'])
    expect(paragraphs.map((paragraph) => paragraph.text)).toContain('Lone surrogate')
    expect(paragraphs[paragraphs.length - 1].text).toBe('CV\nDiplômes')
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

  it('clamps an absurd inline size for the run, so every value is a finite integer and the line stays at least 286', async () => {
    const { xml } = await readDocx(
      await build({
        ...FULL_LETTER,
        opening_paragraph: `<p><span style="font-size: ${'9'.repeat(300)}px">huge</span></p>`,
        closing_paragraph: '<p><span style="font-size: 0.0001px">tiny</span></p>',
      }),
    )
    const values = [...xml.matchAll(/w:(?:line|val|after|before|sz)="([^"]*)"/g)].map((match) => match[1])
    const numeric = values.filter((value) => /^[-+\d.eE]+$/.test(value))
    expect(numeric.length).toBeGreaterThan(0)
    for (const value of numeric) expect(value, value).toMatch(/^\d+$/)
    const sizes = [...xml.matchAll(/<w:sz w:val="(\d+)"\/>/g)].map((match) => Number(match[1]))
    expect(Math.max(...sizes)).toBe(3276)
    expect(Math.min(...sizes)).toBe(2)
    const lines = new Set([...xml.matchAll(/w:line="(\d+)"/g)].map((match) => Number(match[1])))
    expect([...lines]).toEqual([LINE])
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
        sender_street: '   ',
        sender_postal_locality: null,
        sender_phone: null,
        sender_email: '',
        recipient_name: null,
        recipient_title: 'Head of Talent',
        company_name: null,
        company_address: null,
        job_title: '',
        greeting: 'Hello,',
        opening_paragraph: '<p> </p>',
        body_paragraphs: ['', '<div><br></div>', '<p>Only body</p>', 42, null] as unknown as CoverLetterPdfFields['body_paragraphs'],
        closing_paragraph: null,
        sign_off: 'Bye,',
        annexes: '',
      }),
    )
    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual(['Head of Talent', CURRENT_DATE, 'Hello,', 'Only body', 'Bye,'])
  })

  it("writes the language's defaults for an empty greeting and sign-off", async () => {
    const { paragraphs } = await readDocx(await build({ ...FULL_LETTER, greeting: '', sign_off: '' }))
    const texts = paragraphs.map((paragraph) => paragraph.text)
    expect(texts).toContain('Dear Hiring Manager,')
    expect(texts).toContain('Kind regards')
  })

  it('collapses whitespace in plain parts as the PDF does, but keeps the address lines', async () => {
    const { paragraphs } = await readDocx(
      await build({ ...FULL_LETTER, greeting: '  Dear \n  team,  ', company_address: '  Street 1 \n\n  City  ' }),
    )
    const texts = paragraphs.map((paragraph) => paragraph.text)
    expect(texts).toContain('Dear team,')
    expect(paragraphs[1].text).toBe('Jürgen Weiß\nLeiter Entwicklung\nGröße & Söhne AG\nStreet 1\n\nCity')
  })
})
