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
import { SWISS_COMMERCE_LINE_HEIGHT } from '@/lib/resume-line-height'
import { DEFAULT_RESUME_LAYOUT, type EditorMainId, type EditorSidebarId } from '@/lib/layout-settings'
import {
  formatSwissDateRange,
  formatSwissMonth,
  swissContactEntries,
  swissHeading,
  swissHasText,
  swissLanguageLevel,
  swissSkillContent,
} from '@/lib/swiss-vocational-template'
import {
  SWISS_COMMERCE_GEOMETRY as GEOMETRY,
  SWISS_COMMERCE_SIZES as SIZES,
  swissCommerceLanguagePill,
  swissCommerceSections,
  swissCommerceSkillLabel,
  type SwissCommerceSectionId,
} from '@/lib/swiss-commerce-template'

const LINE_HEIGHT = SWISS_COMMERCE_LINE_HEIGHT

/**
 * The word separator a column's text ends with where another column's text
 * continues on the same line, so the PDF's text layer does not run the two
 * together. One interpolated string with the text it follows, never a child of
 * its own: see `COLUMN_BREAK` in `swiss-vocational-template.tsx` for what was
 * measured.
 */
const COLUMN_BREAK = '\u00A0'

/** The width of `COLUMN_BREAK` in Inter, in em: a no-break space is as wide as a space. */
const COLUMN_BREAK_EM = 0.25

interface SwissCommerceTemplateProps {
  resume: Resume
  /**
   * Passed by every caller like any template's, and not read: every word this
   * template draws comes from `dict`, and its months are printed `MM.YYYY` in
   * every locale.
   */
  locale: Locale
  /** The `common` dictionary: headings, dates, contact labels and level names are read from it. */
  dict: unknown
  /** Main sections hidden through the layout model, in the editor's vocabulary. */
  hiddenMainSections?: readonly EditorMainId[]
  /** Sidebar sections hidden through the layout model: this template draws skills, languages and training from them. */
  hiddenSidebarSections?: readonly EditorSidebarId[]
  /** Contact details the owner hid (FR-14), the photo among them; drawn through `visibleContactDetails`. */
  hiddenContactFields?: readonly ContactFieldId[]
  /**
   * The browser-local photo, drawn round in the header band when present and
   * not hidden. It is uploaded from the Editor's Contact tab; the CV draws no
   * upload affordance and no empty frame (FR-5).
   */
  photoUrl?: string
}

/**
 * "Commerce & administration": a full-width navy band with a round photo, the
 * name, the CV title and one row of contact details, then one column on white:
 * summary, experience, education, skills in two columns, languages as pills,
 * and certifications. Dated rows put their dates in a left column.
 *
 * Sizes, geometry and section sequence come from `@/lib/swiss-commerce-template`;
 * dates, headings, contact entries and level names from
 * `@/lib/swiss-vocational-template`. `docx-swiss-commerce.ts` reads the same.
 * It draws its own typeface (the app's Inter) at its own sizes, whatever font
 * and font scale the layout model stores (FR-4): it takes neither.
 */
export function SwissCommerceTemplate({
  resume,
  dict,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  hiddenContactFields,
  photoUrl,
}: SwissCommerceTemplateProps) {
  const size = SIZES

  const { contact, title, photoVisible } = visibleContactDetails(resume, hiddenContactFields)
  const photo = photoVisible ? photoUrl : undefined
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).filter((exp) => exp.visible !== false)
  const education = ((resume.education as unknown as ResumeEducation[]) || []).filter((edu) => edu.visible !== false)
  const certifications = ((resume.certifications as unknown as ResumeCertification[]) || []).filter(
    (cert) => cert.visible !== false,
  )
  // A row whose content is empty draws nothing, so it is not a row (FR-2).
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissSkillContent(skill)
    return content ? [{ category: skill.category, content }] : []
  })
  const languages = ((resume.languages as unknown as ResumeLanguage[]) || []).filter((lang) => lang.visible !== false)

  const contactEntries = swissContactEntries(contact, dict)
  const sections = swissCommerceSections(hiddenMainSections, hiddenSidebarSections)

  const heading = (label: string) => (
    <h2
      className="font-bold uppercase tracking-widest"
      style={{
        color: '#1f3a5f',
        borderBottom: `${GEOMETRY.headingRule}px solid`,
        borderColor: '#1f3a5f',
        fontSize: `${size.heading}px`,
        lineHeight: LINE_HEIGHT.compact,
        paddingBottom: `${GEOMETRY.headingRuleGap}px`,
        marginBottom: `${GEOMETRY.headingGap}px`,
      }}
    >
      {label}
    </h2>
  )

  /** A row with its dates in the left column and its content on the right; kept on one page when it fits. */
  const datedRow = (key: number, dates: string, content: ReactNode) => (
    <div
      key={key}
      className="grid break-inside-avoid"
      style={{ gridTemplateColumns: `${GEOMETRY.dateColumn}px 1fr`, marginTop: key === 0 ? 0 : `${GEOMETRY.entryGap}px` }}
    >
      <div className="font-medium text-slate-500" style={{ fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
        {dates && `${dates}${COLUMN_BREAK}`}
      </div>
      <div style={{ fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>{content}</div>
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

  const renderSection = (sectionId: SwissCommerceSectionId): ReactNode => {
    switch (sectionId) {
      case 'summary': {
        if (!swissHasText(resume.summary)) return null
        return (
          <section className="break-inside-avoid">
            {heading(swissHeading(dict, 'summary'))}
            <div className="text-slate-800" style={{ fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
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
            datedRow(
              index,
              formatSwissDateRange(exp.startDate, exp.endDate, exp.current, dict),
              <>
                <p>
                  <span className="font-bold text-slate-900">{exp.position}</span>
                  {exp.company && (
                    <span className="text-slate-500">
                      {' · '}
                      {exp.company}
                      {exp.location && `, ${exp.location}`}
                    </span>
                  )}
                </p>
                {(exp.achievements ?? []).some(swissHasText) ? (
                  <ul className="mt-1 list-disc pl-5 text-slate-800">
                    {(exp.achievements ?? []).filter(swissHasText).map((achievement, i) => (
                      <li key={i}>{renderFormattedText(achievement, { justify: false })}</li>
                    ))}
                  </ul>
                ) : swissHasText(exp.description) ? (
                  <div className="mt-1 text-slate-800">{renderFormattedText(exp.description, { justify: false })}</div>
                ) : null}
              </>,
            ),
          ),
        )
      }

      case 'education': {
        if (education.length === 0) return null
        return entrySection(
          swissHeading(dict, 'education'),
          education.map((edu, index) =>
            datedRow(
              index,
              formatSwissDateRange(edu.startDate, edu.endDate, false, dict),
              <>
                {edu.degree && <p className="font-bold text-slate-900">{edu.degree}</p>}
                {(edu.school || edu.field) && (
                  <p className="text-slate-500">{[edu.school, edu.field].filter(Boolean).join(' · ')}</p>
                )}
                {swissHasText(edu.description) && (
                  <div className="mt-1 text-slate-800">{renderFormattedText(edu.description, { justify: false })}</div>
                )}
              </>,
            ),
          ),
        )
      }

      case 'skills': {
        if (skills.length === 0) return null
        return (
          <section className="break-inside-avoid">
            {heading(swissHeading(dict, 'skills'))}
            <div
              className="grid grid-cols-2"
              style={{
                columnGap: `${GEOMETRY.skillColumnGap}px`,
                rowGap: `${GEOMETRY.skillRowGap}px`,
                fontSize: `${size.body}px`,
                lineHeight: LINE_HEIGHT.text,
              }}
            >
              {/* Each category leads its skills on the same line, and a skill
                  line that wraps continues at the cell's full width under the
                  label. The block right after the label is drawn inline: the
                  rich-text wrapper, whose first paragraph runs on from the
                  label, or the first plain-text block `formatText` draws. Any
                  further paragraph, and a list, starts on its own line, as the
                  Word export draws them. */}
              {skills.map((skill, index) => (
                <div
                  key={index}
                  className="min-w-0 break-words text-slate-800 [&>span+div]:inline [&>span+div>p:first-child]:inline"
                >
                  {/* The gap after the label is a no-break space in the label's own
                      text node: a separate space node is lost from the PDF's text
                      layer, which then reads "Label:skills". */}
                  <span className="font-bold" style={{ color: '#1f3a5f' }}>
                    {`${swissCommerceSkillLabel(skill.category)}${COLUMN_BREAK}`}
                  </span>
                  {skill.content.kind === 'html'
                    ? renderFormattedText(skill.content.html, { justify: false })
                    : `${skill.content.text}${COLUMN_BREAK}`}
                </div>
              ))}
            </div>
          </section>
        )
      }

      case 'languages': {
        if (languages.length === 0) return null
        return (
          <section className="break-inside-avoid">
            {heading(swissHeading(dict, 'languages'))}
            {/* Inline pills separated by a space and a margin that together make
                the gap. A pill's text ends in its own separator, since the space
                between two inline blocks does not reach the PDF's text layer. */}
            <div style={{ fontSize: `${size.pill}px`, lineHeight: LINE_HEIGHT.compact, marginBottom: `-${GEOMETRY.pillGap}px` }}>
              {languages.map((lang, index) => (
                <span key={index}>
                  {index > 0 && ' '}
                  <span
                    className="swiss-commerce-pill inline-block whitespace-nowrap border-blue-200 bg-blue-50 text-slate-800"
                    style={{
                      borderWidth: `${GEOMETRY.pillBorder}px`,
                      borderStyle: 'solid',
                      borderRadius: `${GEOMETRY.pillRadius}px`,
                      // The trailing separator takes its width out of the right padding,
                      // so the pill keeps its drawn size.
                      padding: `${GEOMETRY.pillPaddingY}px calc(${GEOMETRY.pillPaddingX}px - ${COLUMN_BREAK_EM}em) ${GEOMETRY.pillPaddingY}px ${GEOMETRY.pillPaddingX}px`,
                      marginRight: `${GEOMETRY.pillGap / 2}px`,
                      marginBottom: `${GEOMETRY.pillGap}px`,
                    }}
                  >
                    {/* Its separator parts this pill from the next one in the PDF's text layer. */}
                    {`${swissCommerceLanguagePill(lang.language, swissLanguageLevel(dict, lang.level))}${COLUMN_BREAK}`}
                  </span>
                </span>
              ))}
            </div>
          </section>
        )
      }

      case 'training': {
        if (certifications.length === 0) return null
        return entrySection(
          swissHeading(dict, 'training'),
          certifications.map((cert, index) =>
            datedRow(
              index,
              cert.date ? formatSwissMonth(cert.date) : '',
              <p>
                <span className="font-bold text-slate-900">{cert.name}</span>
                {cert.issuer && <span className="text-slate-500">{` · ${cert.issuer}`}</span>}
              </p>,
            ),
          ),
        )
      }
    }
  }

  // An empty section draws nothing at all, its heading included (FR-2), and
  // the first section drawn is the one that sits under the band.
  const drawn = sections.flatMap((sectionId) => {
    const content = renderSection(sectionId)
    return content === null ? [] : [{ sectionId, content }]
  })

  return (
    <div
      data-testid="resume-document"
      className="swiss-commerce-template relative mx-auto bg-white shadow-lg print:shadow-none"
      style={{ width: PAGE_WIDTH_CSS, paddingBottom: `${GEOMETRY.paddingBottom}px` }}
    >
      <header
        className="flex items-center"
        style={{
          backgroundColor: '#1f3a5f',
          padding: `${GEOMETRY.bandPaddingY}px ${GEOMETRY.paddingX}px`,
          columnGap: `${GEOMETRY.photoGap}px`,
        }}
      >
        {photo && (
          <div
            className="swiss-commerce-photo shrink-0 overflow-hidden rounded-full border-blue-300"
            style={{
              width: `${GEOMETRY.photo}px`,
              height: `${GEOMETRY.photo}px`,
              borderWidth: `${GEOMETRY.photoRing}px`,
              borderStyle: 'solid',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a browser-local data URL, which next/image cannot optimise */}
            <img src={photo} alt="" className="h-full w-full object-cover" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {contact.name && (
            <h1 className="font-bold text-white" style={{ fontSize: `${size.name}px`, lineHeight: LINE_HEIGHT.name }}>
              {contact.name}
            </h1>
          )}
          {title && (
            <p
              className="uppercase tracking-widest text-blue-300"
              style={{ fontSize: `${size.title}px`, lineHeight: LINE_HEIGHT.compact, marginTop: `${GEOMETRY.nameGap}px` }}
            >
              {title}
            </p>
          )}
          {contactEntries.length > 0 && (
            <p
              className="flex flex-wrap text-blue-100"
              style={{
                columnGap: `${GEOMETRY.contactGap}px`,
                fontSize: `${size.contact}px`,
                lineHeight: LINE_HEIGHT.compact,
                marginTop: `${GEOMETRY.titleGap}px`,
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
