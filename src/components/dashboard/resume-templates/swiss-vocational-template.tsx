'use client'

import { useCallback, useRef, type ChangeEvent, type ReactNode } from 'react'
import type {
  Resume,
  ResumeContact,
  ResumeExperience,
  ResumeEducation,
  ResumeSkillCategory,
  ResumeLanguage,
  ResumeCertification,
} from '@/types/database'
import type { Locale } from '@/lib/i18n'
import { renderFormattedText } from '@/lib/format-text'
import { PAGE_WIDTH_CSS } from '@/lib/resume-page-size'
import { SWISS_VOCATIONAL_LINE_HEIGHT } from '@/lib/resume-line-height'
import { SWISS_VOCATIONAL_ACCENT } from '@/lib/resume-graphics'
import { DEFAULT_RESUME_LAYOUT, type EditorMainId, type EditorSidebarId } from '@/lib/layout-settings'
import {
  SWISS_VOCATIONAL_GEOMETRY as GEOMETRY,
  SWISS_VOCATIONAL_SIZES as SIZES,
  formatSwissDateRange,
  formatSwissMonth,
  swissContactEntries,
  swissHeading,
  swissHasText,
  swissLanguageLevel,
  swissSkillContent,
  swissVocationalVisibility,
  type SwissVocationalSectionId,
} from '@/lib/swiss-vocational-template'

/** The largest photo file the upload affordance reads, the limit `modern-template.tsx` applies. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024

const LINE_HEIGHT = SWISS_VOCATIONAL_LINE_HEIGHT

/**
 * The word separator a column's text ends with where another column's text
 * continues on the same line.
 *
 * Side by side, two flex or grid items are two boxes; nothing in the text
 * stands between their words, so the PDF's text layer — what copy-paste,
 * screen readers and ATS parsers read — runs them together ("Localisation
 * Lausanne, Vaud" reads "LocalisationLausanne, Vaud").
 *
 * What survives into the PDF, measured on the server's print of this template:
 * a no-break space at the end of the left column's text, IN THE SAME TEXT NODE
 * as that text. Written as a separate child (`{label}{'\u00A0'}`), React
 * creates two text nodes on the client, Chromium shapes the space as a run of
 * its own, and a whitespace-only run at the end of a line is not written into
 * the PDF. An ASCII space is collapsed away, whitespace between flex items is
 * dropped, and a space leading the right column moves its text. So every use
 * is one interpolated string, label and separator together.
 */
const COLUMN_BREAK = '\u00A0'

/**
 * The dictionary keys this template reads itself. Its headings, dates, contact
 * labels and level names are read through `@/lib/swiss-vocational-template`,
 * which takes the whole `common` dictionary.
 */
interface SwissVocationalDict {
  resumes: { editor: { uploadPhoto: string; changePhoto: string; photoTooLarge: string } }
}

interface SwissVocationalTemplateProps {
  resume: Resume
  /**
   * Passed by every caller like any template's, and not read: every word this
   * template draws comes from `dict`, and its months are printed `MM.YYYY` in
   * every locale.
   */
  locale: Locale
  dict: SwissVocationalDict
  /** The document-wide size multiplier from the layout model. Every size this template draws is drawn at it. */
  fontScale?: number
  /**
   * The font the owner CHOSE, or undefined when they chose none. The template
   * declares no family of its own and draws the app's Inter until one is
   * chosen; `resume-preview.tsx` applies `chosenFontFamily` before passing it.
   */
  fontFamily?: string
  /** Main sections hidden through the layout model, in the editor's vocabulary. */
  hiddenMainSections?: readonly EditorMainId[]
  /** Sidebar sections hidden through the layout model: this template draws skills, languages and training from them. */
  hiddenSidebarSections?: readonly EditorSidebarId[]
  /** The browser-local photo, drawn top right when present. */
  photoUrl?: string
  /**
   * The Editor's photo handler. Passed only by the Editor, where it turns the
   * photo's place into an upload affordance; the Preview, PDF and thumbnails
   * pass none and draw no photo frame when there is no photo.
   */
  onPhotoChange?: (dataUrl: string) => void
}

/**
 * "Formation professionnelle (CFC)": one column on an A4 page with a red strip
 * down the left edge, a header with the name, the CV title and a labelled
 * contact grid beside the photo, then summary, experience, education,
 * certifications, and skills and languages side by side. Dated rows put their
 * dates in a left column.
 *
 * Sizes, section sequence, dates and labels come from
 * `@/lib/swiss-vocational-template`, which `docx-swiss-vocational.ts` reads too.
 */
export function SwissVocationalTemplate({
  resume,
  dict,
  fontScale = DEFAULT_RESUME_LAYOUT.fontScale,
  fontFamily,
  hiddenMainSections = DEFAULT_RESUME_LAYOUT.hiddenMainSections,
  hiddenSidebarSections = DEFAULT_RESUME_LAYOUT.hiddenSidebarSections,
  photoUrl,
  onPhotoChange,
}: SwissVocationalTemplateProps) {
  const size = {
    name: SIZES.name * fontScale,
    title: SIZES.title * fontScale,
    contact: SIZES.contact * fontScale,
    heading: SIZES.heading * fontScale,
    body: SIZES.body * fontScale,
  }

  const contact = (resume.contact as unknown as ResumeContact) || {}
  const experiences = ((resume.experience as unknown as ResumeExperience[]) || []).filter((exp) => exp.visible !== false)
  const education = ((resume.education as unknown as ResumeEducation[]) || []).filter((edu) => edu.visible !== false)
  const certifications = ((resume.certifications as unknown as ResumeCertification[]) || []).filter(
    (cert) => cert.visible !== false,
  )
  const visibility = swissVocationalVisibility(hiddenMainSections, hiddenSidebarSections)
  // A hidden column draws as an empty one: no heading, no entries.
  // A row whose content is empty draws nothing, so it is not a row (FR-2).
  const skills = visibility.skills
    ? ((resume.skills as unknown as ResumeSkillCategory[]) || []).flatMap((skill) => {
        const content = skill.visible === false ? null : swissSkillContent(skill)
        return content ? [{ category: skill.category, content }] : []
      })
    : []
  const languages = visibility.languages
    ? ((resume.languages as unknown as ResumeLanguage[]) || []).filter((lang) => lang.visible !== false)
    : []

  const contactEntries = swissContactEntries(contact, dict)
  // The two fixed-width columns grow with the type, so scaled text still fits (FR-4).
  const dateColumn = GEOMETRY.dateColumn * fontScale
  const contactLabelWidth = GEOMETRY.contactLabel * fontScale
  const sections = visibility.sections

  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleFileSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      // Reset so the same file can be chosen again.
      event.target.value = ''
      if (!file || !onPhotoChange) return

      if (file.size > MAX_PHOTO_BYTES) {
        alert(dict.resumes.editor.photoTooLarge)
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') onPhotoChange(reader.result)
      }
      reader.readAsDataURL(file)
    },
    [dict, onPhotoChange],
  )

  const heading = (label: string) => (
    <h2
      className="flex items-center border-b border-slate-300 pb-1.5 font-bold uppercase tracking-widest text-slate-900"
      style={{ fontSize: `${size.heading}px`, lineHeight: LINE_HEIGHT.compact, marginBottom: `${GEOMETRY.headingGap}px` }}
    >
      <span
        aria-hidden="true"
        className="inline-block shrink-0 bg-red-700"
        style={{
          width: `${SWISS_VOCATIONAL_ACCENT.squarePx}px`,
          height: `${SWISS_VOCATIONAL_ACCENT.squarePx}px`,
          marginRight: `${SWISS_VOCATIONAL_ACCENT.squareGapPx}px`,
        }}
      />
      {label}
    </h2>
  )

  /** A row with its dates in the left column and its content on the right; kept on one page when it fits. */
  const datedRow = (key: number, dates: string, content: ReactNode) => (
    <div
      key={key}
      className="grid break-inside-avoid"
      style={{ gridTemplateColumns: `${dateColumn}px 1fr`, marginTop: key === 0 ? 0 : `${GEOMETRY.entryGap}px` }}
    >
      <div className="text-slate-600" style={{ fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
        {dates && `${dates}${COLUMN_BREAK}`}
      </div>
      <div style={{ fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>{content}</div>
    </div>
  )

  /**
   * A section of entries whose heading never ends a printed page alone: the
   * heading and the first entry are kept together, and each further entry
   * breaks as an entry does. The wrapper has no margin, padding or border, so
   * it does not change the layout.
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

  const renderSection = (sectionId: SwissVocationalSectionId): ReactNode => {
    switch (sectionId) {
      case 'summary': {
        if (!swissHasText(resume.summary)) return null
        return (
          // Heading and text kept together; a summary longer than a page still breaks.
          <section className="break-inside-avoid">
            {heading(swissHeading(dict, 'summary'))}
            <div className="text-justify text-slate-700" style={{ fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
              {renderFormattedText(resume.summary)}
            </div>
          </section>
        )
      }

      case 'experience': {
        if (experiences.length === 0) return null
        return (
          entrySection(
            swissHeading(dict, 'experience'),
            experiences.map((exp, index) =>
              datedRow(
                index,
                formatSwissDateRange(exp.startDate, exp.endDate, exp.current, dict),
                <>
                  <p>
                    <span className="font-bold text-slate-900">{exp.position}</span>
                    {exp.company && (
                      <span className="text-slate-600">
                        {' · '}
                        {exp.company}
                        {exp.location && `, ${exp.location}`}
                      </span>
                    )}
                  </p>
                  {(exp.achievements ?? []).some(swissHasText) ? (
                    <ul className="mt-1 list-disc pl-5 text-slate-700">
                      {(exp.achievements ?? []).filter(swissHasText).map((achievement, i) => (
                        <li key={i}>{renderFormattedText(achievement, { justify: false })}</li>
                      ))}
                    </ul>
                  ) : swissHasText(exp.description) ? (
                    <div className="mt-1 text-slate-700">{renderFormattedText(exp.description, { justify: false })}</div>
                  ) : null}
                </>,
              ),
            ),
          )
        )
      }

      case 'education': {
        if (education.length === 0) return null
        return (
          entrySection(
            swissHeading(dict, 'education'),
            education.map((edu, index) =>
              datedRow(
                index,
                formatSwissDateRange(edu.startDate, edu.endDate, false, dict),
                <>
                  <p className="font-bold text-slate-900">{edu.degree}</p>
                  {(edu.school || edu.field) && (
                    <p className="text-slate-600">{[edu.school, edu.field].filter(Boolean).join(' · ')}</p>
                  )}
                  {swissHasText(edu.description) && (
                    <div className="mt-1 text-slate-700">{renderFormattedText(edu.description, { justify: false })}</div>
                  )}
                </>,
              ),
            ),
          )
        )
      }

      case 'training': {
        if (certifications.length === 0) return null
        return (
          entrySection(
            swissHeading(dict, 'training'),
            certifications.map((cert, index) =>
              datedRow(
                index,
                cert.date ? formatSwissMonth(cert.date) : '',
                <p>
                  <span className="font-bold text-slate-900">{cert.name}</span>
                  {cert.issuer && <span className="text-slate-600">{` · ${cert.issuer}`}</span>}
                </p>,
              ),
            ),
          )
        )
      }

      case 'skillsAndLanguages': {
        if (skills.length === 0 && languages.length === 0) return null
        return (
          <div className="grid grid-cols-2" style={{ columnGap: `${GEOMETRY.columnGap}px` }}>
            {skills.length > 0 && (
              <section className="break-inside-avoid">
                {heading(swissHeading(dict, 'skills'))}
                <div className="space-y-1.5" style={{ fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
                  {/* One structure whatever the storage: the label, then the content
                      in a block beside it, so one line reads inline and a longer
                      one wraps under itself, not under the label. */}
                  {skills.map((skill, index) => (
                    <div key={index} className="flex">
                      {/* The separator is the gap between the label and its content. */}
                      <span className="shrink-0 font-bold text-slate-900">{`${skill.category}:${COLUMN_BREAK}`}</span>
                      <div className="min-w-0 flex-1 text-slate-700">
                        {skill.content.kind === 'html' ? renderFormattedText(skill.content.html, { justify: false }) : skill.content.text}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {languages.length > 0 && (
              <section className="break-inside-avoid">
                {heading(swissHeading(dict, 'languages'))}
                <div style={{ fontSize: `${size.body}px`, lineHeight: LINE_HEIGHT.text }}>
                  {languages.map((lang, index) => (
                    <div key={index} className="flex justify-between border-b border-dotted border-slate-300 py-1">
                      <span className="text-slate-900">{`${lang.language}${COLUMN_BREAK}`}</span>
                      <span className="text-slate-600">{swissLanguageLevel(dict, lang.level)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      }
    }
  }

  return (
    <div
      data-testid="resume-document"
      className="swiss-vocational-template relative mx-auto bg-white shadow-lg print:shadow-none"
      style={{
        width: PAGE_WIDTH_CSS,
        fontFamily: fontFamily,
        padding: `${GEOMETRY.paddingY}px ${GEOMETRY.paddingX}px`,
      }}
    >
      {/* The accent strip. In print it is fixed to the page's left edge, so it
          runs the full height of every printed page, as the DOCX page border
          does. Its print offset is where the centred document starts, half of
          PAGE_WIDTH_PX (794) left of the middle: 0 on an A4 sheet, the
          document's edge in a wider viewport. Tailwind reads class names
          statically, so the 397 is written out. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-red-700 print:fixed print:left-[max(0px,calc(50%-397px))]"
        style={{ width: `${SWISS_VOCATIONAL_ACCENT.stripPx}px` }}
      />

      <header
        className="flex items-start justify-between border-b-2 border-slate-800"
        style={{ paddingBottom: `${GEOMETRY.sectionGap}px`, columnGap: `${GEOMETRY.photoGap}px` }}
      >
        <div className="min-w-0 flex-1">
          {contact.name && (
            <h1 className="font-bold text-slate-900" style={{ fontSize: `${size.name}px`, lineHeight: LINE_HEIGHT.name }}>
              {contact.name}
            </h1>
          )}
          {resume.title && (
            <p
              className="mt-2 uppercase tracking-widest text-red-700"
              style={{ fontSize: `${size.title}px`, lineHeight: LINE_HEIGHT.compact }}
            >
              {resume.title}
            </p>
          )}
          {contactEntries.length > 0 && (
            <dl
              className="mt-4 grid grid-cols-2 gap-y-1"
              style={{ columnGap: `${GEOMETRY.contactPairGap}px`, fontSize: `${size.contact}px`, lineHeight: LINE_HEIGHT.compact }}
            >
              {contactEntries.map((entry) => (
                <div key={entry.key} className="flex min-w-0" style={{ columnGap: `${GEOMETRY.contactLabelGap * fontScale}px` }}>
                  <dt className="shrink-0 font-semibold text-slate-900" style={{ width: `${contactLabelWidth}px` }}>
                    {`${entry.label}${COLUMN_BREAK}`}
                  </dt>
                  {/* Its separator parts this pair from the next one on the row. */}
                  <dd className="min-w-0 break-words text-slate-700">{`${entry.value}${COLUMN_BREAK}`}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {photoUrl ? (
          <div className="group relative shrink-0 overflow-hidden" style={{ width: `${GEOMETRY.photoWidth}px`, height: `${GEOMETRY.photoHeight}px` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a browser-local data URL, which next/image cannot optimise */}
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            {onPhotoChange && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-medium text-white opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 group-hover:opacity-100 print:hidden"
              >
                {dict.resumes.editor.changePhoto}
              </button>
            )}
          </div>
        ) : onPhotoChange ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex shrink-0 flex-col items-center justify-center gap-2 border border-dashed border-slate-400 bg-slate-50 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 print:hidden"
            style={{ width: `${GEOMETRY.photoWidth}px`, height: `${GEOMETRY.photoHeight}px` }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            {dict.resumes.editor.uploadPhoto}
          </button>
        ) : null}

        {onPhotoChange && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleFileSelect}
          />
        )}
      </header>

      {sections.map((sectionId) => {
        // An empty section draws nothing at all, its heading included (FR-2).
        const content = renderSection(sectionId)
        return content === null ? null : (
          <div key={sectionId} style={{ marginTop: `${GEOMETRY.sectionGap}px` }}>
            {content}
          </div>
        )
      })}
    </div>
  )
}
