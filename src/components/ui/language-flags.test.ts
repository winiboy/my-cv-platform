import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FlagDE, FlagFR, FlagGB, FlagIT, LANGUAGE_FLAG_OPTIONS } from './language-flags'

/**
 * The language flags are one shared source (cover-letter-export-translate,
 * US-003, FR-4), and moving them changed nothing the grammar checker draws.
 *
 * The expected markup below is what the grammar checker's own inline
 * `FlagGB`/`FlagFR`/`FlagDE`/`FlagIT` rendered before the move, captured by
 * rendering them from commit 281088a (`grammar-checker-client.tsx:53-100`).
 */

const MARKUP_BEFORE_THE_MOVE = {
  FlagGB:
    '<svg viewBox="0 0 60 30" width="20" height="10" aria-hidden="true"><rect width="60" height="30" fill="#012169"></rect><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"></path><path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="2"></path><path d="M30,0 V30 M0,15 H60" stroke="#fff" stroke-width="10"></path><path d="M30,0 V30 M0,15 H60" stroke="#C8102E" stroke-width="6"></path></svg>',
  FlagFR:
    '<svg viewBox="0 0 30 20" width="20" height="13" aria-hidden="true"><rect width="10" height="20" fill="#002395"></rect><rect x="10" width="10" height="20" fill="#fff"></rect><rect x="20" width="10" height="20" fill="#ED2939"></rect></svg>',
  FlagDE:
    '<svg viewBox="0 0 30 20" width="20" height="13" aria-hidden="true"><rect width="30" height="6.67" fill="#000"></rect><rect y="6.67" width="30" height="6.67" fill="#DD0000"></rect><rect y="13.33" width="30" height="6.67" fill="#FFCC00"></rect></svg>',
  FlagIT:
    '<svg viewBox="0 0 30 20" width="20" height="13" aria-hidden="true"><rect width="10" height="20" fill="#009246"></rect><rect x="10" width="10" height="20" fill="#fff"></rect><rect x="20" width="10" height="20" fill="#CE2B37"></rect></svg>',
} as const

const FLAGS = { FlagGB, FlagFR, FlagDE, FlagIT } as const

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('language flags', () => {
  it.each(Object.keys(FLAGS) as (keyof typeof FLAGS)[])('%s draws exactly the SVG the grammar checker drew', (name) => {
    expect(renderToStaticMarkup(createElement(FLAGS[name]))).toBe(MARKUP_BEFORE_THE_MOVE[name])
  })

  it("keeps the checker's order, codes and names, each with its flag", () => {
    expect(LANGUAGE_FLAG_OPTIONS.map(({ code, Flag, fullName }) => [code, Flag, fullName])).toEqual([
      ['en', FlagGB, 'English'],
      ['fr', FlagFR, 'Français'],
      ['de', FlagDE, 'Deutsch'],
      ['it', FlagIT, 'Italiano'],
    ])
  })

  it.each([
    'src/components/tools/grammar-checker-client.tsx',
    'src/components/dashboard/cover-letter-editor.tsx',
  ])('%s draws the shared flags and defines none of its own', (path) => {
    const code = source(path)
    expect(code).toContain("from '@/components/ui/language-flags'")
    expect(code).not.toMatch(/function Flag(?:GB|FR|DE|IT)\b|<svg\b/)
  })
})
