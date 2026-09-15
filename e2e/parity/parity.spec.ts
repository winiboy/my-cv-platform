import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures/auth'
import { seedFixtureResume } from '../fixtures/resume'
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_KEY,
  assertLocalSupabase,
} from '../../src/test/local-stack'
import {
  resolveLayoutModel,
  resolveResumeLayout,
  toStoredLayout,
  type PersistedLayoutSource,
} from '../../src/lib/layout-settings'
import {
  CONTACT_NAME,
  PROFILES,
  TEMPLATE_SPECS,
  describeNonDefault,
  type ProfileId,
} from './profiles'
import { coloursAgree, convertCssColour } from './colour'
import {
  SURFACES,
  TYPOGRAPHY_ELEMENTS,
  buildProbe,
  capturePrint,
  measureDocx,
  measureSettled,
  openPreview,
  pdfTypography,
  type ColourSample,
  type DomMeasurement,
  type Observation,
  type SurfaceId,
  type SurfaceMeasurement,
} from './surfaces'
import {
  KNOWN_EXPECTATIONS,
  buildReport,
  evaluateRow,
  formatReport,
  formatRowLine,
  rowDefinitions,
  type ObservationKey,
} from './verdicts'
import type { ResumeTemplate } from '../../src/types/database'

/**
 * US-008: parity across Preview, PDF and DOCX, demonstrated.
 *
 *   pnpm supabase start
 *   pnpm test:parity
 *
 * NOT A REQUIRED GATE, ON PURPOSE
 *
 * Part 3 enumerates divergences this check exists to report, so it cannot be
 * green until Part 3 is done. It has its own config, port, build directory and
 * output directory, and `playwright.config.ts` ignores `e2e/parity`, so the
 * required `pnpm test:e2e` never collects it.
 *
 * HOW IT RUNS
 *
 *  1. The fixture's layout is shown to differ from the defaults.
 *  2. One COLLECT test per profile and template seeds the fixture resume,
 *     stores the profile's layout, and measures the DOCX, the Preview and the
 *     print rendering plus its PDF. It writes what it measured to
 *     `test-results-parity/observations/` — Playwright empties that directory
 *     at the start of every run, so no row can read a previous run.
 *  3. One ROW test per compared property. Its verdict is a pure function of the
 *     observations (`verdicts.ts`).
 *  4. The REPORT test prints the table and writes `parity-report.json`.
 *
 * EXIT SEMANTICS
 *
 *  - MATCH: the row passes.
 *  - KNOWN: the row is listed in `KNOWN_EXPECTATIONS` and marked `test.fail()`.
 *    It passes only while that exact Part 3 defect reproduces. It stays in the
 *    output under its id, never suppressed.
 *  - A known divergence that stops diverging, or diverges in another way:
 *    Playwright reports "Expected to fail, but passed" — the run exits non-zero.
 *  - NEW: the row fails — the run exits non-zero. Part 3's scope is incomplete.
 *
 * `test.fail()` was chosen over a report with its own exit-code policy because
 * Playwright already enforces both directions natively, per row, with the row
 * named in the failure; a hand-written policy would be one more thing to trust.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? LOCAL_SUPABASE_URL
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY

assertLocalSupabase(SUPABASE_URL, 'E2E parity check')

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

interface StoredRow extends PersistedLayoutSource {
  title: string
}

async function storeLayout(resumeId: string, layout: unknown): Promise<void> {
  const { error } = await admin().from('resumes').update({ layout_settings: layout }).eq('id', resumeId)
  if (error) throw new Error(`Could not store the parity layout: ${error.message}`)
}

async function readStoredRow(resumeId: string): Promise<StoredRow> {
  const { data, error } = await admin()
    .from('resumes')
    .select('title, layout_settings, custom_sections')
    .eq('id', resumeId)
    .single()
  if (error || !data) throw new Error(`Could not read the seeded resume: ${error?.message ?? 'no row'}`)
  return data as StoredRow
}

const observationDirectory = () => path.join(test.info().project.outputDir, 'observations')
const observationPath = (profile: ProfileId, template: ResumeTemplate) =>
  path.join(observationDirectory(), `${profile}__${template}.json`)

function readObservation(profile: ProfileId, template: ResumeTemplate): Observation {
  const file = observationPath(profile, template)
  if (!existsSync(file)) {
    throw new Error(`No observation at ${file}: its collect test did not complete in this run`)
  }
  return JSON.parse(readFileSync(file, 'utf-8')) as Observation
}

function describeSurface(surface: SurfaceId, measurement: SurfaceMeasurement): string[] {
  const t = measurement.typography
  return [
    `${surface}: sections ${measurement.sequence.length} [${measurement.sequence.join(' > ')}]`,
    ...(t
      ? [
          `${surface}: title ${t.documentTitle.halfPoints}hp ${t.documentTitle.colour.hex} ${t.documentTitle.fontFamily} "${t.documentTitle.text}"`,
          `${surface}: heading ${t.sectionHeading.halfPoints}hp ${t.sectionHeading.colour.hex} ${t.sectionHeading.fontFamily} "${t.sectionHeading.text}"`,
          `${surface}: body ${t.bodyText.halfPoints}hp ${t.bodyText.colour.hex} ${t.bodyText.fontFamily}`,
        ]
      : [`${surface}: typography not sampled for this profile`]),
    `${surface}: sidebar ${measurement.sidebarBackground?.hex ?? '-'} accent ${measurement.accent?.hex ?? '-'}`,
    `${surface}: page width ${measurement.pageWidthInches.toFixed(2)}in`,
  ]
}

/**
 * Converts every CSS colour a second time, without the browser, and fails the
 * collect test if the canvas conversion disagrees. Returns one evidence line
 * per colour: the computed string, the canvas result, the independent result.
 */
function checkColourConversions(
  measurements: readonly (readonly [string, DomMeasurement])[],
  model: { sidebar: ColourSample; accent: ColourSample },
): string[] {
  const lines: string[] = []
  const check = (label: string, sample: ColourSample | null) => {
    if (!sample) return
    if (!sample.css) throw new Error(`${label}: the CSS colour string was not recorded`)
    const independent = convertCssColour(sample.css)
    const line =
      `${label}: css "${sample.css}" canvas ${sample.hex} a=${sample.alpha} ` +
      `independent ${independent.hex} a=${independent.alpha}`
    lines.push(line)
    expect(coloursAgree(independent, sample), `Canvas and independent conversion disagree — ${line}`).toBe(true)
  }
  for (const [surface, measurement] of measurements) {
    if (measurement.typography) {
      for (const element of TYPOGRAPHY_ELEMENTS) {
        check(`${surface} ${element}`, measurement.typography[element].colour)
        check(`${surface} ${element} backdrop`, measurement.typography[element].backdrop)
      }
    }
    for (const [key, extra] of Object.entries(measurement.extraColours)) {
      check(`${surface} ${key}`, extra.colour)
      check(`${surface} ${key} backdrop`, extra.backdrop)
    }
    check(`${surface} sidebar background`, measurement.sidebarBackground)
    check(`${surface} accent`, measurement.accent)
  }
  check('model sidebar', model.sidebar)
  check('model accent', model.accent)
  return lines
}

test('the fixture layout differs from DEFAULT_RESUME_LAYOUT on every required property', () => {
  const primary = PROFILES.find((profile) => profile.id === 'primary')
  if (!primary) throw new Error('No primary profile')
  const lines = describeNonDefault(primary.layout)
  for (const line of lines) {
    console.log(
      `${line.differs ? 'differs ' : 'SAME    '} ${line.property}: default ${line.defaultValue} -> seeded ${line.seededValue}` +
        (line.required ? ' (required)' : ''),
    )
  }
  const required = lines.filter((line) => line.required)
  expect(required.map((line) => line.property)).toEqual([
    'mainContentOrder',
    'sidebarOrder',
    'hiddenMainSections',
    'hiddenSidebarSections',
    'fontScale',
    'sidebar colour',
  ])
  for (const line of lines) {
    expect(line.differs, `${line.property} must differ from its default`).toBe(true)
  }
})

for (const profile of PROFILES) {
  for (const template of profile.templates) {
    test(`collect · ${profile.id} · ${template}`, async ({ page, authedUser }) => {
      const spec = TEMPLATE_SPECS[template]
      const expectedModel = resolveLayoutModel(profile.layout)

      // Nothing in the profile may be discarded by the parse, or the check
      // would be measuring a layout other than the one it claims.
      expect(toStoredLayout(expectedModel)).toEqual(profile.layout)

      const resume = await seedFixtureResume(authedUser.id, template)
      await storeLayout(resume.id, profile.layout)
      const stored = await readStoredRow(resume.id)
      expect(resolveResumeLayout(stored, null)).toEqual(expectedModel)

      // Control profiles are sampled for typography too: primary rows read them.
      const sampleTypography = profile.rowGroups.includes('typography') || profile.control === true
      const probe = buildProbe(
        spec,
        spec.titleSource === 'contactName' ? CONTACT_NAME : stored.title,
        sampleTypography,
        expectedModel,
      )

      // DOCX first: before the Preview mounts and can write the account.
      const response = await page.request.get(`/api/resumes/${resume.id}/download-docx?locale=en`)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('wordprocessingml')
      const docx = await measureDocx(await response.body(), probe)

      await openPreview(page, resume.id)
      const preview = await measureSettled(page, probe)
      const { print, pdf } = await capturePrint(page, probe)
      const colours = preview.modelColours

      // The Preview's account writer must not have changed what the model says.
      expect(resolveResumeLayout(await readStoredRow(resume.id), null)).toEqual(expectedModel)

      // Nothing below may be a verdict over empty input.
      expect(docx.paragraphCount, 'DOCX paragraphs read').toBeGreaterThan(0)
      expect(docx.runCount, 'DOCX runs read').toBeGreaterThan(0)
      expect(docx.sequence.length, 'DOCX sections located').toBeGreaterThan(0)
      expect(preview.renderedHeadingCount, 'Preview headings rendered').toBeGreaterThan(0)
      expect(preview.sequence.length, 'Preview sections located').toBeGreaterThan(0)
      expect(print.sequence.length, 'print sections located').toBeGreaterThan(0)
      expect(pdf.pages, 'PDF pages').toBeGreaterThan(0)
      expect(pdf.characters, 'PDF text characters').toBeGreaterThan(0)
      expect(pdf.sequence.length, 'PDF sections located').toBeGreaterThan(0)
      if (sampleTypography) {
        expect(preview.typography, 'Preview typography sampled').not.toBeNull()
        expect(pdf.samples, 'PDF typography read from the PDF').not.toBeNull()
        expect(docx.typography, 'DOCX typography sampled').not.toBeNull()
      }
      expect(Object.keys(docx.extraColours).sort(), 'DOCX extra colour samples').toEqual(
        spec.extraColourSamples.map((extra) => extra.key).sort(),
      )
      // A rendered heading no locator claims is a section this check cannot see.
      expect(preview.unclaimedHeadings, 'Preview headings with no section locator').toEqual([])
      expect(print.unclaimedHeadings, 'print headings with no section locator').toEqual([])

      const colourChecks = checkColourConversions(
        [
          ['preview', preview],
          ['print', print],
        ],
        colours,
      )

      const surfaces: Record<SurfaceId, SurfaceMeasurement> = {
        preview: {
          sequence: preview.sequence,
          typography: preview.typography,
          extraColours: preview.extraColours,
          sidebarBackground: preview.sidebarBackground,
          accent: preview.accent,
          pageWidthInches: preview.pageWidthInches,
        },
        // Order, presence, page size, font size and embedded font from the PDF bytes;
        // colour, letter spacing and line height from the print rendering it was made from.
        pdf: {
          sequence: pdf.sequence,
          typography: pdfTypography(print, pdf),
          extraColours: print.extraColours,
          sidebarBackground: print.sidebarBackground,
          accent: print.accent,
          pageWidthInches: pdf.pageWidthInches,
        },
        docx: {
          sequence: docx.sequence,
          typography: docx.typography,
          extraColours: docx.extraColours,
          sidebarBackground: docx.sidebarBackground,
          accent: docx.accent,
          pageWidthInches: docx.pageWidthInches,
        },
      }

      const browserVersion = page.context().browser()?.version()
      if (!browserVersion) throw new Error('The browser did not report its version')

      const observation: Observation = {
        profile: profile.id,
        template,
        environment: { browserVersion },
        model: expectedModel,
        modelColours: colours,
        surfaces,
        colourChecks,
        evidence: {
          preview: [
            ...describeSurface('preview', surfaces.preview),
            `preview: ${preview.renderedHeadingCount} rendered h2, screen media, controls off`,
          ],
          pdf: [
            ...describeSurface('pdf', surfaces.pdf),
            `pdf: ${pdf.pages} page(s), ${pdf.characters} text characters; styles from print media, controls as shipped (${print.renderedHeadingCount} rendered h2)`,
          ],
          docx: [
            ...describeSurface('docx', surfaces.docx),
            `docx: ${docx.paragraphCount} paragraphs, ${docx.runCount} runs`,
          ],
        },
      }

      for (const surface of SURFACES) {
        for (const line of observation.evidence[surface]) console.log(`${profile.id} · ${template} · ${line}`)
      }
      console.log(`${profile.id} · ${template} · model colours sidebar ${colours.sidebar.hex} accent ${colours.accent.hex}`)
      for (const line of colourChecks) console.log(`${profile.id} · ${template} · colour check ${line}`)

      mkdirSync(observationDirectory(), { recursive: true })
      writeFileSync(observationPath(profile.id, template), `${JSON.stringify(observation, null, 2)}\n`)
    })
  }
}

for (const row of rowDefinitions()) {
  const known = KNOWN_EXPECTATIONS[row.id]
  test(`row · ${row.id}${known ? ` · expects KNOWN ${known}` : ''}`, () => {
    // Read every input before `test.fail()`: a missing observation must fail as
    // itself, not be absorbed as an expected failure.
    const inputs = new Map(row.inputs.map((key) => [`${key.profile}/${key.template}`, readObservation(key.profile, key.template)]))
    const resolve = (key: ObservationKey) => {
      const observation = inputs.get(`${key.profile}/${key.template}`)
      if (!observation) throw new Error(`${row.id} read an observation it did not declare: ${key.profile}/${key.template}`)
      return observation
    }
    const evaluated = evaluateRow(row, resolve)
    console.log(formatRowLine(evaluated))

    if (known) {
      test.fail(true, `KNOWN ${known}: expected to diverge until Part 3 closes it`)
      if (evaluated.verdict === `KNOWN: ${known}`) {
        throw new Error(`Expected divergence reproduced — ${formatRowLine(evaluated)}`)
      }
      console.log(
        `NOT REPRODUCED: ${row.id} was expected to show ${known} but its verdict is ${evaluated.verdict}. ` +
          'If Part 3 fixed it, delete the entry from KNOWN_EXPECTATIONS.',
      )
      return
    }

    // Only MATCH passes. There is no verdict a row can reach that passes by default.
    expect(
      evaluated.verdict,
      `${evaluated.verdict === 'NEW' ? 'NEW DIVERGENCE — Part 3 does not name it. ' : ''}${formatRowLine(evaluated)}`,
    ).toBe('MATCH')
  })
}

test('report', () => {
  const observations = PROFILES.flatMap((profile) =>
    profile.templates.map((template) => readObservation(profile.id, template)),
  )
  // Host facts that are stable on one machine; nothing per-run (no hostname, time or user).
  const report = buildReport(observations, {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    node: process.version,
  })
  expect(report.rows.length).toBeGreaterThan(0)

  console.log(formatReport(report))
  const file = path.join(test.info().project.outputDir, 'parity-report.json')
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Machine-readable report: ${file}`)
})
