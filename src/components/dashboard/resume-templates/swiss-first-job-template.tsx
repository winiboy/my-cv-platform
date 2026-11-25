'use client'

import { Fragment, type ReactNode } from 'react'
import type { Resume, ResumeExperience, ResumeEducation, ResumeSkillCategory, ResumeLanguage, ResumeCertification } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { visibleContactDetails, type ContactFieldId } from '@/lib/contact-visibility'
import { renderFormattedText } from '@/lib/format-text'
import { PAGE_HEIGHT_CSS, PAGE_WIDTH_CSS } from '@/lib/resume-page-size'
import { SWISS_FIRST_JOB_LINE_HEIGHT } from '@/lib/resume-line-height'
import { DEFAULT_RESUME_LAYOUT, type EditorMainId, type EditorSidebarId } from '@/lib/layout-settings'
import { formatSwissMonth, swissHeading, swissHasText, swissLanguageLevel } from '@/lib/swiss-vocational-template'
import { swissTradesContactHeading } from '@/lib/swiss-trades-template'
import { swissEngineeringSkillContent } from '@/lib/swiss-engineering-template'
import { swissItDates, swissItEntryLines, swissItLinkParts } from '@/lib/swiss-it-template'
import { swissAcademicDate } from '@/lib/swiss-academic-template'
import {
  SWISS_FIRST_JOB_CHECK,
  SWISS_FIRST_JOB_GEOMETRY as GEOMETRY,
  SWISS_FIRST_JOB_SIZES as SIZES,
  swissFirstJobCertificate,
  swissFirstJobContactLines,
  swissFirstJobEmailFit,
  swissFirstJobLanguageDots,
  swissFirstJobSections,
  type SwissFirstJobMainSectionId,
  type SwissFirstJobSidebarSectionId,
} from '@/lib/swiss-first-job-template'

const LINE_HEIGHT = SWISS_FIRST_JOB_LINE_HEIGHT

/**
 * How both columns wrap text: at spaces only, a word never cut (the owner's
 * rule, every locale). `break-word` breaks a word only as a last resort, when
 * that single word is wider than the whole line it is on; set once on each
 * column, so nothing below it adds a rule. Every word of the long-word lists in
 * `swiss-first-job-template.test.ts` fits the sidebar whole. A contact link
 * carries a `<wbr>` at each of its boundaries (`linkText`), so one wider than
 * the sidebar wraps after a "/" or before a ".", never at a letter; an email
 * is never altered: drawn whole on one line, shrunk to fit when wider than
 * the sidebar (`emailText`), as in Word. A date is never wrapped: its spaces are no-break
 * spaces (`swissAcademicDate`).
 */

interface SwissFirstJobTemplateProps {
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
  /** Sidebar sections hidden through the layout model: this template draws skills, languages and certifications from them. */
  hiddenSidebarSections?: readonly EditorSidebarId[]
  /** Contact details the owner hid (FR-14), the photo among them; drawn through `visibleContactDetails`. */
  hiddenContactFields?: readonly ContactFieldId[]
  /**
   * The browser-local photo, drawn round at the top of the sidebar when present
   * and not hidden. It is uploaded from the Editor's Contact tab; the CV draws
   * no upload affordance and no empty frame (FR-5).
   */
  photoUrl?: string
}

/**
 * "Premier emploi": a light violet sidebar down the left of every page holding
 * a round photo, the contact details one per line, the skills behind check
 * marks, the languages with their level in five dots, and the certificates;
 * a white main column with the name and CV title in violet, then the summary,
 * the experience and the education, each entry under its violet date line.
 * Sidebar headings are violet spaced capitals; main headings follow a filled
 * violet circle.
 *
 * Sizes, geometry, section sequences, dots and joined text come from
 * `@/lib/swiss-first-job-template`; dates, headings and level names from the
 * shared Swiss helpers. `docx-swiss-first-job.ts` reads the same. It draws the
 * app's Inter at its own sizes, whatever font and font scale the layout model
 * stores (FR-4): it takes neither.
 */
export function SwissFirstJobTemplate({
  resume,
  dict,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  hiddenContactFields,
  photoUrl,
}: SwissFirstJobTemplateProps) {
  const size = SIZES

  const { contact, title, photoVisible } = visibleContactDetails(resume, hiddenContactFields)
  const photo = photoVisible ? photoUrl : undefined
  // An entry that stores nothing the template draws is not an entry (FR-2).
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).flatMap((exp) => {
    if (exp.visible === false) return []
    const lines = swissItEntryLines(exp.position, [exp.company, exp.location])
    const dates = swissAcademicDate(swissItDates(exp.startDate, exp.endDate, exp.current, dict))
    const achievements = (exp.achievements ?? []).filter(swissHasText)
    const description = achievements.length === 0 && swissHasText(exp.description) ? exp.description : null
    return lines.lead || dates || achievements.length > 0 || description ? [{ ...lines, dates, achievements, description }] : []
  })
  const education = ((resume.education as unknown as ResumeEducation[]) || []).flatMap((edu) => {
    if (edu.visible === false) return []
    const lines = swissItEntryLines(edu.degree, [edu.school, edu.field])
    const dates = swissAcademicDate(swissItDates(edu.startDate, edu.endDate, false, dict))
    const description = swissHasText(edu.description) ? edu.description : null
    return lines.lead || dates || description ? [{ ...lines, dates, description }] : []
  })
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissEngineeringSkillContent(skill)
    return content ? [{ category: skill.category?.trim() ?? '', content }] : []
  })
  const languages = ((resume.languages as unknown as ResumeLanguage[]) || []).filter((lang) => lang.visible !== false && Boolean(lang.language?.trim()))
  const certificates = ((resume.certifications as unknown as ResumeCertification[]) || []).flatMap((cert) => {
    if (cert.visible === false) return []
    const line = swissFirstJobCertificate(cert.name, cert.issuer, cert.date ? swissAcademicDate(formatSwissMonth(cert.date)) : '')
    return line ? [line] : []
  })

  const contactLines = swissFirstJobContactLines(contact)
  const sections = swissFirstJobSections(hiddenMainSections, hiddenSidebarSections)

  /** Text drawn in parts, a `<wbr>` between two: a break opportunity that draws nothing. */
  const withBreaks = (parts: readonly string[]) =>
    parts.map((part, index) => (
      <Fragment key={index}>
        {index > 0 && <wbr />}
        {part}
      </Fragment>
    ))

  /**
   * A link or a contact value, with a `<wbr>` at each place it may wrap
   * (`swissItLinkParts`), so one wider than its line wraps after a "/" or
   * before a "." rather than at an arbitrary letter.
   */
  const linkText = (text: string) => withBreaks(swissItLinkParts(text))

  /**
   * The email: the stored address, never altered, on one line, shrunk to fit
   * the sidebar when wider than it (`swissFirstJobEmailFit`), at the size Word
   * draws it at.
   */
  const emailText = (email: string) => {
    const fit = swissFirstJobEmailFit(email)
    // Too wide even at the smallest size: wrapped at its boundaries only.
    if (fit.parts.length > 1) return <span style={{ fontSize: `${fit.px}px` }}>{withBreaks(fit.parts)}</span>
    // Drawn whole: never wrapped, not even at its hyphen, on screen and in
    // print, so a rasteriser's sub-pixel difference from the measured width
    // cannot push its end onto a second line.
    return fit.px === size.sidebar ? (
      <span className="whitespace-nowrap">{email}</span>
    ) : (
      <span className="whitespace-nowrap" style={{ fontSize: `${fit.px}px` }}>
        {email}
      </span>
    )
  }

  // ----------------------------------------------------------
  // The sidebar
  // ----------------------------------------------------------

  /** A sidebar heading: violet spaced capitals. */
  const sidebarHeading = (label: string) => (
    <h2
      className="font-bold uppercase tracking-widest"
      style={{
        color: '#6d28d9',
        fontSize: `${size.sidebarHeading}px`,
        lineHeight: LINE_HEIGHT.compact,
        marginBottom: `${GEOMETRY.sidebarHeadingGap}px`,
      }}
    >
      {label}
    </h2>
  )

  /** Lines of the sidebar, the space between two lines its row gap. */
  const sidebarLines = (lines: ReactNode[]) =>
    lines.map((line, index) => (
      <p key={index} style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.sidebarRowGap}px` }}>
        {line}
      </p>
    ))

  const renderSidebarSection = (sectionId: SwissFirstJobSidebarSectionId): ReactNode => {
    switch (sectionId) {
      case 'skills': {
        if (skills.length === 0) return null
        return (
          <section>
            {sidebarHeading(swissHeading(dict, 'skills'))}
            {skills.map((skill, index) => (
              <div key={index} className="break-inside-avoid" style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.skillCategoryGap}px` }}>
                {/* The mockup draws no category; the stored category is content, so
                    it is drawn as a caption above its skills, as swissEngineering
                    draws it (FR-1). */}
                {skill.category && (
                  <p className="font-semibold" style={{ color: '#0f172a', marginBottom: `${GEOMETRY.skillCaptionGap}px` }}>
                    {skill.category}
                  </p>
                )}
                {skill.content.kind === 'lines'
                  ? sidebarLines(
                      skill.content.lines.map((line, i) => (
                        <span key={i} className="flex" style={{ columnGap: 0 }}>
                          <span aria-hidden="true" className="shrink-0" style={{ width: `${GEOMETRY.checkIndent}px` }}>
                            {SWISS_FIRST_JOB_CHECK}
                          </span>
                          <span className="min-w-0">{line}</span>
                        </span>
                      )),
                    )
                  : renderFormattedText(skill.content.html, { justify: false })}
              </div>
            ))}
          </section>
        )
      }

      case 'languages': {
        if (languages.length === 0) return null
        return (
          <section className="break-inside-avoid">
            {sidebarHeading(swissHeading(dict, 'languages'))}
            {sidebarLines(
              languages.map((lang) => {
                const dots = swissFirstJobLanguageDots(lang.level)
                return (
                  <>
                    {lang.language.trim()}
                    {/* The level in five equal round dots, filled then light,
                        named in words for assistive technology: the level is
                        never told by colour alone. */}
                    <span
                      role="img"
                      aria-label={swissLanguageLevel(dict, lang.level)}
                      className="inline-flex whitespace-nowrap align-middle"
                      style={{ marginLeft: `${GEOMETRY.dotsLead}px`, columnGap: `${GEOMETRY.dotsGap}px` }}
                    >
                      {Array.from({ length: dots.filled }, (_, i) => (
                        <span
                          key={`filled-${i}`}
                          className="swiss-first-job-dot inline-block shrink-0"
                          style={{ width: `${GEOMETRY.dot}px`, height: `${GEOMETRY.dot}px`, borderRadius: '50%', backgroundColor: '#7c3aed' }}
                        />
                      ))}
                      {Array.from({ length: dots.empty }, (_, i) => (
                        <span
                          key={`empty-${i}`}
                          className="swiss-first-job-dot inline-block shrink-0"
                          style={{ width: `${GEOMETRY.dot}px`, height: `${GEOMETRY.dot}px`, borderRadius: '50%', backgroundColor: '#ddd6fe' }}
                        />
                      ))}
                    </span>
                  </>
                )
              }),
            )}
          </section>
        )
      }

      case 'training': {
        if (certificates.length === 0) return null
        return (
          <section className="break-inside-avoid">
            {sidebarHeading(swissHeading(dict, 'training'))}
            {sidebarLines(certificates)}
          </section>
        )
      }
    }
  }

  // The photo, the contact details, then the sections: whatever is drawn, in
  // that order. An empty section draws nothing, its heading included (FR-2).
  const sidebarBlocks: { key: string; content: ReactNode }[] = []
  if (photo) {
    sidebarBlocks.push({
      key: 'photo',
      content: (
        <div className="flex justify-center">
          <div
            className="swiss-first-job-photo shrink-0 overflow-hidden"
            style={{
              width: `${GEOMETRY.photo}px`,
              height: `${GEOMETRY.photo}px`,
              borderRadius: '50%',
              borderWidth: `${GEOMETRY.photoRing}px`,
              borderStyle: 'solid',
              borderColor: '#c4b5fd',
              backgroundColor: '#ede9fe',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a browser-local data URL, which next/image cannot optimise */}
            <img src={photo} alt="" className="h-full w-full object-cover" />
          </div>
        </div>
      ),
    })
  }
  if (contactLines.length > 0) {
    sidebarBlocks.push({
      key: 'contact',
      content: (
        <section className="break-inside-avoid">
          {sidebarHeading(swissTradesContactHeading(dict))}
          {/* The mockup draws the values without labels, one per line. */}
          {sidebarLines(contactLines.map(({ key, value }) => (key === 'email' ? emailText(value) : linkText(value))))}
        </section>
      ),
    })
  }
  for (const sectionId of sections.sidebar) {
    const content = renderSidebarSection(sectionId)
    if (content !== null) sidebarBlocks.push({ key: sectionId, content })
  }

  // ----------------------------------------------------------
  // The main column
  // ----------------------------------------------------------

  /** A main heading: a filled violet circle, then the heading in violet bold. */
  const heading = (label: string) => (
    <h2
      className="flex items-center font-bold"
      style={{
        color: '#6d28d9',
        columnGap: `${GEOMETRY.headingCircleGap}px`,
        fontSize: `${size.heading}px`,
        lineHeight: LINE_HEIGHT.compact,
        marginBottom: `${GEOMETRY.headingGap}px`,
      }}
    >
      <span
        aria-hidden="true"
        className="swiss-first-job-circle shrink-0"
        style={{ width: `${GEOMETRY.headingCircle}px`, height: `${GEOMETRY.headingCircle}px`, borderRadius: '50%', backgroundColor: '#7c3aed' }}
      />
      {label}
    </h2>
  )

  /** Rich text in the body colour (FR-9), ragged-right. */
  const richText = (text: string, marginTop = 0) => (
    <div style={{ color: '#1e293b', marginTop: `${marginTop}px` }}>{renderFormattedText(text, { justify: false })}</div>
  )

  /** An entry: its date line in violet, its bold title, its grey second line. */
  const entryHead = (dates: string, lead: string, detail: string) => (
    <>
      {dates && (
        <p className="whitespace-nowrap" style={{ color: '#6d28d9', fontSize: `${size.date}px` }}>
          {dates}
        </p>
      )}
      {lead && (
        <p className="font-bold" style={{ color: '#0f172a' }}>
          {lead}
        </p>
      )}
      {detail && <p style={{ color: '#475569' }}>{detail}</p>}
    </>
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

  const renderMainSection = (sectionId: SwissFirstJobMainSectionId): ReactNode => {
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

      case 'experience': {
        if (experiences.length === 0) return null
        return entrySection(
          swissHeading(dict, 'experience'),
          experiences.map((exp, index) => (
            <div key={index} className="break-inside-avoid" style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.entryGap}px` }}>
              {entryHead(exp.dates, exp.lead, exp.detail)}
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
              {entryHead(edu.dates, edu.lead, edu.detail)}
              {edu.description && richText(edu.description, GEOMETRY.detailGap)}
            </div>
          )),
        )
      }
    }
  }

  const drawnMain = sections.main.flatMap((sectionId) => {
    const content = renderMainSection(sectionId)
    return content === null ? [] : [{ sectionId, content }]
  })
  const hasHeader = Boolean(contact.name || title)

  return (
    <div
      data-testid="resume-document"
      className="swiss-first-job-template relative mx-auto flex bg-white shadow-lg print:shadow-none"
      style={{ width: PAGE_WIDTH_CSS, minHeight: PAGE_HEIGHT_CSS }}
    >
      <aside
        className="swiss-first-job-column shrink-0"
        style={{
          overflowWrap: 'break-word',
          wordBreak: 'normal',
          width: `${GEOMETRY.sidebarWidth}px`,
          backgroundColor: '#f5f3ff',
          color: '#1e293b',
          fontSize: `${size.sidebar}px`,
          lineHeight: LINE_HEIGHT.text,
          padding: `${GEOMETRY.paddingTop}px ${GEOMETRY.sidebarPaddingX}px ${GEOMETRY.paddingBottom}px`,
        }}
      >
        {sidebarBlocks.map(({ key, content }, index) => (
          <div
            key={key}
            style={{
              marginTop: index === 0 ? 0 : `${sidebarBlocks[index - 1].key === 'photo' ? GEOMETRY.photoGap : GEOMETRY.sidebarSectionGap}px`,
            }}
          >
            {content}
          </div>
        ))}
      </aside>

      <main
        className="swiss-first-job-column min-w-0 flex-1"
        style={{
          overflowWrap: 'break-word',
          wordBreak: 'normal',
          padding: `${GEOMETRY.paddingTop}px ${GEOMETRY.mainPaddingRight}px ${GEOMETRY.paddingBottom}px ${GEOMETRY.mainPaddingLeft}px`,
        }}
      >
        {contact.name && (
          <h1 className="font-bold" style={{ color: '#4c1d95', fontSize: `${size.name}px`, lineHeight: LINE_HEIGHT.name }}>
            {contact.name}
          </h1>
        )}
        {title && (
          <p
            className="font-medium"
            style={{
              color: '#6d28d9',
              fontSize: `${size.title}px`,
              lineHeight: LINE_HEIGHT.compact,
              marginTop: contact.name ? `${GEOMETRY.nameGap}px` : 0,
            }}
          >
            {title}
          </p>
        )}
        {drawnMain.map(({ sectionId, content }, index) => (
          <div key={sectionId} style={{ marginTop: index === 0 ? (hasHeader ? `${GEOMETRY.titleGap}px` : 0) : `${GEOMETRY.sectionGap}px` }}>
            {content}
          </div>
        ))}
      </main>
    </div>
  )
}
