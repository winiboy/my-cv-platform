'use client'

import { Fragment, type ReactNode } from 'react'
import type {
  Resume,
  ResumeExperience,
  ResumeEducation,
  ResumeSkillCategory,
  ResumeLanguage,
  ResumeCertification,
  ResumeProject,
} from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { visibleContactDetails, type ContactFieldId } from '@/lib/contact-visibility'
import { renderFormattedText } from '@/lib/format-text'
import { PAGE_WIDTH_CSS } from '@/lib/resume-page-size'
import { SWISS_ACADEMIC_LINE_HEIGHT } from '@/lib/resume-line-height'
import { DEFAULT_RESUME_LAYOUT, type EditorMainId, type EditorSidebarId } from '@/lib/layout-settings'
import { formatSwissMonth, swissHeading, swissHasText, swissLanguageLevel } from '@/lib/swiss-vocational-template'
import { swissEngineeringProject } from '@/lib/swiss-engineering-template'
import { swissFinanceSkillContent } from '@/lib/swiss-finance-template'
import { SWISS_IT_CONTACT_DOT, swissItDates, swissItLinkParts } from '@/lib/swiss-it-template'
import {
  SWISS_ACADEMIC_GEOMETRY as GEOMETRY,
  SWISS_ACADEMIC_SIZES as SIZES,
  swissAcademicContactValues,
  swissAcademicDate,
  swissAcademicDateColumnPx,
  swissAcademicEntryLine,
  swissAcademicLanguagesText,
  swissAcademicLastHeading,
  swissAcademicSkillLabel,
  swissAcademicVisibility,
  type SwissAcademicSectionId,
} from '@/lib/swiss-academic-template'

const LINE_HEIGHT = SWISS_ACADEMIC_LINE_HEIGHT

/**
 * The word separator a text ends with where another text continues on the same
 * line or in the next box, so the PDF's text layer does not run the two
 * together. One interpolated string with the text it follows, never a child of
 * its own: see `COLUMN_BREAK` in `swiss-vocational-template.tsx` for what was
 * measured.
 */
const COLUMN_BREAK = '\u00A0'

/**
 * How the page wraps text: at spaces only, a word never cut (the owner's rule,
 * every locale). `break-word` breaks a word only as a last resort, when that
 * single word is wider than the whole line it is on; set once, on the
 * document, so nothing below it adds a rule.
 *
 * A contact value is a flex item of a wrapping row, so the line breaks between
 * two values and moves one that does not fit to the next line whole; a contact
 * value and a project's link carry a `<wbr>` at each of their boundaries
 * (`linkText`), so one wider than its line wraps after a "/" or before a ".",
 * never at an arbitrary letter. A date is never wrapped (`whitespace-nowrap`),
 * in a column as wide as the CV's widest date (`swissAcademicDateColumnPx`).
 */

interface SwissAcademicTemplateProps {
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
  /** Sidebar sections hidden through the layout model: this template draws the projects, certifications, skills and languages from them. */
  hiddenSidebarSections?: readonly EditorSidebarId[]
  /** Contact details the owner hid (FR-14); drawn through `visibleContactDetails`. */
  hiddenContactFields?: readonly ContactFieldId[]
}

/**
 * "Académique & recherche": one serif column with no photo, even when the CV
 * has one (the PRD's FR-5 exception): the name in bold, the CV title and the
 * contact line in grey; then the summary, education, experience, the projects
 * as numbered "Publications and projects", the certifications as
 * "Distinctions", and one last section for the skills and the languages.
 * Headings are letter-spaced small capitals over a thin rule; dated entries
 * put their dates in a left column as wide as the widest date.
 *
 * It takes no photo: the Preview hands it none, and `TEMPLATE_DRAWS_PHOTO`
 * keeps the Contact tab's photo row, and its tick, off for it (FR-3).
 *
 * Sizes, geometry, section sequence, date column and joined text come from
 * `@/lib/swiss-academic-template`; dates, headings and level names from the
 * shared Swiss helpers. `docx-swiss-academic.ts` reads the same. It draws
 * Tailwind's `font-serif` stack (Georgia) at its own sizes, whatever font and
 * font scale the layout model stores (FR-4): it takes neither.
 */
export function SwissAcademicTemplate({
  resume,
  dict,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  hiddenContactFields,
}: SwissAcademicTemplateProps) {
  const size = SIZES

  const { contact, title } = visibleContactDetails(resume, hiddenContactFields)
  // An entry that stores nothing the template draws is not an entry (FR-2).
  const education = ((resume.education as unknown as ResumeEducation[]) || []).flatMap((edu) => {
    if (edu.visible === false) return []
    const line = swissAcademicEntryLine(edu.degree, [edu.school])
    const field = edu.field?.trim() ?? ''
    const dates = swissAcademicDate(swissItDates(edu.startDate, edu.endDate, false, dict))
    const description = swissHasText(edu.description) ? edu.description : null
    return line.lead || line.rest || field || dates || description ? [{ ...line, field, dates, description }] : []
  })
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).flatMap((exp) => {
    if (exp.visible === false) return []
    const line = swissAcademicEntryLine(exp.position, [exp.company, exp.location])
    const dates = swissAcademicDate(swissItDates(exp.startDate, exp.endDate, exp.current, dict))
    const achievements = (exp.achievements ?? []).filter(swissHasText)
    const description = achievements.length === 0 && swissHasText(exp.description) ? exp.description : null
    return line.lead || line.rest || dates || achievements.length > 0 || description ? [{ ...line, dates, achievements, description }] : []
  })
  const projects = ((resume.projects as unknown as ResumeProject[]) || []).flatMap((project) => {
    const drawn = project.visible === false ? null : swissEngineeringProject(project)
    return drawn ? [drawn] : []
  })
  const distinctions = ((resume.certifications as unknown as ResumeCertification[]) || []).flatMap((cert) => {
    if (cert.visible === false) return []
    const line = swissAcademicEntryLine(cert.name, [cert.issuer])
    const dates = cert.date?.trim() ? swissAcademicDate(formatSwissMonth(cert.date)) : ''
    return line.lead || line.rest || dates ? [{ ...line, dates }] : []
  })
  const visibility = swissAcademicVisibility(hiddenMainSections, hiddenSidebarSections)
  const skills = visibility.skills
    ? ((resume.skills as unknown as ResumeSkillCategory[]) || []).flatMap((skill) => {
        const content = skill.visible === false ? null : swissFinanceSkillContent(skill)
        return content ? [{ category: skill.category?.trim() ?? '', content }] : []
      })
    : []
  const languages = visibility.languages
    ? ((resume.languages as unknown as ResumeLanguage[]) || []).flatMap((lang) =>
        lang.visible !== false && lang.language?.trim() ? [{ language: lang.language, level: swissLanguageLevel(dict, lang.level) }] : [],
      )
    : []

  const sectionShown = (sectionId: SwissAcademicSectionId) => visibility.sections.includes(sectionId)
  // One date column for the whole page, as wide as the widest date it draws.
  const dateColumn = swissAcademicDateColumnPx([
    ...(sectionShown('education') ? education.map((edu) => edu.dates) : []),
    ...(sectionShown('experience') ? experiences.map((exp) => exp.dates) : []),
    ...(sectionShown('training') ? distinctions.map((cert) => cert.dates) : []),
  ])
  const contactValues = swissAcademicContactValues(contact)
  const hasHeader = Boolean(contact.name || title || contactValues.length > 0)
  /** Whether a contact value is the email address, its separator aside. */
  const isEmail = (value: string) =>
    Boolean(contact.email?.trim()) &&
    (value.endsWith(SWISS_IT_CONTACT_DOT) ? value.slice(0, -SWISS_IT_CONTACT_DOT.length) : value) === contact.email?.trim()

  /**
   * A link or a contact value, with a `<wbr>` at each place it may wrap
   * (`swissItLinkParts`), so one wider than its line wraps after a "/" or
   * before a "." rather than at an arbitrary letter. `suffix` ends the last
   * part's own text node, as `COLUMN_BREAK` must. An email address gets none,
   * as in Word: it is drawn whole.
   */
  const linkText = (text: string, suffix = '', breakable = true) =>
    (breakable ? swissItLinkParts(text) : [text]).map((part, index, parts) => (
      <Fragment key={index}>
        {index > 0 && <wbr />}
        {index === parts.length - 1 ? `${part}${suffix}` : part}
      </Fragment>
    ))

  /** A section heading: letter-spaced small capitals over a thin rule. */
  const heading = (label: string) => (
    <h2
      className="font-bold tracking-widest"
      style={{
        color: '#0f172a',
        fontVariant: 'small-caps',
        fontSize: `${size.heading}px`,
        lineHeight: LINE_HEIGHT.compact,
        borderBottomWidth: `${GEOMETRY.headingRule}px`,
        borderBottomStyle: 'solid',
        borderBottomColor: '#94a3b8',
        paddingBottom: `${GEOMETRY.headingRuleGap}px`,
        marginBottom: `${GEOMETRY.headingGap}px`,
      }}
    >
      {label}
    </h2>
  )

  /** Rich text in the body colour (FR-9), ragged-right. */
  const richText = (text: string, marginTop = 0) => (
    <div style={{ color: '#1e293b', marginTop: `${marginTop}px` }}>{renderFormattedText(text, { justify: false })}</div>
  )

  /** An entry's line: its lead (bold when `bold`), then " — " and its place. */
  const entryLine = (lead: string, rest: string, bold: boolean) =>
    lead || rest ? (
      <p style={{ color: '#1e293b' }}>
        {bold ? (
          <>
            {lead && <strong style={{ color: '#0f172a' }}>{lead}</strong>}
            {rest}
          </>
        ) : (
          // One text node: the line reads as one run in Word too.
          `${lead}${rest}`
        )}
      </p>
    ) : null

  /** A dated entry: its dates in the left column, never wrapped, its content beside them. */
  const datedEntry = (key: number, dates: string, content: ReactNode) => (
    <div
      key={key}
      className="grid break-inside-avoid"
      style={{
        gridTemplateColumns: `${dateColumn}px minmax(0, 1fr)`,
        // No date anywhere: no column and no gap.
        columnGap: dateColumn > 0 ? `${GEOMETRY.dateGap}px` : 0,
        marginTop: key === 0 ? 0 : `${GEOMETRY.entryGap}px`,
      }}
    >
      <p className="whitespace-nowrap" style={{ color: '#475569', fontSize: `${size.date}px` }}>
        {dates && `${dates}${COLUMN_BREAK}`}
      </p>
      <div className="min-w-0">{content}</div>
    </div>
  )

  /**
   * A section whose heading never ends a printed page alone: the heading and
   * the first entry are kept together, and each further entry breaks as an
   * entry does.
   */
  const entrySection = (label: string, entries: ReactNode[]) => (
    <section style={{ fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
      <div className="break-inside-avoid">
        {heading(label)}
        {entries[0]}
      </div>
      {entries.slice(1)}
    </section>
  )

  const renderSection = (sectionId: SwissAcademicSectionId): ReactNode => {
    switch (sectionId) {
      case 'summary': {
        if (!swissHasText(resume.summary)) return null
        return (
          <section className="break-inside-avoid" style={{ fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
            {heading(swissHeading(dict, 'summary'))}
            {richText(resume.summary)}
          </section>
        )
      }

      case 'education': {
        if (education.length === 0) return null
        return entrySection(
          swissHeading(dict, 'education'),
          education.map((edu, index) =>
            datedEntry(
              index,
              edu.dates,
              <>
                {entryLine(edu.lead, edu.rest, true)}
                {/* The field of study, as the mockup's thesis line: stored text, italic, grey. */}
                {edu.field && (
                  <p className="italic" style={{ color: '#475569' }}>
                    {edu.field}
                  </p>
                )}
                {edu.description && richText(edu.description, GEOMETRY.detailGap)}
              </>,
            ),
          ),
        )
      }

      case 'experience': {
        if (experiences.length === 0) return null
        return entrySection(
          swissHeading(dict, 'experience'),
          experiences.map((exp, index) =>
            datedEntry(
              index,
              exp.dates,
              <>
                {entryLine(exp.lead, exp.rest, true)}
                {exp.achievements.length > 0 ? (
                  <ul className="list-disc" style={{ color: '#1e293b', marginTop: `${GEOMETRY.detailGap}px`, paddingLeft: `${GEOMETRY.bulletIndent}px` }}>
                    {exp.achievements.map((achievement, i) => (
                      <li key={i}>{renderFormattedText(achievement, { justify: false })}</li>
                    ))}
                  </ul>
                ) : (
                  exp.description && richText(exp.description, GEOMETRY.detailGap)
                )}
              </>,
            ),
          ),
        )
      }

      case 'keyAchievements': {
        if (projects.length === 0) return null
        // The projects, numbered 1., 2., 3. as the mockup lists them: a real
        // ordered list, whose numbers are the list's markers.
        return (
          <section style={{ fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
            <div className="break-inside-avoid">{heading(swissHeading(dict, 'publications'))}</div>
            <ol className="list-decimal" style={{ color: '#1e293b', paddingLeft: `${GEOMETRY.numberIndent}px` }}>
              {projects.map((project, index) => (
                <li key={index} className="break-inside-avoid" style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.publicationGap}px` }}>
                  {project.name && <p className="font-bold" style={{ color: '#0f172a' }}>{project.name}</p>}
                  {project.description && richText(project.description)}
                  {/* The technologies and the link are stored content the Projects
                      tab collects; drawn muted under the description, as
                      swissEngineering draws them (FR-1). */}
                  {(project.technologies || project.url) && (
                    <div style={{ color: '#475569' }}>
                      {project.technologies && <p>{project.technologies}</p>}
                      {project.url && <p>{linkText(project.url)}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )
      }

      case 'training': {
        if (distinctions.length === 0) return null
        return entrySection(
          swissHeading(dict, 'distinctions'),
          distinctions.map((cert, index) => datedEntry(index, cert.dates, entryLine(cert.lead, cert.rest, false))),
        )
      }

      case 'skillsAndLanguages': {
        if (skills.length === 0 && languages.length === 0) return null
        const label = swissAcademicLastHeading(swissHeading(dict, 'skills'), swissHeading(dict, 'languages'), skills.length > 0, languages.length > 0)
        return (
          <section className="break-inside-avoid" style={{ color: '#1e293b', fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
            {heading(label)}
            {skills.map((skill, index) =>
              skill.content.kind === 'text' ? (
                <p key={index} style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.lastRowGap}px` }}>
                  {skill.category && <strong style={{ color: '#0f172a' }}>{`${swissAcademicSkillLabel(skill.category)}${COLUMN_BREAK}`}</strong>}
                  {skill.content.text}
                </p>
              ) : (
                // Rich text that is not a list of skills stands under its label.
                <div key={index} style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.lastRowGap}px` }}>
                  {skill.category && (
                    <p className="font-bold" style={{ color: '#0f172a' }}>
                      {swissAcademicSkillLabel(skill.category)}
                    </p>
                  )}
                  {richText(skill.content.html)}
                </div>
              ),
            )}
            {languages.length > 0 && (
              <p style={{ marginTop: skills.length > 0 ? `${GEOMETRY.lastRowGap}px` : 0 }}>
                <strong style={{ color: '#0f172a' }}>{`${swissAcademicSkillLabel(swissHeading(dict, 'languages'))}${COLUMN_BREAK}`}</strong>
                {swissAcademicLanguagesText(languages)}
              </p>
            )}
          </section>
        )
      }
    }
  }

  // An empty section draws nothing at all, its heading included (FR-2).
  const drawn = visibility.sections.flatMap((sectionId) => {
    const content = renderSection(sectionId)
    return content === null ? [] : [{ sectionId, content }]
  })

  return (
    <div
      data-testid="resume-document"
      className="swiss-academic-template relative mx-auto bg-white font-serif shadow-lg print:shadow-none"
      style={{
        overflowWrap: 'break-word',
        wordBreak: 'normal',
        width: PAGE_WIDTH_CSS,
        padding: `${GEOMETRY.paddingTop}px ${GEOMETRY.paddingX}px ${GEOMETRY.paddingBottom}px`,
      }}
    >
      {hasHeader && (
        <header>
          {contact.name && (
            <h1 className="font-bold" style={{ color: '#0f172a', fontSize: `${size.name}px`, lineHeight: LINE_HEIGHT.name }}>
              {contact.name}
            </h1>
          )}
          {title && (
            <p
              style={{
                color: '#475569',
                fontSize: `${size.title}px`,
                lineHeight: LINE_HEIGHT.compact,
                marginTop: contact.name ? `${GEOMETRY.nameGap}px` : 0,
              }}
            >
              {title}
            </p>
          )}
          {contactValues.length > 0 && (
            <p
              className="flex flex-wrap"
              style={{
                color: '#475569',
                fontSize: `${size.contact}px`,
                lineHeight: LINE_HEIGHT.compact,
                marginTop: contact.name || title ? `${GEOMETRY.titleGap}px` : 0,
              }}
            >
              {contactValues.map((value, index) => (
                // Each value is drawn whole and the line wraps between two.
                // The space after a dot is the value's own separator, which
                // also parts it from the next in the PDF's text layer.
                <span key={index} className="max-w-full">
                  {linkText(value, index < contactValues.length - 1 ? COLUMN_BREAK : '', !isEmail(value))}
                </span>
              ))}
            </p>
          )}
        </header>
      )}

      {drawn.map(({ sectionId, content }, index) => (
        <div key={sectionId} style={{ marginTop: index === 0 ? (hasHeader ? `${GEOMETRY.headerGap}px` : 0) : `${GEOMETRY.sectionGap}px` }}>
          {content}
        </div>
      ))}
    </div>
  )
}
