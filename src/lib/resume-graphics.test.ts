import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ResumeTemplate } from '@/types/database'
import { TAILWIND_SPACING_PX } from './resume-line-height'
import {
  CREATIVE_HEADER_CIRCLES,
  CREATIVE_LANGUAGE_BAR,
  CREATIVE_LANGUAGE_LEVEL_SEGMENTS,
  CREATIVE_PROJECT_CARD,
  CREATIVE_TIMELINE,
  MODERN_SKILL_BAR,
  PREVIEW_GRAPHICS,
  creativeLanguageBarSegments,
  graphicHeightPx,
  modernSkillBarTrack,
} from './resume-graphics'

/**
 * Part 3 US-007: the geometry the DOCX generators draw the Preview's bars,
 * pills, rules and markers with may not drift from the templates that draw them.
 *
 * Everything here is read out of the template source, because that is where the
 * Preview's values live: they are Tailwind class names and inline style literals
 * that no module can import (see the DECISION in `resume-graphics.ts`). A
 * template that restyles one of these graphics fails this test instead of
 * leaving the DOCX drawing the old shape.
 *
 * Not covered: that a generator actually draws what is declared. That is
 * `docx-graphics.test.ts`, on generated documents, and `pnpm test:parity`.
 */

const ROOT = path.resolve(__dirname, '../..')
const TEMPLATES: readonly ResumeTemplate[] = ['professional', 'modern', 'classic', 'minimal', 'creative']
const template = (name: ResumeTemplate) =>
  readFileSync(path.join(ROOT, `src/components/dashboard/resume-templates/${name}-template.tsx`), 'utf-8')

/** Every occurrence of a pattern, so a count can be pinned as well as a presence. */
const count = (source: string, pattern: RegExp) => (source.match(pattern) ?? []).length

describe('the spacing unit these graphics are measured in', () => {
  it('is the one resume-line-height.ts derives from the Tailwind theme', () => {
    expect(graphicHeightPx(1)).toBe(TAILWIND_SPACING_PX)
    expect(graphicHeightPx(1.5)).toBe(6)
  })
})

describe('MODERN_SKILL_BAR', () => {
  const source = template('modern')

  it('takes the level the Preview draws every bar at', () => {
    expect(count(source, /\bconst level = \d+\b/g), 'modern-template.tsx sets the skill level once').toBe(1)
    expect(/\bconst level = (\d+)\b/.exec(source)?.[1]).toBe(String(MODERN_SKILL_BAR.levelPercent))
    expect(source, 'the bar is drawn at `${level}%` of the track').toContain("width: `${level}%`")
  })

  it('takes the track’s height and translucency as the template writes them', () => {
    expect(source).toContain(`height: '${MODERN_SKILL_BAR.heightPx}px'`)
    expect(source).toContain(`backgroundColor: '${MODERN_SKILL_BAR.trackCss}'`)
    expect(
      MODERN_SKILL_BAR.trackCss,
      'the declared alpha is the one in the declared CSS',
    ).toBe(`rgba(255,255,255,${MODERN_SKILL_BAR.trackAlpha})`)
  })

  it('composites the track over the sidebar, not over nothing', () => {
    // White at 20% over black is 20% grey; over white it is white.
    expect(modernSkillBarTrack('FFFFFF', '000000')).toBe('333333')
    expect(modernSkillBarTrack('FFFFFF', 'FFFFFF')).toBe('FFFFFF')
    // The same arithmetic US-006 gives translucent text: 0.2 over #0D0DA5.
    expect(modernSkillBarTrack('FFFFFF', '0D0DA5')).toBe('3D3DB7')
  })
})

describe('CREATIVE_LANGUAGE_BAR', () => {
  const source = template('creative')

  it('takes the segment count, height and gap the Preview draws', () => {
    expect(source).toContain(`{[${Array.from({ length: CREATIVE_LANGUAGE_BAR.segments }, (_, i) => i + 1).join(', ')}].map((level)`)
    expect(source).toContain(`className="flex gap-${CREATIVE_LANGUAGE_BAR.gapStep}"`)
    expect(source).toContain(`h-${CREATIVE_LANGUAGE_BAR.heightStep} w-full rounded`)
    expect(graphicHeightPx(CREATIVE_LANGUAGE_BAR.heightStep)).toBe(6)
    expect(graphicHeightPx(CREATIVE_LANGUAGE_BAR.gapStep)).toBe(4)
  })

  it('fills the segments the Preview’s own conditions fill, and no others', () => {
    const conditions = [...source.matchAll(/\(lang\.level === '([^']+)' && level <= (\d)\)/g)]
    expect(
      Object.fromEntries(conditions.map(([, level, segments]) => [level, Number(segments)])),
      'creative-template.tsx and CREATIVE_LANGUAGE_LEVEL_SEGMENTS disagree about which levels fill what',
    ).toEqual(CREATIVE_LANGUAGE_LEVEL_SEGMENTS)
  })

  it('fills none for a level the Preview does not recognise', () => {
    expect(creativeLanguageBarSegments('Native')).toBe(5)
    expect(creativeLanguageBarSegments('C2 - Proficient')).toBe(0)
    expect(creativeLanguageBarSegments('')).toBe(0)
    expect(creativeLanguageBarSegments(undefined)).toBe(0)
  })
})

describe('CREATIVE_TIMELINE and CREATIVE_PROJECT_CARD', () => {
  const source = template('creative')

  it('takes the timeline’s gutter, dot and line from the entry the Preview draws', () => {
    expect(source).toContain(`<div key={index} className="relative pl-${CREATIVE_TIMELINE.gutterPx / TAILWIND_SPACING_PX}">`)
    expect(source).toContain(
      `className="absolute left-0 top-1 h-${CREATIVE_TIMELINE.dotStep} w-${CREATIVE_TIMELINE.dotStep} rounded-full bg-gradient-to-br from-purple-500 to-pink-500"`,
    )
    expect(source).toContain(
      `className="absolute left-[${CREATIVE_TIMELINE.lineLeftPx}px] top-4 h-full w-0.5 bg-gradient-to-b from-purple-300 to-transparent"`,
    )
    expect(graphicHeightPx(0.5), 'w-0.5 is the line’s width').toBe(CREATIVE_TIMELINE.lineWidthPx)
    expect(graphicHeightPx(CREATIVE_TIMELINE.dotStep)).toBe(12)
  })

  it('takes the project card’s rule and padding from the card the Preview draws', () => {
    expect(source).toContain(
      `className="rounded-lg border-l-${CREATIVE_PROJECT_CARD.rulePx} border-purple-500 bg-slate-50 p-${CREATIVE_PROJECT_CARD.paddingPx / TAILWIND_SPACING_PX}"`,
    )
  })
})

describe('CREATIVE_HEADER_CIRCLES', () => {
  const source = template('creative')
  const step = (px: number) => px / TAILWIND_SPACING_PX

  it('takes both discs’ sizes and overhangs from the header the Preview draws', () => {
    const { topRight, bottomLeft } = CREATIVE_HEADER_CIRCLES
    expect(source).toContain(
      `className="absolute -right-${step(topRight.overhangPx)} -top-${step(topRight.overhangPx)} ` +
        `h-${step(topRight.sizePx)} w-${step(topRight.sizePx)} rounded-full bg-white/${CREATIVE_HEADER_CIRCLES.alpha * 100}"`,
    )
    expect(source).toContain(
      `className="absolute -bottom-${step(bottomLeft.overhangPx)} -left-${step(bottomLeft.overhangPx)} ` +
        `h-${step(bottomLeft.sizePx)} w-${step(bottomLeft.sizePx)} rounded-full bg-white/${CREATIVE_HEADER_CIRCLES.alpha * 100}"`,
    )
    // Two, and only two: `resume-palette.test.ts` pins the same count from the
    // colour side, and skips the `bg-white/90` on the print:hidden editor
    // controls, which are never part of the document.
    expect(
      count(source, new RegExp(`bg-white/${CREATIVE_HEADER_CIRCLES.alpha * 100}\\b`, 'g')),
      'the header draws exactly these two translucent discs',
    ).toBe(2)
  })

  it('takes the header padding both offsets are measured across, and its clip', () => {
    const header = /<div className="relative overflow-hidden ([^"]*)"/.exec(source)?.[1]
    expect(header, 'creative-template.tsx has no `relative overflow-hidden` header').toBeDefined()
    // `overflow-hidden` is what clips the discs' overhang; Word clips a floating
    // drawing to its table cell, which is what the DOCX relies on in its place.
    expect(header?.split(/\s+/), 'the header padding both offsets are measured across').toContain(
      `p-${step(CREATIVE_HEADER_CIRCLES.paddingPx)}`,
    )
  })

  it('is drawn over the header fill and under nothing: the Preview lifts the text above it', () => {
    // `relative z-10` on the header content is why the Preview stacks the discs
    // beneath the text; the DOCX cannot, which `PREVIEW_GRAPHICS` records.
    expect(source).toContain('<div className="relative z-10">')
  })
})

describe('PREVIEW_GRAPHICS', () => {
  it('covers all five templates', () => {
    expect([...TEMPLATES].sort()).toEqual(Object.keys(PREVIEW_GRAPHICS).sort())
  })

  it('records a form and an approximation for every graphic', () => {
    for (const name of TEMPLATES) {
      for (const [key, graphic] of Object.entries(PREVIEW_GRAPHICS[name])) {
        expect(graphic.element, `${name}.${key} names no Preview element`).not.toBe('')
        expect(graphic.approximation.length, `${name}.${key} records no approximation`).toBeGreaterThan(40)
      }
    }
  })

  /**
   * The first version of this check accepted any prose containing "NOT DRAWN"
   * and the word "OOXML", and passed a record that claimed the header circles
   * were inexpressible when they were not. What it can honestly check is
   * narrower: that a not-drawn entry names WHO decided and on what ground, and
   * that it does not make the one claim this story got wrong — that the format
   * cannot. Whether the ground is true is not decidable from a string, and is
   * covered instead by the Word-rendered probes recorded with each story and by
   * `docx-graphics.test.ts`, which reads the shape out of a generated document.
   */
  it('says of every not-drawn graphic who decided, and claims no impossibility', () => {
    const notDrawn = TEMPLATES.flatMap((name) =>
      Object.entries(PREVIEW_GRAPHICS[name])
        .filter(([, graphic]) => graphic.form === 'not-drawn')
        .map(([key, graphic]) => [`${name}.${key}`, graphic.approximation] as const),
    )
    expect(notDrawn.map(([id]) => id), 'the graphics the DOCX does not draw').toEqual(['creative.timelineDot'])
    for (const [id, reason] of notDrawn) {
      expect(reason, `${id} does not say it is undrawn`).toContain('NOT DRAWN')
      expect(
        reason,
        `${id} must name a decision or a rejected attempt, not simply stop`,
      ).toMatch(/owner decision|rejected|not taken/i)
      expect(
        reason,
        `${id} claims the format cannot. Probe it and record what Word did, or draw it.`,
      ).not.toMatch(/\b(?:cannot|can not|impossible|no way to|has nothing)\b/i)
    }
  })

  it('claims no impossibility for a graphic it does draw either', () => {
    for (const name of TEMPLATES) {
      for (const [key, graphic] of Object.entries(PREVIEW_GRAPHICS[name])) {
        if (graphic.form === 'not-drawn') continue
        expect(
          graphic.approximation,
          `${name}.${key} is drawn, so nothing about it is impossible`,
        ).not.toMatch(/\bimpossible\b/i)
      }
    }
  })

  it('leaves no graphic of the three templates that draw none', () => {
    for (const name of ['professional', 'classic', 'minimal'] as const) {
      expect(Object.keys(PREVIEW_GRAPHICS[name]), `${name} declares a graphic`).toEqual([])
    }
  })
})
