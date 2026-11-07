import { test, expect } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { insertLetter, rect, SENDER_NAME } from './fixtures/cover-letter-preview'
import en from '../src/locales/en/common.json'
import fr from '../src/locales/fr/common.json'
import de from '../src/locales/de/common.json'
import it from '../src/locales/it/common.json'

/**
 * Zoom controls in the preview window and the editor's preview pane
 * (cover-letter-preview-and-card-language, US-002).
 *
 * WHY THIS NEEDS A BROWSER
 *
 * The page is scaled with a CSS transform inside a sized frame, in a scroll
 * area with controls laid over it. Whether the page's edges and last line can
 * be scrolled into view, whether "show all" really fits the first page, and
 * whether the controls stay put while the letter scrolls are all layout
 * outcomes, and exist only in a rendered page.
 *
 * WHAT IS ASSERTED, in the window and in the pane alike
 *
 *   - The controls sit at the scroll area's bottom-right, inside it, and do
 *     not move when the letter scrolls.
 *   - Zoom in and zoom out move the shown level by 10 points (from a
 *     between-steps level, to the next step), the page's rendered width
 *     follows, and the polite live region announces the new level.
 *   - Repeated zoom in stops at 200% and disables zoom in; repeated zoom out
 *     stops at 25% and disables zoom out.
 *   - At 200%, the page's left edge shows at scrollLeft 0, its right edge and
 *     the last line can be scrolled into view, and the blank space below the
 *     page is no more than the area's bottom padding.
 *   - "Show all" fits the whole first page in the area, both ways, with no
 *     scrolling needed, even when pressed while scrolled to the letter's end.
 *   - The group always exposes the current level in full to assistive
 *     technology, on load and after a resize. The live region stays empty
 *     until a control is pressed, a refit after a window resize is shown but
 *     not announced, and "show all" pressed again at its level is announced
 *     again.
 *   - Enter and Space on a button at its bound change nothing, and keep
 *     focus on it.
 *   - The controls work from the keyboard, with a visible focus ring.
 *
 * And: the window opens at "show all"; the pane starts fitted to its width,
 * at most 85%, as before; the two zoom apart; the controls' names are
 * localized in en/fr/de/it; at 1280x800 and 1440x900, without scrolling the
 * page, the pane's controls lie on screen and inside the pane, at either end
 * of the letter.
 */

const editorDict = en.coverLetters.editor

/** The template's first page: A4, 794 x 1123 CSS pixels at 100%. */
const PAGE_WIDTH = 794
const PAGE_HEIGHT = 1123

/** Sub-pixel layout and rounding. */
const TOLERANCE = 1.5

interface Surface {
  name: string
  scrollArea: Locator
  letterPage: Locator
  controls: Locator
  zoomIn: Locator
  zoomOut: Locator
  showAll: Locator
  /** The shown percentage. */
  percent: Locator
  /** The polite live region: empty until a control is pressed. */
  status: Locator
}

function surface(name: string, scope: Locator, dict: typeof editorDict = editorDict): Surface {
  const controls = scope.getByRole('group', { name: dict.zoomControls, exact: true })
  return {
    name,
    scrollArea: scope.getByRole('region', { name: dict.previewScrollArea, exact: true }),
    letterPage: scope.getByTestId('cover-letter-preview-page'),
    controls,
    zoomIn: controls.getByRole('button', { name: dict.zoomIn, exact: true }),
    zoomOut: controls.getByRole('button', { name: dict.zoomOut, exact: true }),
    showAll: controls.getByRole('button', { name: dict.zoomFit, exact: true }),
    percent: controls.getByTestId('cover-letter-zoom-percent'),
    status: controls.getByRole('status'),
  }
}

const levelText = (percent: number) => editorDict.zoomLevel.replace('{percent}', String(percent))

/** The level the controls show, as a number. */
async function shownPercent(target: Surface): Promise<number> {
  const text = (await target.percent.textContent()) ?? ''
  const match = /^(\d+)%$/.exec(text.trim())
  expect(match, `${target.name}: no level in "${text}"`).not.toBeNull()
  return Number(match![1])
}

/** The scroll area's visible box, without its scrollbars, and its scroll state. */
function areaState(area: Locator) {
  return area.evaluate((element) => {
    const { left, top } = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    return {
      left,
      top,
      right: left + element.clientWidth,
      bottom: top + element.clientHeight,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
      paddingTop: parseFloat(style.paddingTop),
      paddingBottom: parseFloat(style.paddingBottom),
      paddingLeft: parseFloat(style.paddingLeft),
      paddingRight: parseFloat(style.paddingRight),
    }
  })
}

/**
 * The group's accessibility tree names the current level in full, matching
 * the percentage shown, whether or not anything has been announced.
 */
async function expectLevelExposed(target: Surface, dict: typeof editorDict = editorDict) {
  await expect(async () => {
    const shown = await shownPercent(target)
    const tree = await target.controls.ariaSnapshot()
    expect(tree, `${target.name}: the group's accessible text`).toContain(
      dict.zoomLevel.replace('{percent}', String(shown)),
    )
  }).toPass({ timeout: 10_000 })
}

function scrollTo(area: Locator, position: 'start' | 'end') {
  return area.evaluate((element, where) => {
    element.scrollTo({
      left: where === 'start' ? 0 : element.scrollWidth,
      top: where === 'start' ? 0 : element.scrollHeight,
      behavior: 'instant',
    })
  }, position)
}

async function expectPageWidth(target: Surface, percent: number) {
  await expect
    .poll(async () => (await rect(target.letterPage)).width, `${target.name}: page width at ${percent}%`)
    .toBeCloseTo((PAGE_WIDTH * percent) / 100, 0)
}

/**
 * The whole first page lies inside the area's visible box, as it is: the
 * area is not scrolled here, and needs no scrolling.
 */
async function expectFirstPageFits(target: Surface) {
  await expect(async () => {
    const area = await areaState(target.scrollArea)
    expect(area.scrollTop, `${target.name}: scrollTop`).toBe(0)
    expect(area.scrollLeft, `${target.name}: scrollLeft`).toBe(0)
    const page = await rect(target.letterPage)
    const firstPageBottom = page.top + (page.width * PAGE_HEIGHT) / PAGE_WIDTH
    expect(area.scrollWidth, `${target.name}: needs scrolling sideways`).toBeLessThanOrEqual(area.clientWidth)
    expect(page.left, `${target.name}: first page left`).toBeGreaterThanOrEqual(area.left - TOLERANCE)
    expect(page.right, `${target.name}: first page right`).toBeLessThanOrEqual(area.right + TOLERANCE)
    expect(page.top, `${target.name}: first page top`).toBeGreaterThanOrEqual(area.top - TOLERANCE)
    expect(firstPageBottom, `${target.name}: first page bottom`).toBeLessThanOrEqual(area.bottom + TOLERANCE)
    expect(await shownPercent(target)).toBe(Math.round((page.width / PAGE_WIDTH) * 100))
  }).toPass({ timeout: 10_000 })
}

/** Controls at the area's bottom-right, inside it, unmoved by scrolling the letter. */
async function expectControlsPinned(target: Surface) {
  await scrollTo(target.scrollArea, 'start')
  const area = await rect(target.scrollArea)
  const before = await rect(target.controls)
  expect(before.right, `${target.name}: controls right`).toBeLessThanOrEqual(area.right)
  expect(before.bottom, `${target.name}: controls bottom`).toBeLessThanOrEqual(area.bottom)
  // Within the inset plus a scrollbar of the area's bottom-right corner.
  expect(area.right - before.right, `${target.name}: controls right inset`).toBeLessThanOrEqual(40)
  expect(area.bottom - before.bottom, `${target.name}: controls bottom inset`).toBeLessThanOrEqual(40)
  expect(before.left - area.left, `${target.name}: controls on the right half`).toBeGreaterThan(area.width / 2)

  await target.scrollArea.evaluate((element) => {
    element.scrollTop = 600
  })
  await expect.poll(() => target.scrollArea.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await rect(target.controls), `${target.name}: controls moved with the letter`).toEqual(before)
  await scrollTo(target.scrollArea, 'start')
}

/** At the current zoom: every edge of the page and its last line can be scrolled into view. */
async function expectWholeLetterReachable(target: Surface, lastLine: Locator) {
  await scrollTo(target.scrollArea, 'start')
  await expect(async () => {
    const area = await areaState(target.scrollArea)
    const page = await rect(target.letterPage)
    expect(area.scrollLeft).toBe(0)
    expect(page.left, `${target.name}: left edge at scrollLeft 0`).toBeGreaterThanOrEqual(area.left - TOLERANCE)
    // A page wider than the area starts at its left padding, not centred
    // with its left part cut off; a narrower one is centred.
    if (page.width > area.clientWidth - area.paddingLeft - area.paddingRight) {
      expect(page.left - area.left, `${target.name}: left gap at scrollLeft 0`).toBeLessThanOrEqual(
        area.paddingLeft + TOLERANCE,
      )
    }
    expect(page.top, `${target.name}: top edge at scrollTop 0`).toBeGreaterThanOrEqual(area.top - TOLERANCE)
  }).toPass({ timeout: 10_000 })

  await scrollTo(target.scrollArea, 'end')
  await expect(async () => {
    const area = await areaState(target.scrollArea)
    const border = await rect(target.scrollArea)
    const page = await rect(target.letterPage)
    const line = await rect(lastLine)
    // The box the browser scrolls through, read from where it stops. Not
    // clientWidth/clientHeight: where scrollbars take no room (overlay
    // scrollbars, or Playwright's hidden ones) while the stable gutter is
    // still reserved, the browser scrolls content through the gutter too, so
    // clientWidth understates what is shown.
    const scrollport = {
      right: area.left + area.scrollWidth - area.scrollLeft,
      bottom: area.top + area.scrollHeight - area.scrollTop,
    }
    expect(scrollport.right, `${target.name}: scrollport inside the area`).toBeLessThanOrEqual(border.right + TOLERANCE)
    expect(scrollport.bottom, `${target.name}: scrollport inside the area`).toBeLessThanOrEqual(
      border.bottom + TOLERANCE,
    )
    expect(page.right, `${target.name}: right edge reachable`).toBeLessThanOrEqual(scrollport.right + TOLERANCE)
    expect(page.bottom, `${target.name}: bottom edge reachable`).toBeLessThanOrEqual(scrollport.bottom + TOLERANCE)
    expect(line.bottom, `${target.name}: last line reachable`).toBeLessThanOrEqual(scrollport.bottom)
    expect(line.top, `${target.name}: last line reachable`).toBeGreaterThanOrEqual(area.top)
    // Only a letter taller than the area scrolls; a shorter one leaves the
    // area's remaining height empty without adding any scroll.
    if (area.scrollHeight > area.clientHeight) {
      expect(scrollport.bottom - page.bottom, `${target.name}: blank below the page`).toBeLessThanOrEqual(
        area.paddingBottom + TOLERANCE,
      )
    }
  }).toPass({ timeout: 10_000 })
  await scrollTo(target.scrollArea, 'start')
}

/**
 * The full set of zoom checks, from the surface's starting level. Leaves the
 * surface at "show all".
 */
async function exerciseZoom(target: Surface, lastLine: Locator) {
  // Nothing is announced before the user presses a control.
  await expect(target.status).toHaveText('')
  await expectControlsPinned(target)
  const start = await shownPercent(target)

  // One step in, one step out: from a between-steps level, to the next step.
  const stepUp = Math.floor(start / 10) * 10 + 10
  await target.zoomIn.click()
  await expect(target.status).toHaveText(levelText(stepUp))
  await expectPageWidth(target, stepUp)
  await target.zoomOut.click()
  await expect(target.status).toHaveText(levelText(stepUp - 10))
  await expectPageWidth(target, stepUp - 10)

  // Up to the upper bound.
  for (let press = 0; press < 20 && (await shownPercent(target)) < 200; press += 1) {
    await target.zoomIn.click()
  }
  await expect(target.status).toHaveText(levelText(200))
  await expect(target.zoomIn).toBeDisabled()
  await expect(target.zoomOut).toBeEnabled()
  // Forced: Playwright will not click a disabled button, and a press at the
  // bound must change nothing.
  await target.zoomIn.click({ force: true })
  await expect(target.status).toHaveText(levelText(200))
  // And from the keyboard: focus stays on the button, the level stays.
  await target.zoomIn.focus()
  await target.zoomIn.press('Enter')
  await target.zoomIn.press('Space')
  await expect(target.zoomIn).toBeFocused()
  await expect(target.percent).toHaveText('200%')
  await expectPageWidth(target, 200)
  await expectControlsPinned(target)
  await expectWholeLetterReachable(target, lastLine)

  // Down to the lower bound.
  for (let press = 0; press < 20 && (await shownPercent(target)) > 25; press += 1) {
    await target.zoomOut.click()
  }
  await expect(target.status).toHaveText(levelText(25))
  await expect(target.zoomOut).toBeDisabled()
  await expect(target.zoomIn).toBeEnabled()
  await target.zoomOut.click({ force: true })
  await expect(target.status).toHaveText(levelText(25))
  await expectPageWidth(target, 25)
  await expectWholeLetterReachable(target, lastLine)

  // Show all, pressed while scrolled to the letter's end: the first page
  // comes back into view whole.
  for (let press = 0; press < 20 && (await shownPercent(target)) < 100; press += 1) {
    await target.zoomIn.click()
  }
  await expect(target.percent).toHaveText('100%')
  await scrollTo(target.scrollArea, 'end')
  await expect.poll(() => target.scrollArea.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await target.showAll.click()
  await expectFirstPageFits(target)
  await expect(target.status).toHaveText(levelText(await shownPercent(target)))

  // Pressed again at the level it already gives: announced again. The
  // region's content is replaced, not left as it was.
  const announced = await target.status.locator('span').elementHandle()
  expect(announced).not.toBeNull()
  await target.showAll.click()
  await expect.poll(() => announced!.evaluate((element) => element.isConnected)).toBe(false)
  await expect(target.status).toHaveText(levelText(await shownPercent(target)))
  await announced!.dispose()
  await expect(target.zoomIn).toBeEnabled()
  await expect(target.zoomOut).toBeEnabled()

  // The keyboard: Tab from the scroll area reaches zoom out first, with a
  // visible ring, and Enter presses it.
  const fitted = await shownPercent(target)
  await target.scrollArea.focus()
  await target.scrollArea.page().keyboard.press('Tab')
  await expect(target.zoomOut).toBeFocused()
  const ring = await target.zoomOut.evaluate((element) => ({
    focusVisible: element.matches(':focus-visible'),
    boxShadow: window.getComputedStyle(element).boxShadow,
  }))
  expect(ring.focusVisible, `${target.name}: focus is visible`).toBe(true)
  expect(ring.boxShadow, `${target.name}: focus ring`).not.toBe('none')
  await target.scrollArea.page().keyboard.press('Enter')
  await expect(target.status).toHaveText(levelText(Math.ceil(fitted / 10) * 10 - 10))
  await target.scrollArea.page().keyboard.press('Tab')
  await target.scrollArea.page().keyboard.press('Tab')
  await expect(target.showAll).toBeFocused()
  await target.scrollArea.page().keyboard.press('Space')
  await expect(target.status).toHaveText(levelText(fitted))
}

async function openEditor(page: Page, letterId: string, locale = 'en') {
  const response = await page.goto(`/${locale}/dashboard/cover-letters/${letterId}/edit`)
  expect(response?.status()).toBe(200)
}

function paneSurface(page: Page): Surface {
  return surface('pane', page.getByTestId('cover-letter-preview-pane'))
}

async function openWindow(page: Page): Promise<{ dialog: Locator; window: Surface }> {
  await page.getByRole('button', { name: editorDict.preview, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: editorDict.previewTitle, exact: true })
  await expect(dialog).toBeVisible()
  return { dialog, window: surface('window', dialog) }
}

test('the preview window opens at "show all" and zooms within its bounds', async ({ page, authedUser }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)

  const { dialog, window } = await openWindow(page)
  await expect(window.controls).toBeVisible()
  await expectFirstPageFits(window)
  await expectLevelExposed(window)
  await exerciseZoom(window, dialog.getByText(SENDER_NAME, { exact: true }).last())
})

test('the editor pane starts fitted to its width and zooms within its bounds', async ({ page, authedUser }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)

  const pane = paneSurface(page)
  await expect(pane.controls).toBeVisible()

  // Today's starting size: fitted to the pane's width, at most 85%. The
  // expectation is built from the pane element itself, not from the box the
  // page was fitted to. The one deliberate difference from before zoom is
  // the scrollbar the pane now reserves, as it scrolls: it is measured and
  // recorded, not assumed.
  const expectFitWidth = async () => {
    let reservedScrollbar = 0
    await expect(async () => {
      const paneInner = await page.getByTestId('cover-letter-preview-pane').evaluate((element) => {
        const style = window.getComputedStyle(element)
        return (
          element.getBoundingClientRect().width -
          parseFloat(style.borderLeftWidth) -
          parseFloat(style.borderRightWidth) -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight)
        )
      })
      const area = await pane.scrollArea.evaluate((element: HTMLElement) => {
        const style = window.getComputedStyle(element)
        return {
          scrollbar:
            element.offsetWidth -
            element.clientWidth -
            parseFloat(style.borderLeftWidth) -
            parseFloat(style.borderRightWidth),
          padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
        }
      })
      reservedScrollbar = area.scrollbar
      const pageBox = await rect(pane.letterPage)
      const expected = Math.min(paneInner - area.scrollbar - area.padding, 0.85 * PAGE_WIDTH)
      expect(Math.abs(pageBox.width - expected), `page ${pageBox.width}, expected ${expected}`).toBeLessThanOrEqual(1)
      expect(await shownPercent(pane)).toBe(Math.round((pageBox.width / PAGE_WIDTH) * 100))
    }).toPass({ timeout: 10_000 })
    return reservedScrollbar
  }
  const reservedScrollbar = await expectFitWidth()
  await expectLevelExposed(pane)
  test.info().annotations.push({
    type: 'pane scrollbar',
    description: `${reservedScrollbar}px reserved for the pane's vertical scrollbar at ${page.viewportSize()?.width}px`,
  })

  // A wider window refits the pane, shown but not announced.
  const before = await shownPercent(pane)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect.poll(() => shownPercent(pane), 'the pane refits to the wider window').not.toBe(before)
  await expectFitWidth()
  await expectLevelExposed(pane)
  await expect(pane.status).toHaveText('')
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect.poll(() => shownPercent(pane)).toBe(before)
  await expect(pane.status).toHaveText('')

  await exerciseZoom(pane, page.getByTestId('cover-letter-preview-pane').getByText(SENDER_NAME, { exact: true }).last())
})

test('the pane and the window zoom independently', async ({ page, authedUser }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const letterId = await insertLetter(authedUser.id)
  await openEditor(page, letterId)

  const pane = paneSurface(page)
  for (let press = 0; press < 20 && (await shownPercent(pane)) < 120; press += 1) {
    await pane.zoomIn.click()
  }
  await expect(pane.percent).toHaveText('120%')

  // The window opens at its own "show all", not at the pane's level.
  const { dialog, window } = await openWindow(page)
  await expectFirstPageFits(window)
  const windowStart = await shownPercent(window)
  expect(windowStart).not.toBe(120)

  await window.zoomOut.click()
  await window.zoomOut.click()
  const windowZoomed = await shownPercent(window)
  expect(windowZoomed).toBeLessThan(windowStart)
  await expect(pane.percent).toHaveText('120%')

  await dialog.getByRole('button', { name: editorDict.closePreview, exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(pane.percent).toHaveText('120%')
  await expectPageWidth(pane, 120)

  // Reopened, the window starts at "show all" again.
  const reopened = await openWindow(page)
  await expect(reopened.window.percent).toHaveText(`${windowStart}%`)
  await expect(reopened.window.status).toHaveText('')
})

test('the zoom controls are named in every locale', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id)

  for (const [locale, messages] of Object.entries({ en, fr, de, it })) {
    await test.step(locale, async () => {
      const dict = messages.coverLetters.editor
      await openEditor(page, letterId, locale)
      const pane = surface(`${locale} pane`, page.getByTestId('cover-letter-preview-pane'), dict)
      await expect(pane.controls).toBeVisible()
      for (const button of [pane.zoomOut, pane.zoomIn, pane.showAll]) {
        await expect(button).toBeVisible()
      }
      await expect(pane.status).toHaveAttribute('aria-live', 'polite')
      const before = await shownPercent(pane)
      await pane.zoomIn.click()
      await expect(pane.status).toHaveText(dict.zoomLevel.replace('{percent}', String(Math.floor(before / 10) * 10 + 10)))
    })
  }
})

test('the pane\'s zoom controls are on screen without scrolling the page', async ({ page, authedUser }) => {
  const letterId = await insertLetter(authedUser.id)

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    await test.step(`${viewport.width}x${viewport.height}`, async () => {
      await page.setViewportSize(viewport)
      await openEditor(page, letterId)
      const paneBox = page.getByTestId('cover-letter-preview-pane')
      const pane = paneSurface(page)
      await expect(pane.controls).toBeVisible()

      // Nothing on the page scrolled: neither the document nor the dashboard's own scroll container.
      const scrolled = await page.evaluate(() => ({
        document: document.scrollingElement?.scrollTop ?? 0,
        main: document.querySelector('main')?.scrollTop ?? 0,
      }))
      expect(scrolled).toEqual({ document: 0, main: 0 })

      const expectOnScreen = async (when: string) => {
        const controls = await rect(pane.controls)
        const bounds = await rect(paneBox)
        const label = `${viewport.width}x${viewport.height}, ${when}`
        expect(controls.top, `${label}: controls top`).toBeGreaterThanOrEqual(0)
        expect(controls.left, `${label}: controls left`).toBeGreaterThanOrEqual(0)
        expect(controls.bottom, `${label}: controls bottom`).toBeLessThanOrEqual(viewport.height)
        expect(controls.right, `${label}: controls right`).toBeLessThanOrEqual(viewport.width)
        expect(controls.left, `${label}: controls inside the pane`).toBeGreaterThanOrEqual(bounds.left)
        expect(controls.right, `${label}: controls inside the pane`).toBeLessThanOrEqual(bounds.right)
        expect(controls.bottom, `${label}: controls inside the pane`).toBeLessThanOrEqual(bounds.bottom)
      }

      await expectOnScreen('at the top of the letter')
      await scrollTo(pane.scrollArea, 'end')
      await expect
        .poll(() => pane.scrollArea.evaluate((element) => element.scrollTop), 'the pane scrolls')
        .toBeGreaterThan(0)
      await expectOnScreen('at the end of the letter')
    })
  }
})
