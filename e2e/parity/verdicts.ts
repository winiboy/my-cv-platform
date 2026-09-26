import type { ResumeTemplate } from '../../src/types/database'
import {
  TEMPLATE_APPLIED_SIZE_KEYS,
  templateOffersLayoutControl,
  type PerPropertySizeKey,
} from '../../src/lib/layout-settings'
import {
  COLOUR_CHANNEL_TOLERANCE,
  compositeOver,
  coloursAgree,
  type ConvertedColour,
} from './colour'
import {
  PROFILES,
  TEMPLATE_SPECS,
  describeNonDefault,
  fontChosen,
  primaryFamily,
  referenceFor,
  type Column,
  type NonDefaultLine,
  type ParityProfile,
  type ProfileId,
} from './profiles'
import {
  SURFACES,
  TYPOGRAPHY_ELEMENTS,
  type ColourSample,
  type LineHeight,
  type Observation,
  type StyleSample,
  type SurfaceId,
  type TypographyElement,
} from './surfaces'

/**
 * Part 2 US-008: rows, verdicts, and the report.
 *
 * Everything in this file is a pure function of the observations. Run it twice
 * over the same observations and it produces the same report, byte for byte.
 *
 * NO VERDICT PASSES BY DEFAULT. Every row either matches, reproduces a named
 * Part 3 defect, or is NEW. What the check cannot compare is listed separately,
 * with a reason, and never stands in for a row.
 */

// ---------------------------------------------------------------------------
// Known divergences
// ---------------------------------------------------------------------------

/**
 * The defects `tasks/prds/milestone-c-part-3-parity-defects.md` enumerates, each
 * named `US-NNN-<defect>` after the story that closes it. A story that closes
 * defects of different shapes, or one defect per template, has an id and a
 * signature for each.
 *
 * The first draft of that document numbered its stories differently. Its ids
 * map, by its Story Map, as: P3-US001-<template> to US-002-sections-<template>
 * (closed by US-002, and removed with its signature), P3-US002-<template> to
 * US-009-order-<template>, P3-US003 to US-010-empty-main, P3-US004 to
 * US-011-font-size, P3-US005 to US-015-creative-sections. The `US-` form cannot
 * be mistaken for the old one.
 *
 * US-003-palette was closed by US-003 and removed with its signature and the
 * two colour tables only that signature read. US-004-line-spacing was closed by
 * US-004 and removed with its signature and the Word auto spacing table only
 * that signature read. US-005-letter-spacing was closed by US-005 and removed
 * with its signature and the stock tracking table only that signature read.
 * US-006-translucent-text was closed by US-006 and removed with its signature
 * and the translucent-white pattern only that signature read. US-008-page-width
 * was closed by US-008 and removed with its signature and the two page-size
 * constants only that signature read.
 *
 * US-012-font-family was closed by US-012 and removed with its signature, the
 * declared-family table, the classic Times New Roman constant and the generic
 * keyword set that only that signature read. The chosen/not-chosen rule the
 * rows now compare against lives in the application, not here:
 * `chosenFontFamily` in src/lib/layout-settings.ts, which `fontChosen` asks.
 *
 * US-010-empty-main was closed by US-010 and removed with its signature:
 * modern-template.tsx adopted the generator's condition, so an order that maps
 * to nothing falls back to DEFAULT_MODERN_MAIN_ORDER on both surfaces.
 * US-013-accent-hue was closed by US-013 and removed with its signature and
 * the gold accent-fallback constant only that signature read; the Preview's
 * deriveAccentColor now parses the decimal components the layout model admits.
 *
 * US-009-order-classic and US-009-order-minimal were closed by US-009 and
 * removed with their shared signature and the sequence helper only that
 * signature read. Both Previews now derive their section order from
 * `mapEditorOrderToClassic` / `mapEditorOrderToMinimal` and filter
 * `hiddenMainSections` from it, which is the rule their generators already
 * applied, so the order and visibility rows compare two readings of one rule.
 *
 * US-015-creative-sections was closed by US-015 and removed with its signature.
 * Creative now reads a section vocabulary of its own (`mapEditorOrderToCreative`
 * in src/lib/layout-settings.ts), which both its Preview and docx-creative.ts
 * consume, so the rows that reported 'both surfaces agree on ignoring the model'
 * have no subject left. What the vocabulary cannot express is recorded in
 * `ANNOTATIONS` as a DECISION: certifications and projects have no editor id and
 * keep their slots, and summary is fixed in the header.
 *
 * US-014-sidebar-colour and US-014-per-property were resolved by US-014 and
 * removed with their signatures. NOT by making the surfaces draw the values:
 * both were dead controls, and US-014 answers a dead control by withdrawing it,
 * not by inventing a rendering for it. The rows they covered are no longer
 * reported, because the question each asked — "does the value this control
 * writes reach the surfaces?" — has no subject once the control is not offered.
 * What remains true of those stored values is recorded in `ANNOTATIONS` as two
 * DECISIONs, with the evidence that nothing deletes them.
 *
 * US-011-font-size was closed by US-011 and removed with its signature and the
 * stock-size table only that signature read. Both halves of it went: the three
 * Previews are now passed `fontScale` and draw every size they take from the
 * model at that scale, and the generators write the stored per-property size
 * instead of a default copied into their own FONT_SIZES — for exactly the
 * elements `TEMPLATE_APPLIED_SIZE_KEYS` says the template applies, modern's
 * two included.
 */
export type KnownId = 'US-016-html-body-line-height'

export const KNOWN_IDS: readonly KnownId[] = [
  'US-016-html-body-line-height',
]

export type Verdict = 'MATCH' | `KNOWN: ${KnownId}` | 'NEW'

const rowIds = (profile: ProfileId, templates: readonly ResumeTemplate[], properties: readonly string[]) =>
  templates.flatMap((template) => properties.map((property) => `${profile} · ${template} · ${property}`))

/** A row listed under two ids is a mistake in this file, not a verdict, so it throws. */
function expectations(groups: readonly (readonly [KnownId, readonly string[]])[]): Readonly<Record<string, KnownId>> {
  const byRow: Record<string, KnownId> = {}
  for (const [id, rows] of groups) {
    for (const row of rows) {
      if (byRow[row]) throw new Error(`${row} is listed as both ${byRow[row]} and ${id}`)
      byRow[row] = id
    }
  }
  return byRow
}

/**
 * The rows expected to diverge, by name and story.
 *
 * Each becomes a `test.fail()` in the spec. The entry passes only while the
 * named defect reproduces with its own signature (see `SIGNATURES`); if the
 * row starts matching, or diverges in some other way, Playwright reports
 * "Expected to fail, but passed" and the run exits non-zero. A Part 3 fix
 * therefore turns this command red until the entry is deleted — deliberately.
 *
 * Nothing that is NEW may be listed here. A NEW divergence is not an expected
 * failure; it is a hole in Part 3's scope.
 */
export const KNOWN_EXPECTATIONS: Readonly<Record<string, KnownId>> = expectations([
  [
    'US-016-html-body-line-height',
    // US-016 made classic, minimal and creative render stored HTML as formatted
    // text, which draws at .formatted-content's 1.4. Their generators still write
    // the template's own body ratio for that text, as they did when those Previews
    // rendered no formatted content at all. Professional and modern already follow
    // the Preview here, through formattedTextLineHeight.
    rowIds('html-body-and-skills', ['classic', 'minimal', 'creative'], ['line-height:bodyText']),
  ],
])

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type Family =
  | 'visibility'
  | 'order'
  | 'font-size'
  | 'font-scale'
  | 'per-property'
  | 'colour'
  | 'font-family'
  | 'letter-spacing'
  | 'line-height'
  | 'page-width'

export interface ObservationKey {
  profile: ProfileId
  template: ResumeTemplate
}

export interface RowDefinition {
  id: string
  profile: ProfileId
  template: ResumeTemplate
  family: Family
  property: string
  subject: string
  /** Every observation the row reads, the row's own first. */
  inputs: readonly ObservationKey[]
}

const COLUMNS: readonly Column[] = ['header', 'sidebar', 'main']

/**
 * The layout key behind each typography element's per-property size, which is
 * the bridge between this check's vocabulary and the layout model's. The
 * `per-property-control` profile resets exactly these three keys.
 */
const SIZE_KEY_BY_ELEMENT: Readonly<Record<TypographyElement, PerPropertySizeKey>> = {
  documentTitle: 'titleFontSize',
  sectionHeading: 'sectionTitleFontSize',
  bodyText: 'sectionDescFontSize',
}

/**
 * Every row the check reports, derived from the profiles and the section
 * catalogue alone — never from what a run observed — so the set of rows, and
 * therefore the set of tests, is the same on every run.
 */
export function rowDefinitions(): RowDefinition[] {
  const rows: RowDefinition[] = []
  for (const profile of PROFILES) {
    if (profile.control) continue
    if (profile.rowGroups.includes('font') && profile.rowGroups.includes('typography')) {
      throw new Error(`${profile.id}: the font row group repeats rows the typography group already reports`)
    }
    for (const template of profile.templates) {
      const spec = TEMPLATE_SPECS[template]
      const reference = referenceFor(profile, template)
      const appliedSizeKeys = TEMPLATE_APPLIED_SIZE_KEYS[template]
      const own: ObservationKey = { profile: profile.id, template }
      const add = (family: Family, property: string, subject: string, controls: readonly ProfileId[] = []) =>
        rows.push({
          id: `${profile.id} · ${template} · ${property}`,
          profile: profile.id,
          template,
          family,
          property,
          subject,
          inputs: [own, ...controls.map((control) => ({ profile: control, template }))],
        })

      if (profile.rowGroups.includes('structure')) {
        for (const section of spec.sections) add('visibility', `visibility:${section.key}`, section.key)
        for (const column of COLUMNS) {
          if ((reference.order[column]?.length ?? 0) >= 2) add('order', `order:${column}`, column)
        }
        add('order', 'order:document', 'document')
      }
      if (profile.rowGroups.includes('typography')) {
        for (const element of TYPOGRAPHY_ELEMENTS) {
          add('font-size', `font-size:${element}`, element)
          add('font-scale', `font-scale:${element}`, element, ['scale-control'])
          // Part 3 US-014: only where the template applies that element's size.
          // A size no surface of the template reads has no control to offer it
          // and no rendering to compare, so it is a recorded DECISION rather
          // than a row — see `TEMPLATE_APPLIED_SIZE_KEYS` for the matrix and
          // `ANNOTATIONS` for what is preserved. The sizes modern DOES apply
          // stay rows: they were US-011's divergence, not this one, and since
          // that story they respond on both surfaces.
          if (appliedSizeKeys.includes(SIZE_KEY_BY_ELEMENT[element])) {
            add('per-property', `per-property:${element}`, element, ['per-property-control'])
          }
          add('colour', `colour:${element}`, element)
          add('font-family', `font-family:${element}`, element)
          add('letter-spacing', `letter-spacing:${element}`, element)
          add('line-height', `line-height:${element}`, element)
        }
        for (const extra of spec.extraColourSamples) add('colour', `colour:${extra.key}`, extra.key)
      }
      if (profile.rowGroups.includes('font')) {
        for (const element of TYPOGRAPHY_ELEMENTS) add('font-family', `font-family:${element}`, element)
      }
      if (profile.rowGroups.includes('body-line-height')) {
        if (profile.rowGroups.includes('typography')) {
          throw new Error(`${profile.id}: the body-line-height row group repeats a row the typography group already reports`)
        }
        add('line-height', 'line-height:bodyText', 'bodyText')
      }
      if (profile.rowGroups.includes('colour')) {
        // Only the templates the editor offers the sidebar colour for. It used
        // to be every template — the editor offered and stored the colour for
        // all of them, so one that rendered it nowhere was a row with a verdict
        // rather than an omission. Part 3 US-014 withdrew the control where no
        // surface draws it, which removes the row's subject; the stored colour
        // is kept, and its preservation is a DECISION in `ANNOTATIONS`.
        if (templateOffersLayoutControl(template, 'sidebarColour')) {
          add('colour', 'colour:sidebar-background', 'sidebarBackground')
        }
        if (spec.accentDepth !== null) add('colour', 'colour:accent', 'accent')
      }
      if (profile.rowGroups.includes('page')) {
        add('page-width', 'page-width', 'document')
      }
      if (profile.rowGroups.includes('print')) {
        if (spec.sidebarBackgroundDepth === null) {
          throw new Error(`${profile.id}: ${template} draws no sidebar column for the print to be read against`)
        }
        add('colour', 'colour:print-sidebar-column', 'printSidebarColumn')
      }
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

type Value =
  | { kind: 'visibility'; shown: boolean }
  | { kind: 'sequence'; keys: readonly string[] }
  | { kind: 'size'; halfPoints: number; px: number }
  /** A size ratio, with the quantisation slack of the sizes it was computed from. */
  | { kind: 'ratio'; ratio: number; slack: number }
  | { kind: 'responds'; responds: boolean }
  | { kind: 'colour'; hex: string; css?: string; over?: string; overNote?: string }
  /** More than one colour where one is drawn, in order of first appearance. Never equal to a single colour. */
  | { kind: 'colours'; hexes: readonly string[] }
  | { kind: 'not-rendered' }
  | { kind: 'family'; name: string }
  /** Letter spacing as a multiple of the run size, with the slack of the twip it was encoded in. */
  | { kind: 'tracking'; em: number; slack: number }
  | { kind: 'line-height'; lineHeight: LineHeight }
  | { kind: 'length'; inches: number }

/**
 * Letter spacing is compared to one twip, as it always was, but per surface
 * rather than between them: a surface's em is whatever its own encoding could
 * express, so each side is allowed half of this in its own twips (see
 * `trackingSlack`). Where two surfaces draw an element at the same size — which
 * is what the font-size rows are for — that is the same single-twip tolerance.
 */
const TWIPS_TOLERANCE = 1

/** Line-height ratios are declared to three decimals at most (1.625, 1.5, 1.2). */
const LINE_HEIGHT_TOLERANCE = 0.01

/**
 * Page sizes agree to a quarter of a millimetre. Chromium writes a printed media
 * box in whole points, so A4 prints as 595pt = 8.2633in against the 8.2708in the
 * Preview computes and the 8.2694in the DOCX writes. Letter against A4 is 0.23in,
 * a format apart, so this admits the rounding without admitting a defect.
 */
const PAGE_LENGTH_TOLERANCE_INCHES = 0.01

const opaque = (hex: string): ConvertedColour => ({ hex, alpha: 255 })

function equal(a: Value, b: Value): boolean {
  switch (a.kind) {
    case 'visibility':
      return b.kind === 'visibility' && a.shown === b.shown
    case 'sequence':
      return b.kind === 'sequence' && a.keys.join('>') === b.keys.join('>')
    case 'size':
      return b.kind === 'size' && a.halfPoints === b.halfPoints
    case 'ratio':
      return b.kind === 'ratio' && Math.abs(a.ratio - b.ratio) <= a.slack + b.slack
    case 'responds':
      return b.kind === 'responds' && a.responds === b.responds
    case 'family':
      return b.kind === 'family' && normaliseFamily(a.name) === normaliseFamily(b.name)
    case 'colour':
      return b.kind === 'colour' && coloursAgree(opaque(a.hex), opaque(b.hex))
    case 'colours':
      return (
        b.kind === 'colours' &&
        a.hexes.length === b.hexes.length &&
        a.hexes.every((hex, i) => coloursAgree(opaque(hex), opaque(b.hexes[i])))
      )
    case 'not-rendered':
      return b.kind === 'not-rendered'
    case 'tracking':
      return b.kind === 'tracking' && Math.abs(a.em - b.em) <= a.slack + b.slack
    case 'line-height': {
      if (b.kind !== 'line-height') return false
      const [x, y] = [a.lineHeight, b.lineHeight]
      // Different kinds never match. In particular a Word auto multiple scales
      // the font's single-line height and a CSS ratio scales the font size, and
      // at-least spacing may be drawn taller than its number, so equal numbers
      // can draw different leading: comparing only the encoding would be a
      // MATCH over nothing. Only `ratio` is drawn leading.
      if (x.kind !== y.kind) return false
      if (x.kind === 'normal' || y.kind === 'normal') return true
      return Math.abs(x.ratio - y.ratio) <= LINE_HEIGHT_TOLERANCE
    }
    case 'length':
      // Page sizes are compared on the physical page, not on a decimal string.
      //
      // Rounding to two decimals worked only while the page was US Letter, where
      // Chromium's 612pt media box is exactly 8.50in and every surface agreed on
      // the digits. A4 has no such luck: the Preview computes 794 CSS px =
      // 8.270833in, the DOCX writes 11908.8 twips = 8.269444in, and Chromium
      // writes the printed media box in whole points, 595pt = 8.263333in. All
      // three are A4 (210mm); they straddle the boundary the string comparison
      // drew, so it reported three correct pages as three different sizes.
      //
      // The tolerance is 0.01in (0.254mm), which admits Chromium's whole-point
      // rounding and nothing a reader could see. A real page-size defect is a
      // format apart — Letter against A4 is 0.23in — so this does not hide one.
      return b.kind === 'length' && Math.abs(a.inches - b.inches) <= PAGE_LENGTH_TOLERANCE_INCHES
  }
}

/**
 * Family names compared as names, not spellings: case and spaces ignored, so
 * a PDF's "TimesNewRoman" and a DOCX's "Times New Roman" are one family.
 */
export function normaliseFamily(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase()
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

function display(value: Value | null): string {
  if (value === null) return '-'
  switch (value.kind) {
    case 'visibility':
      return value.shown ? 'shown' : 'absent'
    case 'sequence':
      return value.keys.length ? value.keys.join(' > ') : '(none)'
    case 'size':
      return `${value.halfPoints}hp (${round3(value.px)}px)`
    case 'ratio':
      return `x${value.ratio.toFixed(3)}`
    case 'responds':
      return value.responds ? 'responds' : 'ignores'
    case 'family':
      return value.name
    case 'colour': {
      const over = value.over ? ` over ${value.over}${value.overNote ? ` (${value.overNote})` : ''}` : ''
      const source = value.css ? ` (${value.css}${over})` : ''
      return `${value.hex}${source}`
    }
    case 'colours':
      return value.hexes.join(' then ')
    case 'not-rendered':
      return 'not rendered'
    case 'tracking':
      return `${value.em.toFixed(4)}em`
    case 'line-height':
      switch (value.lineHeight.kind) {
        case 'normal':
          return 'normal'
        case 'ratio':
          return `x${value.lineHeight.ratio.toFixed(3)} font size`
        case 'auto-multiple':
          return `auto x${value.lineHeight.ratio.toFixed(3)} single line`
        case 'at-least':
          return `at least x${value.lineHeight.ratio.toFixed(3)} font size`
      }
    case 'length':
      return `${value.inches.toFixed(2)}in`
  }
}

/**
 * The colour as seen: translucent text composited over the opaque backdrop
 * behind it. Nothing translucent is ever compared raw, and nothing translucent
 * is excused.
 *
 * Two things make text see-through and the browser paints their product, so
 * both are folded into one alpha before compositing: the alpha of the colour
 * itself (`rgba()`, `text-white/90`) and the CSS `opacity` the element is drawn
 * through (`opacity-80`), which `getComputedStyle` reports separately. The
 * product is quantised to eight bits.
 *
 * The backdrop is what the surface measured behind the text, EXCEPT where the
 * sample declares a substitute (`note`), which the row then prints beside it so
 * a substituted backdrop cannot read as a measured one. Creative's two header
 * rows are the only ones today: the Preview paints a gradient there, which has
 * no single colour to measure and which the DOCX cannot draw, so both sides
 * composite over the solid fill the DOCX does draw. See the creative header
 * gradient LIMITATION for what that hides.
 */
function seenColour(
  colour: ColourSample,
  backdrop: ColourSample | null,
  label: string,
  opacity = 1,
  note: string | null = null,
): Value {
  if (!(opacity >= 0 && opacity <= 1)) throw new Error(`${label}: an opacity of ${opacity} is not a fraction`)
  const alpha = Math.round(colour.alpha * opacity)
  const drawn = opacity === 1 ? '' : ` x opacity ${opacity}`
  const source = colour.css ? { css: `${colour.css}${drawn}` } : {}
  if (alpha === 255) return { kind: 'colour', hex: colour.hex, ...source }
  if (!backdrop) throw new Error(`${label}: translucent colour ${colour.hex} a=${alpha} has no measured backdrop`)
  const seen: ConvertedColour = compositeOver({ hex: colour.hex, alpha }, backdrop)
  return {
    kind: 'colour',
    hex: seen.hex,
    ...source,
    over: backdrop.hex,
    ...(note ? { overNote: note } : {}),
  }
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

interface SignatureContext {
  row: RowDefinition
  observation: Observation
  profile: ParityProfile
  reference: Value | null
  values: Record<SurfaceId, Value>
}

interface Signature {
  id: KnownId
  /** The defect, as its story names it. Printed as the note of every row it claims. */
  defect: string
  matches: (context: SignatureContext) => boolean
}

const shown = (value: Value) => value.kind === 'visibility' && value.shown
const isTypographyElement = (subject: string): subject is TypographyElement =>
  (TYPOGRAPHY_ELEMENTS as readonly string[]).includes(subject)

/** Per-property size each sampled element may take from the model. */
const PER_PROPERTY: Readonly<Record<TypographyElement, 'titleFontSize' | 'sectionTitleFontSize' | 'sectionDescFontSize'>> = {
  documentTitle: 'titleFontSize',
  sectionHeading: 'sectionTitleFontSize',
  bodyText: 'sectionDescFontSize',
}

/**
 * The family a font-family row compares against. A chosen font is the reference
 * on every template. For a font never chosen, the owner's decision of 2026-09-15
 * says a template keeps its own designed font: minimal and creative stay Inter.
 * Professional and modern are not named; they draw the stored default today,
 * and no unchosen font may change, so the stored font stays their reference.
 *
 * Classic alone has NO single reference, because it draws TWO designed
 * families: serif on its title and headings, the app's Inter on its body. A
 * reference is per template, not per element, so naming one here would hold
 * two thirds of classic's unchosen rows to the wrong family. They are compared
 * surface against surface instead, which is the whole of what US-012 asks of
 * them — that the DOCX draw what the Preview draws — and is why the DECISION
 * below records the two families rather than one.
 */
function fontFamilyReference(template: ResumeTemplate, model: Observation['model']): string | null {
  if (fontChosen(model)) return primaryFamily(model.fontFamily)
  if (template === 'minimal' || template === 'creative') return 'Inter'
  if (template === 'classic') return null
  return primaryFamily(model.fontFamily)
}

/**
 * What each known defect looks like on a row. A divergence is attributed to a
 * story only when it has that defect's shape — the surfaces that are wrong,
 * wrong in the way the story describes, and the others right. A divergence
 * with any other shape is NEW, even on a template the defect concerns. No row
 * may have two shapes: `evaluateRow` throws if signatures overlap.
 */
const SIGNATURES: readonly Signature[] = [
  {
    id: 'US-016-html-body-line-height',
    defect:
      'Body text stored as HTML draws at the formatted-content line height in the Preview and print ' +
      'on classic, minimal and creative, while their generators write the template own body ratio. ' +
      'US-016 fixed the Preview side, which is what revealed this; the DOCX side is owed.',
    matches: ({ row, values }) => {
      if (!['classic', 'minimal', 'creative'].includes(row.template)) return false
      if (row.family !== 'line-height' || row.subject !== 'bodyText') return false
      // Pinned on both sides: the Preview and print draw the formatted-content
      // height, and the DOCX draws a ratio that is not it. A generator that
      // drifted to some third value is NEW, not this.
      // The value is a line-height, whose own kind says how it is drawn; only
      // `ratio` is drawn leading (US-004).
      if (values.preview.kind !== 'line-height' || values.pdf.kind !== 'line-height') return false
      if (values.docx.kind !== 'line-height') return false
      const shown = values.preview.lineHeight
      if (shown.kind !== 'ratio') return false
      if (!equal(values.pdf, values.preview)) return false
      // 1.4 is .formatted-content's line height in globals.css, the same number
      // formattedTextLineHeight writes on the surfaces that already follow it.
      if (Math.abs(shown.ratio - 1.4) > LINE_HEIGHT_TOLERANCE) return false
      return !equal(values.docx, values.preview)
    },
  },
]

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface EvaluatedRow extends Omit<RowDefinition, 'inputs'> {
  model: string
  preview: string
  pdf: string
  docx: string
  /** With a model reference: `model` and the surfaces equal to it. Without: the largest agreeing group. */
  agree: string[]
  diverge: string[]
  verdict: Verdict
  note: string | null
}

export type ObservationResolver = (key: ObservationKey) => Observation

const profileById = (id: ProfileId) => {
  const profile = PROFILES.find((p) => p.id === id)
  if (!profile) throw new Error(`Unknown profile ${id}`)
  return profile
}

function typographyOf(observation: Observation, surface: SurfaceId, row: RowDefinition): StyleSample {
  const typography = observation.surfaces[surface].typography
  if (!typography) throw new Error(`${row.id}: ${surface} of ${observation.profile} was not sampled for typography`)
  return typography[row.subject as TypographyElement]
}

/** Ratio slack from quantisation: CSS and PDF sizes are fractional; DOCX sizes are whole half-points. */
function sizeSlack(surface: SurfaceId, sample: StyleSample): number {
  return surface === 'docx' ? 0.5 / sample.halfPoints : 0.001
}

/**
 * Half of `TWIPS_TOLERANCE`, in em, at the size this surface draws the element:
 * the DOCX encodes its character spacing in whole twips of a run measured in
 * half-points (ten twips each), the Preview and print in CSS px (fifteen twips
 * each). The PDF takes the em from the print rendering, so its slack is that of
 * the size the PDF reports for the same text, within a fraction of a point of
 * the print's.
 */
function trackingSlack(surface: SurfaceId, sample: StyleSample): number {
  const twipsPerEm = surface === 'docx' ? sample.halfPoints * 10 : sample.px * 15
  return TWIPS_TOLERANCE / 2 / twipsPerEm
}

export function evaluateRow(row: RowDefinition, resolve: ObservationResolver): EvaluatedRow {
  const observation = resolve(row.inputs[0])
  if (observation.profile !== row.profile || observation.template !== row.template) {
    throw new Error(`Observation ${observation.profile}/${observation.template} does not belong to row ${row.id}`)
  }
  const profile = profileById(row.profile)
  const spec = TEMPLATE_SPECS[row.template]
  const templateReference = referenceFor(profile, row.template)
  const { surfaces, model } = observation
  const values = {} as Record<SurfaceId, Value>
  let reference: Value | null = null

  switch (row.family) {
    case 'visibility': {
      const expected = templateReference.visible[row.subject]
      if (expected === undefined) throw new Error(`${row.id}: no reference visibility`)
      reference = expected === null ? null : { kind: 'visibility', shown: expected }
      for (const s of SURFACES) values[s] = { kind: 'visibility', shown: surfaces[s].sequence.includes(row.subject) }
      break
    }
    case 'order': {
      if (row.subject === 'document') {
        const common = surfaces.preview.sequence.filter((key) => SURFACES.every((s) => surfaces[s].sequence.includes(key)))
        for (const s of SURFACES) values[s] = { kind: 'sequence', keys: surfaces[s].sequence.filter((k) => common.includes(k)) }
      } else {
        const expected = templateReference.order[row.subject as Column]
        if (!expected) throw new Error(`${row.id}: no reference order`)
        reference = { kind: 'sequence', keys: expected }
        for (const s of SURFACES) values[s] = { kind: 'sequence', keys: surfaces[s].sequence.filter((k) => expected.includes(k)) }
      }
      break
    }
    case 'font-size': {
      for (const s of SURFACES) {
        const sample = typographyOf(observation, s, row)
        values[s] = { kind: 'size', halfPoints: sample.halfPoints, px: sample.px }
      }
      break
    }
    case 'font-scale': {
      const control = resolve(row.inputs[1])
      if (control.model.fontScale === model.fontScale) throw new Error(`${row.id}: the control does not vary fontScale`)
      reference = { kind: 'ratio', ratio: model.fontScale / control.model.fontScale, slack: 0 }
      for (const s of SURFACES) {
        const primary = typographyOf(observation, s, row)
        const base = typographyOf(control, s, row)
        const ratio = primary.px / base.px
        values[s] = { kind: 'ratio', ratio, slack: ratio * (sizeSlack(s, primary) + sizeSlack(s, base)) }
      }
      break
    }
    case 'per-property': {
      const control = resolve(row.inputs[1])
      const key = PER_PROPERTY[row.subject as TypographyElement]
      if (control.model[key] === model[key]) throw new Error(`${row.id}: the control does not vary ${key}`)
      // The model changed the property; a surface that reads it must change too.
      reference = { kind: 'responds', responds: true }
      for (const s of SURFACES) {
        const primary = typographyOf(observation, s, row)
        const base = typographyOf(control, s, row)
        const changed = s === 'docx' ? primary.halfPoints !== base.halfPoints : Math.abs(primary.px - base.px) > 0.01
        values[s] = { kind: 'responds', responds: changed }
      }
      break
    }
    case 'font-family': {
      const family = fontFamilyReference(row.template, model)
      reference = family === null ? null : { kind: 'family', name: family }
      for (const s of SURFACES) values[s] = { kind: 'family', name: typographyOf(observation, s, row).fontFamily }
      break
    }
    case 'letter-spacing': {
      for (const s of SURFACES) {
        const sample = typographyOf(observation, s, row)
        values[s] = { kind: 'tracking', em: sample.letterSpacingEm, slack: trackingSlack(s, sample) }
      }
      break
    }
    case 'line-height': {
      for (const s of SURFACES) values[s] = { kind: 'line-height', lineHeight: typographyOf(observation, s, row).lineHeight }
      break
    }
    case 'colour': {
      if (isTypographyElement(row.subject)) {
        for (const s of SURFACES) {
          const sample = typographyOf(observation, s, row)
          values[s] = seenColour(sample.colour, sample.backdrop, `${row.id} ${s}`, sample.opacity)
        }
        break
      }
      if (spec.extraColourSamples.some((extra) => extra.key === row.subject)) {
        for (const s of SURFACES) {
          const sample = surfaces[s].extraColours[row.subject]
          if (!sample) throw new Error(`${row.id}: ${s} has no ${row.subject} measurement`)
          values[s] = seenColour(sample.colour, sample.backdrop, `${row.id} ${s}`, sample.opacity, sample.backdropNote)
        }
        break
      }
      if (row.subject === 'printSidebarColumn') {
        // The sidebar colour as each surface draws it down the column: the
        // Preview's and the DOCX's sidebar background, and what the printed
        // pages actually show there, band included.
        const column = observation.printSidebarColumn
        if (!column) throw new Error(`${row.id}: the print sidebar column was not read`)
        reference = seenColour(observation.modelColours.sidebar, null, `${row.id} model`)
        for (const s of ['preview', 'docx'] as const) {
          const sample = surfaces[s].sidebarBackground
          if (!sample) throw new Error(`${row.id}: ${s} has no sidebarBackground measurement`)
          values[s] = seenColour(sample, null, `${row.id} ${s}`)
        }
        values.pdf =
          column.colours.length === 1
            ? { kind: 'colour', hex: column.colours[0].hex }
            : { kind: 'colours', hexes: column.colours.map((colour) => colour.hex) }
        break
      }
      const target = row.subject === 'accent' ? 'accent' : 'sidebarBackground'
      const modelColour = target === 'accent' ? observation.modelColours.accent : observation.modelColours.sidebar
      reference = seenColour(modelColour, null, `${row.id} model`)
      const templateDraws = target === 'accent' ? spec.accentDepth !== null : spec.sidebarBackgroundDepth !== null
      for (const s of SURFACES) {
        const sample = surfaces[s][target]
        if (templateDraws) {
          if (!sample) throw new Error(`${row.id}: ${s} has no ${target} measurement`)
          values[s] = seenColour(sample, null, `${row.id} ${s}`)
        } else {
          if (sample) throw new Error(`${row.id}: ${s} measured a ${target} the catalogue says is not drawn`)
          values[s] = { kind: 'not-rendered' }
        }
      }
      break
    }
    case 'page-width': {
      for (const s of SURFACES) values[s] = { kind: 'length', inches: surfaces[s].pageWidthInches }
      break
    }
  }

  let agree: string[]
  let diverge: string[]
  if (reference !== null) {
    const ref = reference
    agree = ['model', ...SURFACES.filter((s) => equal(values[s], ref))]
    diverge = SURFACES.filter((s) => !equal(values[s], ref))
  } else {
    const groups: SurfaceId[][] = []
    for (const s of SURFACES) {
      const group = groups.find((g) => equal(values[g[0]], values[s]))
      if (group) group.push(s)
      else groups.push([s])
    }
    // Largest group first; on a tie, the group holding the Preview, which
    // `.claude/rules/exports.md` makes the contract.
    groups.sort((a, b) => b.length - a.length || Number(b.includes('preview')) - Number(a.includes('preview')))
    agree = groups[0]
    diverge = groups.slice(1).flat()
  }

  const surfacesAgree = SURFACES.every((s) => equal(values[s], values.preview))
  const allMatch = surfacesAgree && (reference === null || equal(values.preview, reference))
  const context: SignatureContext = { row, observation, profile, reference, values }

  let verdict: Verdict
  let note: string | null = null
  if (allMatch) {
    verdict = 'MATCH'
  } else {
    const known = SIGNATURES.filter((signature) => signature.matches(context))
    if (known.length > 1) {
      throw new Error(`${row.id} has the shape of ${known.map((k) => k.id).join(' and ')}; signatures must not overlap`)
    }
    if (known.length === 1) {
      verdict = `KNOWN: ${known[0].id}`
      note = known[0].defect
    } else {
      verdict = 'NEW'
      note = newDivergenceNote(context)
    }
  }

  const { inputs: _inputs, ...definition } = row
  return {
    ...definition,
    model: display(reference),
    preview: display(values.preview),
    pdf: display(values.pdf),
    docx: display(values.docx),
    agree,
    diverge,
    verdict,
    note,
  }
}

/**
 * Says what a NEW divergence is, from evidence in the row alone, without
 * attributing it to a story and without deciding which surface is right. A NEW
 * row has, by definition, no story's shape.
 */
function newDivergenceNote({ row, values, reference }: SignatureContext): string | null {
  const surfacesAgree = SURFACES.every((s) => equal(values[s], values.preview))

  if (!equal(values.pdf, values.preview)) {
    return 'The PDF differs from the Preview it is printed from.'
  }

  switch (row.family) {
    case 'font-scale':
      return (
        'A surface does not scale this element by the model fontScale. Since Part 3 US-011 every surface ' +
        'draws it at the stored size times that scale.'
      )
    case 'letter-spacing':
      return (
        'Letter spacing differs as a multiple of the size each surface draws the element at; DOCX can express ' +
        'it (w:spacing w:val), and since Part 3 US-005 the generators write it from the Preview em at the run size.'
      )
    case 'line-height': {
      const docx = values.docx.kind === 'line-height' ? values.docx.lineHeight : null
      const preview = values.preview.kind === 'line-height' ? values.preview.lineHeight : null
      if (docx?.kind === 'auto-multiple' && preview?.kind === 'ratio') {
        const encodingMatches = Math.abs(docx.ratio - preview.ratio) <= LINE_HEIGHT_TOLERANCE
        return (
          (encodingMatches
            ? 'Encoded ratio matches, but Word auto scales single-line height, so drawn leading differs. '
            : 'The encoded ratios differ, and Word auto scales single-line height rather than font size. ') +
          'The DOCX uses w:lineRule="auto" where the CSS means a multiple of the font size; since Part 3 ' +
          'US-004 the generators write exact spacing.'
        )
      }
      if (docx?.kind === 'at-least') {
        return (
          'The DOCX writes at-least spacing, drawn at its multiple of the font size only where the ' +
          "font's single line is not taller; this check reads no font metrics, so it is not drawn leading."
        )
      }
      if (docx?.kind === 'normal' || preview?.kind === 'normal') {
        // `normal` is the font's own leading (about 1.215 em for Verdana): it may be close to
        // the other side's ratio or not, and this check reads no font metrics to say which.
        return (
          'Not compared physically: one side is the font\'s own single line (CSS normal / Word 240), ' +
          'the other a multiple of the font size, and drawn leading is not computed.'
        )
      }
      return 'Line height differs.'
    }
    case 'colour':
      if (values.preview.kind === 'colour' && values.docx.kind === 'colour') {
        const seen = values.preview.over ? `, composited over ${values.preview.over} to ${values.preview.hex}` : ''
        return (
          `The Preview renders ${values.preview.css ?? values.preview.hex}${seen}; the DOCX writes ` +
          `${values.docx.hex}, a different sRGB colour.`
        )
      }
      break
    default:
      break
  }

  if (reference !== null && surfacesAgree) {
    return 'The surfaces agree with each other; all three disagree with the model.'
  }
  return null
}

// ---------------------------------------------------------------------------
// What is not a row: limitations, decisions, unmeasured findings
// ---------------------------------------------------------------------------

export type AnnotationVerdict = 'LIMITATION' | 'NOT EXERCISED' | 'FINDING' | 'DECISION'

export interface AnnotationRow {
  template: ResumeTemplate | 'all'
  property: string
  surfaces: readonly SurfaceId[]
  verdict: AnnotationVerdict
  reason: string
}

const annotation = (
  verdict: AnnotationVerdict,
  template: AnnotationRow['template'],
  property: string,
  surfaces: readonly SurfaceId[],
  reason: string,
): AnnotationRow => ({ template, property, surfaces, verdict, reason })

/**
 * LIMITATION is reserved for what a target format, or the reader this check
 * uses on it, genuinely cannot express or supply — each with its evidence.
 * A disagreement a template or generator could fix is a row or a FINDING; a
 * choice the product made is a DECISION.
 */
export const ANNOTATIONS: readonly AnnotationRow[] = [
  annotation('LIMITATION', 'all', 'PDF text colour', ['pdf'],
    'The PDF reader this check can use (pdf.js bundled with pdf-parse) does not apply the ICC colour spaces ' +
      'Chromium writes: in a measured probe rgb(55,65,81) read back as [55,64,80] but oklch(0.5 0.22 290), ' +
      'rendered #693AD4, read back as [63,33,128]. PDF text colour is therefore taken from the computed ' +
      'style of the print rendering the PDF is made from, composited over its backdrop. Size and font are ' +
      'read from the PDF itself.'),
  annotation('LIMITATION', 'all', 'PDF letter-spacing and line-height', ['pdf'],
    'A reader choice, not a format limit. Chromium writes letter-spaced text as individually positioned glyphs ' +
      '(a moveText per glyph in the measured probe) and leading as baseline positions, not as spacing ' +
      'properties; both could be reconstructed from glyph advances and baseline gaps, which this check does ' +
      'not do. Both are taken from the print rendering the PDF is made from. Recorded as a follow-up.'),
  annotation('LIMITATION', 'all', 'PDF production method', ['pdf'],
    'The PDF is produced with page.pdf() (Chromium print-to-PDF, preferCSSPageSize), not window.print(). ' +
      "The print dialog's own settings — paper, margins, scale, headers and footers, background graphics — " +
      'are not exercised.'),
  annotation('LIMITATION', 'all', 'PDF section order', ['pdf'],
    'Order in the PDF is geometric: template column, then page, then top to bottom, then left to right, from ' +
      'the positions pdf.js reports for the text item holding each title (whitespace removed, case folded, ' +
      'each title required to occur at most once). Columns are assigned from the section catalogue, not ' +
      'measured from x.'),
  annotation('LIMITATION', 'professional', 'PDF sidebar column colour', ['pdf'],
    'Read from pixels, because a band painted behind the document shows only where the document does not ' +
      'cover the page, which no computed style says. The PDF is rasterised by the same pdf.js build inside ' +
      'Chromium at 72 dpi, and a strip 2pt from the left edge is read down the whole of every page; below the ' +
      "last page's lowest text baseline, blank paper is not counted but any painted colour is, and a single " +
      'row blending the two fills either side of it is an anti-aliased edge, not a colour. That reader ' +
      'does not apply ICC colour spaces (see PDF text colour), ' +
      'so the colours read are its own conversion; they are compared at the declared tolerance and nothing ' +
      'they read is excused.'),
  annotation('LIMITATION', 'all', 'font family', ['preview', 'pdf', 'docx'],
    'A DOCX run names one font and carries no fallback stack, so what Word renders depends on the fonts ' +
      'installed where it is opened; which face Word would use is not observable. The Preview column is the ' +
      'face Chromium actually used (CSS.getPlatformFontsForNode) and the PDF column the embedded font, and ' +
      'BOTH DEPEND ON THE MACHINE: on one without Verdana — typical Linux CI — the professional and modern ' +
      'font-family rows would resolve to a fallback face and turn NEW. The report is deterministic per ' +
      'machine only; its environment block (OS, Node, Chromium, and every declared-to-used resolution) ' +
      'identifies the machine so two reports are not compared blindly.'),
  annotation('LIMITATION', 'all', 'font weight', ['docx'],
    'A DOCX run carries bold on or off (w:b). CSS weights such as black (900), semibold (600), medium (500) ' +
      'and light (300) have no DOCX encoding and are not compared.'),
  annotation('DECISION', 'all', 'letter spacing: compared as a multiple of the run size', ['preview', 'pdf', 'docx'],
    'Closed the letter-spacing divergence (Part 3 US-005). Every DOCX run is written with the character spacing ' +
      'its Preview element draws — the em in src/lib/resume-letter-spacing.ts times the size of that run, in ' +
      'twentieths of a point — where the generators previously wrote one fixed twip count, correct at one font ' +
      'size only. The rows therefore compare the em, each surface dividing its own spacing by its own size, not ' +
      'the absolute twips: on the four templates where the DOCX still draws a title at a different size from the ' +
      "Preview's, absolute twips would report US-011's size divergence a second time under letter spacing, and " +
      'would go on reporting it after this story had made the spacing right. The tolerance is unchanged — half of ' +
      'the declared one twip per side, in that side\'s own twips, which is one twip between two surfaces drawing ' +
      'at the same size. Sub-twip quantisation remains: 0.025em over a 13pt heading is 6.5 twips and is written ' +
      'as 7.'),
  annotation('DECISION', 'all', 'translucent text: composited against what the DOCX draws behind it', ['preview', 'pdf', 'docx'],
    'Closed the translucent text divergence (Part 3 US-006). A DOCX run carries no alpha, so every run whose ' +
      'Preview counterpart is see-through is written in the opaque colour that tint composites to over the ' +
      'colour the DOCX itself draws behind it: the user\'s sidebar fill on professional and modern, the header ' +
      'fill on creative. The alphas come from src/lib/resume-text-opacity.ts, which declares each one in the ' +
      'form its template writes it — professional opacity-80, modern rgba(255,255,255,0.6/0.7/0.8), creative ' +
      'text-white/90 and /80 — and which resume-palette.test.ts holds to the template sources in both ' +
      'directions. Compositing is source-over in 8-bit sRGB as encoded, not in linear light, which is what the ' +
      'browser draws; the alpha is quantised to eight bits on both sides so neither can round differently. ' +
      'The Preview side of a row folds the element\'s CSS opacity into the alpha of its colour, because ' +
      'getComputedStyle reports the two separately and the browser paints their product.'),
  annotation('DECISION', 'all', 'sidebar colour: stored for every template, offered only where it is drawn', ['preview', 'pdf', 'docx'],
    'Closed the dead sidebar-colour control (Part 3 US-014). Classic, minimal and creative paint no sidebar ' +
      'fill on any surface — resume-editor.tsx passes them no sidebarColor, and docx-classic.ts, ' +
      'docx-minimal.ts and docx-creative.ts write no sidebar shading — so the editor no longer offers the ' +
      'colour while one of them is selected. The three stored components are NOT touched: ' +
      'TEMPLATE_LAYOUT_CONTROLS in src/lib/layout-settings.ts gates only what is rendered, the editor derives ' +
      'it per render and writes nothing back, and toStoredLayout still carries sidebarHue, sidebarSaturation ' +
      'and sidebarBrightness for every template, so a resume moved to professional or modern draws the colour ' +
      'its owner last chose. The rows that reported the dead control are therefore no longer generated for ' +
      'those three templates rather than reported as matching, since there is nothing left to compare.'),
  annotation('DECISION', 'all', 'per-property sizes: stored where no control offers them', ['preview', 'pdf', 'docx'],
    'Closed the inert per-property sizes (Part 3 US-014). Professional reads no per-property size on any ' +
      'surface and the editor passes it none. Modern applies two of them — titleFontSize on its document ' +
      'title and sectionDescFontSize on its body text — and reads neither contactFontSize nor ' +
      'sectionTitleFontSize, and it renders no input for any of the four; the editor now hands it those ' +
      'sizes without the setters that would produce one. So professional\'s three sizes and modern\'s section ' +
      'heading are stored state that no control adjusts and no surface draws, which is a decision about ' +
      'where the controls live and not a divergence between surfaces: their rows are not generated. The ' +
      'values survive untouched — nothing in the gating path writes the model — and apply again on classic, ' +
      'minimal or creative, which offer the control and draw all four. The two sizes modern DOES apply keep ' +
      'their rows: Part 3 US-011 made its DOCX write them, so they now respond on every surface.'),
  annotation('DECISION', 'all', 'font size: one stored size per property, drawn at the model scale', ['preview', 'pdf', 'docx'],
    'Closed the font-size divergence (Part 3 US-011). Two halves. resume-preview.tsx now passes fontScale to ' +
      'classic, minimal and creative, and each multiplies the four per-property sizes by it before drawing, ' +
      'as modern and professional already did — the sliders keep showing and writing the STORED size, since ' +
      'the scale is a second, document-wide control. And docx-classic.ts, docx-minimal.ts, docx-creative.ts ' +
      'and docx-modern.ts now write the stored size for the elements their template applies, where each had ' +
      'copied the control default into its own FONT_SIZES and scaled that. Which element takes which key is ' +
      'TEMPLATE_APPLIED_SIZE_KEYS in src/lib/layout-settings.ts, unwidened: modern takes titleFontSize and ' +
      'sectionDescFontSize only, professional none. The sizes are read from the model the route resolves, ' +
      'never from DEFAULT_RESUME_LAYOUT, which resolves to the default while the Preview keeps the owner\'s ' +
      'value. Elements the Preview draws from a Tailwind class rather than the model — classic\'s text-sm ' +
      'dates, minimal\'s text-xl positions, creative\'s header summary — keep their generator constant.'),
  annotation('DECISION', 'all', 'line height: Word exact spacing', ['docx'],
    'Closed the Word auto line spacing finding (Part 3 US-004). Every DOCX paragraph, and the document default, ' +
      'is written as w:lineRule="exact" at the Preview line height of its element times the size of its run, in ' +
      'twips, taken from src/lib/resume-line-height.ts. Exact rather than at-least: exact is drawn at exactly ' +
      "that pitch in every font, where at-least is drawn at the font's single line whenever that is taller — " +
      'Verdana\'s 1.215 em against the 1.2 of the professional and modern titles. The line-height rows compare ' +
      'the DOCX exact spacing divided by the run size, which is its drawn leading; at-least and auto spacing are ' +
      'read as what they ask for and never match a CSS line height.'),
  annotation('FINDING', 'all', 'line height: what exact spacing does not carry', ['docx'],
    'Residual differences after Part 3 US-004, each measured on DOCX files the generators wrote, exported to PDF ' +
      'by Word 16 and read back with pdf.js. (1) Baseline position: Word lays each line of an exact paragraph ' +
      'at the written pitch (summary baselines 13.44/13.56pt apart for 13.5pt written, 20.28pt for 20.3pt; ' +
      "Word places lines on a grid of about 0.12pt) but puts the baseline at 80% of the line's height, where " +
      'CSS centres the font\'s ascent-plus-descent in the line box, so glyphs sit up to about 0.1em higher or ' +
      'lower within the same line box (classic title: 3.7pt lower; professional title: 0.75pt higher). The ' +
      "effect is largest on modern's job-title bar, whose paragraph stands for the bar's padded box: the fill is " +
      'the Preview\'s height (27.75pt, its line plus 4px above and below), but Word draws the baseline 22.2pt ' +
      'down it where the Preview draws it about 19.7pt down, so the title sits about 2.5pt low in the bar, ' +
      '5.5pt from its bottom edge instead of 8pt; nothing of it is cut. OOXML has no property that places the ' +
      'baseline within an exact line. Nothing clipped: the tallest accented capitals ' +
      'and the descenders of g, j, p, q, y rendered whole in Verdana at 1.2, the tightest ratio any generator ' +
      'writes, and in Times New Roman at 1.5. (2) One Word paragraph has one line height and one pair of gaps: ' +
      'where the Preview draws two boxes side by side in a flex row and the text may wrap, the two cannot both ' +
      'hold. A title and its date take the taller line box for every line, so a title that wraps is spaced at ' +
      "that height rather than its own. A creative heading instead keeps its own leading and carries its bar's " +
      'surplus height as fixed space above and below, so a heading that wraps is 2 lines plus that surplus ' +
      '(2 x 360 + 120 twips for a main-column heading at the default size) where the Preview draws the taller ' +
      'of the bar and the two lines, about 8px less. Halving the surplus rounds up, so the one-line row can be ' +
      'a twip over the bar (361 against 360 for a sidebar heading at font scale 0.8; 481 against 480 for a main ' +
      "one at 1.2). modern's bullet, a separate flex item at 1.5, can make a one-line HTML achievement 0.1em " +
      'taller than its 1.4 text leading. (3) Paragraphs that draw no text (spacers, the paragraph a table cell requires, the ' +
      'paragraph after a final table) take a 1-twip exact line, where the Preview draws none.'),
  annotation('LIMITATION', 'all', 'colour conversion', ['preview', 'pdf', 'docx'],
    `Compared as 8-bit sRGB with a tolerance of ${COLOUR_CHANNEL_TOLERANCE} level per channel. CSS colours are ` +
      'converted by the browser canvas and, independently, by the OKLab matrices in e2e/parity/colour.ts; a ' +
      'collect test fails if the two disagree. Translucent colours are composited over their measured ' +
      'backdrop before comparison. Colours outside sRGB are clipped.'),
  annotation('LIMITATION', 'creative', 'header gradient', ['docx'],
    'The header is a three-stop CSS gradient (from-purple-600 via-pink-500 to-orange-400). DOCX paragraph and ' +
      'table-cell shading is a single solid fill (w:shd), so since Part 3 US-003 the generator fills the header ' +
      "with the gradient's first stop, globals.css purple-600, taken from src/lib/resume-palette.ts. The other " +
      'two stops are not drawn. The two bg-white/10 circles the Preview draws over the gradient inside the same ' +
      'header ARE drawn, since Part 3 US-007, as floating rasters; they have their own DECISION row, and they ' +
      "are not folded into the composite below. The fill is not compared. Part 3 US-006 composites the header's " +
      'translucent text against that same first stop, on both sides: the colour:headerSummary and ' +
      'colour:headerLinks rows print it as the "over" colour, read from the computed background-image of the ' +
      'header the Preview actually rendered, never assumed, and marked as the DOCX fill rather than a measured ' +
      'backdrop. WHAT THAT HIDES, measured on the painted pixels of the primary profile\'s creative Preview ' +
      '(header 816x273): the gradient runs to-br, so the first stop is the top-left CORNER only — painted ' +
      '#6A3AD4 at (1,1), against #F747A4, #F647A4 and #FF890B at the other three, and already #B047BA halfway ' +
      'down the left edge. Both sampled texts also lie inside the bottom-left bg-white/10 disc (centre (56,217), ' +
      'r=96; the summary 83 away, the links 18), and the right end of the summary lies inside the top-right disc ' +
      '(centre (768,48), r=128; 74 away). So the backdrop actually painted behind them is pink, not the first ' +
      'stop: #BC58BE level with the summary and #E750AC level with the links, reaching #FA6095 and #F84490 at ' +
      'their right ends. The Preview therefore draws those two texts at about #F8EFF9 and #FADCEE where the DOCX ' +
      'writes #F0ECFB and #E1D8F6 — a hue difference, pink against lavender, 25 levels of red apart on the links ' +
      'row, not a uniform lightening. Nothing in DOCX shading can carry a gradient or a disc, so the rows match ' +
      'on the fill the format can draw and this records what they cannot cover.'),
  annotation('LIMITATION', 'modern', 'colour:accent reference', ['preview', 'pdf', 'docx'],
    'The accent is not stored in the model. It is derived from the sidebar colour by the rule documented in ' +
      'modern-template.tsx and docx-modern.ts (saturation +20 capped at 100, lightness +25 capped at 65); ' +
      'the reference applies that rule to the model colour.'),
  annotation('DECISION', 'creative', 'section vocabulary', ['preview', 'pdf', 'docx'],
    'Part 3 US-015 gave creative a section vocabulary and put it where the modern and single-column ' +
      'mappings live: mapEditorOrderToCreative in src/lib/layout-settings.ts, which creative-template.tsx ' +
      'and docx-creative.ts both read, so neither states a section list of its own. The reference below is ' +
      'no longer an interpretation of what the surfaces happen to draw; it is that mapping, and it is why ' +
      'these rows stopped being KNOWN. What the vocabulary DOES NOT express, decided with the story: ' +
      'summary is FIXED in the gradient header — it is not in either column, and the only layout the model ' +
      'could express for it would be a redesign of the template, so it carries visibility only and the ' +
      'editor no longer offers to drag it while creative is selected. certifications (left column) and ' +
      'projects (right) have no editor id at all, so they keep their own slots and are always shown, ' +
      'exactly as the single-column mapping keeps skills and projects in theirs; per-item visibility is ' +
      'still the only hiding available for them. keyAchievements and training are not creative sections ' +
      'and are no longer offered by the editor while creative is selected, though what is stored for them ' +
      'is left untouched.'),
  annotation('DECISION', 'modern', 'modern-empty-main: summary and experience against the model', ['preview', 'pdf', 'docx'],
    "What Modern's main column shows when the stored order maps to nothing was settled by Part 3 US-010: " +
      'the default sections, which is what docx-modern.ts already drew and what modern-template.tsx now ' +
      'draws too, through one shared resolveModernMainOrder in src/lib/layout-settings.ts that this ' +
      "reference asks as well. The generator's condition was adopted rather than the reverse because the " +
      'model already ' +
      'answers the question the same way — parseLayoutModel discards a main order that validates to empty ' +
      'and falls through to the default — and because no editor action asks for a resume with neither ' +
      'summary nor experience: the editor keeps every main section in the order and expresses removal ' +
      'through hiddenMainSections, which still empties the column when the user hides everything. So these ' +
      'rows compare the surfaces against each other AND against the model, and all three agree. Pinned by ' +
      'modern-template.test.ts, which walks the reachable input — a stored mainContentOrder of ' +
      "['education'] — through parseLayoutModel and mapEditorOrderToModern before rendering it."),
  annotation('DECISION', 'modern', 'photo', ['docx'],
    'The photo is browser-local by the owner\'s decision of 2026-09-07 and reaches the DOCX only in a POST ' +
      'body; this check requests the DOCX by GET and does not compare the photo.'),
  annotation('DECISION', 'all', 'font-not-chosen: font family reference', ['preview', 'pdf', 'docx'],
    "The owner decided on 2026-09-15 that a stored font equal to today's default was never chosen, and that " +
      'a template keeps its own designed font until one is: classic stays serif, minimal and creative stay ' +
      'Inter. So these rows reference Inter on minimal and creative, and the stored font on professional and ' +
      'modern, which the decision does not name and which draw it today. Classic has NO reference and is ' +
      'compared surface against surface, because it draws TWO designed families and a reference is per ' +
      'template: serif on its title and section headings, the app\'s Inter on its body. Part 3 US-012 settled ' +
      'the question that was open here by keeping exactly what classic\'s Preview draws — "classic stays ' +
      'serif" reads as its serif headings, not as a serif body it never had — and by making docx-classic.ts ' +
      'follow that instead of the Times New Roman it chose privately. No unchosen font changes on any ' +
      'surface, which is what the not-chosen visual baselines record.'),
  annotation('LIMITATION', 'professional', 'print page band colour', ['pdf'],
    'The band src/app/globals.css paints for body:has(.professional-template) under print now follows the ' +
      "user's colour, and NO PIXEL OF ANY PRINTED PAGE SHOWS IT. Part 3 US-013 replaced the fixed " +
      'oklch(0.25 0.05 240) with var(--professional-print-sidebar-color, oklch(0.25 0.05 240)), which ' +
      'professional-template.tsx declares on body from the stored colour; the computed gradient on a print ' +
      'render of hsl(150, 60%, 30%) reads rgb(31, 122, 77) at both stops, where it read the fixed oklch ' +
      'before. The band stays invisible because the document occludes it completely, which was measured from ' +
      'the printed pages themselves rather than reasoned: a two-page professional print, rasterised at 72 dpi ' +
      'so one pixel is one point, scanned across every page at three heights and down one column, at the ' +
      'stored sidebar width and at the control minimum. The band spans x 0..178.7pt, the same column the ' +
      'document occupies. At 30% the sidebar element ends at 178.6pt: the colour runs x0-177 on both pages, ' +
      'with page 1 filled top to bottom and page 2 filled to y747 and white below, which is where the ' +
      "document ends. At 20% the sidebar element ends at 119.1pt and the band's exposed 119..178.7pt reads " +
      'WHITE on both pages, because the main content area paints white over it. So the band is covered by the ' +
      'sidebar element where the sidebar reaches and by the white main area where it does not, and below the ' +
      'end of the document it is not painted at all: the gradient is on body, which ends with the content, ' +
      'and html is white !important under it. This is a limitation of where the band can be seen, not a ' +
      'disagreement between surfaces, so it is no longer a FINDING. The colour:print-sidebar-column row ' +
      'matches, and would match whatever colour the band carried.'),
  annotation('DECISION', 'modern', 'graphics: skill level bars and technology chips', ['docx'],
    'Closed the modern half of the graphics divergence (Part 3 US-007). The skill level bars, which the DOCX ' +
      'previously omitted, are drawn as a one-row two-cell table under each skill: the accent colour across the ' +
      'level the Preview draws (src/lib/resume-graphics.ts MODERN_SKILL_BAR.levelPercent, a constant in the ' +
      'Preview too) and the track across the rest, at the bar\'s own height as an exact row height. The track is ' +
      'rgba(255,255,255,0.2) over the sidebar in the Preview and a cell fill carries no alpha, so it is written ' +
      'as the composite US-006 writes for translucent text, over the same backdrop. The technology chips, ' +
      'previously one line of bullet-separated text, are one shaded run each, slate-700 on slate-100. Not ' +
      'drawn: the corner radius of either, which OOXML has for neither a cell nor a run, and the chips\' ' +
      'vertical padding, because a run\'s shading is exactly as tall as its line. The bars appear under the ' +
      'skills the Preview draws bars for — a category\'s `items`; a category carrying `skillsHtml` is the ' +
      'content divergence US-016 owns and gets no bar. Not measured by this check: it samples text, and these ' +
      'graphics carry none. Asserted on generated documents by docx-graphics.test.ts.'),
  annotation('DECISION', 'creative', 'graphics: level bars, pills, timeline and project cards', ['docx'],
    'Closed the creative half of the graphics divergence (Part 3 US-007). The five-segment language level bars, ' +
      'for which the DOCX wrote "Fluent (4/5)", are drawn as a one-row table of five shaded cells and four ' +
      'unshaded gaps, purple-500 for a filled segment and slate-200 for an empty one; the number filled is the ' +
      'level, so the value is in the document, and the text that stood in for them is gone because the Preview ' +
      'never showed it. A stored level the Preview does not recognise fills none, on both surfaces: the old ' +
      'code echoed such a value verbatim, so an out-of-union level that ResumeLanguage forbids but a stored row ' +
      'may still hold now reaches no surface at all — the Preview and the print never showed it either, and ' +
      'closing the divergence on the Preview\'s side is FR-3. The ' +
      'technology pills, which the DOCX wrote as one bold stock-purple line, are one shaded run each, white on ' +
      'purple-500. The experience timeline is a left paragraph border on every paragraph of an entry, which ' +
      'Word draws as one continuous rule. Its dot is NOT drawn: a "●" run at the head of the entry was built ' +
      'and rendered, and the owner rejected it because the head of that entry is the job title and a run there ' +
      'writes "●  " into the text an ATS reads as the title — and because standing text in for a shape is the ' +
      'inverse of what this story does everywhere else. The rule already marks where each entry begins. The ' +
      'project card is a single-cell table: ' +
      'slate-50 fill, a 4px purple-500 left border and 16px cell margins. Every colour is now a ' +
      'resume-palette.ts entry; the two stock hexes the generator kept for the level text and the pills are ' +
      'gone. Also not drawn, each measured rather than assumed: corner radii, which OOXML has for neither a ' +
      'cell nor a run; the timeline line\'s fade to transparent and the pills\' and bars\' later gradient stop, ' +
      'both first-stop substitutions this report already records; and the pills\' vertical padding, because a ' +
      'run\'s shading is exactly as tall as its line. Paragraph shading was tried for the card before the cell ' +
      'was: Word paints it from the paragraph\'s left INDENT to the right text margin, so the card can have the ' +
      'padding or the fill over it but not both. Not measured by this check: it samples text, and these ' +
      'graphics carry none. Asserted on generated documents by docx-graphics.test.ts.'),
  annotation('DECISION', 'creative', 'graphics: the header\'s decorative discs', ['docx'],
    'Closed by Part 3 US-007, after a first attempt recorded it as a format limitation and the review found ' +
      'that claim false. The Preview draws two `bg-white/10` discs, 256px and 192px, positioned outside the ' +
      'header box and clipped by it. Each is now a floating `w:drawing` anchored inside the header cell — the ' +
      'same mechanism docx-modern.ts already uses for the photo — holding a PNG whose alpha channel carries ' +
      'the 10% white (src/app/api/resumes/[id]/download-docx/docx-disc.ts). MEASURED IN WORD 16 before it was ' +
      'written: with behindDoc="1" the drawing is painted behind the cell\'s own w:shd fill and cannot be seen ' +
      'at all; with behindDoc="0" it is painted over the fill, and Word clips it to the cell, which is exactly ' +
      'the Preview\'s `overflow-hidden`, so the overhanging parts are cut where the Preview cuts them. A second ' +
      'probe placed the bottom disc against summaries wrapping to one, two and four lines: anchored in a ' +
      'zero-height paragraph after the header\'s last, it holds its distance from the header\'s bottom edge in ' +
      'all three, so the content-dependent header height does not move it. TWO DIFFERENCES REMAIN, both ' +
      'recorded rather than absorbed. The Preview stacks the discs UNDER the header text (`relative z-10` on ' +
      'the content) and OOXML has no layer between a cell\'s fill and its text, so the DOCX draws them over it; ' +
      'the text they reach is white or near-white, so the wash moves it by 0.1 x (255 - v) a channel: nothing ' +
      'on the opaque white title, and at most 3.9 — four levels once rounded — on the darkest of them, the ' +
      'green of the composited text-white/80 links row. That is ABOVE this check\'s one-level tolerance, and it ' +
      'is not caught, because neither side of a colour row sees a disc at all: the Preview side reads the ' +
      'computed style rather than the painted pixel, and the DOCX side reads the run colour. A row here can ' +
      'therefore not confirm the discs; the assertions that do are in docx-graphics.test.ts, on the drawing and ' +
      'its PNG. And the disc is a raster scaled to size where the Preview draws ' +
      'a vector, because the docx package exposes no shape primitive. Not measured by this check: it samples ' +
      'text colour, and composites the sampled header text against the header fill on both sides, so neither ' +
      'side accounts for a disc that may lie over it.'),
  ...(['classic', 'minimal'] as const).map((template) =>
    annotation('FINDING', template, 'hiddenSidebarSections: skills', ['preview', 'pdf', 'docx'],
      'A dead control, and since Part 3 US-002 a user-visible one. The editor renders its sidebar panel for ' +
        `whichever template is selected (resume-editor.tsx:1198), so a ${template} user can hide skills, and ` +
        `no surface reads that list here: ${template}-template.tsx reads no layout list at all, and ` +
        `docx-${template}.ts destructures only mainContentOrder and hiddenMainSections. Before US-002 the ` +
        'export happened to look obedient, because it drew no skills section for anyone; now a user who hid ' +
        'skills gets a DOCX that shows them. US-002 did not gate the new section on that list on purpose: the ' +
        'Preview has always shown skills and the Preview is the contract for exports (FR-3), so gating the ' +
        'DOCX alone would have created the surface disagreement this milestone removes, and would have raised ' +
        'the same question for languages, whose row matches today. Owned by US-014, which hides a control the ' +
        'selected template does not apply (FR-9) while keeping the stored value. The visibility rows here ' +
        'MATCH because no surface hides the section, which is what the model reference says for this template.'),
  ),
  ...(['classic', 'minimal', 'creative'] as const).map((template) =>
    annotation('DECISION', template, 'rich text in skills and projects', ['preview', 'pdf', 'docx'],
      'Closed by Part 3 US-016, on the Preview side, without touching a generator. projects-section.tsx ' +
        `stores the project description as HTML and ${template}-template.tsx rendered {project.description} ` +
        'as a plain string, so the Preview and the print showed literal <p> markup where ' +
        `docx-${template}.ts already drew formatted text; the same shape in skills, where a category ` +
        'carries skillsHtml and the template read items only, so an edited category showed a stale list. ' +
        `US-016 routes both through renderFormattedText, as professional-template.tsx already did, so ` +
        'every template sanitizes the stored HTML in the browser with the inert sanitiser and renders it ' +
        'into .formatted-content, and reads skillsHtml first with items as the fallback when none is ' +
        'stored. The DOCX is unchanged. Exercised by the html-body-and-skills profile, whose body ' +
        'line-height rows now cover all five templates; the per-template rendering itself is asserted in ' +
        'rich-text.test.ts. Not measured here: this check still compares no body text.'),
  ),
]

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface KnownStatus {
  id: KnownId
  defect: string
  status: 'CONFIRMED' | 'REFUTED' | 'NOT EXERCISED'
  rows: string[]
}

/** The machine a report was produced on. Supplied by the caller; everything else is derived. */
export interface HostEnvironment {
  platform: string
  release: string
  arch: string
  node: string
}

export interface ReportEnvironment extends HostEnvironment {
  browserVersion: string
  /**
   * How this machine resolved each requested family, per surface:
   * `Verdana -> Verdana`, `ui-serif -> Georgia`. Sorted and de-duplicated.
   */
  fontResolutions: { preview: string[]; pdf: string[] }
}

export interface ParityReport {
  command: 'pnpm test:parity'
  environment: ReportEnvironment
  colourChannelTolerance: number
  fixture: {
    profile: ProfileId
    purpose: string
    templates: readonly ResumeTemplate[]
    layout: ParityProfile['layout']
    nonDefault: NonDefaultLine[]
  }[]
  rows: EvaluatedRow[]
  annotations: readonly AnnotationRow[]
  known: KnownStatus[]
  newRows: string[]
  /** Rows whose verdict disagrees with `KNOWN_EXPECTATIONS`. Each is also a failed test. */
  unreconciled: string[]
  /** Every CSS colour conversion, canvas beside independent, per profile and template. */
  colourChecks: Record<string, string[]>
  counts: Record<string, number>
}

function reportEnvironment(observations: readonly Observation[], host: HostEnvironment): ReportEnvironment {
  const browsers = [...new Set(observations.map((o) => o.environment.browserVersion))]
  if (browsers.length !== 1) {
    throw new Error(`Observations were rendered by different browsers: ${browsers.join(', ')}`)
  }
  const resolutions = (surface: 'preview' | 'pdf') =>
    [
      ...new Set(
        observations.flatMap((o) =>
          TYPOGRAPHY_ELEMENTS.flatMap((element) => {
            const sample = o.surfaces[surface].typography?.[element]
            return sample ? [`${sample.declaredFamily} -> ${sample.fontFamily}`] : []
          }),
        ),
      ),
    ].sort()
  return {
    ...host,
    browserVersion: browsers[0],
    fontResolutions: { preview: resolutions('preview'), pdf: resolutions('pdf') },
  }
}

/**
 * The known-divergence list must be internally consistent before any verdict
 * is trusted: every id has exactly one signature and at least one expected row,
 * and every expected row is a row the check reports. A mistyped row id would
 * otherwise expect nothing and fail nothing, and an id with no rows would sit
 * unexercised.
 */
function assertKnownListConsistent(rows: readonly EvaluatedRow[]): void {
  const expectedIds = new Set(Object.values(KNOWN_EXPECTATIONS))
  for (const id of KNOWN_IDS) {
    const signatures = SIGNATURES.filter((signature) => signature.id === id).length
    if (signatures !== 1) throw new Error(`${id} has ${signatures} signatures; it needs exactly one`)
    if (!expectedIds.has(id)) throw new Error(`${id} has no expected row in KNOWN_EXPECTATIONS`)
  }
  for (const signature of SIGNATURES) {
    if (!KNOWN_IDS.includes(signature.id)) throw new Error(`Signature ${signature.id} is not in KNOWN_IDS`)
  }
  const reported = new Set(rows.map((row) => row.id))
  const missing = Object.keys(KNOWN_EXPECTATIONS).filter((id) => !reported.has(id))
  if (missing.length > 0) throw new Error(`KNOWN_EXPECTATIONS lists rows the check does not report: ${missing.join('; ')}`)
}

export function buildReport(observations: readonly Observation[], host: HostEnvironment): ParityReport {
  const resolve: ObservationResolver = ({ profile, template }) => {
    const observation = observations.find((o) => o.profile === profile && o.template === template)
    if (!observation) throw new Error(`No observation for ${profile}/${template}`)
    return observation
  }
  const rows = rowDefinitions().map((row) => evaluateRow(row, resolve))
  assertKnownListConsistent(rows)

  const known: KnownStatus[] = KNOWN_IDS.map((id) => {
    const catalogued = Object.entries(KNOWN_EXPECTATIONS).filter(([, expected]) => expected === id)
    const confirmed = rows.filter((row) => row.verdict === `KNOWN: ${id}`)
    const signature = SIGNATURES.find((s) => s.id === id)
    if (!signature) throw new Error(`${id} has no signature`)
    return {
      id,
      defect: signature.defect,
      status: confirmed.length > 0 ? 'CONFIRMED' : catalogued.length > 0 ? 'REFUTED' : 'NOT EXERCISED',
      rows: confirmed.length > 0 ? confirmed.map((row) => row.id) : catalogued.map(([rowId]) => rowId),
    }
  })

  const unreconciled = rows
    .filter((row) => {
      const expected = KNOWN_EXPECTATIONS[row.id]
      return expected ? row.verdict !== `KNOWN: ${expected}` : row.verdict.startsWith('KNOWN')
    })
    .map((row) => row.id)

  const counts: Record<string, number> = {
    MATCH: 0, KNOWN: 0, NEW: 0, LIMITATION: 0, 'NOT EXERCISED': 0, FINDING: 0, DECISION: 0,
  }
  for (const row of rows) counts[row.verdict.startsWith('KNOWN') ? 'KNOWN' : row.verdict] += 1
  for (const entry of ANNOTATIONS) counts[entry.verdict] += 1

  return {
    command: 'pnpm test:parity',
    environment: reportEnvironment(observations, host),
    colourChannelTolerance: COLOUR_CHANNEL_TOLERANCE,
    fixture: PROFILES.map((profile) => ({
      profile: profile.id,
      purpose: profile.purpose,
      templates: profile.templates,
      layout: profile.layout,
      nonDefault: describeNonDefault(profile.layout),
    })),
    rows,
    annotations: ANNOTATIONS,
    known,
    newRows: rows.filter((row) => row.verdict === 'NEW').map((row) => row.id),
    unreconciled,
    colourChecks: Object.fromEntries(observations.map((o) => [`${o.profile} · ${o.template}`, o.colourChecks])),
    counts,
  }
}

export function formatRowLine(row: EvaluatedRow): string {
  return (
    `[${row.verdict}] ${row.id} | model ${row.model} | preview ${row.preview} | pdf ${row.pdf} | ` +
    `docx ${row.docx} | agree ${row.agree.join(', ') || '-'} | diverge ${row.diverge.join(', ') || '-'}` +
    (row.note ? ` | ${row.note}` : '')
  )
}

function table(headers: readonly string[], body: readonly (readonly string[])[]): string {
  const widths = headers.map((header, i) => Math.max(header.length, ...body.map((cells) => cells[i].length)))
  const line = (cells: readonly string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join(' | ').trimEnd()
  return [line(headers), widths.map((w) => '-'.repeat(w)).join('-+-'), ...body.map(line)].join('\n')
}

export function formatReport(report: ParityReport): string {
  const out: string[] = []
  const env = report.environment
  out.push('PARITY REPORT — Preview / PDF / DOCX against the stored layout model')
  out.push(`Colour tolerance: ${report.colourChannelTolerance} level per 8-bit channel.`)
  out.push(
    `Environment: ${env.platform} ${env.release} ${env.arch}, Node ${env.node}, Chromium ${env.browserVersion}. ` +
      'Font faces depend on this machine; compare reports only from the same environment.',
  )
  out.push(`  Preview faces: ${env.fontResolutions.preview.join('; ')}`)
  out.push(`  PDF faces:     ${env.fontResolutions.pdf.join('; ')}`)
  out.push('')

  for (const fixture of report.fixture) {
    out.push(`Profile ${fixture.profile} (${fixture.templates.join(', ')}): ${fixture.purpose}`)
    out.push(
      table(
        ['property', 'DEFAULT_RESUME_LAYOUT', 'seeded', 'differs', 'required'],
        fixture.nonDefault.map((l) => [l.property, l.defaultValue, l.seededValue, l.differs ? 'yes' : 'NO', l.required ? 'yes' : '']),
      ),
    )
    out.push('')
  }

  out.push('ROWS')
  out.push(
    table(
      ['verdict', 'profile', 'template', 'property', 'model', 'preview', 'pdf', 'docx', 'agree', 'diverge', 'note'],
      report.rows.map((row) => [
        row.verdict, row.profile, row.template, row.property, row.model, row.preview, row.pdf, row.docx,
        row.agree.join(', '), row.diverge.join(', ') || '-', row.note ?? '',
      ]),
    ),
  )
  out.push('')

  out.push('NOT ROWS: LIMITATIONS, DECISIONS, UNMEASURED FINDINGS, NOT EXERCISED')
  out.push(
    table(
      ['verdict', 'template', 'property', 'surfaces', 'reason'],
      report.annotations.map((a) => [a.verdict, a.template, a.property, a.surfaces.join(', '), a.reason]),
    ),
  )
  out.push('')

  out.push('INDEPENDENT COLOUR CONVERSION CHECKS')
  for (const [key, lines] of Object.entries(report.colourChecks)) {
    for (const line of lines) out.push(`  ${key} · ${line}`)
  }
  out.push('')

  out.push('KNOWN DIVERGENCES')
  out.push(
    table(
      ['id', 'status', 'rows', 'defect'],
      report.known.map((k) => [k.id, k.status, k.rows.join('; '), k.defect]),
    ),
  )
  out.push('')
  out.push(`NEW divergences (${report.newRows.length}):`)
  for (const id of report.newRows) out.push(`  ${id}`)
  out.push(`Unreconciled with KNOWN_EXPECTATIONS (${report.unreconciled.length}):`)
  for (const id of report.unreconciled) out.push(`  ${id}`)
  out.push(`Counts: ${Object.entries(report.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  return out.join('\n')
}
