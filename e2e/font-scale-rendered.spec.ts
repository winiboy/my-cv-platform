import { test, expect } from './fixtures/auth'
import { seedFixtureResume } from './fixtures/resume'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../src/test/local-stack'
import { DEFAULT_RESUME_LAYOUT } from '../src/lib/layout-settings'

/**
 * Part 3 US-011, criterion 2: moving the font-scale control changes the size
 * the browser actually draws.
 *
 * MEASURED, NOT INFERRED. The unit suite compares the number a template writes
 * into an inline style against the number the model holds, which is the
 * control agreeing with itself. This reads `getComputedStyle().fontSize` off
 * the laid-out document in Chromium, at two stored scales, and asserts the
 * ratio between them is the ratio of the scales. A template that wrote the
 * size into an attribute the browser ignores, or that had it overridden by a
 * stylesheet, passes the unit test and fails this one.
 *
 * The three templates are the ones the story is about: classic, minimal and
 * creative received no `fontScale` at all before it. Modern is included as the
 * control — it already scaled — so a regression that broke scaling everywhere
 * would not look like a pass on three templates and silence on the fourth.
 */

const SCALES = [1, 1.5] as const

const TEMPLATES = ['classic', 'minimal', 'creative', 'modern'] as const
type Template = (typeof TEMPLATES)[number]

/** Where the evidence PNGs are written, one per template per scale. */
const SHOT_DIR =
  process.env.US011_SHOT_DIR ??
  'C:/Users/cedri/AppData/Local/Temp/claude/E--website-cv-website-my-cv-platform/f5d99e39-2294-48da-86ff-f6c97e35df3f/scratchpad/p3us011'

/**
 * Non-default sizes, so a surface that fell back to `DEFAULT_RESUME_LAYOUT`
 * would not be able to produce these numbers.
 */
const STORED = {
  titleFontSize: 30,
  sectionDescFontSize: 11,
} as const

let service: SupabaseClient | null = null
function admin(): SupabaseClient {
  const url = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
  const key = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY
  assertLocalSupabase(url, 'The US-011 font-scale measurement')
  if (!service) service = createClient(url, key, { auth: { persistSession: false } })
  return service
}

async function seedScale(resumeId: string, fontScale: number): Promise<void> {
  const { error } = await admin()
    .from('resumes')
    .update({ layout_settings: { ...STORED, fontScale } })
    .eq('id', resumeId)
  if (error) throw new Error(`Could not seed the font scale: ${error.message}`)
}

test.describe('the font scale reaches the rendered document', () => {
  for (const template of TEMPLATES) {
    test(`${template}: the drawn size follows the stored scale`, async ({ page, authedUser }) => {
      const resume = await seedFixtureResume(authedUser.id, template)

      const measured: Record<number, { title: number; body: number }> = {}

      for (const scale of SCALES) {
        await seedScale(resume.id, scale)
        await page.goto(`/en/dashboard/resumes/${resume.id}/preview`)
        const document = page.locator('[data-testid="resume-document"]')
        await expect(document).toBeVisible()
        await page.evaluate(() => globalThis.document.fonts.ready)

        const title = document.locator('h1').first()
        await expect(title).toBeVisible()
        // An experience achievement, which every one of these templates draws
        // from `sectionDescFontSize`. NOT the summary: creative's lives in the
        // gradient header at a Tailwind size the model does not reach, so it
        // would report a ratio of 1 for a reason that is not this story's.
        const body = document.getByText('p95', { exact: false }).first()

        const px = async (locator: typeof title) =>
          Number(
            (await locator.evaluate((element) => getComputedStyle(element).fontSize)).replace('px', ''),
          )

        measured[scale] = { title: await px(title), body: await px(body) }
        // eslint-disable-next-line no-console -- the measurement IS the evidence this test exists to produce
        console.log(`US-011 ${template} @ ${scale}: ${JSON.stringify(measured[scale])}`)
        await page.screenshot({ path: `${SHOT_DIR}/${template}-scale-${scale}.png`, fullPage: true })
      }

      const ratio = SCALES[1] / SCALES[0]
      expect(measured[SCALES[0]].title).toBeCloseTo(STORED.titleFontSize * SCALES[0], 1)
      expect(measured[SCALES[1]].title).toBeCloseTo(STORED.titleFontSize * SCALES[1], 1)
      expect(measured[SCALES[1]].title / measured[SCALES[0]].title).toBeCloseTo(ratio, 2)
      expect(measured[SCALES[1]].body / measured[SCALES[0]].body).toBeCloseTo(ratio, 2)
      // The two scales really are two, and the stored size really is not the
      // default, or every assertion above would hold over one number.
      expect(SCALES[0]).not.toEqual(SCALES[1])
      expect(STORED.titleFontSize).not.toEqual(DEFAULT_RESUME_LAYOUT.titleFontSize)
    })
  }
})
