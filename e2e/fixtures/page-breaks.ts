import {
  FIXTURE_EDUCATION,
  FIXTURE_EXPERIENCE,
  FIXTURE_LANGUAGES,
  FIXTURE_SKILLS,
  type FixtureContentOverrides,
  type FixtureExperience,
} from './resume'
import { PAGE_HEIGHT_PX } from '../../src/lib/resume-page-size'
import { SHEET_GAP_PX as SHEET_GAP } from '../../src/lib/resume-sheets'

/**
 * Content and sheet arithmetic shared by the page-break specs, so the editor
 * and the Preview page are exercised on the same documents and judged by the
 * same rule.
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
 * The number of sheets a Preview or Editor frame of this unscaled height
 * draws (swiss-templates-only-page-fidelity US-003): n A4 sheets and the
 * n − 1 gaps between them, the last sheet full height. Written from the page
 * size and the gap, not from the app's arithmetic. `null` for a height that is
 * not a whole number of sheets within a px: the frame always fills its last
 * sheet, so such a height is not settled, or wrong.
 */
export function sheetsForHeight(unscaledHeight: number): number | null {
  const sheets = Math.max(1, Math.round((unscaledHeight + SHEET_GAP) / (PAGE_HEIGHT_PX + SHEET_GAP)))
  const exact = sheets * PAGE_HEIGHT_PX + (sheets - 1) * SHEET_GAP
  return Math.abs(exact - unscaledHeight) <= 1 ? sheets : null
}

/** The unscaled y where sheet `page` (1-based) starts. */
export function sheetTopFor(page: number): number {
  return (page - 1) * (PAGE_HEIGHT_PX + SHEET_GAP)
}
