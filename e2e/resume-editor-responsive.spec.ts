import { test, expect, loginAs } from './fixtures/auth'
import { seedFixtureResume } from './fixtures/resume'
import type { Locator, Page } from '@playwright/test'

/**
 * The resume editor on narrow screens.
 *
 * Below `md` the dashboard navigation moves into a drawer, and below `xl` the
 * editor form stacks above the live preview. From `xl` up nothing changes:
 * the desktop geometry asserted at 1280 was measured on the editor before the
 * responsive work (HEAD 75315d0), so a regression there fails here rather than
 * passing as "still looks fine".
 *
 * The preview frame assertion covers the second defect: a CSS transform does
 * not shrink the layout box, so the frame around the scaled page has to be
 * sized explicitly, and has to follow the document when its content grows.
 *
 * The last block runs with real scrollbars. Headless Chromium hides them by
 * default, which is exactly the condition under which a width-derived scale
 * can never fight a scrollbar - so the stability check would pass vacuously
 * without opting out.
 */

const HEIGHT = 900
/** WCAG 2.5.5 / platform guidance minimum touch target. */
const TOUCH_TARGET = 44

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function box(locator: Locator): Promise<Box> {
  const value = await locator.boundingBox()
  if (!value) throw new Error('Element has no layout box')
  return value
}

async function openEditor(page: Page, resumeId: string, width: number, height = HEIGHT): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.goto(`/en/dashboard/resumes/${resumeId}/edit`)
  await expect(page.getByTestId('resume-document')).toBeVisible()
  // The scale is applied after the first measurement of the preview pane, and
  // the frame height after the first measurement of the document.
  await expect.poll(() => frameMatchesDocument(page)).toBe(true)
}

/** The frame is the scaled page's height, not the unscaled one. */
async function frameMatchesDocument(page: Page): Promise<boolean> {
  const frame = await box(page.getByTestId('resume-editor-preview-frame'))
  const document = await box(page.getByTestId('resume-document'))
  return Math.abs(frame.height - document.height) <= 1
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) throw new Error('No <main> element')
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      main: main.scrollWidth - main.clientWidth,
    }
  })
  expect(overflow).toEqual({ page: 0, main: 0 })
}

async function expectWithinViewport(locator: Locator, width: number): Promise<void> {
  const b = await box(locator)
  expect(b.x).toBeGreaterThanOrEqual(0)
  expect(b.x + b.width).toBeLessThanOrEqual(width)
  expect(b.width).toBeGreaterThan(0)
}

async function expectTouchTarget(locator: Locator, { width = false } = {}): Promise<void> {
  const b = await box(locator)
  expect(b.height).toBeGreaterThanOrEqual(TOUCH_TARGET)
  if (width) expect(b.width).toBeGreaterThanOrEqual(TOUCH_TARGET)
}

const drawerToggle = (page: Page) => page.getByRole('button', { name: 'Dashboard menu', exact: true })
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Dashboard menu', exact: true })

for (const width of [390, 768, 1024]) {
  test(`at ${width}px the editor stacks above the preview and both fit the viewport`, async ({ page, authedUser }) => {
    const resume = await seedFixtureResume(authedUser.id, 'professional')
    await openEditor(page, resume.id, width)

    await expectNoHorizontalScroll(page)
    await expectWithinViewport(page.getByTestId('resume-editor-panel'), width)
    await expectWithinViewport(page.getByTestId('resume-editor-preview'), width)

    // Stacked: the form comes first, the preview below it at the same width.
    const editor = await box(page.getByTestId('resume-editor-panel'))
    const preview = await box(page.getByTestId('resume-editor-preview'))
    expect(preview.y).toBeGreaterThanOrEqual(editor.y + editor.height - 1)
    expect(Math.abs(preview.width - editor.width)).toBeLessThanOrEqual(1)

    const documentLocator = page.getByTestId('resume-document')
    await documentLocator.scrollIntoViewIfNeeded()
    await expect(documentLocator).toBeInViewport()
    await expectWithinViewport(documentLocator, width)
    // The page fills the preview pane's content width rather than shrinking
    // to the 10% floor it fell to when squeezed beside the navigation.
    expect((await box(documentLocator)).width).toBeGreaterThan(width / 2)

    // The section strip: touch-sized tabs, scrolling without a visible scrollbar.
    const sectionNav = page.getByTestId('resume-editor-section-nav').locator('nav')
    for (const tab of await sectionNav.getByRole('button').all()) {
      await expectTouchTarget(tab)
    }
    expect(await sectionNav.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe('none')
  })
}

test('below md the dashboard navigation is a drawer operable by keyboard', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'professional')
  await openEditor(page, resume.id, 390)

  await expect(page.getByTestId('dashboard-sidebar')).toBeHidden()

  const toggle = drawerToggle(page)
  await expect(drawer(page)).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expectTouchTarget(toggle)

  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(drawer(page)).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  // Focus lands on the close button, not on the logo link.
  const closeButton = drawer(page).getByRole('button', { name: 'Close dashboard menu' })
  await expect(closeButton).toBeFocused()
  await expectTouchTarget(closeButton, { width: true })

  for (const link of await drawer(page).getByRole('navigation').getByRole('link').all()) {
    await expectTouchTarget(link)
  }

  // Tab stays among the drawer's controls.
  await page.keyboard.press('Tab')
  const focusedInside = await drawer(page).evaluate((element) => element.contains(document.activeElement))
  expect(focusedInside).toBe(true)

  await page.keyboard.press('Escape')
  await expect(drawer(page)).toBeHidden()
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  await page.keyboard.press('Enter')
  await expect(drawer(page)).toBeVisible()
  await expect(closeButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(drawer(page)).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

// Requesting authedUser is what signs the page in.
test('a drawer link to the current page still closes the drawer', async ({ page, authedUser }) => {
  await page.setViewportSize({ width: 390, height: HEIGHT })
  await page.goto('/en/dashboard/resumes')

  await drawerToggle(page).click()
  await expect(drawer(page)).toBeVisible()

  // No navigation happens, so only the click itself can close the drawer.
  const currentPageLink = drawer(page).getByRole('link', { name: 'My Resumes' })
  await currentPageLink.focus()
  await page.keyboard.press('Enter')
  await expect(drawer(page)).toBeHidden()
  await expect(page).toHaveURL(/\/en\/dashboard\/resumes$/)
  await expect(drawerToggle(page)).toHaveAttribute('aria-expanded', 'false')
})

test('at md the dashboard navigation stays a sidebar', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'professional')
  await openEditor(page, resume.id, 768)

  await expect(page.getByTestId('dashboard-sidebar')).toBeVisible()
  await expect(drawerToggle(page)).toBeHidden()
})

test('at 1280px the desktop layout is unchanged', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'professional')
  await openEditor(page, resume.id, 1280)

  await expect(drawerToggle(page)).toBeHidden()

  // Measured at 1280x900 on the pre-change editor with this fixture.
  const expected: Record<string, Box> = {
    nav: { x: 0, y: 69, width: 256, height: 341 },
    sectionNav: { x: 280, y: 164, width: 256, height: 765 },
    editor: { x: 536, y: 164, width: 358, height: 765 },
    preview: { x: 898, y: 164, width: 358, height: 765 },
    document: { x: 930, y: 522, width: 294, height: 416 },
  }
  const actual: Record<string, Box> = {
    nav: await box(page.getByTestId('dashboard-sidebar').locator('aside')),
    sectionNav: await box(page.getByTestId('resume-editor-section-nav')),
    editor: await box(page.getByTestId('resume-editor-panel')),
    preview: await box(page.getByTestId('resume-editor-preview')),
    document: await box(page.getByTestId('resume-document')),
  }

  for (const [name, want] of Object.entries(expected)) {
    const got = actual[name]
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(got[key] - want[key]), `${name}.${key}: ${got[key]} vs ${want[key]}`).toBeLessThanOrEqual(1)
    }
  }
})

test('the preview frame follows the scaled document height as content grows', async ({ page, authedUser }) => {
  const resume = await seedFixtureResume(authedUser.id, 'professional')
  await openEditor(page, resume.id, 1280)

  const frame = page.getByTestId('resume-editor-preview-frame')
  const documentLocator = page.getByTestId('resume-document')
  const unscaledHeight = () =>
    documentLocator.evaluate((element) => (element as HTMLElement).offsetHeight)

  const heightBefore = await unscaledHeight()
  const frameBefore = await box(frame)
  const scale = frameBefore.height / heightBefore
  expect(scale).toBeLessThan(1)

  // Grow the document past its page and let the observer react. Larger than a
  // page so the growth cannot be absorbed by the page's own minimum height.
  await documentLocator.evaluate((element) => {
    const spacer = document.createElement('div')
    spacer.style.height = '1500px'
    element.appendChild(spacer)
  })

  await expect.poll(unscaledHeight).toBeGreaterThan(heightBefore)
  await expect.poll(() => frameMatchesDocument(page)).toBe(true)
  const frameAfter = await box(frame)
  expect(Math.abs(frameAfter.height - (await unscaledHeight()) * scale)).toBeLessThanOrEqual(1)
})

test.describe('with real scrollbars', () => {
  /**
   * The viewport height at which the scroll container's content exactly fills
   * it without a scrollbar. The container's height tracks the viewport height
   * one-for-one in both layouts (the split pane is 100vh minus fixed chrome;
   * <main> is the viewport minus the header).
   *
   * Measured from a viewport tall enough that nothing overflows, because
   * scrollHeight cannot be used: the content's height depends on the width the
   * scrollbar leaves (the scale, and the colour/font controls that wrap), so
   * an overflow measured with a scrollbar does not locate the edge without one.
   */
  async function scrollbarEdgeHeight(page: Page, width: number, selector: string): Promise<number> {
    const tall = 4000
    await page.setViewportSize({ width, height: tall })
    await expect.poll(() => frameMatchesDocument(page)).toBe(true)
    const slack = await page.evaluate((sel) => {
      const element = document.querySelector(sel) as HTMLElement | null
      const last = element?.lastElementChild
      if (!element || !last) throw new Error(`No content for ${sel}`)
      const contentBottom =
        last.getBoundingClientRect().bottom + parseFloat(getComputedStyle(element).paddingBottom)
      return element.getBoundingClientRect().top + element.clientHeight - contentBottom
    }, selector)
    expect(slack).toBeGreaterThan(0)
    return Math.round(tall - slack)
  }

  /** Distinct preview scales seen over one second of animation frames. */
  async function scaleChangesOverOneSecond(page: Page): Promise<number> {
    return page.getByTestId('resume-document').evaluate(
      (documentElement) =>
        new Promise<number>((resolve) => {
          const scaled = documentElement.parentElement as HTMLElement
          let last = scaled.style.transform
          let changes = 0
          const start = performance.now()
          const tick = () => {
            if (scaled.style.transform !== last) {
              changes++
              last = scaled.style.transform
            }
            if (performance.now() - start < 1000) requestAnimationFrame(tick)
            else resolve(changes)
          }
          requestAnimationFrame(tick)
        })
    )
  }

  for (const { width, container } of [
    { width: 1280, container: '[data-testid="resume-editor-preview"]' },
    { width: 1024, container: 'main' },
  ]) {
    test(`at ${width}px the preview scale is stable at the scrollbar edge`, async ({ playwright, baseURL, authedUser }) => {
      // A browser of its own: launch options cannot be overridden per test.
      const browser = await playwright.chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })
      try {
        const page = await (await browser.newContext({ baseURL })).newPage()
        await loginAs(page, authedUser)
        const resume = await seedFixtureResume(authedUser.id, 'professional')
        await openEditor(page, resume.id, width)

        // Real scrollbars take layout width; with hidden ones this test proves nothing.
        const scrollbarWidth = await page.evaluate(() => {
          const main = document.querySelector('main') as HTMLElement
          return main.offsetWidth - main.clientWidth
        })
        expect(scrollbarWidth).toBeGreaterThan(0)

        // Adding the scrollbar narrows the content and shortens the scaled page
        // by roughly 15 × (1123 / 794) ≈ 21px, so the unstable band lies in
        // the ~21px just below the edge. Step through it and a little beyond.
        const edge = await scrollbarEdgeHeight(page, width, container)
        for (let height = edge - 30; height <= edge + 6; height += 3) {
          await page.setViewportSize({ width, height })
          // Let the resize itself settle before sampling.
          await page.waitForTimeout(250)
          expect(await scaleChangesOverOneSecond(page), `viewport height ${height}`).toBe(0)
        }
      } finally {
        await browser.close()
      }
    })
  }
})
