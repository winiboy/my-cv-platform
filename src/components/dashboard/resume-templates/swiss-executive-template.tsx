'use client'

import { Fragment, type ReactNode } from 'react'
import type { Resume, ResumeExperience, ResumeEducation, ResumeLanguage, ResumeCertification, ResumeProject } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { visibleContactDetails, type ContactFieldId } from '@/lib/contact-visibility'
import { renderFormattedText } from '@/lib/format-text'
import { PAGE_WIDTH_CSS } from '@/lib/resume-page-size'
import { SWISS_EXECUTIVE_LINE_HEIGHT } from '@/lib/resume-line-height'
import { DEFAULT_RESUME_LAYOUT, type EditorMainId, type EditorSidebarId } from '@/lib/layout-settings'
import { formatSwissMonth, swissHeading, swissHasText, swissLanguageLevel } from '@/lib/swiss-vocational-template'
import { swissEngineeringProject } from '@/lib/swiss-engineering-template'
import { swissItCardRows, swissItCertificationsLine, swissItDates, swissItEntryLines, swissItLanguagesLine, swissItLinkParts } from '@/lib/swiss-it-template'
import {
  SWISS_EXECUTIVE_GEOMETRY as GEOMETRY,
  SWISS_EXECUTIVE_SIZES as SIZES,
  swissExecutiveCertificate,
  swissExecutiveContactValues,
  swissExecutiveLastHeading,
  swissExecutiveVisibility,
  type SwissExecutiveSectionId,
} from '@/lib/swiss-executive-template'

const LINE_HEIGHT = SWISS_EXECUTIVE_LINE_HEIGHT

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
 * every locale). `break-word` — not `anywhere`, which would let a box shrink
 * below a word that fits, and not `break-all` — breaks a word only as a last
 * resort, when that single word is wider than the whole line it is on. Set
 * once, on the document (`overflowWrap` and `wordBreak`), so nothing below it
 * adds a rule. Every word of the long-word lists in
 * `swiss-executive-template.test.ts` fits an achievement card whole.
 *
 * A contact value is a flex item of a wrapping row, so the line breaks between
 * two values and moves one that does not fit to the next line whole. A contact
 * value and a project's link carry a `<wbr>` at each of their boundaries
 * (`linkText`), so one wider than its line wraps after a "/" or before a ".",
 * never at an arbitrary letter. A date is never wrapped (`whitespace-nowrap`),
 * and its column is as wide as the date: the entry's title takes the rest.
 */

interface SwissExecutiveTemplateProps {
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
  /** Sidebar sections hidden through the layout model: this template draws the projects, languages and certifications from them. */
  hiddenSidebarSections?: readonly EditorSidebarId[]
  /** Contact details the owner hid (FR-14), the photo among them; drawn through `visibleContactDetails`. */
  hiddenContactFields?: readonly ContactFieldId[]
  /**
   * The browser-local photo, drawn round at the right of the header when
   * present and not hidden. It is uploaded from the Editor's Contact tab; the
   * CV draws no upload affordance and no empty frame (FR-5).
   */
  photoUrl?: string
}

/**
 * "Cadre & direction": a header with the name in a large serif, the CV title in
 * burgundy spaced capitals, the contact line, and a round photo in a gold ring
 * at its right, over a gold rule; then the summary in a cream box behind a gold
 * bar, in italics, with no heading; the projects as key achievements, two to a
 * row under a gold rule each; experience, education, and one last section for
 * the languages and the certifications. Headings are burgundy serif.
 *
 * The mockup draws no skills, so the template draws none (PRD section order).
 *
 * Sizes, geometry, section sequence and joined text come from
 * `@/lib/swiss-executive-template`; dates, headings and level names from the
 * shared Swiss helpers. `docx-swiss-executive.ts` reads the same. It draws
 * Tailwind's `font-serif` stack (Georgia) for the name and headings and the
 * app's Inter for the rest, at its own sizes, whatever font and font scale the
 * layout model stores (FR-4): it takes neither.
 */
export function SwissExecutiveTemplate({
  resume,
  dict,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  hiddenContactFields,
  photoUrl,
}: SwissExecutiveTemplateProps) {
  const size = SIZES

  const { contact, title, photoVisible } = visibleContactDetails(resume, hiddenContactFields)
  const photo = photoVisible ? photoUrl : undefined
  // An entry that stores nothing the template draws is not an entry (FR-2).
  const projects = ((resume.projects as unknown as ResumeProject[]) || []).flatMap((project) => {
    const drawn = project.visible === false ? null : swissEngineeringProject(project)
    return drawn ? [drawn] : []
  })
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).flatMap((exp) => {
    if (exp.visible === false) return []
    const lines = swissItEntryLines(exp.position, [exp.company, exp.location])
    const dates = swissItDates(exp.startDate, exp.endDate, exp.current, dict)
    const achievements = (exp.achievements ?? []).filter(swissHasText)
    const description = achievements.length === 0 && swissHasText(exp.description) ? exp.description : null
    return lines.lead || dates || achievements.length > 0 || description ? [{ ...lines, dates, achievements, description }] : []
  })
  const education = ((resume.education as unknown as ResumeEducation[]) || []).flatMap((edu) => {
    if (edu.visible === false) return []
    const lines = swissItEntryLines(edu.degree, [edu.school, edu.field])
    const dates = swissItDates(edu.startDate, edu.endDate, false, dict)
    const description = swissHasText(edu.description) ? edu.description : null
    return lines.lead || dates || description ? [{ ...lines, dates, description }] : []
  })
  const visibility = swissExecutiveVisibility(hiddenMainSections, hiddenSidebarSections)
  const languages = visibility.languages
    ? ((resume.languages as unknown as ResumeLanguage[]) || []).flatMap((lang) =>
        lang.visible !== false && lang.language?.trim() ? [{ language: lang.language, level: swissLanguageLevel(dict, lang.level) }] : [],
      )
    : []
  const certificates = visibility.certifications
    ? ((resume.certifications as unknown as ResumeCertification[]) || []).flatMap((cert) => {
        if (cert.visible === false) return []
        const line = swissExecutiveCertificate(cert.name, cert.issuer, cert.date ? formatSwissMonth(cert.date) : '')
        return line ? [line] : []
      })
    : []

  const contactValues = swissExecutiveContactValues(contact)
  // A header with nothing in it is not drawn, nor its rule (FR-2).
  const hasHeader = Boolean(contact.name || title || contactValues.length > 0 || photo)

  /**
   * A link or a contact value, with a `<wbr>` at each place it may wrap
   * (`swissItLinkParts`), so one wider than its line wraps after a "/" or
   * before a "." rather than at an arbitrary letter. `suffix` ends the last
   * part's own text node, as `COLUMN_BREAK` must.
   */
  const linkText = (text: string, suffix = '') =>
    swissItLinkParts(text).map((part, index, parts) => (
      <Fragment key={index}>
        {index > 0 && <wbr />}
        {index === parts.length - 1 ? `${part}${suffix}` : part}
      </Fragment>
    ))

  /** A section heading: burgundy serif. */
  const heading = (label: string) => (
    <h2
      className="font-serif font-normal"
      style={{
        color: '#9f1239',
        fontSize: `${size.heading}px`,
        lineHeight: LINE_HEIGHT.compact,
        marginBottom: `${GEOMETRY.headingGap}px`,
      }}
    >
      {label}
    </h2>
  )

  /** An entry's first line: its bold title, the dates at its right in grey, the date's column as wide as the date. */
  const firstLine = (lead: string, dates: string) =>
    lead || dates ? (
      <div className="flex items-baseline justify-between" style={{ columnGap: `${GEOMETRY.dateGap}px` }}>
        <p className="min-w-0 font-bold" style={{ color: '#0f172a' }}>
          {dates ? `${lead}${COLUMN_BREAK}` : lead}
        </p>
        {/* Never wrapped: a date is one unit. */}
        {dates && (
          <p className="shrink-0 whitespace-nowrap" style={{ color: '#64748b', fontSize: `${size.date}px` }}>
            {dates}
          </p>
        )}
      </div>
    ) : null

  /** An entry's second line, in grey. */
  const detailLine = (detail: string) => (detail ? <p style={{ color: '#64748b' }}>{detail}</p> : null)

  /** Rich text in the body colour (FR-9), ragged-right as the mockup. */
  const richText = (text: string, marginTop = 0) => (
    <div style={{ color: '#1e293b', marginTop: `${marginTop}px` }}>{renderFormattedText(text, { justify: false })}</div>
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

  const renderSection = (sectionId: SwissExecutiveSectionId): ReactNode => {
    switch (sectionId) {
      case 'summary': {
        if (!swissHasText(resume.summary)) return null
        // The summary, in its cream box behind the gold bar, in italics; no
        // heading, as the mockup draws it (it is the summary, FR-6).
        return (
          <section
            className="break-inside-avoid italic"
            style={{
              color: '#1e293b',
              backgroundColor: '#faf6ee',
              borderLeftWidth: `${GEOMETRY.summaryBar}px`,
              borderLeftStyle: 'solid',
              borderLeftColor: '#a16207',
              padding: `${GEOMETRY.summaryPaddingY}px ${GEOMETRY.summaryPaddingX}px`,
              fontSize: `${size.summary}px`,
              lineHeight: LINE_HEIGHT.text,
            }}
          >
            {renderFormattedText(resume.summary, { justify: false })}
          </section>
        )
      }

      case 'keyAchievements': {
        if (projects.length === 0) return null
        return entrySection(
          swissHeading(dict, 'keyAchievements'),
          // Two cards to a row, each half the width; an odd last card stays in
          // the left column. Each card sits under its own gold rule.
          swissItCardRows(projects).map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-2"
              style={{ columnGap: `${GEOMETRY.cardGap}px`, marginTop: rowIndex === 0 ? 0 : `${GEOMETRY.cardRowGap}px` }}
            >
              {row.map(
                (project, column) =>
                  project && (
                    <div
                      key={column}
                      className="swiss-executive-card min-w-0 break-inside-avoid"
                      style={{
                        borderTopWidth: `${GEOMETRY.cardRule}px`,
                        borderTopStyle: 'solid',
                        borderTopColor: '#a16207',
                        paddingTop: `${GEOMETRY.cardRuleGap}px`,
                      }}
                    >
                      {project.name && (
                        <p className="font-bold" style={{ color: '#0f172a' }}>
                          {project.name}
                        </p>
                      )}
                      {project.description && richText(project.description)}
                      {/* The technologies and the link are stored content the
                          Projects tab collects; drawn muted under the
                          description, as swissEngineering draws them (FR-1). */}
                      {(project.technologies || project.url) && (
                        <div style={{ color: '#64748b' }}>
                          {project.technologies && <p>{project.technologies}</p>}
                          {project.url && <p>{linkText(project.url)}</p>}
                        </div>
                      )}
                    </div>
                  ),
              )}
            </div>
          )),
        )
      }

      case 'experience': {
        if (experiences.length === 0) return null
        return entrySection(
          swissHeading(dict, 'experience'),
          experiences.map((exp, index) => (
            <div key={index} className="break-inside-avoid" style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.entryGap}px` }}>
              {firstLine(exp.lead, exp.dates)}
              {detailLine(exp.detail)}
              {exp.achievements.length > 0 ? (
                <ul className="list-disc" style={{ color: '#1e293b', marginTop: `${GEOMETRY.detailGap}px`, paddingLeft: `${GEOMETRY.bulletIndent}px` }}>
                  {exp.achievements.map((achievement, i) => (
                    <li key={i}>{renderFormattedText(achievement, { justify: false })}</li>
                  ))}
                </ul>
              ) : (
                exp.description && richText(exp.description, GEOMETRY.detailGap)
              )}
            </div>
          )),
        )
      }

      case 'education': {
        if (education.length === 0) return null
        return entrySection(
          swissHeading(dict, 'education'),
          education.map((edu, index) => (
            <div key={index} className="break-inside-avoid" style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.entryGap}px` }}>
              {firstLine(edu.lead, edu.dates)}
              {detailLine(edu.detail)}
              {edu.description && richText(edu.description, GEOMETRY.detailGap)}
            </div>
          )),
        )
      }

      case 'languagesAndCertifications': {
        if (languages.length === 0 && certificates.length === 0) return null
        const label = swissExecutiveLastHeading(
          swissHeading(dict, 'languages'),
          swissHeading(dict, 'training'),
          languages.length > 0,
          certificates.length > 0,
        )
        return (
          <section className="break-inside-avoid" style={{ color: '#1e293b', fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
            {heading(label)}
            {languages.length > 0 && <p>{swissItLanguagesLine(languages)}</p>}
            {certificates.length > 0 && (
              <p style={{ marginTop: languages.length > 0 ? `${GEOMETRY.lastRowGap}px` : 0 }}>{swissItCertificationsLine(certificates)}</p>
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
      className="swiss-executive-template relative mx-auto bg-white shadow-lg print:shadow-none"
      style={{
        overflowWrap: 'break-word',
        wordBreak: 'normal',
        width: PAGE_WIDTH_CSS,
        padding: `${GEOMETRY.paddingTop}px ${GEOMETRY.paddingX}px ${GEOMETRY.paddingBottom}px`,
      }}
    >
      {hasHeader && (
        <header>
          <div className="flex items-center" style={{ columnGap: `${GEOMETRY.photoGap}px` }}>
            <div className="min-w-0 flex-1">
              {contact.name && (
                <h1 className="font-serif font-normal" style={{ color: '#0f172a', fontSize: `${size.name}px`, lineHeight: LINE_HEIGHT.name }}>
                  {contact.name}
                </h1>
              )}
              {title && (
                <p
                  className="uppercase tracking-widest"
                  style={{
                    color: '#9f1239',
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
                    color: '#64748b',
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
                      {linkText(value, index < contactValues.length - 1 ? COLUMN_BREAK : '')}
                    </span>
                  ))}
                </p>
              )}
            </div>
            {photo && (
              <div
                className="swiss-executive-photo shrink-0 overflow-hidden"
                style={{
                  width: `${GEOMETRY.photo}px`,
                  height: `${GEOMETRY.photo}px`,
                  borderRadius: '50%',
                  borderWidth: `${GEOMETRY.photoRing}px`,
                  borderStyle: 'solid',
                  borderColor: '#a16207',
                  backgroundColor: '#f5efe3',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a browser-local data URL, which next/image cannot optimise */}
                <img src={photo} alt="" className="h-full w-full object-cover" />
              </div>
            )}
          </div>
          {/* The gold rule under the header. */}
          <div
            style={{
              borderTopWidth: `${GEOMETRY.headerRule}px`,
              borderTopStyle: 'solid',
              borderTopColor: '#a16207',
              marginTop: `${GEOMETRY.headerRuleGap}px`,
            }}
          />
        </header>
      )}

      {drawn.map(({ sectionId, content }, index) => (
        <div key={sectionId} style={{ marginTop: index === 0 ? (hasHeader ? `${GEOMETRY.ruleGap}px` : 0) : `${GEOMETRY.sectionGap}px` }}>
          {content}
        </div>
      ))}
    </div>
  )
}
