import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_RESUME_LAYOUT,
  mapEditorOrderToClassic,
  mapEditorOrderToMinimal,
  mapEditorOrderToModern,
  resolveLayoutModel,
  toStoredLayout,
  type ResumeLayoutModel,
  type StoredLayoutModel,
} from '../../src/lib/layout-settings'
import type { ResumeTemplate } from '../../src/types/database'
import {
  FIXTURE_CERTIFICATIONS,
  FIXTURE_CONTACT,
  FIXTURE_EXPERIENCE,
  type FixtureExperience,
} from '../fixtures/resume'

/**
 * Part 2 US-008: the inputs of the parity check, and what the layout model REQUESTS
 * for each template.
 *
 * WHY THE MODEL IS THE REFERENCE, NOT ONLY SURFACE AGAINST SURFACE
 *
 * Two surfaces can agree on ignoring the user. Creative's Preview and DOCX both
 * hardcode the same section sequence, so a surface-against-surface comparison
 * calls creative a match while Part 3's US-015 says it is defective. Every
 * structural row is therefore compared against the order and visibility the
 * stored layout asks for, and the surfaces are also compared with each other.
 *
 * WHERE THE REFERENCE COMES FROM
 *
 * Only from the shared layout model in `src/lib/layout-settings.ts`: the parse
 * (`resolveLayoutModel`) and the per-template vocabulary mappings
 * (`mapEditorOrderToModern`, `mapEditorOrderToClassic`,
 * `mapEditorOrderToMinimal`). Nothing here re-derives a template's rendering.
 * Where the model defines no position for a section, the reference says so
 * (`positioned: false`) rather than inventing one; where Part 3 has not yet
 * decided what the model means, the reference is explicitly undecided.
 */

export const TEMPLATES: readonly ResumeTemplate[] = [
  'professional',
  'modern',
  'classic',
  'minimal',
  'creative',
]

export type ProfileId =
  | 'primary'
  | 'scale-control'
  | 'per-property-control'
  | 'creative-order'
  | 'modern-empty-main'
  | 'modern-non-integer-hue'
  | 'font-not-chosen'
  | 'multi-page'

/**
 * Which row families a profile is run for. `font` is the font-family rows alone,
 * for a profile whose only difference is the font; `typography` already
 * includes them. `print` reads the sidebar column of every printed page.
 */
export type RowFamilyGroup = 'structure' | 'typography' | 'font' | 'colour' | 'page' | 'print'

export interface ParityProfile {
  id: ProfileId
  /** Why the profile exists, printed in the report. */
  purpose: string
  templates: readonly ResumeTemplate[]
  rowGroups: readonly RowFamilyGroup[]
  /**
   * A control profile reports no rows of its own. It exists so a primary row
   * can ask whether a surface RESPONDS to a model property, by comparing the
   * primary rendering with one in which only that property differs.
   */
  control?: boolean
  /** Exactly what is written to `resumes.layout_settings`. */
  layout: StoredLayoutModel
  /**
   * Section keys whose model reference is undecided for this profile, keyed by
   * template. Rows over these keys compare the surfaces with each other only.
   */
  undecided?: Partial<Record<ResumeTemplate, { keys: readonly string[]; reason: string }>>
  /**
   * Content seeded in place of the fixture's, and the fewest pages its print
   * must fill for the profile to measure what it exists for. Absent: the fixture.
   */
  content?: { experience: readonly FixtureExperience[]; minimumPrintedPages: number }
}

/**
 * The fixture's layout: different from `DEFAULT_RESUME_LAYOUT` in every
 * property the check reads. `describeNonDefault` below proves that, property
 * by property, before anything is rendered.
 *
 * - Both orders are permuted, and one section in each list is hidden, so
 *   order and visibility are each discriminated on the templates that honour
 *   them. `education` is the hidden main section because hiding `summary` or
 *   `experience` would leave Modern's two-member main column with one section
 *   and nothing to order.
 * - `fontScale` 1.2 sits inside the control range [0.7, 1.3].
 * - The colour is an integer HSL triple the sidebar controls can produce.
 *   Integers matter: see the `modern-non-integer-hue` probe for why.
 * - `Verdana, Geneva, sans-serif` is one of the stacks the editor's font
 *   carousel offers (`font-carousel-3d.tsx`), not an invented value.
 * - The three per-property sizes are non-default so that US-011's second
 *   clause — per-property sizes reach the Preview and not the DOCX — is
 *   observable rather than hidden behind values that happen to coincide.
 */
const PRIMARY_LAYOUT: StoredLayoutModel = {
  ...toStoredLayout(DEFAULT_RESUME_LAYOUT),
  titleFontSize: 30,
  sectionTitleFontSize: 20,
  sectionDescFontSize: 15,
  sidebarHue: 150,
  sidebarSaturation: 60,
  sidebarBrightness: 30,
  fontScale: 1.2,
  fontFamily: 'Verdana, Geneva, sans-serif',
  sidebarOrder: ['training', 'languages', 'skills', 'keyAchievements'],
  mainContentOrder: ['experience', 'summary', 'education'],
  hiddenSidebarSections: ['languages'],
  hiddenMainSections: ['education'],
}

/**
 * Earlier roles appended to the fixture's two, so the professional document
 * prints on more than one page. Deterministic like the fixture, and worded to
 * contain no section title: the PDF reader refuses a title that occurs twice.
 */
const EARLIER_ROLES: readonly FixtureExperience[] = [
  {
    company: 'Harbour Analytics',
    position: 'Software Engineer',
    startDate: '2014-07',
    endDate: '2016-12',
    current: false,
    location: 'Zurich',
    description: 'Maintained the reporting service behind a regional retail dashboard.',
    achievements: [
      'Rebuilt the nightly aggregation job so it completed before offices opened.',
      'Replaced a hand-maintained release script with a reviewed pipeline.',
      'Wrote the on-call runbook the team kept for six years.',
    ],
    visible: true,
  },
  {
    company: 'Cobalt Freight',
    position: 'Backend Developer',
    startDate: '2012-09',
    endDate: '2014-06',
    current: false,
    location: 'Basel',
    description: 'Developed shipment tracking interfaces for logistics partners.',
    achievements: [
      'Designed a carrier webhook gateway handling two million events a day.',
      'Reduced duplicate shipment records by reconciling partner identifiers.',
      'Introduced consumer-driven tests between the tracking and billing services.',
    ],
    visible: true,
  },
  {
    company: 'Alpine Health Data',
    position: 'Data Engineer',
    startDate: '2011-01',
    endDate: '2012-08',
    current: false,
    location: 'Bern',
    description: 'Operated the anonymisation pipeline for clinical research exports.',
    achievements: [
      'Automated consent checks before every research export.',
      'Moved batch jobs from cron hosts to a monitored scheduler.',
      'Cut storage costs by compacting historical partitions.',
    ],
    visible: true,
  },
  {
    company: 'Lakeside Media',
    position: 'Web Developer',
    startDate: '2009-10',
    endDate: '2010-12',
    current: false,
    location: 'Montreux',
    description: 'Built publishing tools for a regional newspaper group.',
    achievements: [
      'Shipped the article scheduling tool editors used every morning.',
      'Made the image upload flow resumable on unreliable connections.',
      'Paired with editors to redesign the correction workflow.',
    ],
    visible: true,
  },
  {
    company: 'Quarry Robotics',
    position: 'Firmware Intern',
    startDate: '2008-06',
    endDate: '2009-09',
    current: false,
    location: 'Neuchatel',
    description: 'Supported sensor calibration tooling for warehouse robots.',
    achievements: [
      'Wrote the calibration report generator used on the factory floor.',
      'Added checksums to firmware images before flashing.',
      'Recorded field faults in a searchable log.',
    ],
    visible: true,
  },
  {
    company: 'Civic Transit Lab',
    position: 'Research Assistant',
    startDate: '2007-09',
    endDate: '2008-05',
    current: false,
    location: 'Lausanne',
    description: 'Modelled bus network timetables for a municipal study.',
    achievements: [
      'Built a timetable simulator from open schedule data.',
      'Presented route change findings to the city planning office.',
      'Published the simulator under an open licence.',
    ],
    visible: true,
  },
]

export const PROFILES: readonly ParityProfile[] = [
  {
    id: 'primary',
    purpose:
      'The fixture. Non-default order, visibility, scale, colour, font family and ' +
      'per-property sizes, rendered by all five templates. Its font (Verdana) differs from ' +
      "today's default, so it is US-012's chosen-font case.",
    templates: TEMPLATES,
    rowGroups: ['structure', 'typography', 'colour', 'page'],
    layout: PRIMARY_LAYOUT,
  },
  {
    id: 'scale-control',
    purpose:
      'Control for fontScale. Identical to primary except fontScale 1, so each surface\'s ' +
      'primary/control size ratio can be compared with the model ratio 1.2. Surfaces that agree ' +
      'with each other while all ignoring the scale cannot read as a match.',
    templates: TEMPLATES,
    rowGroups: [],
    control: true,
    layout: { ...PRIMARY_LAYOUT, fontScale: 1 },
  },
  {
    id: 'per-property-control',
    purpose:
      'Control for the per-property sizes. Identical to primary except titleFontSize, ' +
      'sectionTitleFontSize and sectionDescFontSize at their defaults, so a size the model ' +
      'carries but no surface applies is reported rather than matched.',
    templates: TEMPLATES,
    rowGroups: [],
    control: true,
    layout: {
      ...PRIMARY_LAYOUT,
      titleFontSize: DEFAULT_RESUME_LAYOUT.titleFontSize,
      sectionTitleFontSize: DEFAULT_RESUME_LAYOUT.sectionTitleFontSize,
      sectionDescFontSize: DEFAULT_RESUME_LAYOUT.sectionDescFontSize,
    },
  },
  {
    id: 'creative-order',
    purpose:
      "Creative's column order. The primary profile hides one section in each " +
      'creative column, leaving nothing to order; this profile hides nothing and ' +
      'reverses both columns.',
    templates: ['creative'],
    rowGroups: ['structure'],
    layout: {
      ...PRIMARY_LAYOUT,
      mainContentOrder: ['education', 'experience', 'summary'],
      sidebarOrder: ['languages', 'skills', 'training', 'keyAchievements'],
      hiddenSidebarSections: [],
      hiddenMainSections: [],
    },
  },
  {
    id: 'modern-empty-main',
    purpose:
      "US-010's input. A stored mainContentOrder of ['education'] parses as valid, " +
      "then maps to an empty Modern main column; no ordinary order reaches it.",
    templates: ['modern'],
    rowGroups: ['structure'],
    layout: {
      ...PRIMARY_LAYOUT,
      mainContentOrder: ['education'],
      hiddenSidebarSections: [],
      hiddenMainSections: [],
    },
    undecided: {
      modern: {
        keys: ['summary', 'experience'],
        reason:
          "What Modern's main column should show when the stored order maps to nothing is " +
          "Part 3 US-010's decision; until it is made the model has no answer to compare against.",
      },
    },
  },
  {
    id: 'modern-non-integer-hue',
    purpose:
      "Part 2 US-007 finding F-A, now US-013. modern-template.tsx deriveAccentColor matches integer " +
      'HSL only; a stored non-integer hue is accepted by the model and exercises it.',
    templates: ['modern'],
    rowGroups: ['colour'],
    layout: { ...PRIMARY_LAYOUT, sidebarHue: 150.5 },
  },
  {
    id: 'font-not-chosen',
    purpose:
      "US-012's not-chosen case. Identical to primary except fontFamily at today's default, which " +
      'the owner decided on 2026-09-15 counts as never chosen. primary is the chosen case.',
    templates: TEMPLATES,
    rowGroups: ['font'],
    layout: { ...PRIMARY_LAYOUT, fontFamily: DEFAULT_RESUME_LAYOUT.fontFamily },
  },
  {
    id: 'multi-page',
    purpose:
      "US-013's professional print band. Primary's layout over the fixture with earlier roles " +
      'appended, so the print runs past one page and the sidebar column of every printed page can be ' +
      'read from the PDF, where globals.css paints its band behind the document.',
    templates: ['professional'],
    rowGroups: ['print'],
    layout: PRIMARY_LAYOUT,
    content: { experience: [...FIXTURE_EXPERIENCE, ...EARLIER_ROLES], minimumPrintedPages: 2 },
  },
]

/** Whether a profile's collect test samples title, heading and body typography. */
export function samplesTypography(profile: ParityProfile): boolean {
  // Control profiles are sampled too: primary rows read them.
  return profile.control === true || profile.rowGroups.includes('typography') || profile.rowGroups.includes('font')
}

// ---------------------------------------------------------------------------
// Section catalogue
// ---------------------------------------------------------------------------

export type Column = 'main' | 'sidebar' | 'header'

export type SectionLocator =
  | { kind: 'heading'; text: string }
  | { kind: 'marker'; text: string }

export interface SectionSpec {
  key: string
  column: Column
  locator: SectionLocator
}

export interface TemplateReference {
  /** Whether the model asks for each section to be shown. `null` = undecided. */
  visible: Record<string, boolean | null>
  /** Per column, the sections the model positions, visible ones only, in model order. */
  order: Partial<Record<Column, readonly string[]>>
}

export interface TemplateSpec {
  template: ResumeTemplate
  sections: readonly SectionSpec[]
  /** Text of the template's single `h1`, compared across surfaces for typography. */
  titleSource: 'resumeTitle' | 'contactName'
  /** Section key whose heading is sampled for heading typography. Present on every surface. */
  headingSampleKey: string
  /**
   * How many opaque ancestors of a sidebar heading lie between it and the
   * sidebar's own background; `null` when the template has no sidebar colour.
   */
  sidebarBackgroundDepth: number | null
  /** The same for the accent banner behind a sidebar heading; `null` when none. */
  accentDepth: number | null
  /**
   * Further text colours to compare, located by their exact text on every
   * surface. Modern's sidebar secondary text is translucent white in the
   * Preview; it is composited over its backdrop and compared, never excused.
   */
  extraColourSamples: readonly { key: string; text: string }[]
  reference(model: ResumeLayoutModel): TemplateReference
}

interface CommonDictionary {
  resumes: {
    editor: { sections: Record<string, string> }
    template: Record<string, string>
  }
}

/**
 * Section titles come from the same dictionary the templates render them from,
 * never from a literal: a hardcoded "Projects" would silently stop matching the
 * heading the templates actually print ("Key Achievements" in `en`).
 */
const EN: CommonDictionary = JSON.parse(
  readFileSync(path.join(__dirname, '../../src/locales/en/common.json'), 'utf-8'),
) as CommonDictionary

const S = EN.resumes.editor.sections
const T = EN.resumes.template

/** Unique to the summary; used where a template renders the summary without a heading. */
export const SUMMARY_MARKER = 'multi-tenant'

/** The first achievement of the first role: body text present in every template. */
export const BODY_MARKER = FIXTURE_EXPERIENCE[0].achievements[0]

export const CONTACT_NAME = FIXTURE_CONTACT.name

const heading = (text: string): SectionLocator => ({ kind: 'heading', text })

function orderedVisible(
  order: readonly string[],
  members: readonly string[],
  isVisible: (id: string) => boolean,
): string[] {
  return order.filter((id) => members.includes(id) && isVisible(id))
}

const PROFESSIONAL: TemplateSpec = {
  template: 'professional',
  titleSource: 'resumeTitle',
  headingSampleKey: 'experience',
  sidebarBackgroundDepth: 1,
  accentDepth: null,
  extraColourSamples: [],
  sections: [
    { key: 'keyAchievements', column: 'sidebar', locator: heading(T.keyAchievements) },
    { key: 'skills', column: 'sidebar', locator: heading(T.skills) },
    { key: 'languages', column: 'sidebar', locator: heading(T.languages) },
    { key: 'training', column: 'sidebar', locator: heading(T.training) },
    { key: 'summary', column: 'main', locator: heading(T.summary) },
    { key: 'experience', column: 'main', locator: heading(T.experience) },
    { key: 'education', column: 'main', locator: heading(T.education) },
  ],
  reference(model) {
    const sidebarShown = (id: string) =>
      (model.sidebarOrder as readonly string[]).includes(id) &&
      !(model.hiddenSidebarSections as readonly string[]).includes(id)
    const mainShown = (id: string) =>
      (model.mainContentOrder as readonly string[]).includes(id) &&
      !(model.hiddenMainSections as readonly string[]).includes(id)
    const sidebar = ['keyAchievements', 'skills', 'languages', 'training']
    const main = ['summary', 'experience', 'education']
    return {
      visible: Object.fromEntries([
        ...sidebar.map((id) => [id, sidebarShown(id)]),
        ...main.map((id) => [id, mainShown(id)]),
      ]),
      order: {
        sidebar: orderedVisible(model.sidebarOrder, sidebar, sidebarShown),
        main: orderedVisible(model.mainContentOrder, main, mainShown),
      },
    }
  },
}

const MODERN: TemplateSpec = {
  template: 'modern',
  titleSource: 'contactName',
  headingSampleKey: 'experience',
  sidebarBackgroundDepth: 2,
  accentDepth: 1,
  // rgba(255,255,255,0.6) contact label and rgba(255,255,255,0.7) certificate issuer
  // in modern-template.tsx; opaque white runs in docx-modern.ts.
  extraColourSamples: [
    { key: 'sidebarLabel', text: 'Email' },
    { key: 'sidebarSecondary', text: FIXTURE_CERTIFICATIONS[0].issuer },
  ],
  sections: [
    { key: 'contact', column: 'sidebar', locator: heading(S.contact) },
    { key: 'education', column: 'sidebar', locator: heading(S.education) },
    { key: 'skills', column: 'sidebar', locator: heading(S.skills) },
    { key: 'languages', column: 'sidebar', locator: heading(S.languages) },
    { key: 'training', column: 'sidebar', locator: heading(S.certifications) },
    { key: 'summary', column: 'main', locator: heading(S.summary) },
    { key: 'experience', column: 'main', locator: heading(S.experience) },
    // Rendered after the main sections by the template; the model has no id for it.
    { key: 'projects', column: 'main', locator: heading(S.projects) },
  ],
  reference(model) {
    const mapped = mapEditorOrderToModern(
      model.sidebarOrder,
      model.mainContentOrder,
      model.hiddenSidebarSections,
      model.hiddenMainSections,
    )
    const sidebarShown = (id: string) =>
      (mapped.modernSidebarOrder as string[]).includes(id) &&
      !(mapped.hiddenModernSidebar as string[]).includes(id)
    const mainShown = (id: string) =>
      (mapped.modernMainOrder as string[]).includes(id) &&
      !(mapped.hiddenModernMain as string[]).includes(id)
    const sidebar = ['contact', 'education', 'skills', 'languages', 'training']
    const main = ['summary', 'experience']
    return {
      visible: Object.fromEntries([
        ...sidebar.map((id) => [id, sidebarShown(id)]),
        ...main.map((id) => [id, mainShown(id)]),
        ['projects', true],
      ]),
      order: {
        sidebar: orderedVisible(mapped.modernSidebarOrder, sidebar, sidebarShown),
        main: orderedVisible(mapped.modernMainOrder, main, mainShown),
      },
    }
  },
}

/**
 * Classic and Minimal share one vocabulary and one mapping, whose
 * `languagesAndCerts` member renders as two headed sections side by side.
 * `skills` and `projects` are not representable in the editor's main order
 * (US-002), so the model positions neither — but nothing hides them either,
 * so the reference expects both to be shown.
 */
function singleColumn(
  template: 'classic' | 'minimal',
  map: (order: readonly string[]) => string[],
): TemplateSpec {
  return {
    template,
    titleSource: 'resumeTitle',
    headingSampleKey: 'experience',
    sidebarBackgroundDepth: null,
    accentDepth: null,
    extraColourSamples: [],
    sections: [
      { key: 'summary', column: 'main', locator: heading(S.summary) },
      { key: 'experience', column: 'main', locator: heading(S.experience) },
      { key: 'education', column: 'main', locator: heading(S.education) },
      { key: 'skills', column: 'main', locator: heading(S.skills) },
      { key: 'projects', column: 'main', locator: heading(S.projects) },
      { key: 'languages', column: 'main', locator: heading(S.languages) },
      { key: 'certifications', column: 'main', locator: heading(S.certifications) },
    ],
    reference(model) {
      const expanded = map(model.mainContentOrder).flatMap((id) =>
        id === 'languagesAndCerts' ? ['languages', 'certifications'] : [id],
      )
      const hidden = model.hiddenMainSections as readonly string[]
      const shown = (id: string) => expanded.includes(id) && !hidden.includes(id)
      const positioned = ['summary', 'experience', 'education', 'languages', 'certifications']
      return {
        visible: {
          ...Object.fromEntries(positioned.map((id) => [id, shown(id)])),
          skills: true,
          projects: true,
        },
        order: { main: orderedVisible(expanded, positioned, shown) },
      }
    },
  }
}

/**
 * Creative has no section vocabulary (Part 3 US-015). The reference is the
 * plain reading of the editor ids creative actually renders: `summary` in the
 * header (shown or hidden, never positioned), `skills` and `languages` in the
 * left column, `experience` and `education` in the right. `certifications`
 * and `projects` have no id and are expected shown; `training` and
 * `keyAchievements` mean nothing here. That reading is recorded as a
 * limitation in the report, because it is an interpretation.
 */
const CREATIVE: TemplateSpec = {
  template: 'creative',
  titleSource: 'resumeTitle',
  headingSampleKey: 'experience',
  sidebarBackgroundDepth: null,
  accentDepth: null,
  extraColourSamples: [],
  sections: [
    { key: 'summary', column: 'header', locator: { kind: 'marker', text: SUMMARY_MARKER } },
    { key: 'skills', column: 'sidebar', locator: heading(S.skills) },
    { key: 'languages', column: 'sidebar', locator: heading(S.languages) },
    { key: 'certifications', column: 'sidebar', locator: heading(S.certifications) },
    { key: 'experience', column: 'main', locator: heading(S.experience) },
    { key: 'projects', column: 'main', locator: heading(S.projects) },
    { key: 'education', column: 'main', locator: heading(S.education) },
  ],
  reference(model) {
    const sidebarShown = (id: string) =>
      (model.sidebarOrder as readonly string[]).includes(id) &&
      !(model.hiddenSidebarSections as readonly string[]).includes(id)
    const mainShown = (id: string) =>
      (model.mainContentOrder as readonly string[]).includes(id) &&
      !(model.hiddenMainSections as readonly string[]).includes(id)
    return {
      visible: {
        summary: mainShown('summary'),
        skills: sidebarShown('skills'),
        languages: sidebarShown('languages'),
        certifications: true,
        experience: mainShown('experience'),
        projects: true,
        education: mainShown('education'),
      },
      order: {
        sidebar: orderedVisible(model.sidebarOrder, ['skills', 'languages'], sidebarShown),
        main: orderedVisible(model.mainContentOrder, ['experience', 'education'], mainShown),
      },
    }
  },
}

export const TEMPLATE_SPECS: Readonly<Record<ResumeTemplate, TemplateSpec>> = {
  professional: PROFESSIONAL,
  modern: MODERN,
  classic: singleColumn('classic', mapEditorOrderToClassic),
  minimal: singleColumn('minimal', mapEditorOrderToMinimal),
  creative: CREATIVE,
}

/**
 * The model a profile resolves to, and its reference for one template with any
 * undecided keys blanked out.
 */
export function referenceFor(profile: ParityProfile, template: ResumeTemplate): TemplateReference {
  const model = resolveLayoutModel(profile.layout)
  const reference = TEMPLATE_SPECS[template].reference(model)
  const undecided = profile.undecided?.[template]
  if (!undecided) return reference

  const visible = { ...reference.visible }
  for (const key of undecided.keys) visible[key] = null
  const order: TemplateReference['order'] = {}
  for (const [column, keys] of Object.entries(reference.order) as [Column, readonly string[]][]) {
    const touchesUndecided = TEMPLATE_SPECS[template].sections.some(
      (section) => section.column === column && undecided.keys.includes(section.key),
    )
    if (!touchesUndecided) order[column] = keys
  }
  return { visible, order }
}

/** First family of a CSS font stack, unquoted. */
export function primaryFamily(stack: string): string {
  return stack.split(',')[0].trim().replace(/['"]/g, '')
}

/**
 * Whether the model's font was chosen. The model cannot record that yet (US-012
 * adds it), so this applies the owner's decision of 2026-09-15 literally: a
 * stored font equal to today's default was never chosen.
 */
export function fontChosen(model: ResumeLayoutModel): boolean {
  return model.fontFamily !== DEFAULT_RESUME_LAYOUT.fontFamily
}

// ---------------------------------------------------------------------------
// Proof that the fixture is non-default
// ---------------------------------------------------------------------------

export interface NonDefaultLine {
  property: string
  defaultValue: string
  seededValue: string
  differs: boolean
  /** Required by the story; the rest are seeded to expose US-011 and font-family parity. */
  required: boolean
}

const show = (value: unknown) => JSON.stringify(value)

export function describeNonDefault(layout: StoredLayoutModel): NonDefaultLine[] {
  const model = resolveLayoutModel(layout)
  const d = DEFAULT_RESUME_LAYOUT
  const colour = (m: ResumeLayoutModel) =>
    `hsl(${m.sidebarHue}, ${m.sidebarSaturation}%, ${m.sidebarBrightness}%)`
  const line = (
    property: string,
    defaultValue: unknown,
    seededValue: unknown,
    required: boolean,
  ): NonDefaultLine => ({
    property,
    defaultValue: show(defaultValue),
    seededValue: show(seededValue),
    differs: show(defaultValue) !== show(seededValue),
    required,
  })
  const nonEmpty = (list: readonly string[]) => list.length > 0

  return [
    line('mainContentOrder', d.mainContentOrder, model.mainContentOrder, true),
    line('sidebarOrder', d.sidebarOrder, model.sidebarOrder, true),
    {
      ...line('hiddenMainSections', d.hiddenMainSections, model.hiddenMainSections, true),
      differs: !nonEmpty(d.hiddenMainSections) && nonEmpty(model.hiddenMainSections),
    },
    {
      ...line('hiddenSidebarSections', d.hiddenSidebarSections, model.hiddenSidebarSections, true),
      differs: !nonEmpty(d.hiddenSidebarSections) && nonEmpty(model.hiddenSidebarSections),
    },
    line('fontScale', d.fontScale, model.fontScale, true),
    line('sidebar colour', colour(d), colour(model), true),
    line('fontFamily', d.fontFamily, model.fontFamily, false),
    line('titleFontSize', d.titleFontSize, model.titleFontSize, false),
    line('sectionTitleFontSize', d.sectionTitleFontSize, model.sectionTitleFontSize, false),
    line('sectionDescFontSize', d.sectionDescFontSize, model.sectionDescFontSize, false),
  ]
}
