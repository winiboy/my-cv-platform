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
import { SWISS_HEALTH_LINE_HEIGHT } from '@/lib/resume-line-height'
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
  SWISS_HEALTH_GEOMETRY as GEOMETRY,
  SWISS_HEALTH_SEPARATOR,
  SWISS_HEALTH_SIZES as SIZES,
  swissHealthLanguageLine,
  swissHealthSections,
  swissHealthSkillContent,
  type SwissHealthSectionId,
} from '@/lib/swiss-health-template'

const LINE_HEIGHT = SWISS_HEALTH_LINE_HEIGHT

/**
 * The word separator a text ends with where another text continues on the same
 * line, so the PDF's text layer does not run the two together. One
 * interpolated string with the text it follows, never a child of its own: see
 * `COLUMN_BREAK` in `swiss-vocational-template.tsx` for what was measured.
 */
const COLUMN_BREAK = ' '

interface SwissHealthTemplateProps {
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
   * The browser-local photo, drawn round beside the name when present and not
   * hidden. It is uploaded from the Editor's Contact tab; the CV draws no
   * upload affordance and no empty frame (FR-5).
   */
  photoUrl?: string
}

/**
 * "Santé & social": one column on white with a teal accent. A round photo
 * beside the name, the CV title in teal and one line of contact details; then
 * summary, education, experience and continuing education (certifications)
 * under pill-shaped headings, each dated entry with its dates in a left
 * column behind a thin light-teal bar; then skills and languages side by side.
 *
 * Sizes, geometry, section sequence and skill text come from
 * `@/lib/swiss-health-template`; dates, headings, contact entries and level
 * names from `@/lib/swiss-vocational-template`. `docx-swiss-health.ts` reads
 * the same. It draws its own typeface (the app's Inter) at its own sizes,
 * whatever font and font scale the layout model stores (FR-4): it takes neither.
 */
export function SwissHealthTemplate({
  resume,
  dict,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  hiddenContactFields,
  photoUrl,
}: SwissHealthTemplateProps) {
  const size = SIZES

  const { contact, title, photoVisible } = visibleContactDetails(resume, hiddenContactFields)
  const photo = photoVisible ? photoUrl : undefined
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).filter((exp) => exp.visible !== false)
  const education = ((resume.education as unknown as ResumeEducation[]) || []).filter((edu) => edu.visible !== false)
  const certifications = ((resume.certifications as unknown as ResumeCertification[]) || []).flatMap((cert) => {
    if (cert.visible === false) return []
    const name = cert.name?.trim() ?? ''
    const issuer = cert.issuer?.trim() ?? ''
    const date = cert.date ? formatSwissMonth(cert.date) : ''
    return name || issuer || date ? [{ name, issuer, date }] : []
  })
  // A row whose content is empty draws nothing, so it is not a row (FR-2).
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissHealthSkillContent(skill)
    return content ? [{ category: skill.category?.trim() ?? '', content }] : []
  })
  const languages = ((resume.languages as unknown as ResumeLanguage[]) || []).filter(
    (lang) => lang.visible !== false && Boolean(lang.language?.trim()),
  )

  const contactEntries = swissContactEntries(contact, dict)
  const sections = swissHealthSections(hiddenMainSections, hiddenSidebarSections)

  /** A section heading drawn as a pill: dark-teal spaced capitals on a light-teal fill. */
  const heading = (label: string) => (
    <h2
      className="swiss-health-pill w-fit max-w-full break-words font-bold uppercase tracking-widest"
      style={{
        color: '#134e4a',
        backgroundColor: '#ccfbf1',
        borderRadius: `${GEOMETRY.pillRadius}px`,
        padding: `${GEOMETRY.pillPaddingY}px ${GEOMETRY.pillPaddingX}px`,
        fontSize: `${size.pill}px`,
        lineHeight: LINE_HEIGHT.compact,
        marginBottom: `${GEOMETRY.headingGap}px`,
      }}
    >
      {label}
    </h2>
  )

  /**
   * A dated entry: its dates in the left column, in teal, behind the thin
   * light-teal bar that runs the entry's full height; its content on the
   * right. Kept on one page when it fits.
   */
  const datedRow = (key: number, dates: string, content: ReactNode) => (
    <div
      key={key}
      className="grid break-inside-avoid"
      style={{
        gridTemplateColumns: `${GEOMETRY.dateColumn - GEOMETRY.entryBar}px minmax(0, 1fr)`,
        borderLeftWidth: `${GEOMETRY.entryBar}px`,
        borderLeftStyle: 'solid',
        borderLeftColor: '#99f6e4',
        marginTop: key === 0 ? 0 : `${GEOMETRY.entryGap}px`,
        fontSize: `${size.body}px`,
        lineHeight: LINE_HEIGHT.text,
      }}
    >
      <p
        className="font-medium"
        style={{
          color: '#0f766e',
          fontSize: `${size.date}px`,
          lineHeight: LINE_HEIGHT.text,
          paddingLeft: `${GEOMETRY.datePaddingLeft}px`,
        }}
      >
        {dates && `${dates}${COLUMN_BREAK}`}
      </p>
      <div className="min-w-0 break-words">{content}</div>
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

  const skillsBlock = (): ReactNode => (
    <section className="min-w-0">
      {heading(swissHeading(dict, 'skills'))}
      {skills.map((skill, index) => (
        <div
          key={index}
          className="break-words"
          style={{
            color: '#1e293b',
            fontSize: `${size.body}px`,
            lineHeight: LINE_HEIGHT.text,
            marginTop: index === 0 ? 0 : `${GEOMETRY.skillCategoryGap}px`,
          }}
        >
          {/* The mockup draws no category; the stored category is content, so it
              is drawn, small, as a caption above its own skills (FR-1). */}
          {skill.category && (
            <p
              className="font-semibold"
              style={{
                color: '#134e4a',
                fontSize: `${size.skillCaption}px`,
                lineHeight: LINE_HEIGHT.compact,
                marginBottom: `${GEOMETRY.skillCaptionGap}px`,
              }}
            >
              {skill.category}
            </p>
          )}
          {skill.content.kind === 'text' ? (
            <p>{skill.content.text}</p>
          ) : (
            renderFormattedText(skill.content.html, { justify: false })
          )}
        </div>
      ))}
    </section>
  )

  const languagesBlock = (): ReactNode => (
    <section className="min-w-0">
      {heading(swissHeading(dict, 'languages'))}
      <div className="break-words" style={{ color: '#1e293b', fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
        {languages.map((lang, index) => (
          <p key={index}>{swissHealthLanguageLine(lang.language, swissLanguageLevel(dict, lang.level))}</p>
        ))}
      </div>
    </section>
  )

  const skillsDrawn = sections.includes('skills') && skills.length > 0
  const languagesDrawn = sections.includes('languages') && languages.length > 0

  const renderSection = (sectionId: SwissHealthSectionId): ReactNode => {
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

      case 'education': {
        if (education.length === 0) return null
        return entrySection(
          swissHeading(dict, 'education'),
          education.map((edu, index) => {
            // The degree, or the school when there is no degree, so the entry
            // still opens with a bold line of its own; a value that is not
            // stored leaves no line (FR-2).
            const degree = edu.degree?.trim() ?? ''
            const school = [edu.school?.trim(), edu.field?.trim()].filter(Boolean).join(', ')
            const first = degree || school
            return datedRow(
              index,
              formatSwissDateRange(edu.startDate, edu.endDate, false, dict),
              <>
                {first && (
                  <p className="font-bold" style={{ color: '#0f172a' }}>
                    {first}
                  </p>
                )}
                {degree && school && <p style={{ color: '#64748b' }}>{school}</p>}
                {details([], edu.description)}
              </>,
            )
          }),
        )
      }

      case 'experience': {
        if (experiences.length === 0) return null
        return entrySection(
          swissHeading(dict, 'experience'),
          experiences.map((exp, index) => {
            // The position, then its employer on the same line after " · "; the
            // employer as the bold line when there is no position.
            const position = exp.position?.trim() ?? ''
            const employer = [exp.company?.trim(), exp.location?.trim()].filter(Boolean).join(', ')
            const first = position || employer
            return datedRow(
              index,
              formatSwissDateRange(exp.startDate, exp.endDate, exp.current, dict),
              <>
                {first && (
                  <p>
                    <span className="font-bold" style={{ color: '#0f172a' }}>
                      {first}
                    </span>
                    {position && employer && <span style={{ color: '#64748b' }}>{`${SWISS_HEALTH_SEPARATOR}${employer}`}</span>}
                  </p>
                )}
                {details((exp.achievements ?? []).filter(swissHasText), exp.description)}
              </>,
            )
          }),
        )
      }

      case 'training': {
        if (certifications.length === 0) return null
        return entrySection(
          swissHeading(dict, 'training'),
          certifications.map(({ name, issuer, date }, index) =>
            datedRow(
              index,
              date,
              name || issuer ? (
                <p>
                  {name && (
                    <span className="font-bold" style={{ color: '#0f172a' }}>
                      {name}
                    </span>
                  )}
                  {issuer && <span style={{ color: '#64748b' }}>{name ? `${SWISS_HEALTH_SEPARATOR}${issuer}` : issuer}</span>}
                </p>
              ) : null,
            ),
          ),
        )
      }

      case 'skills': {
        if (!skillsDrawn) return null
        if (!languagesDrawn) return <div className="break-inside-avoid">{skillsBlock()}</div>
        // Skills and languages side by side, as the mockup draws them. When
        // one of the two is not drawn, the other takes the full width alone,
        // so no empty half-column is left beside it.
        return (
          <div className="grid grid-cols-2 break-inside-avoid" style={{ columnGap: `${GEOMETRY.columnGap}px` }}>
            {skillsBlock()}
            {languagesBlock()}
          </div>
        )
      }

      case 'languages': {
        // Drawn beside the skills when both are drawn.
        if (!languagesDrawn || skillsDrawn) return null
        return <div className="break-inside-avoid">{languagesBlock()}</div>
      }
    }
  }

  // An empty section draws nothing at all, its heading included (FR-2).
  const drawn = sections.flatMap((sectionId) => {
    const content = renderSection(sectionId)
    return content === null ? [] : [{ sectionId, content }]
  })
  const hasHeader = Boolean(photo || contact.name || title || contactEntries.length > 0)

  return (
    <div
      data-testid="resume-document"
      className="swiss-health-template relative mx-auto bg-white shadow-lg print:shadow-none"
      style={{
        width: PAGE_WIDTH_CSS,
        padding: `${GEOMETRY.paddingTop}px ${GEOMETRY.paddingX}px ${GEOMETRY.paddingBottom}px`,
      }}
    >
      {hasHeader && (
        <header className="flex items-center" style={{ columnGap: `${GEOMETRY.photoGap}px` }}>
          {photo && (
            <div
              className="swiss-health-photo shrink-0 overflow-hidden"
              style={{
                width: `${GEOMETRY.photo}px`,
                height: `${GEOMETRY.photo}px`,
                borderRadius: '50%',
                borderWidth: `${GEOMETRY.photoRing}px`,
                borderStyle: 'solid',
                borderColor: '#99f6e4',
                backgroundColor: '#f0fdfa',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a browser-local data URL, which next/image cannot optimise */}
              <img src={photo} alt="" className="h-full w-full object-cover" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            {contact.name && (
              <h1 className="break-words font-bold" style={{ color: '#134e4a', fontSize: `${size.name}px`, lineHeight: LINE_HEIGHT.name }}>
                {contact.name}
              </h1>
            )}
            {title && (
              <p
                className="break-words font-medium"
                style={{
                  color: '#0f766e',
                  fontSize: `${size.title}px`,
                  lineHeight: LINE_HEIGHT.compact,
                  marginTop: contact.name ? `${GEOMETRY.nameGap}px` : 0,
                }}
              >
                {title}
              </p>
            )}
            {contactEntries.length > 0 && (
              <p
                className="flex flex-wrap"
                style={{
                  color: '#475569',
                  columnGap: `${GEOMETRY.contactGap}px`,
                  fontSize: `${size.contact}px`,
                  lineHeight: LINE_HEIGHT.compact,
                  marginTop: contact.name || title ? `${GEOMETRY.titleGap}px` : 0,
                }}
              >
                {contactEntries.map((entry) => (
                  // The mockup draws the values without labels. Its separator
                  // parts this value from the next one in the PDF's text layer.
                  <span key={entry.key} className="min-w-0 break-words">
                    {`${entry.value}${COLUMN_BREAK}`}
                  </span>
                ))}
              </p>
            )}
          </div>
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
