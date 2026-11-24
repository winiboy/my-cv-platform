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
import { SWISS_IT_LINE_HEIGHT } from '@/lib/resume-line-height'
import { DEFAULT_RESUME_LAYOUT, type EditorMainId, type EditorSidebarId } from '@/lib/layout-settings'
import { formatSwissMonth, swissHeading, swissHasText, swissLanguageLevel } from '@/lib/swiss-vocational-template'
import {
  SWISS_IT_GEOMETRY as GEOMETRY,
  SWISS_IT_MONO_FONT as MONO,
  SWISS_IT_SIZES as SIZES,
  swissItCardRows,
  swissItCertificate,
  swissItCertificationsLine,
  swissItContactLines,
  swissItDates,
  swissItEntryLines,
  swissItHeading,
  swissItLanguagesLine,
  swissItLastHeading,
  swissItLinkParts,
  swissItProject,
  swissItSkillContent,
  swissItSkillLabel,
  swissItTitle,
  swissItVisibility,
  type SwissItSectionId,
} from '@/lib/swiss-it-template'

const LINE_HEIGHT = SWISS_IT_LINE_HEIGHT

/**
 * The word separator a text ends with where another text continues on the same
 * line or in the next box, so the PDF's text layer does not run the two
 * together. One interpolated string with the text it follows, never a child of
 * its own: see `COLUMN_BREAK` in `swiss-vocational-template.tsx` for what was
 * measured.
 */
const COLUMN_BREAK = '\u00A0'

/** The width of `COLUMN_BREAK` in Inter, in em: a no-break space is as wide as a space. */
const COLUMN_BREAK_EM = 0.25

/**
 * How the page wraps text: at spaces only, a word never cut (the owner's rule,
 * every locale). `break-word` — not `anywhere`, which would let a box shrink
 * below a word that fits, and not `break-all` — breaks a word only as a last
 * resort, when that single word is wider than the whole line it is on: a link
 * or an address wider than a project card, which no wrapping at spaces could
 * hold and which would otherwise run off the page. Every word of the long-word
 * lists in `swiss-it-template.test.ts` fits a card whole. Set once, on the
 * document (`overflowWrap` and `wordBreak`), so nothing below it adds a rule.
 *
 * A tag and a contact value are each a flex item of a wrapping row, so a line
 * breaks between two of them and moves one that does not fit to the next line
 * whole; one wider than its whole row (`max-w-full`) wraps at its own spaces.
 * A contact value and a project's link carry a `<wbr>` at each of their
 * boundaries (`linkText`), so one wider than its line wraps after a "/" or
 * before a ".", "-", "?", "#" or "=", never at an arbitrary letter. A date is
 * never wrapped (`whitespace-nowrap`).
 */

interface SwissItTemplateProps {
  resume: Resume
  /** The locale whose rules lower-case the headings (`swissItHeading`). */
  locale: Locale
  /** The `common` dictionary: headings, dates and level names are read from it. */
  dict: unknown
  /** Main sections hidden through the layout model, in the editor's vocabulary. */
  hiddenMainSections?: readonly EditorMainId[]
  /** Sidebar sections hidden through the layout model: this template draws the skills, projects, languages and certifications from them. */
  hiddenSidebarSections?: readonly EditorSidebarId[]
  /** Contact details the owner hid (FR-14), the photo among them; drawn through `visibleContactDetails`. */
  hiddenContactFields?: readonly ContactFieldId[]
  /**
   * The browser-local photo, drawn round at the right of the band when present
   * and not hidden. It is uploaded from the Editor's Contact tab; the CV draws
   * no upload affordance and no empty frame (FR-5).
   */
  photoUrl?: string
}

/**
 * "Informatique & IT": a dark band across the top holding the name, the CV
 * title behind a "> " prompt and the contact lines in a monospace face, and a
 * round photo in a green ring at its right; then one column on white: summary,
 * skills as green tags after each category's label, experience, the projects as
 * cards two to a row with their technologies as tags, education, and one last
 * section for the languages and the certifications. Headings are "// label",
 * lower case, in green monospace; dates sit at the right in grey monospace.
 *
 * Sizes, geometry, section sequence and joined text come from
 * `@/lib/swiss-it-template`; dates, headings and level names from the shared
 * Swiss helpers. `docx-swiss-it.ts` reads the same. It draws the app's Inter at
 * its own sizes for everything but its monospace lines, whatever font and font
 * scale the layout model stores (FR-4): it takes neither.
 */
export function SwissItTemplate({
  resume,
  locale,
  dict,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  hiddenContactFields,
  photoUrl,
}: SwissItTemplateProps) {
  const size = SIZES

  const { contact, title, photoVisible } = visibleContactDetails(resume, hiddenContactFields)
  const photo = photoVisible ? photoUrl : undefined
  // An entry that stores nothing the template draws is not an entry (FR-2).
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissItSkillContent(skill)
    return content ? [{ category: skill.category?.trim() ?? '', content }] : []
  })
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).flatMap((exp) => {
    if (exp.visible === false) return []
    const lines = swissItEntryLines(exp.position, [exp.company, exp.location])
    const dates = swissItDates(exp.startDate, exp.endDate, exp.current, dict)
    const achievements = (exp.achievements ?? []).filter(swissHasText)
    const description = achievements.length === 0 && swissHasText(exp.description) ? exp.description : null
    return lines.lead || dates || achievements.length > 0 || description ? [{ ...lines, dates, achievements, description }] : []
  })
  const projects = ((resume.projects as unknown as ResumeProject[]) || []).flatMap((project) => {
    const drawn = project.visible === false ? null : swissItProject(project)
    return drawn ? [drawn] : []
  })
  const education = ((resume.education as unknown as ResumeEducation[]) || []).flatMap((edu) => {
    if (edu.visible === false) return []
    const lines = swissItEntryLines(edu.degree, [edu.school, edu.field])
    const dates = swissItDates(edu.startDate, edu.endDate, false, dict)
    const description = swissHasText(edu.description) ? edu.description : null
    return lines.lead || dates || description ? [{ ...lines, dates, description }] : []
  })
  const visibility = swissItVisibility(hiddenMainSections, hiddenSidebarSections)
  const languages = visibility.languages
    ? ((resume.languages as unknown as ResumeLanguage[]) || []).flatMap((lang) =>
        lang.visible !== false && lang.language?.trim() ? [{ language: lang.language, level: swissLanguageLevel(dict, lang.level) }] : [],
      )
    : []
  const certificates = visibility.certifications
    ? ((resume.certifications as unknown as ResumeCertification[]) || []).flatMap((cert) => {
        if (cert.visible === false) return []
        const line = swissItCertificate(cert.name, cert.issuer, cert.date ? formatSwissMonth(cert.date) : '')
        return line ? [line] : []
      })
    : []

  const contactLines = swissItContactLines(contact)
  // A band with nothing in it is not drawn (FR-2).
  const hasBand = Boolean(contact.name || title || contactLines.length > 0 || photo)

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

  /** A section heading: "// label", lower case, in green monospace. */
  const heading = (label: string) => (
    <h2
      className="font-bold"
      style={{
        color: '#15803d',
        fontFamily: MONO,
        fontSize: `${size.heading}px`,
        lineHeight: LINE_HEIGHT.compact,
        marginBottom: `${GEOMETRY.headingGap}px`,
      }}
    >
      {label}
    </h2>
  )

  /** A green outlined pill: a skill, or a project's technology; a flex item, so its words never part. */
  const tag = (text: string, key: number) => (
    <span
      key={key}
      className="swiss-it-tag max-w-full"
      style={{
        color: '#166534',
        backgroundColor: '#f0fdf4',
        borderWidth: `${GEOMETRY.tagBorder}px`,
        borderStyle: 'solid',
        borderColor: '#86efac',
        borderRadius: `${GEOMETRY.tagRadius}px`,
        // The trailing separator takes its width out of the right padding, so
        // the tag keeps its drawn size.
        padding: `${GEOMETRY.tagPaddingY}px calc(${GEOMETRY.tagPaddingX}px - ${COLUMN_BREAK_EM}em) ${GEOMETRY.tagPaddingY}px ${GEOMETRY.tagPaddingX}px`,
        fontSize: `${size.tag}px`,
        lineHeight: LINE_HEIGHT.compact,
      }}
    >
      {/* Its separator parts this tag from the next one in the PDF's text layer. */}
      {`${text}${COLUMN_BREAK}`}
    </span>
  )

  /** An entry's first line: its bold lead, the dates at its right in grey monospace. */
  const firstLine = (lead: string, dates: string) =>
    lead || dates ? (
      <div className="flex items-baseline justify-between" style={{ columnGap: `${GEOMETRY.dateGap}px` }}>
        <p className="min-w-0 font-bold" style={{ color: '#0f172a' }}>
          {dates ? `${lead}${COLUMN_BREAK}` : lead}
        </p>
        {/* Never wrapped: a date is one unit, and the widest of every locale fits
            the line beside its title. */}
        {dates && (
          <p className="shrink-0 whitespace-nowrap" style={{ color: '#64748b', fontFamily: MONO, fontSize: `${size.date}px` }}>
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

  const renderSection = (sectionId: SwissItSectionId): ReactNode => {
    switch (sectionId) {
      case 'summary': {
        if (!swissHasText(resume.summary)) return null
        return (
          <section className="break-inside-avoid" style={{ fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
            {heading(swissItHeading(swissHeading(dict, 'summary'), locale))}
            {richText(resume.summary)}
          </section>
        )
      }

      case 'skills': {
        if (skills.length === 0) return null
        return entrySection(
          swissItHeading(swissHeading(dict, 'skills'), locale),
          skills.map((skill, index) => {
            const rowGap = index === 0 ? 0 : `${GEOMETRY.skillRowGap}px`
            // The label leads its tags on their line, and tags that do not fit
            // wrap under it at the full width. Rich text that is not a list of
            // skills stands under its label, as every Swiss template stacks it.
            if (skill.content.kind === 'html') {
              return (
                <div key={index} className="break-inside-avoid" style={{ marginTop: rowGap }}>
                  {skill.category && (
                    <p className="font-bold" style={{ color: '#0f172a' }}>
                      {swissItSkillLabel(skill.category)}
                    </p>
                  )}
                  {richText(skill.content.html)}
                </div>
              )
            }
            return (
              <div key={index} className="flex flex-wrap items-center break-inside-avoid" style={{ gap: `${GEOMETRY.tagGap}px`, marginTop: rowGap }}>
                {/* The gap after the label is a no-break space in the label's own
                    text node: a separate space node is lost from the PDF's text layer. */}
                {skill.category && (
                  <span className="font-bold" style={{ color: '#0f172a' }}>
                    {`${swissItSkillLabel(skill.category)}${COLUMN_BREAK}`}
                  </span>
                )}
                {skill.content.tags.map((text, tagIndex) => tag(text, tagIndex))}
              </div>
            )
          }),
        )
      }

      case 'experience': {
        if (experiences.length === 0) return null
        return entrySection(
          swissItHeading(swissHeading(dict, 'experience'), locale),
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

      case 'keyAchievements': {
        if (projects.length === 0) return null
        return entrySection(
          swissItHeading(swissHeading(dict, 'projects'), locale),
          // Two cards to a row, each half the width; an odd last card stays in
          // the left column. The cards of a row share its height.
          swissItCardRows(projects).map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-2"
              style={{ columnGap: `${GEOMETRY.cardGap}px`, marginTop: rowIndex === 0 ? 0 : `${GEOMETRY.cardGap}px` }}
            >
              {row.map(
                (project, column) =>
                  project && (
                    <div
                      key={column}
                      className="swiss-it-card min-w-0 break-inside-avoid"
                      style={{
                        borderWidth: `${GEOMETRY.cardBorder}px`,
                        borderStyle: 'solid',
                        borderColor: '#e2e8f0',
                        borderRadius: `${GEOMETRY.cardRadius}px`,
                        padding: `${GEOMETRY.cardPaddingY}px ${GEOMETRY.cardPaddingX}px`,
                      }}
                    >
                      {project.name && (
                        <p className="font-bold" style={{ color: '#0f172a' }}>
                          {project.name}
                        </p>
                      )}
                      {project.description && richText(project.description)}
                      {project.url && <p style={{ color: '#64748b' }}>{linkText(project.url)}</p>}
                      {project.technologies.length > 0 && (
                        <div className="flex flex-wrap" style={{ gap: `${GEOMETRY.tagGap}px`, marginTop: `${GEOMETRY.cardTagGap}px` }}>
                          {project.technologies.map((text, tagIndex) => tag(text, tagIndex))}
                        </div>
                      )}
                    </div>
                  ),
              )}
            </div>
          )),
        )
      }

      case 'education': {
        if (education.length === 0) return null
        return entrySection(
          swissItHeading(swissHeading(dict, 'education'), locale),
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
        const label = swissItLastHeading(
          swissHeading(dict, 'languages'),
          swissHeading(dict, 'training'),
          languages.length > 0,
          certificates.length > 0,
          locale,
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

  // An empty section draws nothing at all, its heading included (FR-2), and
  // the first section drawn is the one that sits under the band.
  const drawn = visibility.sections.flatMap((sectionId) => {
    const content = renderSection(sectionId)
    return content === null ? [] : [{ sectionId, content }]
  })

  return (
    <div
      data-testid="resume-document"
      className="swiss-it-template relative mx-auto bg-white shadow-lg print:shadow-none"
      style={{
        overflowWrap: 'break-word',
        wordBreak: 'normal',
        width: PAGE_WIDTH_CSS,
        paddingBottom: `${GEOMETRY.paddingBottom}px`,
      }}
    >
      {hasBand && (
        <header
          className="flex items-center"
          style={{
            backgroundColor: '#0f172a',
            padding: `${GEOMETRY.bandPaddingY}px ${GEOMETRY.paddingX}px`,
            columnGap: `${GEOMETRY.photoGap}px`,
          }}
        >
          <div className="min-w-0 flex-1">
            {contact.name && (
              <h1 className="font-bold" style={{ color: '#ffffff', fontSize: `${size.name}px`, lineHeight: LINE_HEIGHT.name }}>
                {contact.name}
              </h1>
            )}
            {title && (
              <p
                style={{
                  color: '#4ade80',
                  fontFamily: MONO,
                  fontSize: `${size.title}px`,
                  lineHeight: LINE_HEIGHT.compact,
                  marginTop: contact.name ? `${GEOMETRY.nameGap}px` : 0,
                }}
              >
                {swissItTitle(title)}
              </p>
            )}
            {contactLines.length > 0 && (
              <div
                style={{
                  color: '#cbd5e1',
                  fontFamily: MONO,
                  fontSize: `${size.contact}px`,
                  lineHeight: LINE_HEIGHT.compact,
                  marginTop: contact.name || title ? `${GEOMETRY.titleGap}px` : 0,
                }}
              >
                {/* The mockup draws the values without labels. */}
                {contactLines.map((values, index) => (
                  <p key={index} className="flex flex-wrap" style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.contactRowGap}px` }}>
                    {values.map((value, valueIndex) => (
                      // Each value is drawn whole and the line wraps between two.
                      // The space after a dot is the value's own separator, which
                      // also parts it from the next in the PDF's text layer.
                      <span key={valueIndex} className="max-w-full">
                        {linkText(value, valueIndex < values.length - 1 ? COLUMN_BREAK : '')}
                      </span>
                    ))}
                  </p>
                ))}
              </div>
            )}
          </div>
          {photo && (
            <div
              className="swiss-it-photo shrink-0 overflow-hidden"
              style={{
                width: `${GEOMETRY.photo}px`,
                height: `${GEOMETRY.photo}px`,
                borderRadius: '50%',
                borderWidth: `${GEOMETRY.photoRing}px`,
                borderStyle: 'solid',
                borderColor: '#22c55e',
                backgroundColor: '#334155',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a browser-local data URL, which next/image cannot optimise */}
              <img src={photo} alt="" className="h-full w-full object-cover" />
            </div>
          )}
        </header>
      )}

      <div style={{ padding: `0 ${GEOMETRY.paddingX}px` }}>
        {drawn.map(({ sectionId, content }, index) => (
          <div key={sectionId} style={{ marginTop: `${index === 0 ? GEOMETRY.bandGap : GEOMETRY.sectionGap}px` }}>
            {content}
          </div>
        ))}
      </div>
    </div>
  )
}
