# PRD: Modern Word export — the sidebar colour reaches the bottom of every page, on screen as in print

**Status:** APPROVED 2026-10-11

## Objective

When a multi-page CV with the Modern template is opened in Microsoft Word, the
sidebar column shows one uniform sidebar colour from the top to the bottom of
every page. This holds in Word's on-screen Print Layout view, in print, and in
Word's PDF export.

## Context / Current Behavior

- **Owner report, 2026-10-11.** A screenshot of a 2-page Modern CV in Word
  (Print Layout, "text boundaries" dashed lines visible) shows the dark blue
  sidebar stopping a few millimetres above the bottom of pages 1 and 2. A
  **lighter blue** band fills the remaining strip at the bottom of both pages.
- **How the export paints the sidebar today** (`src/app/api/resumes/[id]/download-docx/docx-modern.ts`):
  - The page is exact A4 (16838 twips) with all margins 0 (`:2087-2111`).
  - The body is one 2-column table row that may break across pages
    (`cantSplit: false`, `ATLEAST` height, `:2017-2056`). The sidebar cell is
    shaded with the sidebar colour (`:1940-1959`).
  - **Why the cell alone is not enough.** In Word a cell's shading ends at the
    last line placed on that page, so it stops short. This was measured on
    page 1 at 1105 of 1123 px (`docs/engineering/docx-word-parity.md:170-173`).
  - **What #88 added to cover the gap.** PR #88 (edc4947) added a
    `sidebarFillHeader` (`:1989-2015`): a page-sized solid-colour PNG, floating
    behind the text at page (0,0) in the **default header**, so it repeats on
    every page.
- **Likely cause of the lighter band.** This is a hypothesis to confirm in
  US-001. In Print Layout, Word displays header content **dimmed** while the
  body is being edited. Where the cell shading stops, the user sees the dimmed
  header picture as a lighter band. Print and PDF export are not dimmed, which
  is why the COM-PDF measuring method in `docx-word-parity.md` (`:42-56`) never
  showed it. An alternative cause would be a file generated before #88: no
  header picture and a 0.33" bottom cell margin, which gives a **white** band.
- **Preview and PDF from the app.** On print, the sidebar fills every page
  except the last top to bottom; on the last page it stops where the content
  ends (`modern-template.tsx:721-743`, `globals.css:399-448`). The Word header
  picture already paints the full height of the last page as well.
- **Tests that pin the current construction.**
  - `docx-modern-geometry.test.ts:451-466`: page size, a default header
    reference, a header `wp:anchor` behind the document at page (0,0) with the
    sidebar extent, and the header PNG equal to the cell colour.
  - `e2e/docx-modern-photo.spec.ts:116-127`: exactly one `wp:anchor` in
    `document.xml`, the photo.
- **Library capabilities.** `docx` 9.7.2 supports floating images, `WpsShapeRun`
  (a filled shape, `index.d.ts:3196-3204`), and `DocumentBackground`
  (`w:background`, a whole-page colour that Word does not print by default).

## Scope

- **US-001, diagnose.** Diagnose the owner's symptom on the current export, in
  Word's screen view as well as in print and PDF.
- **US-002, fix.** Fix the Modern Word export so the sidebar colour is uniform
  and full-height on every page in all three views. That includes the last
  page, as the owner's screenshot expects.
- Keep the rest of the Modern Word layout unchanged: text positions, photo,
  sections, widths, colours.

## Out of Scope

- Professional, Classic, Minimal and Creative exports.
- Preview and PDF (print) behaviour in the app.
- Word for Mac, Word Online, LibreOffice and Google Docs rendering, beyond
  recording what was observed if checked.

## Impact Assessment

- **Frontend / UI:** Not affected.
- **Internationalization:** Not affected.
- **Resume model / templates:** Not affected (DOCX generator only).
- **Exports:** Affected. Modern DOCX.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected.
- **Testing / validation:** Affected. Word on-screen and Word-PDF evidence,
  geometry tests updated only where the construction changes.

## User Stories

### US-001: The cause of the short / lighter sidebar is proven on the current export

**Description:**
As the owner, I want to know exactly why the sidebar looks short in Word, so
that the fix targets the real cause.

**Acceptance Criteria:**

- [ ] **Reproduce.** A 2-page Modern CV exported from the current `main` is
      opened in Word desktop (Windows). A screen capture of Print Layout at
      both page bottoms is recorded.
- [ ] **Compare with print.** Word's own PDF export of the same file (the
      `docx-word-parity.md` COM method) is rasterised. The sidebar colour at the
      bottom 40 px of pages 1 and 2 is measured and recorded.
- [ ] **Cause.** The cause of the lighter or white band is stated with
      evidence: a dimmed header picture, an old file, or another cause.
- [ ] **Owner's file.** If the owner provides the `.docx` from the screenshot,
      whether it contains `word/header1.xml` with the full-page picture is
      recorded.

### US-002: The sidebar is one uniform colour down to the bottom of every page in Word

**Description:**
As a user opening my Modern CV in Word, I want the blue sidebar to run
uniformly from top to bottom on every page, so that the document looks as
designed on screen and when printed.

**Acceptance Criteria:**

- [ ] **On screen.** In Word desktop Print Layout, on a 2-page and a 3-page
      Modern CV, the sidebar column on every page is the sidebar colour from
      the top edge to the bottom edge. There is no lighter or white band.
      Screen captures of every page bottom are recorded.
- [ ] **PDF export.** In Word's PDF export of the same files, every sampled
      pixel in the sidebar column (x within the sidebar width, y from 0 to page
      height − 1) on every page is within 1 channel level of the sidebar colour.
- [ ] **Printing.** Word printing with default options shows the same as the
      PDF export.
- [ ] **One-page CV.** A one-page Modern CV still renders exactly as today: the
      Word-PDF raster is identical within the existing Word-parity tolerances.
- [ ] **Rest of the layout.** Text, photo and section positions in the Word-PDF
      are unchanged within ±1.5 px (`docx-word-parity.md` method). The main
      column stays white.
- [ ] **Tests.** Geometry tests are updated only where the sidebar-fill
      construction changes, and assert the new construction. All other DOCX
      tests pass unmodified.

## Functional Requirements

- **FR-1:** Only `docx-modern.ts`, and helpers it alone uses, change in `src/`.
- **FR-2:** No new dependency (`docx` 9.7.2 APIs or raw OOXML through it).
- **FR-3:** The fill colour comes from the same sidebar colour source as the
  cell shading (one source).
- **FR-4:** The fix must not rely on Word's "print background colours and
  images" option being turned on.

## Regression Constraints

- Professional, Classic, Minimal and Creative DOCX are byte-identical (hashes
  recorded).
- `pnpm test:parity` keeps 0 NEW and its current KNOWN set; local report hash
  unchanged, unless a Modern DOCX row legitimately changes, which must be
  explained.
- The Modern photo, contact rows, banners and fonts are unchanged.

## Required Verification

- The `CLAUDE.md` §14 baseline, plus `pnpm test:parity`.
- Export validation:
  - Word COM PDF rasters of 1-, 2- and 3-page Modern CVs, before and after;
  - Word screen captures of every page bottom in Print Layout;
  - DOCX hashes of the other templates.
- `code-reviewer`. `ui-expert` on the Word screen captures and PDF rasters.

## FAIL Conditions

- Any lighter, darker or white band in the sidebar column on any page, on
  screen or in PDF.
- A one-page CV changes, or the other templates' DOCX change.
- The fix only works with Word's background-printing option enabled.

## BLOCKER Conditions

- **No Word to test with.** Word desktop is not available to capture the
  screen view. Report it; on-screen evidence would then come from the owner.
- **Word cannot do it.** No construction available in OOXML gives a uniform
  full-height column in Word's screen view and print at the same time. Report
  the candidates tried with evidence; the owner decides.

## Risks

- Header content is always dimmed on screen while editing the body, so the fix
  may need the colour to come from the body itself. Content-dependent page
  counts make per-page body shapes fragile, which US-001 and US-002 must weigh.
- LibreOffice and Google Docs may render a new construction differently. Out of
  scope, but worth recording.

## Evidence / References

- Owner screenshot, 2026-10-11: a 2-page Modern CV in Word with a lighter band
  at the bottom of the sidebar on pages 1 and 2.
- `docx-modern.ts:546, 827-867, 1940-2115`; `docx-disc.ts:112-144`.
- `docs/engineering/docx-word-parity.md:42-56, 150-182, 214-221`.
- `docx-modern-geometry.test.ts:212, 451-466`; `e2e/docx-modern-photo.spec.ts:116-127`.
- `modern-template.tsx:721-743`; `globals.css:399-448`.

## Open Questions

- None blocking. If the owner can share the `.docx` from the screenshot, US-001
  uses it.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
