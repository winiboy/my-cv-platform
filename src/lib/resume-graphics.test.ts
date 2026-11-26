import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ResumeTemplate } from '@/types/database'
import { templateComponentFile } from '@/test/resume-template-files'
import { RESUME_TEMPLATES } from './resume-templates'
import { PREVIEW_GRAPHICS, SWISS_VOCATIONAL_ACCENT } from './resume-graphics'

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
 * `docx-graphics.test.ts`, on generated documents.
 */

const ROOT = path.resolve(__dirname, '../..')
const TEMPLATES: readonly ResumeTemplate[] = RESUME_TEMPLATES
const template = (name: ResumeTemplate) => readFileSync(path.join(ROOT, templateComponentFile(name)), 'utf-8')

describe('SWISS_VOCATIONAL_ACCENT', () => {
  it('sizes the strip and the heading square the swissVocational Preview draws', () => {
    const source = template('swissVocational')
    expect(source).toMatch(
      /className="absolute inset-y-0 left-0 bg-red-700 [^"]*"\s+style=\{\{ width: `\$\{SWISS_VOCATIONAL_ACCENT\.stripPx\}px` \}\}/,
    )
    expect(source).toContain('width: `${SWISS_VOCATIONAL_ACCENT.squarePx}px`')
    expect(source).toContain('height: `${SWISS_VOCATIONAL_ACCENT.squarePx}px`')
    expect(source).toContain('marginRight: `${SWISS_VOCATIONAL_ACCENT.squareGapPx}px`')
    expect(SWISS_VOCATIONAL_ACCENT).toEqual({ stripPx: 8, squarePx: 10, squareGapPx: 14 })
  })
})

describe('PREVIEW_GRAPHICS', () => {
  it('covers every template', () => {
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
   * and the word "OOXML", and passed a record that claimed a graphic was
   * inexpressible when it was not. What it can honestly check is narrower: that a not-drawn entry names WHO decided and on what ground, and
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
    expect(notDrawn.map(([id]) => id), 'the graphics the DOCX does not draw').toEqual([])
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
})
