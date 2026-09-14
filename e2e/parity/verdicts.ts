import type { ResumeTemplate } from '../../src/types/database'
import { COLOUR_CHANNEL_TOLERANCE, compositeOver, coloursAgree, type ConvertedColour } from './colour'
import {
  PROFILES,
  TEMPLATE_SPECS,
  describeNonDefault,
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
 * US-008: rows, verdicts, and the report.
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

/** The defects `tasks/prds/milestone-c-part-3-parity-defects.md` enumerates. */
export type KnownId =
  | 'P3-US001-classic'
  | 'P3-US001-minimal'
  | 'P3-US002-classic'
  | 'P3-US002-minimal'
  | 'P3-US003'
  | 'P3-US004'
  | 'P3-US005'

export const KNOWN_IDS: readonly KnownId[] = [
  'P3-US001-classic',
  'P3-US001-minimal',
  'P3-US002-classic',
  'P3-US002-minimal',
  'P3-US003',
  'P3-US004',
  'P3-US005',
]

export type Verdict = 'MATCH' | `KNOWN: ${KnownId}` | 'NEW'

const perTemplate = (templates: readonly ResumeTemplate[], properties: readonly string[], id: KnownId) =>
  Object.fromEntries(
    templates.flatMap((template) => properties.map((property) => [`primary · ${template} · ${property}`, id])),
  )

const elementProperties = (family: string) => TYPOGRAPHY_ELEMENTS.map((element) => `${family}:${element}`)

/**
 * The rows expected to diverge, by name and Part 3 id.
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
export const KNOWN_EXPECTATIONS: Readonly<Record<string, KnownId>> = {
  'primary · classic · visibility:skills': 'P3-US001-classic',
  'primary · classic · visibility:projects': 'P3-US001-classic',
  'primary · minimal · visibility:skills': 'P3-US001-minimal',
  'primary · minimal · visibility:projects': 'P3-US001-minimal',

  'primary · classic · visibility:education': 'P3-US002-classic',
  'primary · classic · order:main': 'P3-US002-classic',
  'primary · classic · order:document': 'P3-US002-classic',
  'primary · minimal · visibility:education': 'P3-US002-minimal',
  'primary · minimal · order:main': 'P3-US002-minimal',
  'primary · minimal · order:document': 'P3-US002-minimal',

  'modern-empty-main · modern · visibility:summary': 'P3-US003',
  'modern-empty-main · modern · visibility:experience': 'P3-US003',

  // US-004, surface against surface: a per-property size reached the Preview, not the DOCX.
  ...perTemplate(['classic', 'minimal', 'creative'], elementProperties('font-size'), 'P3-US004'),
  'primary · modern · font-size:documentTitle': 'P3-US004',
  'primary · modern · font-size:bodyText': 'P3-US004',
  // US-004, against the model: fontScale is not passed to these three Previews.
  ...perTemplate(['classic', 'minimal', 'creative'], elementProperties('font-scale'), 'P3-US004'),
  // US-004, against the model: the per-property sizes respond in the Preview and not in the DOCX.
  ...perTemplate(['classic', 'minimal', 'creative'], elementProperties('per-property'), 'P3-US004'),
  'primary · modern · per-property:documentTitle': 'P3-US004',
  'primary · modern · per-property:bodyText': 'P3-US004',

  'primary · creative · visibility:education': 'P3-US005',
  'primary · creative · visibility:languages': 'P3-US005',
  'creative-order · creative · order:main': 'P3-US005',
  'creative-order · creative · order:sidebar': 'P3-US005',
}

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
 * Every row the check reports, derived from the profiles and the section
 * catalogue alone — never from what a run observed — so the set of rows, and
 * therefore the set of tests, is the same on every run.
 */
export function rowDefinitions(): RowDefinition[] {
  const rows: RowDefinition[] = []
  for (const profile of PROFILES) {
    if (profile.control) continue
    for (const template of profile.templates) {
      const spec = TEMPLATE_SPECS[template]
      const reference = referenceFor(profile, template)
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
          add('per-property', `per-property:${element}`, element, ['per-property-control'])
          add('colour', `colour:${element}`, element)
          add('font-family', `font-family:${element}`, element)
          add('letter-spacing', `letter-spacing:${element}`, element)
          add('line-height', `line-height:${element}`, element)
        }
        for (const extra of spec.extraColourSamples) add('colour', `colour:${extra.key}`, extra.key)
      }
      if (profile.rowGroups.includes('colour')) {
        // Every template, including those that draw no sidebar: the editor offers
        // and stores the colour for all of them, so a template that renders it
        // nowhere is a row with a verdict, not an omission.
        add('colour', 'colour:sidebar-background', 'sidebarBackground')
        if (spec.accentDepth !== null) add('colour', 'colour:accent', 'accent')
      }
      if (profile.rowGroups.includes('page')) {
        add('page-width', 'page-width', 'document')
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
  | { kind: 'colour'; hex: string; css?: string; over?: string }
  | { kind: 'not-rendered' }
  | { kind: 'family'; name: string }
  | { kind: 'twips'; twips: number }
  | { kind: 'line-height'; lineHeight: LineHeight }
  | { kind: 'length'; inches: number }

/** Letter spacing is compared in twips; CSS px convert at 15 twips per px and round once. */
const TWIPS_TOLERANCE = 1

/** Line-height ratios are declared to three decimals at most (1.625, 1.5, 1.2). */
const LINE_HEIGHT_TOLERANCE = 0.01

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
      return b.kind === 'colour' && coloursAgree({ hex: a.hex, alpha: 255 }, { hex: b.hex, alpha: 255 })
    case 'not-rendered':
      return b.kind === 'not-rendered'
    case 'twips':
      return b.kind === 'twips' && Math.abs(a.twips - b.twips) <= TWIPS_TOLERANCE
    case 'line-height': {
      if (b.kind !== 'line-height') return false
      const [x, y] = [a.lineHeight, b.lineHeight]
      // Different kinds never match. In particular a Word auto multiple scales
      // the font's single-line height and a CSS ratio scales the font size, so
      // equal numbers draw different leading: comparing only the encoding
      // would be a MATCH over nothing.
      if (x.kind !== y.kind) return false
      if (x.kind === 'normal' || y.kind === 'normal') return true
      return Math.abs(x.ratio - y.ratio) <= LINE_HEIGHT_TOLERANCE
    }
    case 'length':
      // Page sizes are declared to two decimals (8.5in, 8.27in); anything finer is rounding.
      return b.kind === 'length' && a.inches.toFixed(2) === b.inches.toFixed(2)
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
      const source = value.css ? ` (${value.css}${value.over ? ` over ${value.over}` : ''})` : ''
      return `${value.hex}${source}`
    }
    case 'not-rendered':
      return 'not rendered'
    case 'twips':
      return `${value.twips}tw`
    case 'line-height':
      switch (value.lineHeight.kind) {
        case 'normal':
          return 'normal'
        case 'ratio':
          return `x${value.lineHeight.ratio.toFixed(3)} font size`
        case 'auto-multiple':
          return `auto x${value.lineHeight.ratio.toFixed(3)} single line`
      }
    case 'length':
      return `${value.inches.toFixed(2)}in`
  }
}

/**
 * The colour as seen: translucent text composited over the opaque backdrop the
 * surface measured behind it. Nothing translucent is ever compared raw, and
 * nothing translucent is excused.
 */
function seenColour(colour: ColourSample, backdrop: ColourSample | null, label: string): Value {
  if (colour.alpha === 255) return { kind: 'colour', hex: colour.hex, ...(colour.css ? { css: colour.css } : {}) }
  if (!backdrop) throw new Error(`${label}: translucent colour ${colour.hex} a=${colour.alpha} has no measured backdrop`)
  const seen: ConvertedColour = compositeOver(colour, backdrop)
  return {
    kind: 'colour',
    hex: seen.hex,
    ...(colour.css ? { css: colour.css } : {}),
    over: backdrop.hex,
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

const shown = (value: Value) => value.kind === 'visibility' && value.shown
const responds = (value: Value) => value.kind === 'responds' && value.responds
const isSequence = (value: Value | null, keys: readonly string[]) =>
  value !== null && value.kind === 'sequence' && value.keys.join('>') === keys.join('>')

/** Per-property size each sampled element may take from the model. */
const PER_PROPERTY: Readonly<Record<TypographyElement, 'titleFontSize' | 'sectionTitleFontSize' | 'sectionDescFontSize'>> = {
  documentTitle: 'titleFontSize',
  sectionHeading: 'sectionTitleFontSize',
  bodyText: 'sectionDescFontSize',
}

/**
 * What each known defect looks like on a row. A divergence is attributed to a
 * Part 3 id only when it has that defect's shape; a divergence with any other
 * shape is NEW, even on a template the defect concerns.
 */
const SIGNATURES: readonly { id: KnownId; matches: (context: SignatureContext) => boolean }[] = [
  ...(['classic', 'minimal'] as const).map((template) => ({
    id: `P3-US001-${template}` as KnownId,
    // The DOCX omits skills or projects; the Preview and its print show them; nothing hides them.
    matches: ({ row, reference, values }: SignatureContext) =>
      row.template === template &&
      row.family === 'visibility' &&
      ['skills', 'projects'].includes(row.subject) &&
      reference !== null &&
      shown(reference) &&
      shown(values.preview) &&
      shown(values.pdf) &&
      !shown(values.docx),
  })),
  ...(['classic', 'minimal'] as const).map((template) => ({
    id: `P3-US002-${template}` as KnownId,
    // The Preview (and so the PDF) ignores order and visibility; the DOCX honours both.
    matches: ({ row, observation, profile, reference, values }: SignatureContext) => {
      if (row.template !== template || !equal(values.pdf, values.preview)) return false
      if (row.family === 'visibility') {
        return reference !== null && !shown(reference) && shown(values.preview) && !shown(values.docx)
      }
      if (row.family === 'order' && row.subject === 'main') {
        return reference !== null && !equal(values.preview, reference) && equal(values.docx, reference)
      }
      if (row.family === 'order' && row.subject === 'document') {
        const modelOrder = referenceFor(profile, template).order.main ?? []
        const docx = values.docx.kind === 'sequence' ? values.docx.keys : []
        return (
          !equal(values.docx, values.preview) &&
          isSequence(values.docx, modelOrder.filter((key) => docx.includes(key))) &&
          observation.surfaces.docx.sequence.length > 0
        )
      }
      return false
    },
  })),
  {
    id: 'P3-US003',
    // Modern, an order that maps to nothing: the Preview's main column is empty, the DOCX falls back.
    matches: ({ row, values }) =>
      row.profile === 'modern-empty-main' &&
      row.template === 'modern' &&
      row.family === 'visibility' &&
      ['summary', 'experience'].includes(row.subject) &&
      !shown(values.preview) &&
      !shown(values.pdf) &&
      shown(values.docx),
  },
  {
    id: 'P3-US004',
    matches: ({ row, observation, reference, values }) => {
      if (!['classic', 'minimal', 'creative', 'modern'].includes(row.template)) return false
      if (!equal(values.pdf, values.preview) || equal(values.docx, values.preview)) return false

      // Surface against surface: a per-property size reached the Preview —
      // unscaled on classic, minimal and creative, scaled on modern — and the
      // DOCX does not agree with it.
      if (row.family === 'font-size' && values.preview.kind === 'size') {
        const { model } = observation
        const perProperty = model[PER_PROPERTY[row.subject as TypographyElement]]
        const expectedPreviewPx = row.template === 'modern' ? perProperty * model.fontScale : perProperty
        return Math.abs(values.preview.px - expectedPreviewPx) < 0.01
      }

      // Against the model: fontScale is not passed to the classic, minimal and
      // creative Previews (ratio 1), while their generators apply it.
      if (row.family === 'font-scale' && reference !== null && values.preview.kind === 'ratio') {
        return (
          row.template !== 'modern' &&
          Math.abs(values.preview.ratio - 1) <= values.preview.slack &&
          equal(values.docx, reference)
        )
      }

      // Against the model: the per-property sizes respond in the Preview and not in the DOCX.
      if (row.family === 'per-property') {
        return responds(values.preview) && responds(values.pdf) && !responds(values.docx)
      }
      return false
    },
  },
  {
    id: 'P3-US005',
    // Creative: the three surfaces agree with one another and all disagree with the model.
    matches: ({ row, reference, values }) =>
      row.template === 'creative' &&
      (row.family === 'visibility' || (row.family === 'order' && row.subject !== 'document')) &&
      reference !== null &&
      equal(values.pdf, values.preview) &&
      equal(values.docx, values.preview) &&
      !equal(values.preview, reference),
  },
]

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Findings not enumerated by Part 3 that a NEW row is recognised as, by structure. */
export type RelatedFinding = 'F-A'

export interface EvaluatedRow extends Omit<RowDefinition, 'inputs'> {
  model: string
  preview: string
  pdf: string
  docx: string
  /** With a model reference: `model` and the surfaces equal to it. Without: the largest agreeing group. */
  agree: string[]
  diverge: string[]
  verdict: Verdict
  relatedFinding: RelatedFinding | null
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
      reference = { kind: 'family', name: primaryFamily(model.fontFamily) }
      for (const s of SURFACES) values[s] = { kind: 'family', name: typographyOf(observation, s, row).fontFamily }
      break
    }
    case 'letter-spacing': {
      for (const s of SURFACES) values[s] = { kind: 'twips', twips: typographyOf(observation, s, row).letterSpacingTwips }
      break
    }
    case 'line-height': {
      for (const s of SURFACES) values[s] = { kind: 'line-height', lineHeight: typographyOf(observation, s, row).lineHeight }
      break
    }
    case 'colour': {
      if ((TYPOGRAPHY_ELEMENTS as readonly string[]).includes(row.subject)) {
        for (const s of SURFACES) {
          const sample = typographyOf(observation, s, row)
          values[s] = seenColour(sample.colour, sample.backdrop, `${row.id} ${s}`)
        }
        break
      }
      if (spec.extraColourSamples.some((extra) => extra.key === row.subject)) {
        for (const s of SURFACES) {
          const sample = surfaces[s].extraColours[row.subject]
          if (!sample) throw new Error(`${row.id}: ${s} has no ${row.subject} measurement`)
          values[s] = seenColour(sample.colour, sample.backdrop, `${row.id} ${s}`)
        }
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
  let relatedFinding: RelatedFinding | null = null
  if (allMatch) {
    verdict = 'MATCH'
  } else {
    const known = SIGNATURES.find((signature) => signature.matches(context))
    if (known) {
      verdict = `KNOWN: ${known.id}`
      if (reference !== null && surfacesAgree) {
        note = 'The surfaces agree with each other; all three disagree with the model.'
      }
    } else {
      verdict = 'NEW'
      relatedFinding = isFindingFA(context) ? 'F-A' : null
      note = newDivergenceNote(context, relatedFinding)
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
    relatedFinding,
    note,
  }
}

/**
 * US-007 finding F-A, recognised by structure rather than by a colour literal:
 * the model's sidebar colour reached the Preview intact, yet the Preview accent
 * derived from that same colour disagrees with the model's derivation, while the
 * DOCX accent agrees with it. The colour arrived; the derivation failed.
 */
function isFindingFA({ row, observation, reference, values }: SignatureContext): boolean {
  if (row.template !== 'modern' || row.subject !== 'accent' || reference === null) return false
  const sidebar = observation.surfaces.preview.sidebarBackground
  const sidebarReachedPreview =
    sidebar !== null && equal(seenColour(sidebar, null, 'F-A sidebar'), seenColour(observation.modelColours.sidebar, null, 'F-A model'))
  return (
    sidebarReachedPreview &&
    !equal(values.preview, reference) &&
    equal(values.pdf, values.preview) &&
    equal(values.docx, reference)
  )
}

/**
 * Says what a NEW divergence is, from evidence in the code and the row, without
 * attributing it to Part 3 and without deciding which surface is right.
 */
function newDivergenceNote({ row, values, reference }: SignatureContext, finding: RelatedFinding | null): string | null {
  const surfacesAgree = SURFACES.every((s) => equal(values[s], values.preview))

  if (finding === 'F-A') {
    return (
      'US-007 finding F-A: the sidebar colour reached the Preview but its accent is not derived from it ' +
      '(modern-template.tsx deriveAccentColor matches integer HSL only and falls back), while the DOCX ' +
      'derives the accent from the stored colour. Not enumerated by Part 3.'
    )
  }

  if (!equal(values.pdf, values.preview)) {
    return 'The PDF differs from the Preview it is printed from.'
  }

  switch (row.family) {
    case 'font-family':
      if (row.template === 'classic') {
        return (
          'Classic ignores the model font on every surface: the Preview draws its title and headings with ' +
          'font-serif and its body with the app font; the DOCX uses Times New Roman throughout. Not enumerated ' +
          'by Part 3. Whether the serif is template identity is a product question.'
        )
      }
      if (row.template === 'minimal' || row.template === 'creative') {
        return (
          'resume-preview.tsx passes fontFamily only to the modern and professional templates, so the Preview ' +
          'renders the app font while the DOCX applies the model font. Not enumerated by Part 3, whose US-004 ' +
          'covers fontScale only.'
        )
      }
      break
    case 'per-property':
      if (reference !== null && surfacesAgree) {
        return (
          `Inert per-property size: the model carries ${PER_PROPERTY[row.subject as TypographyElement]} and ` +
          'no surface of this template applies it. No control for it is offered on this template either ' +
          '(professional receives no size props; modern accepts the setter but renders no slider), so the ' +
          'value arrives only when set on classic, minimal or creative and the template is switched. Not a dead ' +
          'control: whether such a value should carry over is a product question. Not enumerated by Part 3.'
        )
      }
      break
    case 'font-scale':
      return 'A surface does not scale this element by the model fontScale in the way Part 3 US-004 describes.'
    case 'letter-spacing':
      return 'Letter spacing differs; DOCX can express it (w:spacing w:val) and the generators set it for some runs.'
    case 'line-height': {
      const docx = values.docx.kind === 'line-height' ? values.docx.lineHeight : null
      const preview = values.preview.kind === 'line-height' ? values.preview.lineHeight : null
      if (docx?.kind === 'auto-multiple' && preview?.kind === 'ratio') {
        const encodingMatches = Math.abs(docx.ratio - preview.ratio) <= LINE_HEIGHT_TOLERANCE
        return (
          (encodingMatches
            ? 'Encoded ratio matches, but Word auto scales single-line height, so drawn leading differs. '
            : 'The encoded ratios differ, and Word auto scales single-line height rather than font size. ') +
          'The DOCX uses w:lineRule="auto" where the CSS means a multiple of the font size (see the FINDING).'
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
      if (row.subject === 'sidebarBackground' && values.preview.kind === 'not-rendered') {
        return (
          'Dead control: the editor offers and persists the sidebar colour for every template, and no surface ' +
          'of this template renders it — the class of defect Part 3 US-005 names for creative order and ' +
          'visibility only. Whether this template should use the colour or stop offering it is a product decision.'
        )
      }
      if (values.preview.kind === 'colour' && values.docx.kind === 'colour') {
        const seen = values.preview.over ? `, composited over ${values.preview.over} to ${values.preview.hex}` : ''
        return (
          `The Preview renders ${values.preview.css ?? values.preview.hex}${seen}; the DOCX hardcodes ` +
          `${values.docx.hex}, a different sRGB colour. Verified independently of the canvas (see colourChecks). ` +
          'Not enumerated by Part 3.'
        )
      }
      break
    case 'page-width':
      return (
        'The DOCX page is A4 (8.27in wide) while the Preview document and the print stylesheet ' +
        '(@page size: letter) are US Letter (8.5in). DOCX can express Letter, as the professional and modern ' +
        'generators do. Not enumerated by Part 3.'
      )
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
  annotation('FINDING', 'all', 'line height, Word auto spacing', ['docx'],
    'The generators write CSS line-height ratios as w:lineRule="auto" multiples (for example 1.5 as line=360). ' +
      "A Word auto multiple scales the font's single-line height (ascent + descent + line gap, about 1.215 em " +
      'for Verdana), where the CSS ratio scales the font size, so Word draws visibly more leading than the ' +
      'Preview. DOCX can express the CSS intent exactly (w:lineRule="exact" in twips). For Part 3. The ' +
      'line-height rows report every auto multiple as NEW: this check reads no font metrics, so it does not ' +
      'compute drawn leading, and it never lets a matching encoding stand as a MATCH.'),
  annotation('LIMITATION', 'all', 'colour conversion', ['preview', 'pdf', 'docx'],
    `Compared as 8-bit sRGB with a tolerance of ${COLOUR_CHANNEL_TOLERANCE} level per channel. CSS colours are ` +
      'converted by the browser canvas and, independently, by the OKLab matrices in e2e/parity/colour.ts; a ' +
      'collect test fails if the two disagree. Translucent colours are composited over their measured ' +
      'backdrop before comparison. Colours outside sRGB are clipped.'),
  annotation('LIMITATION', 'creative', 'header gradient', ['docx'],
    'The header is a three-stop CSS gradient. DOCX paragraph and table-cell shading is a single solid fill ' +
      '(w:shd); the generator uses solid purple. Not compared.'),
  annotation('LIMITATION', 'modern', 'colour:accent reference', ['preview', 'pdf', 'docx'],
    'The accent is not stored in the model. It is derived from the sidebar colour by the rule documented in ' +
      'modern-template.tsx and docx-modern.ts (saturation +20 capped at 100, lightness +25 capped at 65); ' +
      'the reference applies that rule to the model colour.'),
  annotation('LIMITATION', 'creative', 'section reference', ['preview', 'pdf', 'docx'],
    'Creative has no section vocabulary (Part 3 US-005). Its reference reads the editor ids creative renders: ' +
      'summary in the header, shown or hidden but not positioned; skills and languages in the left column; ' +
      'experience and education in the right. certifications and projects have no id and are expected shown; ' +
      'training and keyAchievements are inert.'),
  annotation('DECISION', 'modern', 'modern-empty-main: summary and experience against the model', ['preview', 'pdf', 'docx'],
    "What Modern's main column should show when the stored order maps to nothing is Part 3 US-003's " +
      'decision, not yet made. Until it is, the surfaces are compared with each other.'),
  annotation('DECISION', 'modern', 'photo', ['docx'],
    'The photo is browser-local by the owner\'s decision of 2026-09-07 and reaches the DOCX only in a POST ' +
      'body; this check requests the DOCX by GET and does not compare the photo.'),
  annotation('FINDING', 'modern', 'skill level bars', ['docx'],
    'The Preview draws a level bar under every skill; the DOCX lists the skills as text. DOCX can approximate ' +
      'a bar with a shaded cell or run; omitting it is a generator choice. For Part 3. Not measured by this check.'),
  annotation('FINDING', 'creative', 'language level bars', ['docx'],
    'The Preview draws five-segment level bars; the DOCX writes "Fluent (4/5)" text. DOCX can approximate the ' +
      'bars with shaded cells or runs; omitting them is a generator choice. For Part 3. Not measured by this check.'),
  annotation('FINDING', 'creative', 'technology pills', ['docx'],
    'The Preview draws each technology as a filled pill; the DOCX writes bold purple text. DOCX can shade a ' +
      'run; omitting it is a generator choice. For Part 3. Not measured by this check.'),
  annotation('NOT EXERCISED', 'professional', 'print page band colour', ['pdf'],
    'src/app/globals.css paints body:has(.professional-template) under print with a fixed ' +
      'oklch(0.25 0.05 240) band at 30% of 816px, independent of the model colour and width. That ignores the ' +
      'model and is a Part 3 candidate, but it is only visible where the sidebar element does not cover the ' +
      'page. The professional document is at least one full Letter page and its sidebar spans the whole ' +
      'document, so on this fixture the band is fully covered and cannot be observed. Exercising it needs ' +
      'content longer than one page or a raster comparison of the PDF.'),
]

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface KnownStatus {
  id: KnownId | RelatedFinding
  inPart3: boolean
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

export function buildReport(observations: readonly Observation[], host: HostEnvironment): ParityReport {
  const resolve: ObservationResolver = ({ profile, template }) => {
    const observation = observations.find((o) => o.profile === profile && o.template === template)
    if (!observation) throw new Error(`No observation for ${profile}/${template}`)
    return observation
  }
  const rows = rowDefinitions().map((row) => evaluateRow(row, resolve))

  const known: KnownStatus[] = KNOWN_IDS.map((id) => {
    const catalogued = Object.entries(KNOWN_EXPECTATIONS).filter(([, expected]) => expected === id)
    const confirmed = rows.filter((row) => row.verdict === `KNOWN: ${id}`)
    return {
      id,
      inPart3: true,
      status: confirmed.length > 0 ? 'CONFIRMED' : catalogued.length > 0 ? 'REFUTED' : 'NOT EXERCISED',
      rows: confirmed.length > 0 ? confirmed.map((row) => row.id) : catalogued.map(([rowId]) => rowId),
    }
  })
  const faRows = rows.filter((row) => row.profile === 'modern-non-integer-hue' && row.subject === 'accent')
  known.push({
    id: 'F-A',
    inPart3: false,
    status: faRows.length === 0 ? 'NOT EXERCISED' : faRows.some((row) => row.relatedFinding === 'F-A') ? 'CONFIRMED' : 'REFUTED',
    rows: faRows.map((row) => row.id),
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
      ['id', 'in Part 3', 'status', 'rows'],
      report.known.map((k) => [k.id, k.inPart3 ? 'yes' : 'NO', k.status, k.rows.join('; ')]),
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
