import { expect } from '@playwright/test'
import {
  FIXTURE_EDUCATION,
  FIXTURE_EXPERIENCE,
  FIXTURE_LANGUAGES,
  FIXTURE_SKILLS,
  type FixtureContentOverrides,
  type FixtureExperience,
} from './resume'
import { PAGE_HEIGHT_PX } from '../../src/lib/resume-page-size'

/**
 * Content and page arithmetic shared by the page-break indicator specs, so the
 * editor and the Preview page are exercised on the same documents and judged
 * by the same rule.
 */

/**
 * Enough extra roles to push every template well past one page. Invented
 * content; the company name is numbered so no two roles render identically.
 */
export const LONG_EXPERIENCE: FixtureExperience[] = Array.from({ length: 10 }, (_, index) => ({
  ...FIXTURE_EXPERIENCE[index % FIXTURE_EXPERIENCE.length],
  company: `${FIXTURE_EXPERIENCE[index % FIXTURE_EXPERIENCE.length].company} ${index + 1}`,
}))

/**
 * A CV short enough for every template to fit one page. The shared fixture
 * does not: it runs onto a second page in all but professional, whose page
 * minimum absorbs it.
 */
export const ONE_PAGE: FixtureContentOverrides = {
  summary: 'Product engineer building document tooling for regulated industries.',
  experience: [{ ...FIXTURE_EXPERIENCE[0], achievements: [] }],
  education: [FIXTURE_EDUCATION[0]],
  skills: [FIXTURE_SKILLS[0]],
  projects: [],
  languages: [FIXTURE_LANGUAGES[0]],
  certifications: [],
}

/**
 * The page count FR-2 gives for this height, written independently of the app:
 * every sheet edge the document passes by more than 1 px starts a new page.
 */
export function expectedPages(unscaledHeight: number): number {
  let pages = 1
  while (unscaledHeight > pages * PAGE_HEIGHT_PX + 1) pages++
  return pages
}

/**
 * Precondition for a multi-page case: the height is clear of every page edge,
 * so the count cannot pass on the tolerance band or a rounding coincidence.
 */
export function expectClearOfPageEdge(unscaledHeight: number): void {
  const distance = unscaledHeight % PAGE_HEIGHT_PX
  expect(distance, `height ${unscaledHeight} is within a px of a page edge`).toBeGreaterThan(1)
  expect(PAGE_HEIGHT_PX - distance).toBeGreaterThan(1)
}
