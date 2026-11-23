'use client'

import type { ReactNode } from 'react'
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
import { PAGE_HEIGHT_CSS, PAGE_WIDTH_CSS } from '@/lib/resume-page-size'
import { SWISS_ENGINEERING_LINE_HEIGHT } from '@/lib/resume-line-height'
import { DEFAULT_RESUME_LAYOUT, type EditorMainId, type EditorSidebarId } from '@/lib/layout-settings'
import { formatSwissMonth, swissContactEntries, swissHeading, swissHasText, swissLanguageLevel } from '@/lib/swiss-vocational-template'
import { swissTradesContactHeading, swissTradesLanguageLine } from '@/lib/swiss-trades-template'
import {
  SWISS_ENGINEERING_GEOMETRY as GEOMETRY,
  SWISS_ENGINEERING_SIZES as SIZES,
  swissEngineeringCertificateLine,
  swissEngineeringDates,
  swissEngineeringEducationLines,
  swissEngineeringProject,
  swissEngineeringSections,
  swissEngineeringSkillContent,
  type SwissEngineeringMainSectionId,
  type SwissEngineeringSideSectionId,
} from '@/lib/swiss-engineering-template'

const LINE_HEIGHT = SWISS_ENGINEERING_LINE_HEIGHT

/**
 * The word separator a text ends with where another text continues on the same
 * line, so the PDF's text layer does not run the two together. One
 * interpolated string with the text it follows, never a child of its own: see
 * `COLUMN_BREAK` in `swiss-vocational-template.tsx` for what was measured.
 */
const COLUMN_BREAK = ' '

/**
 * How both columns wrap text: at spaces only, a word never cut (the owner's
 * rule, every locale). `break-word` — not `anywhere`, which would let a column
 * shrink below a word that fits, and not `break-all` — breaks a word only as a
 * last resort, when that single word is wider than the whole line it is on:
 * a link or an address longer than the light column, which no wrapping at
 * spaces could hold and which would otherwise run off the page. Every word of
 * the long-word lists in `swiss-engineering-template.test.ts` fits the light
 * column whole. Set once on each column (`overflowWrap` and `wordBreak` on
 * `<main>` and `<aside>`), so nothing below it adds a rule.
 */

interface SwissEngineeringTemplateProps {
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
  /** Sidebar sections hidden through the layout model: this template draws the projects, skills, languages and certifications from them. */
  hiddenSidebarSections?: readonly EditorSidebarId[]
  /** Contact details the owner hid (FR-14), the photo among them; drawn through `visibleContactDetails`. */
  hiddenContactFields?: readonly ContactFieldId[]
  /**
   * The browser-local photo, drawn round at the top of the light column when
   * present and not hidden. It is uploaded from the Editor's Contact tab; the
   * CV draws no upload affordance and no empty frame (FR-5).
   */
  photoUrl?: string
}

/**
 * "Ingénierie & technique": a white main column with the name, the CV title
 * in blue, then the summary, the projects as key-achievement cards and the
 * experience; a light column down the right, behind a blue bar, holding a
 * round photo, the contact details, education, skills, languages and
 * certifications. Headings are blue spaced capitals.
 *
 * The mockup draws a level bar under each skill; the platform stores no level
 * per skill, so the skills are listed without bars (PRD out of scope).
 *
 * Sizes, geometry, section sequences and joined text come from
 * `@/lib/swiss-engineering-template`; dates, headings, contact entries and
 * level names from the shared Swiss helpers. `docx-swiss-engineering.ts` reads
 * the same. It draws its own typeface (the app's Inter) at its own sizes,
 * whatever font and font scale the layout model stores (FR-4): it takes neither.
 */
export function SwissEngineeringTemplate({
  resume,
  dict,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  hiddenContactFields,
  photoUrl,
}: SwissEngineeringTemplateProps) {
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
    const position = exp.position?.trim() ?? ''
    const meta = [exp.company?.trim(), exp.location?.trim()].filter(Boolean).join(', ')
    const dates = swissEngineeringDates(exp.startDate, exp.endDate, exp.current, dict)
    const achievements = (exp.achievements ?? []).filter(swissHasText)
    const description = achievements.length === 0 && swissHasText(exp.description) ? exp.description : null
    return position || meta || dates || achievements.length > 0 || description ? [{ position, meta, dates, achievements, description }] : []
  })
  const education = ((resume.education as unknown as ResumeEducation[]) || []).flatMap((edu) => {
    if (edu.visible === false) return []
    const lines = swissEngineeringEducationLines({
      degree: edu.degree,
      school: edu.school,
      field: edu.field,
      dates: swissEngineeringDates(edu.startDate, edu.endDate, false, dict),
    })
    const description = swissHasText(edu.description) ? edu.description : null
    return lines.lead || lines.detail || description ? [{ ...lines, description }] : []
  })
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissEngineeringSkillContent(skill)
    return content ? [{ category: skill.category?.trim() ?? '', content }] : []
  })
  const languages = ((resume.languages as unknown as ResumeLanguage[]) || []).filter(
    (lang) => lang.visible !== false && Boolean(lang.language?.trim()),
  )
  const certifications = ((resume.certifications as unknown as ResumeCertification[]) || []).flatMap((cert) => {
    if (cert.visible === false) return []
    const line = swissEngineeringCertificateLine(cert.name, cert.issuer, cert.date ? formatSwissMonth(cert.date) : '')
    return line ? [line] : []
  })

  const contactEntries = swissContactEntries(contact, dict)
  const sections = swissEngineeringSections(hiddenMainSections, hiddenSidebarSections)

  /** A section heading, in either column: blue spaced capitals. */
  const heading = (label: string) => (
    <h2
      className="font-bold uppercase tracking-widest"
      style={{
        color: '#1d4ed8',
        fontSize: `${size.heading}px`,
        lineHeight: LINE_HEIGHT.compact,
        marginBottom: `${GEOMETRY.headingGap}px`,
      }}
    >
      {label}
    </h2>
  )

  // ----------------------------------------------------------
  // The light column
  // ----------------------------------------------------------

  /** Lines of the light column, the space between two lines its row gap. */
  const columnLines = (lines: ReactNode[]) =>
    lines.map((line, index) => (
      <p key={index} style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.columnRowGap}px` }}>
        {line}
      </p>
    ))

  const renderSideSection = (sectionId: SwissEngineeringSideSectionId): ReactNode => {
    switch (sectionId) {
      case 'education': {
        if (education.length === 0) return null
        return (
          <section>
            {heading(swissHeading(dict, 'education'))}
            {education.map((edu, index) => (
              <div key={index} className="break-inside-avoid" style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.columnEntryGap}px` }}>
                {edu.lead && (
                  <p className="font-bold" style={{ color: '#0f172a' }}>
                    {edu.lead}
                  </p>
                )}
                {edu.detail && <p>{edu.detail}</p>}
                {edu.description && renderFormattedText(edu.description, { justify: false })}
              </div>
            ))}
          </section>
        )
      }

      case 'skills': {
        if (skills.length === 0) return null
        return (
          <section>
            {heading(swissHeading(dict, 'skills'))}
            {skills.map((skill, index) => (
              <div key={index} className="break-inside-avoid" style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.columnEntryGap}px` }}>
                {/* The mockup draws no category; the stored category is content, so
                    it is drawn as a caption on its own line above its skills, as
                    every Swiss template stacks it (FR-1, FR-15). */}
                {skill.category && (
                  <p className="font-semibold" style={{ color: '#0f172a', marginBottom: `${GEOMETRY.skillCaptionGap}px` }}>
                    {skill.category}
                  </p>
                )}
                {skill.content.kind === 'lines'
                  ? columnLines(skill.content.lines)
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
            {heading(swissHeading(dict, 'languages'))}
            {columnLines(languages.map((lang) => swissTradesLanguageLine(lang.language, swissLanguageLevel(dict, lang.level))))}
          </section>
        )
      }

      case 'training': {
        if (certifications.length === 0) return null
        return (
          <section className="break-inside-avoid">
            {heading(swissHeading(dict, 'training'))}
            {columnLines(certifications)}
          </section>
        )
      }
    }
  }

  // The photo, the contact details, then the sections: whatever is drawn, in
  // that order. An empty section draws nothing, its heading included (FR-2).
  const sideBlocks: { key: string; content: ReactNode }[] = []
  if (photo) {
    sideBlocks.push({
      key: 'photo',
      content: (
        <div className="flex justify-center">
          <div
            className="swiss-engineering-photo shrink-0 overflow-hidden"
            style={{
              width: `${GEOMETRY.photo}px`,
              height: `${GEOMETRY.photo}px`,
              borderRadius: '50%',
              borderWidth: `${GEOMETRY.photoRing}px`,
              borderStyle: 'solid',
              borderColor: '#cbd5e1',
              backgroundColor: '#e2e8f0',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a browser-local data URL, which next/image cannot optimise */}
            <img src={photo} alt="" className="h-full w-full object-cover" />
          </div>
        </div>
      ),
    })
  }
  if (contactEntries.length > 0) {
    sideBlocks.push({
      key: 'contact',
      content: (
        <section className="break-inside-avoid">
          {heading(swissTradesContactHeading(dict))}
          {/* The mockup draws the values without labels. */}
          {columnLines(contactEntries.map((entry) => entry.value))}
        </section>
      ),
    })
  }
  for (const sectionId of sections.side) {
    const content = renderSideSection(sectionId)
    if (content !== null) sideBlocks.push({ key: sectionId, content })
  }

  // ----------------------------------------------------------
  // The main column
  // ----------------------------------------------------------

  /** An experience's details: its achievements as bullets, or else its description. */
  const details = (achievements: readonly string[], description: string | null): ReactNode =>
    achievements.length > 0 ? (
      <ul className="list-disc" style={{ color: '#1e293b', marginTop: `${GEOMETRY.detailGap}px`, paddingLeft: `${GEOMETRY.bulletIndent}px` }}>
        {achievements.map((achievement, i) => (
          <li key={i}>{renderFormattedText(achievement, { justify: false })}</li>
        ))}
      </ul>
    ) : description ? (
      <div style={{ color: '#1e293b', marginTop: `${GEOMETRY.detailGap}px` }}>{renderFormattedText(description, { justify: false })}</div>
    ) : null

  /**
   * A section whose heading never ends a printed page alone: the heading and
   * the first entry are kept together, and each further entry breaks as an
   * entry does.
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

  const renderMainSection = (sectionId: SwissEngineeringMainSectionId): ReactNode => {
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

      case 'keyAchievements': {
        if (projects.length === 0) return null
        return entrySection(
          swissHeading(dict, 'keyAchievements'),
          projects.map((project, index) => (
            <div
              key={index}
              className="swiss-engineering-card break-inside-avoid"
              style={{
                marginTop: index === 0 ? 0 : `${GEOMETRY.cardGap}px`,
                backgroundColor: '#f8fafc',
                borderWidth: `${GEOMETRY.cardBorder}px`,
                borderStyle: 'solid',
                borderColor: '#bfdbfe',
                borderLeftWidth: `${GEOMETRY.cardBar}px`,
                borderLeftColor: '#2563eb',
                borderRadius: `${GEOMETRY.cardRadius}px`,
                padding: `${GEOMETRY.cardPaddingY}px ${GEOMETRY.cardPaddingX}px`,
                fontSize: `${size.body}px`,
                lineHeight: LINE_HEIGHT.text,
              }}
            >
              {project.name && (
                <p className="font-bold" style={{ color: '#0f172a' }}>
                  {project.name}
                </p>
              )}
              {project.description && (
                <div style={{ color: '#1e293b' }}>{renderFormattedText(project.description, { justify: false })}</div>
              )}
              {(project.technologies || project.url) && (
                <div style={{ color: '#64748b' }}>
                  {project.technologies && <p>{project.technologies}</p>}
                  {project.url && <p>{project.url}</p>}
                </div>
              )}
            </div>
          )),
        )
      }

      case 'experience': {
        if (experiences.length === 0) return null
        return entrySection(
          swissHeading(dict, 'experience'),
          experiences.map((exp, index) => {
            // The position in bold, or the company when there is no position, so
            // the entry still opens with a line of its own; the company line
            // under a position. A value that is not stored leaves no line (FR-2).
            const first = exp.position || exp.meta
            return (
              <div
                key={index}
                className="break-inside-avoid"
                style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.entryGap}px`, fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}
              >
                {(first || exp.dates) && (
                  <div className="flex items-baseline justify-between" style={{ columnGap: `${GEOMETRY.dateGap}px` }}>
                    <p className="min-w-0 font-bold" style={{ color: '#0f172a' }}>
                      {exp.dates ? `${first}${COLUMN_BREAK}` : first}
                    </p>
                    {/* Never wrapped: a date is one unit, and the widest of every
                        locale fits the line beside its title. */}
                    {exp.dates && (
                      <p className="shrink-0 whitespace-nowrap" style={{ color: '#64748b', fontSize: `${size.date}px` }}>
                        {exp.dates}
                      </p>
                    )}
                  </div>
                )}
                {exp.position && exp.meta && <p style={{ color: '#64748b' }}>{exp.meta}</p>}
                {details(exp.achievements, exp.description)}
              </div>
            )
          }),
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
      className="swiss-engineering-template relative mx-auto flex bg-white shadow-lg print:shadow-none"
      style={{ width: PAGE_WIDTH_CSS, minHeight: PAGE_HEIGHT_CSS }}
    >
      <main
        className="min-w-0 flex-1"
        style={{
          overflowWrap: 'break-word',
          wordBreak: 'normal',
          padding: `${GEOMETRY.mainPaddingTop}px ${GEOMETRY.mainPaddingRight}px ${GEOMETRY.mainPaddingBottom}px ${GEOMETRY.mainPaddingLeft}px`,
        }}
      >
        {contact.name && (
          <h1 className="font-bold" style={{ color: '#0f172a', fontSize: `${size.name}px`, lineHeight: LINE_HEIGHT.name }}>
            {contact.name}
          </h1>
        )}
        {title && (
          <p
            className="font-medium"
            style={{
              color: '#1d4ed8',
              fontSize: `${size.title}px`,
              lineHeight: LINE_HEIGHT.compact,
              marginTop: contact.name ? `${GEOMETRY.nameGap}px` : 0,
            }}
          >
            {title}
          </p>
        )}
        {drawnMain.map(({ sectionId, content }, index) => (
          <div
            key={sectionId}
            style={{ marginTop: index === 0 ? (hasHeader ? `${GEOMETRY.titleGap}px` : 0) : `${GEOMETRY.sectionGap}px` }}
          >
            {content}
          </div>
        ))}
      </main>

      <aside
        className="shrink-0"
        style={{
          overflowWrap: 'break-word',
          wordBreak: 'normal',
          width: `${GEOMETRY.columnWidth}px`,
          backgroundColor: '#f1f5f9',
          borderLeftWidth: `${GEOMETRY.columnBar}px`,
          borderLeftStyle: 'solid',
          borderLeftColor: '#2563eb',
          color: '#1e293b',
          fontSize: `${size.column}px`,
          lineHeight: LINE_HEIGHT.text,
          padding: `${GEOMETRY.columnPaddingTop}px ${GEOMETRY.columnPaddingX}px ${GEOMETRY.columnPaddingBottom}px`,
        }}
      >
        {sideBlocks.map(({ key, content }, index) => (
          <div
            key={key}
            style={{
              marginTop: index === 0 ? 0 : `${sideBlocks[index - 1].key === 'photo' ? GEOMETRY.photoGap : GEOMETRY.columnSectionGap}px`,
            }}
          >
            {content}
          </div>
        ))}
      </aside>
    </div>
  )
}
