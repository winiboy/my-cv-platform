'use client'

import type { ReactNode } from 'react'
import type {
  Resume,
  ResumeExperience,
  ResumeEducation,
  ResumeSkillCategory,
  ResumeLanguage,
  ResumeCertification,
} from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { visibleContactDetails, type ContactFieldId } from '@/lib/contact-visibility'
import { renderFormattedText } from '@/lib/format-text'
import { PAGE_WIDTH_CSS } from '@/lib/resume-page-size'
import { SWISS_FINANCE_LINE_HEIGHT } from '@/lib/resume-line-height'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { DEFAULT_RESUME_LAYOUT, type EditorMainId, type EditorSidebarId } from '@/lib/layout-settings'
import {
  formatSwissDateRange,
  formatSwissMonth,
  swissContactEntries,
  swissHeading,
  swissHasText,
  swissLanguageLevel,
} from '@/lib/swiss-vocational-template'
import {
  SWISS_FINANCE_CONTACT_SEPARATOR,
  SWISS_FINANCE_GEOMETRY as GEOMETRY,
  SWISS_FINANCE_LABEL_MAX_PX,
  SWISS_FINANCE_LABEL_TRACK,
  SWISS_FINANCE_SIZES as SIZES,
  swissFinanceFirstLine,
  swissFinanceLanguagesLine,
  swissFinanceSections,
  swissFinanceSkillContent,
  swissFinanceSkillsHeading,
  type SwissFinanceSectionId,
} from '@/lib/swiss-finance-template'

const LINE_HEIGHT = SWISS_FINANCE_LINE_HEIGHT

const TRACKING = PREVIEW_TRACKING.swissFinance

/**
 * The word separator a text ends with where another text continues on the same
 * line, so the PDF's text layer does not run the two together. One
 * interpolated string with the text it follows, never a child of its own: see
 * `COLUMN_BREAK` in `swiss-vocational-template.tsx` for what was measured.
 */
const COLUMN_BREAK = ' '

interface SwissFinanceTemplateProps {
  resume: Resume
  /**
   * Passed by every caller like any template's, and not read: every word this
   * template draws comes from `dict`, and its months are printed `MM.YYYY` in
   * every locale.
   */
  locale: Locale
  /** The `common` dictionary: headings, dates and level names are read from it. */
  dict: unknown
  /** Main sections hidden through the layout model, in the editor's vocabulary. */
  hiddenMainSections?: readonly EditorMainId[]
  /** Sidebar sections hidden through the layout model: this template draws certifications, skills and languages from them. */
  hiddenSidebarSections?: readonly EditorSidebarId[]
  /** Contact details the owner hid (FR-14), the photo among them; drawn through `visibleContactDetails`. */
  hiddenContactFields?: readonly ContactFieldId[]
  /**
   * The browser-local photo, drawn rectangular at the right of the header when
   * present and not hidden. It is uploaded from the Editor's Contact tab; the
   * CV draws no upload affordance and no empty frame (FR-5).
   */
  photoUrl?: string
}

/**
 * "Banque, finance & assurance": one column on white, in a serif, with a dark
 * green accent. The name in spaced capitals, the CV title in green italics and
 * one line of contact details, a small rectangular photo at the right, and a
 * double green rule under it all; then summary, experience, education and
 * certifications under green spaced-capital headings ruled in grey, each dated
 * entry with its dates right-aligned in grey italics; then skills and
 * languages as the rows of one two-column table.
 *
 * Sizes, geometry, section sequence and joined text come from
 * `@/lib/swiss-finance-template`; dates, headings, contact entries and level
 * names from `@/lib/swiss-vocational-template`. `docx-swiss-finance.ts` reads
 * the same. It draws its own typeface — Tailwind's `font-serif` stack, whose
 * first face a reader is given is Georgia, as classic's headings — at its own
 * sizes, whatever font and font scale the layout model stores (FR-4): it takes
 * neither.
 */
export function SwissFinanceTemplate({
  resume,
  dict,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  hiddenContactFields,
  photoUrl,
}: SwissFinanceTemplateProps) {
  const size = SIZES

  const { contact, title, photoVisible } = visibleContactDetails(resume, hiddenContactFields)
  const photo = photoVisible ? photoUrl : undefined
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).filter((exp) => exp.visible !== false)
  const education = ((resume.education as unknown as ResumeEducation[]) || []).filter((edu) => edu.visible !== false)
  const certifications = ((resume.certifications as unknown as ResumeCertification[]) || []).flatMap((cert) => {
    if (cert.visible === false) return []
    const line = swissFinanceFirstLine([cert.name, cert.issuer])
    const date = cert.date ? formatSwissMonth(cert.date) : ''
    return line.lead || date ? [{ line, date }] : []
  })
  // A row whose content is empty draws nothing, so it is not a row (FR-2).
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissFinanceSkillContent(skill)
    return content ? [{ category: skill.category?.trim() ?? '', content }] : []
  })
  const languages = ((resume.languages as unknown as ResumeLanguage[]) || []).flatMap((lang) => {
    const language = lang.visible === false ? '' : (lang.language?.trim() ?? '')
    return language ? [{ language, level: swissLanguageLevel(dict, lang.level) }] : []
  })

  const contactLine = swissContactEntries(contact, dict)
    .map((entry) => entry.value)
    .join(SWISS_FINANCE_CONTACT_SEPARATOR)
  const sections = swissFinanceSections(hiddenMainSections, hiddenSidebarSections)

  /** A section heading: green spaced capitals over a thin grey rule. */
  const heading = (label: string) => (
    <h2
      className="break-words font-normal uppercase"
      style={{
        color: '#166534',
        fontSize: `${size.heading}px`,
        lineHeight: LINE_HEIGHT.compact,
        letterSpacing: `${TRACKING.heading}em`,
        paddingBottom: `${GEOMETRY.headingRuleGap}px`,
        borderBottomWidth: `${GEOMETRY.headingRule}px`,
        borderBottomStyle: 'solid',
        borderBottomColor: '#cbd5e1',
        marginBottom: `${GEOMETRY.headingGap}px`,
      }}
    >
      {label}
    </h2>
  )

  /**
   * A dated entry: its first line — the bold lead, then the rest of the line —
   * with its dates right-aligned in grey italics in the right column, then
   * whatever it draws below. Kept on one page when it fits.
   */
  const datedEntry = (key: number, line: { lead: string; rest: string }, dates: string, below: ReactNode) => (
    <div
      key={key}
      className="break-inside-avoid"
      style={{
        marginTop: key === 0 ? 0 : `${GEOMETRY.entryGap}px`,
        fontSize: `${size.body}px`,
        lineHeight: LINE_HEIGHT.text,
      }}
    >
      <div className="grid" style={{ gridTemplateColumns: `minmax(0, 1fr) ${GEOMETRY.dateColumn}px` }}>
        <p className="min-w-0 break-words">
          {line.lead && (
            <span className="font-bold" style={{ color: '#0f172a' }}>
              {line.rest ? line.lead : `${line.lead}${COLUMN_BREAK}`}
            </span>
          )}
          {line.rest && <span style={{ color: '#1e293b' }}>{`${line.rest}${COLUMN_BREAK}`}</span>}
        </p>
        {/* Never wrapped: the column holds the widest date in every locale
            (swiss-finance-template.test.ts measures it). */}
        <p
          className="whitespace-nowrap text-right italic"
          style={{ color: '#475569', fontSize: `${size.date}px`, paddingLeft: `${GEOMETRY.dateGap}px` }}
        >
          {dates}
        </p>
      </div>
      {below}
    </div>
  )

  /**
   * A section of entries whose heading never ends a printed page alone: the
   * heading and the first entry are kept together, and each further entry
   * breaks as an entry does.
   */
  const entrySection = (label: string, entries: ReactNode[]) => (
    <section>
      <div className="break-inside-avoid">
        {heading(label)}
        {entries[0]}
      </div>
      {entries.slice(1)}
    </section>
  )

  /** An entry's details: its achievements as bullets, or else its description. */
  const details = (achievements: readonly string[], description: string | undefined): ReactNode =>
    achievements.length > 0 ? (
      <ul
        className="list-disc"
        style={{ color: '#1e293b', marginTop: `${GEOMETRY.detailGap}px`, paddingLeft: `${GEOMETRY.bulletIndent}px` }}
      >
        {achievements.map((achievement, i) => (
          <li key={i}>{renderFormattedText(achievement, { justify: false })}</li>
        ))}
      </ul>
    ) : swissHasText(description) ? (
      <div style={{ color: '#1e293b', marginTop: `${GEOMETRY.detailGap}px` }}>
        {renderFormattedText(description, { justify: false })}
      </div>
    ) : null

  const skillsDrawn = sections.includes('skills') && skills.length > 0
  const languagesDrawn = sections.includes('languages') && languages.length > 0
  // Skills and languages are one table under one heading, drawn where the
  // first of the two sections falls in the sequence.
  const tableSection: SwissFinanceSectionId = sections.includes('skills') ? 'skills' : 'languages'

  /**
   * One row of the skills and languages table: a bold label, and its value
   * beside it. Both are cells of the table's one grid, so every label shares
   * the column `SWISS_FINANCE_LABEL_TRACK` sizes to the widest of them.
   */
  const tableRow = (key: string, label: string, value: ReactNode) => [
    // A label wraps at a space only when it is wider than the column's cap, and
    // the column holds its widest word. Its max width bounds the column, so the
    // values keep their room; `break-word` (not `anywhere`, which would shrink
    // the column below a word that fits) breaks a word only when it is wider
    // than that bound, where no column could hold it. Set here, whatever
    // ancestor styles say.
    <p
      key={`${key}-label`}
      className="break-inside-avoid font-bold"
      style={{
        color: '#0f172a',
        maxWidth: `${SWISS_FINANCE_LABEL_MAX_PX}px`,
        overflowWrap: 'break-word',
        wordBreak: 'normal',
      }}
    >
      {label && `${label}${COLUMN_BREAK}`}
    </p>,
    <div key={`${key}-value`} className="min-w-0 break-inside-avoid break-words" style={{ color: '#1e293b' }}>
      {value}
    </div>,
  ]

  const skillsTable = (): ReactNode => {
    const cells: ReactNode[] = []
    if (skillsDrawn) {
      skills.forEach((skill, index) => {
        cells.push(
          ...tableRow(
            `skill-${index}`,
            skill.category,
            skill.content.kind === 'text' ? <p>{skill.content.text}</p> : renderFormattedText(skill.content.html, { justify: false }),
          ),
        )
      })
    }
    if (languagesDrawn) {
      cells.push(...tableRow('languages', swissHeading(dict, 'languages'), <p>{swissFinanceLanguagesLine(languages)}</p>))
    }
    return (
      <section className="break-inside-avoid">
        {heading(swissFinanceSkillsHeading(swissHeading(dict, 'skills'), swissHeading(dict, 'languages'), skillsDrawn, languagesDrawn))}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${SWISS_FINANCE_LABEL_TRACK} minmax(0, 1fr)`,
            columnGap: `${GEOMETRY.labelGap}px`,
            rowGap: `${GEOMETRY.rowGap}px`,
            fontSize: `${size.body}px`,
            lineHeight: LINE_HEIGHT.text,
          }}
        >
          {cells}
        </div>
      </section>
    )
  }

  const renderSection = (sectionId: SwissFinanceSectionId): ReactNode => {
    switch (sectionId) {
      case 'summary': {
        if (!swissHasText(resume.summary)) return null
        return (
          <section className="break-inside-avoid">
            {heading(swissHeading(dict, 'summary'))}
            <div style={{ color: '#1e293b', fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
              {renderFormattedText(resume.summary, { justify: false })}
            </div>
          </section>
        )
      }

      case 'experience': {
        if (experiences.length === 0) return null
        return entrySection(
          swissHeading(dict, 'experience'),
          experiences.map((exp, index) =>
            datedEntry(
              index,
              // The position in bold, then employer and place; the employer in
              // bold when there is no position (FR-2).
              swissFinanceFirstLine([exp.position, exp.company, exp.location]),
              formatSwissDateRange(exp.startDate, exp.endDate, exp.current, dict),
              details((exp.achievements ?? []).filter(swissHasText), exp.description),
            ),
          ),
        )
      }

      case 'education': {
        if (education.length === 0) return null
        return entrySection(
          swissHeading(dict, 'education'),
          education.map((edu, index) => {
            // The degree in bold, the school on the next line in grey; the
            // school as the bold line when there is no degree, and no empty
            // line for a value that is not stored (FR-2).
            const degree = edu.degree?.trim() ?? ''
            const school = [edu.school?.trim(), edu.field?.trim()].filter(Boolean).join(', ')
            return datedEntry(
              index,
              { lead: degree || school, rest: '' },
              formatSwissDateRange(edu.startDate, edu.endDate, false, dict),
              <>
                {degree && school && <p style={{ color: '#475569' }}>{school}</p>}
                {details([], edu.description)}
              </>,
            )
          }),
        )
      }

      case 'training': {
        if (certifications.length === 0) return null
        return entrySection(
          swissHeading(dict, 'training'),
          certifications.map(({ line, date }, index) => datedEntry(index, line, date, null)),
        )
      }

      case 'skills':
      case 'languages': {
        if (sectionId !== tableSection || (!skillsDrawn && !languagesDrawn)) return null
        return skillsTable()
      }
    }
  }

  // An empty section draws nothing at all, its heading included (FR-2).
  const drawn = sections.flatMap((sectionId) => {
    const content = renderSection(sectionId)
    return content === null ? [] : [{ sectionId, content }]
  })
  const hasHeader = Boolean(photo || contact.name || title || contactLine)

  return (
    <div
      data-testid="resume-document"
      className="swiss-finance-template relative mx-auto bg-white font-serif shadow-lg print:shadow-none"
      style={{
        width: PAGE_WIDTH_CSS,
        padding: `${GEOMETRY.paddingTop}px ${GEOMETRY.paddingX}px ${GEOMETRY.paddingBottom}px`,
      }}
    >
      {hasHeader && (
        <header
          className="flex items-center"
          style={{
            columnGap: `${GEOMETRY.photoGap}px`,
            paddingBottom: `${GEOMETRY.headerRuleGap}px`,
            borderBottomWidth: `${GEOMETRY.headerRule}px`,
            borderBottomStyle: 'double',
            borderBottomColor: '#166534',
          }}
        >
          <div className="min-w-0 flex-1">
            {contact.name && (
              <h1
                className="break-words font-normal uppercase tracking-widest"
                style={{ color: '#0f172a', fontSize: `${size.name}px`, lineHeight: LINE_HEIGHT.name }}
              >
                {contact.name}
              </h1>
            )}
            {title && (
              <p
                className="break-words italic"
                style={{
                  color: '#166534',
                  fontSize: `${size.title}px`,
                  lineHeight: LINE_HEIGHT.compact,
                  marginTop: contact.name ? `${GEOMETRY.nameGap}px` : 0,
                }}
              >
                {title}
              </p>
            )}
            {contactLine && (
              <p
                className="break-words"
                style={{
                  color: '#475569',
                  fontSize: `${size.contact}px`,
                  lineHeight: LINE_HEIGHT.compact,
                  marginTop: contact.name || title ? `${GEOMETRY.titleGap}px` : 0,
                }}
              >
                {contactLine}
              </p>
            )}
          </div>

          {photo && (
            <div
              className="swiss-finance-photo shrink-0 overflow-hidden"
              style={{
                width: `${GEOMETRY.photoWidth}px`,
                height: `${GEOMETRY.photoHeight}px`,
                borderWidth: `${GEOMETRY.photoBorder}px`,
                borderStyle: 'solid',
                borderColor: '#cbd5e1',
                backgroundColor: '#f8fafc',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a browser-local data URL, which next/image cannot optimise */}
              <img src={photo} alt="" className="h-full w-full object-cover" />
            </div>
          )}
        </header>
      )}

      {drawn.map(({ sectionId, content }, index) => (
        <div
          key={sectionId}
          style={{ marginTop: index === 0 ? (hasHeader ? `${GEOMETRY.headerGap}px` : 0) : `${GEOMETRY.sectionGap}px` }}
        >
          {content}
        </div>
      ))}
    </div>
  )
}
