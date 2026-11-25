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
import { PAGE_HEIGHT_CSS, PAGE_WIDTH_CSS } from '@/lib/resume-page-size'
import { SWISS_TRADES_LINE_HEIGHT } from '@/lib/resume-line-height'
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
  SWISS_TRADES_GEOMETRY as GEOMETRY,
  SWISS_TRADES_SIZES as SIZES,
  swissTradesCertificateDetail,
  swissTradesContactHeading,
  swissTradesLanguageLine,
  swissTradesSections,
  swissTradesSkillContent,
  type SwissTradesMainSectionId,
  type SwissTradesSidebarSectionId,
} from '@/lib/swiss-trades-template'

const LINE_HEIGHT = SWISS_TRADES_LINE_HEIGHT

/**
 * The word separator a text ends with where another text continues on the same
 * line or in the next box, so the PDF's text layer does not run the two
 * together. One interpolated string with the text it follows, never a child of
 * its own: see `COLUMN_BREAK` in `swiss-vocational-template.tsx` for what was
 * measured.
 */
const COLUMN_BREAK = ' '

/** The width of `COLUMN_BREAK` in Inter, in em: a no-break space is as wide as a space. */
const COLUMN_BREAK_EM = 0.25

interface SwissTradesTemplateProps {
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
  /** Sidebar sections hidden through the layout model: this template draws skills, training and languages from them. */
  hiddenSidebarSections?: readonly EditorSidebarId[]
  /** Contact details the owner hid (FR-14), the photo among them; drawn through `visibleContactDetails`. */
  hiddenContactFields?: readonly ContactFieldId[]
  /**
   * The browser-local photo, drawn at the top of the dark column when present
   * and not hidden. It is uploaded from the Editor's Contact tab; the CV draws
   * no upload affordance and no empty frame (FR-5).
   */
  photoUrl?: string
}

/**
 * "Métiers techniques & manuels": a dark column down the left holding the
 * photo, the contact details, the skills as tags, the certificates and the
 * languages; a white main column with the name, the CV title in orange, then
 * summary, experience and education under headings that a light-orange rule
 * follows to the column's edge. Dates sit at the right of each entry.
 *
 * Sizes, geometry, section sequences and skill tags come from
 * `@/lib/swiss-trades-template`; dates, headings, contact entries and level
 * names from `@/lib/swiss-vocational-template`. `docx-swiss-trades.ts` reads
 * the same. It draws its own typeface (the app's Inter) at its own sizes,
 * whatever font and font scale the layout model stores (FR-4): it takes neither.
 */
export function SwissTradesTemplate({
  resume,
  dict,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  hiddenContactFields,
  photoUrl,
}: SwissTradesTemplateProps) {
  const size = SIZES

  const { contact, title, photoVisible } = visibleContactDetails(resume, hiddenContactFields)
  const photo = photoVisible ? photoUrl : undefined
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).filter((exp) => exp.visible !== false)
  const education = ((resume.education as unknown as ResumeEducation[]) || []).filter((edu) => edu.visible !== false)
  // A row whose content is empty draws nothing, so it is not a row (FR-2).
  const skills = ((resume.skills as unknown as ResumeSkillCategory[]) || []).flatMap((skill) => {
    const content = skill.visible === false ? null : swissTradesSkillContent(skill)
    return content ? [{ category: skill.category?.trim() ?? '', content }] : []
  })
  const certifications = ((resume.certifications as unknown as ResumeCertification[]) || []).flatMap((cert) => {
    if (cert.visible === false) return []
    const name = cert.name?.trim() ?? ''
    const detail = swissTradesCertificateDetail(cert.issuer, cert.date ? formatSwissMonth(cert.date) : '')
    return name || detail ? [{ name, detail }] : []
  })
  const languages = ((resume.languages as unknown as ResumeLanguage[]) || []).filter(
    (lang) => lang.visible !== false && Boolean(lang.language?.trim()),
  )

  const contactEntries = swissContactEntries(contact, dict)
  const sections = swissTradesSections(hiddenMainSections, hiddenSidebarSections)

  // ----------------------------------------------------------
  // The dark column
  // ----------------------------------------------------------

  const sidebarHeading = (label: string) => (
    <h2
      className="font-bold uppercase tracking-widest"
      style={{
        color: '#fdba74',
        fontSize: `${size.sidebarHeading}px`,
        lineHeight: LINE_HEIGHT.compact,
        marginBottom: `${GEOMETRY.sidebarHeadingGap}px`,
      }}
    >
      {label}
    </h2>
  )

  /** A list of lines in the dark column, the space between two lines its row gap. */
  const sidebarLines = (lines: ReactNode[]) => (
    <div style={{ fontSize: `${size.sidebar}px`, lineHeight: LINE_HEIGHT.text }}>
      {lines.map((line, index) => (
        <p key={index} className="break-words" style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.sidebarRowGap}px` }}>
          {line}
        </p>
      ))}
    </div>
  )

  const renderSidebarSection = (sectionId: SwissTradesSidebarSectionId): ReactNode => {
    switch (sectionId) {
      case 'skills': {
        if (skills.length === 0) return null
        return (
          <section>
            {sidebarHeading(swissHeading(dict, 'skills'))}
            {skills.map((skill, index) => (
              <div
                key={index}
                className="break-inside-avoid"
                style={{ marginTop: index === 0 ? 0 : `${GEOMETRY.skillCategoryGap}px` }}
              >
                {/* The mockup draws no category; the stored category is content, so
                    it is drawn, small, above its own tags (FR-1). */}
                {skill.category && (
                  <p
                    className="break-words font-semibold"
                    style={{
                      fontSize: `${size.skillCaption}px`,
                      lineHeight: LINE_HEIGHT.compact,
                      marginBottom: `${GEOMETRY.skillCaptionGap}px`,
                    }}
                  >
                    {`${skill.category}${COLUMN_BREAK}`}
                  </p>
                )}
                {skill.content.kind === 'tags' ? (
                  <div
                    className="flex flex-wrap"
                    style={{ gap: `${GEOMETRY.tagGap}px`, fontSize: `${size.tag}px`, lineHeight: LINE_HEIGHT.compact }}
                  >
                    {skill.content.tags.map((tag, tagIndex) => (
                      <span
                        key={tagIndex}
                        className="swiss-trades-tag max-w-full break-words"
                        style={{
                          backgroundColor: '#475569',
                          borderRadius: `${GEOMETRY.tagRadius}px`,
                          // The trailing separator takes its width out of the right padding,
                          // so the tag keeps its drawn size.
                          padding: `${GEOMETRY.tagPaddingY}px calc(${GEOMETRY.tagPaddingX}px - ${COLUMN_BREAK_EM}em) ${GEOMETRY.tagPaddingY}px ${GEOMETRY.tagPaddingX}px`,
                        }}
                      >
                        {/* Its separator parts this tag from the next one in the PDF's text layer. */}
                        {`${tag}${COLUMN_BREAK}`}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="break-words" style={{ fontSize: `${size.sidebar}px`, lineHeight: LINE_HEIGHT.text }}>
                    {renderFormattedText(skill.content.html, { justify: false })}
                  </div>
                )}
              </div>
            ))}
          </section>
        )
      }

      case 'training': {
        if (certifications.length === 0) return null
        return (
          <section className="break-inside-avoid">
            {sidebarHeading(swissHeading(dict, 'training'))}
            {sidebarLines(
              certifications.map(({ name, detail }) => (
                <>
                  {name && <span className="font-bold">{name}</span>}
                  {detail && (name ? ` · ${detail}` : detail)}
                </>
              )),
            )}
          </section>
        )
      }

      case 'languages': {
        if (languages.length === 0) return null
        return (
          <section className="break-inside-avoid">
            {sidebarHeading(swissHeading(dict, 'languages'))}
            {sidebarLines(languages.map((lang) => swissTradesLanguageLine(lang.language, swissLanguageLevel(dict, lang.level))))}
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
        <div
          className="swiss-trades-photo mx-auto overflow-hidden"
          style={{
            width: `${GEOMETRY.photoWidth}px`,
            height: `${GEOMETRY.photoHeight}px`,
            borderWidth: `${GEOMETRY.photoBorder}px`,
            borderStyle: 'solid',
            borderColor: '#64748b',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a browser-local data URL, which next/image cannot optimise */}
          <img src={photo} alt="" className="h-full w-full object-cover" />
        </div>
      ),
    })
  }
  if (contactEntries.length > 0) {
    sidebarBlocks.push({
      key: 'contact',
      content: (
        <section className="break-inside-avoid">
          {sidebarHeading(swissTradesContactHeading(dict))}
          {/* The mockup draws the values without labels. */}
          {sidebarLines(contactEntries.map((entry) => entry.value))}
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

  const heading = (label: string) => (
    <h2
      className="flex items-center font-bold uppercase tracking-widest"
      style={{
        color: '#0f172a',
        fontSize: `${size.heading}px`,
        lineHeight: LINE_HEIGHT.compact,
        marginBottom: `${GEOMETRY.headingGap}px`,
      }}
    >
      <span className="shrink-0">{label}</span>
      {/* The rule that fills the rest of the heading's line. */}
      <span
        aria-hidden="true"
        className="min-w-0 flex-1"
        style={{
          height: `${GEOMETRY.headingRule}px`,
          marginLeft: `${GEOMETRY.headingRuleGap}px`,
          backgroundColor: '#fed7aa',
        }}
      />
    </h2>
  )

  /**
   * One entry: its first line, bold, with the dates at its right — the title,
   * or the company or school when there is no title, so the entry still opens
   * with a heading of its own rather than reading as the previous entry's
   * continuation — then the meta line under a title, then its details. A value
   * that is not stored leaves no line (FR-2). Kept on one page when it fits.
   */
  const entry = (key: number, titleText: string, meta: string, dates: string, details: ReactNode) => {
    const firstIsTitle = titleText !== ''
    const first = firstIsTitle ? titleText : meta
    return (
      <div
        key={key}
        className="break-inside-avoid"
        style={{ marginTop: key === 0 ? 0 : `${GEOMETRY.entryGap}px`, fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}
      >
        {(first || dates) && (
          <div className="flex items-baseline justify-between" style={{ columnGap: `${GEOMETRY.dateGap}px` }}>
            <p className="min-w-0 break-words font-bold" style={{ color: '#0f172a' }}>
              {dates ? `${first}${COLUMN_BREAK}` : first}
            </p>
            {dates && (
              <p
                className="shrink-0 whitespace-nowrap font-medium"
                style={{ color: '#c2410c', fontSize: `${size.date}px`, lineHeight: LINE_HEIGHT.text }}
              >
                {dates}
              </p>
            )}
          </div>
        )}
        {firstIsTitle && meta && (
          <p className="break-words" style={{ color: '#64748b' }}>
            {meta}
          </p>
        )}
        {details}
      </div>
    )
  }

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

  const renderMainSection = (sectionId: SwissTradesMainSectionId): ReactNode => {
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
          experiences.map((exp, index) => {
            const achievements = (exp.achievements ?? []).filter(swissHasText)
            return entry(
              index,
              exp.position?.trim() ?? '',
              [exp.company?.trim(), exp.location?.trim()].filter(Boolean).join(', '),
              formatSwissDateRange(exp.startDate, exp.endDate, exp.current, dict),
              achievements.length > 0 ? (
                <ul
                  className="list-disc"
                  style={{ color: '#1e293b', marginTop: `${GEOMETRY.detailGap}px`, paddingLeft: `${GEOMETRY.bulletIndent}px` }}
                >
                  {achievements.map((achievement, i) => (
                    <li key={i}>{renderFormattedText(achievement, { justify: false })}</li>
                  ))}
                </ul>
              ) : swissHasText(exp.description) ? (
                <div style={{ color: '#1e293b', marginTop: `${GEOMETRY.detailGap}px` }}>
                  {renderFormattedText(exp.description, { justify: false })}
                </div>
              ) : null,
            )
          }),
        )
      }

      case 'education': {
        if (education.length === 0) return null
        return entrySection(
          swissHeading(dict, 'education'),
          education.map((edu, index) =>
            entry(
              index,
              edu.degree?.trim() ?? '',
              [edu.school?.trim(), edu.field?.trim()].filter(Boolean).join(', '),
              formatSwissDateRange(edu.startDate, edu.endDate, false, dict),
              swissHasText(edu.description) ? (
                <div style={{ color: '#1e293b', marginTop: `${GEOMETRY.detailGap}px` }}>
                  {renderFormattedText(edu.description, { justify: false })}
                </div>
              ) : null,
            ),
          ),
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
      className="swiss-trades-template relative mx-auto flex bg-white shadow-lg print:shadow-none"
      style={{ width: PAGE_WIDTH_CSS, minHeight: PAGE_HEIGHT_CSS }}
    >
      <aside
        className="shrink-0"
        style={{
          width: `${GEOMETRY.sidebarWidth}px`,
          backgroundColor: '#334155',
          color: '#f1f5f9',
          padding: `${GEOMETRY.sidebarPaddingTop}px ${GEOMETRY.sidebarPaddingX}px ${GEOMETRY.sidebarPaddingBottom}px`,
        }}
      >
        {sidebarBlocks.map(({ key, content }, index) => (
          <div
            key={key}
            style={{
              marginTop:
                index === 0 ? 0 : `${sidebarBlocks[index - 1].key === 'photo' ? GEOMETRY.photoGap : GEOMETRY.sidebarSectionGap}px`,
            }}
          >
            {content}
          </div>
        ))}
      </aside>

      <main
        className="min-w-0 flex-1"
        style={{
          padding: `${GEOMETRY.mainPaddingTop}px ${GEOMETRY.mainPaddingX}px ${GEOMETRY.mainPaddingBottom}px`,
        }}
      >
        {contact.name && (
          <h1 className="break-words font-bold" style={{ color: '#0f172a', fontSize: `${size.name}px`, lineHeight: LINE_HEIGHT.name }}>
            {contact.name}
          </h1>
        )}
        {title && (
          <p
            className="break-words font-bold uppercase tracking-widest"
            style={{
              color: '#c2410c',
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
    </div>
  )
}
