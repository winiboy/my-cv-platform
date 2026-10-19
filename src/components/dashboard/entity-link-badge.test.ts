import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import { CoverLetterLinkBadge, EntityLinkBadge } from '@/components/dashboard/entity-link-badge'

/**
 * The link badge's count uses the locale's singular and plural labels. Before,
 * it appended "s" to the singular, which is English only; en must render as it
 * did then.
 */

const DICTS = { en, fr, de, it: it_ } as Record<'en' | 'fr' | 'de' | 'it', Record<string, unknown>>

/** The badge's visible text. */
function badgeText(element: ReturnType<typeof createElement>): string {
  const html = renderToStaticMarkup(element)
  const match = html.match(/<span class="truncate">([^<]*)<\/span>/)
  if (!match) throw new Error(`No badge text in ${html}`)
  return match[1]
}

describe('EntityLinkBadge count', () => {
  it('en renders exactly as before: singular for 1, singular + "s" for more', () => {
    for (const type of ['resume', 'coverLetter', 'job'] as const) {
      const singular = (en.badges as Record<string, string>)[`${type}Label`]
      expect(badgeText(createElement(EntityLinkBadge, { type, count: 1, dict: en }))).toBe(`1 ${singular}`)
      expect(badgeText(createElement(EntityLinkBadge, { type, count: 3, dict: en }))).toBe(`3 ${singular}s`)
    }
    expect(badgeText(createElement(CoverLetterLinkBadge, { count: 1, dict: en }))).toBe('1 Cover Letter')
    expect(badgeText(createElement(CoverLetterLinkBadge, { count: 2, dict: en }))).toBe('2 Cover Letters')
  })

  for (const locale of ['fr', 'de', 'it'] as const) {
    it(`${locale}: uses the translated singular and plural`, () => {
      const badges = DICTS[locale].badges as Record<string, string>
      for (const type of ['resume', 'coverLetter', 'job'] as const) {
        const singular = badges[`${type}Label`]
        const plural = badges[`${type}LabelPlural`]
        expect(plural).toBeTruthy()
        expect(badgeText(createElement(EntityLinkBadge, { type, count: 1, dict: DICTS[locale] }))).toBe(
          `1 ${singular}`,
        )
        expect(badgeText(createElement(EntityLinkBadge, { type, count: 4, dict: DICTS[locale] }))).toBe(
          `4 ${plural}`,
        )
      }
    })
  }

  it('fr plural is the French form, not an appended "s"', () => {
    expect(badgeText(createElement(CoverLetterLinkBadge, { count: 2, dict: fr }))).toBe('2 Lettres')
    expect(badgeText(createElement(EntityLinkBadge, { type: 'resume', count: 2, dict: fr }))).toBe('2 CV')
    expect(badgeText(createElement(EntityLinkBadge, { type: 'job', count: 2, dict: de }))).toBe('2 Stellen')
  })

  it('without a dictionary, falls back to the previous English', () => {
    expect(badgeText(createElement(CoverLetterLinkBadge, { count: 1 }))).toBe('1 Cover Letter')
    expect(badgeText(createElement(CoverLetterLinkBadge, { count: 5 }))).toBe('5 Cover Letters')
  })
})
