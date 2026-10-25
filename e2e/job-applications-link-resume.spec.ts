import { test, expect, createTestUser, deleteTestUser } from './fixtures/auth'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Locator, Page } from '@playwright/test'
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, assertLocalSupabase } from '../src/test/local-stack'
import frCommon from '../src/locales/fr/common.json'
import deCommon from '../src/locales/de/common.json'

/**
 * "Lier un CV existant" from a Kanban card (job-cv-linking US-002).
 *
 * WHAT IS REAL
 * The board, the card menu, the dialog, `GET /api/resumes`,
 * `POST /api/job-applications/[id]/link-resume`, the session, RLS and the rows
 * in the local Supabase stack. Nothing is stubbed. Rows are seeded for the
 * signed-in user (and, for the forged requests, a second user) through the
 * service-role client.
 *
 * WHAT IS ASSERTED
 * In fr and de: linking a CV to a card without one, replacing a linked CV, and
 * taking a CV from another card update the badges without a reload, and the
 * rows point to each other both ways with no stale link left. A user without
 * CVs sees the localized empty state and its link. The menu item and the
 * dialog work from the keyboard, and Escape gives focus back to the menu
 * button. Forged requests naming another user's CV or application answer 404
 * and change nothing.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E job applications link resume spec')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

test.use({ timezoneId: 'Europe/Zurich', viewport: { width: 1440, height: 900 } })

const COMMON = { fr: frCommon, de: deCommon } as const
type TestLocale = keyof typeof COMMON

interface Seeded {
  id: string
  title: string
}

interface SeededApplication {
  id: string
  jobTitle: string
  company: string
}

async function seedApplication(userId: string, jobTitle: string, company: string): Promise<SeededApplication> {
  const { data, error } = await admin()
    .from('job_applications')
    .insert({ user_id: userId, job_title: jobTitle, company_name: company, status: 'saved' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not seed an application: ${error?.message}`)
  return { id: data.id as string, jobTitle, company }
}

async function seedResume(userId: string, title: string, updatedAt: string): Promise<Seeded> {
  const { data, error } = await admin()
    .from('resumes')
    .insert({ user_id: userId, title, template: 'classic', updated_at: updatedAt })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not seed a resume: ${error?.message}`)
  return { id: data.id as string, title }
}

/** Link both ways, as the resume editor would have. */
async function seedLink(application: SeededApplication, resume: Seeded): Promise<void> {
  const db = admin()
  const { error: resumeError } = await db.from('resumes').update({ job_application_id: application.id }).eq('id', resume.id)
  const { error: applicationError } = await db.from('job_applications').update({ resume_id: resume.id }).eq('id', application.id)
  if (resumeError || applicationError) throw new Error('Could not seed a link')
}

async function applicationResumeId(id: string): Promise<string | null> {
  const { data, error } = await admin().from('job_applications').select('resume_id').eq('id', id).single()
  if (error) throw new Error(`Could not read the application: ${error.message}`)
  return (data.resume_id as string | null) ?? null
}

async function resumeApplicationId(id: string): Promise<string | null> {
  const { data, error } = await admin().from('resumes').select('job_application_id').eq('id', id).single()
  if (error) throw new Error(`Could not read the resume: ${error.message}`)
  return (data.job_application_id as string | null) ?? null
}

function card(page: Page, locale: TestLocale, application: SeededApplication): Locator {
  const name = COMMON[locale].kanban.card.ariaLabel
    .replace('{title}', application.jobTitle)
    .replace('{company}', application.company)
  return page.getByRole('button', { name, exact: true })
}

function badge(page: Page, locale: TestLocale, application: SeededApplication, resumeId: string): Locator {
  return card(page, locale, application).locator(`a[href="/${locale}/dashboard/resumes/${resumeId}/edit"]`)
}

function linkDialog(page: Page, locale: TestLocale): Locator {
  return page.getByRole('dialog', { name: COMMON[locale].kanban.linkResume.title, exact: true })
}

async function gotoBoard(page: Page, locale: TestLocale): Promise<void> {
  const response = await page.goto(`/${locale}/dashboard/job-applications`)
  expect(response?.status()).toBe(200)
  // A marker that a reload or a navigation would wipe.
  await page.evaluate(() => {
    ;(window as unknown as { __boardSession?: boolean }).__boardSession = true
  })
}

async function expectNoReload(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as unknown as { __boardSession?: boolean }).__boardSession)).toBe(true)
}

async function openLinkDialog(page: Page, locale: TestLocale, application: SeededApplication): Promise<Locator> {
  const c = COMMON[locale].kanban.card
  await card(page, locale, application).getByRole('button', { name: c.moreActions, exact: true }).click()
  await page.getByRole('menu', { name: c.menuLabel, exact: true }).getByRole('menuitem', { name: c.linkResume, exact: true }).click()
  const dialog = linkDialog(page, locale)
  await expect(dialog).toBeVisible()
  return dialog
}

/** Pick the CV by title and confirm. */
async function linkFromDialog(page: Page, locale: TestLocale, dialog: Locator, resume: Seeded): Promise<void> {
  await dialog.locator('label', { hasText: resume.title }).getByRole('radio').check()
  const linked = page.waitForResponse((res) => /\/api\/job-applications\/[^/]+\/link-resume$/.test(new URL(res.url()).pathname))
  await dialog.getByRole('button', { name: COMMON[locale].kanban.linkResume.confirm, exact: true }).click()
  expect((await linked).status()).toBe(200)
  await expect(dialog).toBeHidden()
}

for (const locale of ['fr', 'de'] as const) {
  test(`${locale}: a CV linked to a card without one shows its badge, linked both ways`, async ({ page, authedUser }) => {
    const application = await seedApplication(authedUser.id, 'Produktdesigner', 'Beispiel AG')
    const older = await seedResume(authedUser.id, 'CV Älter', '2026-01-01T00:00:00Z')
    const newer = await seedResume(authedUser.id, 'CV Neuer', '2026-06-01T00:00:00Z')

    await gotoBoard(page, locale)
    const dialog = await openLinkDialog(page, locale, application)

    // The user's CVs, most recently updated first; none marked as linked.
    await expect(dialog.getByRole('radio')).toHaveCount(2)
    const titles = await dialog.locator('label').evaluateAll((labels) => labels.map((label) => label.textContent ?? ''))
    expect(titles).toHaveLength(2)
    expect(titles[0]).toContain(newer.title)
    expect(titles[1]).toContain(older.title)
    await expect(dialog.getByText(COMMON[locale].kanban.linkResume.current, { exact: true })).toHaveCount(0)

    await linkFromDialog(page, locale, dialog, older)

    await expect(badge(page, locale, application, older.id)).toBeVisible()
    await expect(badge(page, locale, application, older.id)).toContainText(older.title)
    await expectNoReload(page)
    expect(await applicationResumeId(application.id)).toBe(older.id)
    expect(await resumeApplicationId(older.id)).toBe(application.id)
    expect(await resumeApplicationId(newer.id)).toBeNull()
  })

  test(`${locale}: replacing the linked CV clears the old one and changes the badge`, async ({ page, authedUser }) => {
    const application = await seedApplication(authedUser.id, 'Datenanalyst', 'Muster GmbH')
    const old = await seedResume(authedUser.id, 'CV Alt', '2026-01-01T00:00:00Z')
    const replacement = await seedResume(authedUser.id, 'CV Ersatz', '2026-02-01T00:00:00Z')
    await seedLink(application, old)

    await gotoBoard(page, locale)
    await expect(badge(page, locale, application, old.id)).toBeVisible()
    const dialog = await openLinkDialog(page, locale, application)

    // The current CV is marked, on its own entry.
    await expect(
      dialog.locator('label', { hasText: old.title }).getByText(COMMON[locale].kanban.linkResume.current, { exact: true })
    ).toBeVisible()
    await expect(dialog.getByText(COMMON[locale].kanban.linkResume.current, { exact: true })).toHaveCount(1)

    await linkFromDialog(page, locale, dialog, replacement)

    await expect(badge(page, locale, application, replacement.id)).toBeVisible()
    await expect(badge(page, locale, application, old.id)).toHaveCount(0)
    await expectNoReload(page)
    expect(await applicationResumeId(application.id)).toBe(replacement.id)
    expect(await resumeApplicationId(replacement.id)).toBe(application.id)
    // The old CV is kept, no longer linked.
    expect(await resumeApplicationId(old.id)).toBeNull()
  })

  test(`${locale}: a CV taken from another card leaves that card without a badge`, async ({ page, authedUser }) => {
    const target = await seedApplication(authedUser.id, 'Entwicklerin', 'Ziel AG')
    const other = await seedApplication(authedUser.id, 'Analystin', 'Andere AG')
    const resume = await seedResume(authedUser.id, 'CV Wandernd', '2026-03-01T00:00:00Z')
    await seedLink(other, resume)

    await gotoBoard(page, locale)
    await expect(badge(page, locale, other, resume.id)).toBeVisible()
    const dialog = await openLinkDialog(page, locale, target)
    await linkFromDialog(page, locale, dialog, resume)

    await expect(badge(page, locale, target, resume.id)).toBeVisible()
    await expect(badge(page, locale, other, resume.id)).toHaveCount(0)
    await expectNoReload(page)
    expect(await applicationResumeId(target.id)).toBe(resume.id)
    expect(await applicationResumeId(other.id)).toBeNull()
    expect(await resumeApplicationId(resume.id)).toBe(target.id)
  })

  test(`${locale}: a user without CVs sees the empty state and its link`, async ({ page, authedUser }) => {
    const application = await seedApplication(authedUser.id, 'Projektleiter', 'Leer AG')

    await gotoBoard(page, locale)
    const dialog = await openLinkDialog(page, locale, application)

    await expect(dialog.getByText(COMMON[locale].kanban.linkResume.empty, { exact: true })).toBeVisible()
    const create = dialog.getByRole('link', { name: COMMON[locale].kanban.card.createCV, exact: true })
    await expect(create).toHaveAttribute('href', `/${locale}/dashboard/resumes/new?jobApplicationId=${application.id}`)
    await expect(dialog.getByRole('button', { name: COMMON[locale].kanban.linkResume.confirm, exact: true })).toHaveCount(0)
  })
}

for (const locale of ['fr', 'de'] as const) {
  test(`${locale}: the menu item and the dialog work from the keyboard; Escape returns focus to the menu button`, async ({
    page,
    authedUser,
  }) => {
    const c = COMMON[locale].kanban
    const application = await seedApplication(authedUser.id, 'Designer', 'Clavier SA')
    // A second card in the same column: the board's own arrow-key navigation
    // must not take the keys the open menu uses.
    await seedApplication(authedUser.id, 'Voisin', 'Voisine SA')
    const resume = await seedResume(authedUser.id, 'CV Clavier', '2026-04-01T00:00:00Z')

    await gotoBoard(page, locale)
    const menuButton = card(page, locale, application).getByRole('button', { name: c.card.moreActions, exact: true })
    await menuButton.focus()
    // Space opens the card's menu, its first item focused.
    await page.keyboard.press('Space')
    const menu = page.getByRole('menu', { name: c.card.menuLabel, exact: true })
    await expect(menu.getByRole('menuitem').first()).toBeFocused()

    // "Lier un CV existant" sits directly below "Créer un CV pour ce poste".
    const items = await menu.getByRole('menuitem').allTextContents()
    expect(items.map((text) => text.trim())).toEqual([
      c.card.edit,
      c.card.createCV,
      c.card.linkResume,
      c.card.createCoverLetter,
      c.card.delete,
    ])

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: c.card.linkResume, exact: true })).toBeFocused()
    await page.keyboard.press('Enter')

    const dialog = linkDialog(page, locale)
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard/job-applications$`))
    // Focus is inside the dialog, on the CV list once loaded.
    await expect(dialog.getByRole('radio')).toBeFocused()

    // Tab stays inside the dialog.
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(menuButton).toBeFocused()
    expect(await applicationResumeId(application.id)).toBeNull()
    expect(await resumeApplicationId(resume.id)).toBeNull()
  })
}

for (const locale of ['fr', 'de'] as const) {
  test(`${locale}: a failed link shows the error in the dialog and changes nothing`, async ({ page, authedUser }) => {
    const k = COMMON[locale].kanban
    const application = await seedApplication(authedUser.id, 'Konstrukteur', 'Fehler AG')
    const linked = await seedResume(authedUser.id, 'CV Verknüpft', '2026-01-01T00:00:00Z')
    const other = await seedResume(authedUser.id, 'CV Anderer', '2026-02-01T00:00:00Z')
    await seedLink(application, linked)

    // The link request is held, then answered with a 500.
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/job-applications/*/link-resume', async (route) => {
      await held
      await route.fulfill({ status: 500, json: { error: 'Failed to link resume' } })
    })

    await gotoBoard(page, locale)
    await expect(badge(page, locale, application, linked.id)).toBeVisible()
    const dialog = await openLinkDialog(page, locale, application)
    await dialog.locator('label', { hasText: other.title }).getByRole('radio').check()
    const request = page.waitForRequest((req) => req.url().endsWith('/link-resume') && req.method() === 'POST')
    await dialog.getByRole('button', { name: k.linkResume.confirm, exact: true }).click()
    await request

    // While the request is in flight the busy state shows and nothing closes
    // the dialog: Escape, an outside click, the close button and Cancel.
    await expect(dialog.getByRole('button', { name: k.linkResume.linking, exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await page.mouse.click(5, 5)
    await expect(dialog.getByRole('button', { name: COMMON[locale].common.cancel, exact: true }).first()).toBeDisabled()
    await expect(dialog.getByRole('button', { name: COMMON[locale].common.cancel, exact: true }).last()).toBeDisabled()
    await expect(dialog).toBeVisible()

    release()

    await expect(dialog.getByRole('alert')).toHaveText(k.linkResume.linkError)
    // The error takes the focus the disabled confirm button dropped, and the
    // next Tab lands on a control inside the dialog.
    await expect(dialog.getByRole('alert')).toBeFocused()
    await page.keyboard.press('Tab')
    expect(
      await dialog.evaluate(
        (element) =>
          element.contains(document.activeElement) &&
          document.activeElement instanceof HTMLElement &&
          document.activeElement.matches('button, input, a[href]')
      )
    ).toBe(true)
    await expect(dialog).toBeVisible()
    await expect(badge(page, locale, application, linked.id)).toBeVisible()
    await expect(badge(page, locale, application, other.id)).toHaveCount(0)
    await expectNoReload(page)

    expect(await applicationResumeId(application.id)).toBe(linked.id)
    expect(await resumeApplicationId(linked.id)).toBe(application.id)
    expect(await resumeApplicationId(other.id)).toBeNull()
  })
}

test("forged requests naming another user's CV or application answer 404 and change nothing", async ({
  page,
  authedUser,
}) => {
  const stranger = await createTestUser()
  try {
    const own = await seedApplication(authedUser.id, 'Eigene Stelle', 'Eigen AG')
    const ownResume = await seedResume(authedUser.id, 'Eigener CV', '2026-05-01T00:00:00Z')
    const foreignApplication = await seedApplication(stranger.id, 'Fremde Stelle', 'Fremd AG')
    const foreignResume = await seedResume(stranger.id, 'Fremder CV', '2026-05-01T00:00:00Z')
    await seedLink(foreignApplication, foreignResume)

    // The session of the signed-in user, as the page's own requests carry it.
    await gotoBoard(page, 'fr')

    const foreignCv = await page.request.post(`/api/job-applications/${own.id}/link-resume`, {
      data: { resumeId: foreignResume.id },
    })
    expect(foreignCv.status()).toBe(404)

    const foreignCard = await page.request.post(`/api/job-applications/${foreignApplication.id}/link-resume`, {
      data: { resumeId: ownResume.id },
    })
    expect(foreignCard.status()).toBe(404)

    expect(await applicationResumeId(own.id)).toBeNull()
    expect(await resumeApplicationId(ownResume.id)).toBeNull()
    expect(await applicationResumeId(foreignApplication.id)).toBe(foreignResume.id)
    expect(await resumeApplicationId(foreignResume.id)).toBe(foreignApplication.id)

    // And the stranger's CVs are never listed.
    const list = await page.request.get('/api/resumes')
    expect(list.status()).toBe(200)
    const { resumes } = (await list.json()) as { resumes: Array<{ id: string }> }
    expect(resumes.map((resume) => resume.id)).toEqual([ownResume.id])
  } finally {
    await deleteTestUser(stranger.id)
  }
})

for (const locale of ['fr', 'de'] as const) {
  test(`${locale}: at 375px the card menu is not clipped by the board`, async ({ page, authedUser }) => {
    const c = COMMON[locale].kanban.card
    const viewport = { width: 375, height: 812 }
    await page.setViewportSize(viewport)
    const application = await seedApplication(authedUser.id, 'Mobile', 'Petit SA')

    await gotoBoard(page, locale)
    await card(page, locale, application).getByRole('button', { name: c.moreActions, exact: true }).click()
    const menu = page.getByRole('menu', { name: c.menuLabel, exact: true })
    await expect(menu).toBeVisible()

    const items = menu.getByRole('menuitem')
    await expect(items).toHaveCount(5)
    for (let index = 0; index < 5; index += 1) {
      const box = await items.nth(index).boundingBox()
      expect(box, `menu item ${index}`).not.toBeNull()
      if (!box) continue
      expect(box.x, `menu item ${index} left`).toBeGreaterThanOrEqual(0)
      expect(box.y, `menu item ${index} top`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `menu item ${index} right`).toBeLessThanOrEqual(viewport.width)
      expect(box.y + box.height, `menu item ${index} bottom`).toBeLessThanOrEqual(viewport.height)
    }
    // Not clipped by the board's scroll container either: each item is the
    // topmost element at its own centre.
    const covered = await items.evaluateAll((elements) =>
      elements
        .map((element, index) => {
          const rect = element.getBoundingClientRect()
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          return hit && element.contains(hit) ? null : index
        })
        .filter((index) => index !== null)
    )
    expect(covered).toEqual([])
    await expect(menu.getByRole('menuitem', { name: c.linkResume, exact: true })).toBeInViewport({ ratio: 1 })
  })
}

test.describe('fr: the portaled card menu', () => {
  const locale = 'fr'
  const c = COMMON[locale].kanban

  async function openMenuFromKeyboard(page: Page, application: SeededApplication): Promise<{ menuButton: Locator; menu: Locator }> {
    const menuButton = card(page, locale, application).getByRole('button', { name: c.card.moreActions, exact: true })
    await menuButton.focus()
    await page.keyboard.press('Space')
    const menu = page.getByRole('menu', { name: c.card.menuLabel, exact: true })
    await expect(menu.getByRole('menuitem').first()).toBeFocused()
    return { menuButton, menu }
  }

  test('Enter on "Créer un CV pour ce poste" opens the new-CV page, not the detail page', async ({ page, authedUser }) => {
    const application = await seedApplication(authedUser.id, 'Comptable', 'Entrée SA')
    await gotoBoard(page, locale)
    const { menu } = await openMenuFromKeyboard(page, application)

    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: c.card.createCV, exact: true })).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(`/${locale}/dashboard/resumes/new?jobApplicationId=${application.id}`)
  })

  test('Tab from the open menu closes it and continues from the menu button', async ({ page, authedUser }) => {
    const application = await seedApplication(authedUser.id, 'Juriste', 'Tabulation SA')
    await gotoBoard(page, locale)
    const { menuButton, menu } = await openMenuFromKeyboard(page, application)

    await page.keyboard.press('Tab')

    await expect(menu).toHaveCount(0)
    // Focus is on the menu button or on a control after it, never back at
    // the top of the page or past the end of <body>.
    expect(
      await menuButton.evaluate((button) => {
        const active = document.activeElement
        if (!active || active === document.body) return false
        return active === button || (button.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      })
    ).toBe(true)
  })

  test('the menu closes when the window is resized', async ({ page, authedUser }) => {
    const application = await seedApplication(authedUser.id, 'Architecte', 'Fenêtre SA')
    await gotoBoard(page, locale)
    const { menu } = await openMenuFromKeyboard(page, application)

    await page.setViewportSize({ width: 1280, height: 900 })

    await expect(menu).toHaveCount(0)
  })

  test('the menu closes when the board scrolls', async ({ page, authedUser }) => {
    // Narrow enough for the board's seven columns to scroll horizontally.
    await page.setViewportSize({ width: 1024, height: 900 })
    const application = await seedApplication(authedUser.id, 'Géomètre', 'Défilement SA')
    await gotoBoard(page, locale)
    const board = page.getByRole('region', { name: c.board.ariaLabel, exact: true })
    expect(await board.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    const { menu } = await openMenuFromKeyboard(page, application)

    await board.evaluate((element) => {
      element.scrollLeft += 120
    })

    await expect(menu).toHaveCount(0)
  })
})
