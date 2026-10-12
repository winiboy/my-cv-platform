# PRD: Page-break indicator in the resume previews

**Status:** APPROVED 2026-10-12

## Objective

In both the editor's live preview and the full Preview page, the user sees exactly where each printed A4 page ends and the next one begins. The marking stays discreet and follows every change to the CV content or layout without a reload.

## Context / Current Behavior

Owner request (2026-10-11, FR):

> « L'aperçu en temps réel lors de l'édition d'un CV, ainsi que l'aperçu du CV après avoir cliqué sur le bouton ne permettent pas de voir la démarcation de la/les pages suivantes. Corrige ce manque par un indicateur relativement discret mais précis qui s'adaptera à toute modification du contenu du CV par l'utilisateur. »

**Both previews render the CV as one continuous sheet.** No page boundary is visible. There is no page-counting, page-break or `break-*` logic anywhere in `src/components`.

**Editor live preview:**
- Rendered inline in `src/components/dashboard/resume-editor.tsx`, with no iframe.
- A wrapper `PAGE_WIDTH_PX` wide is scaled with `transform: scale(previewScale)` (`:1690-1698`).
- `calculatePreviewScale` (`:903-919`) and a ResizeObserver (`:942`) keep the scale fitted to the container width.
- A second ResizeObserver stores the unscaled document height `previewDocHeight` (`:953-965`).
- The frame `data-testid="resume-editor-preview-frame"` takes the height `previewDocHeight * previewScale` (`:1681-1688`).

**Full Preview page:**
- Route: `src/app/[locale]/(dashboard)/dashboard/resumes/[id]/preview/page.tsx`.
- Component chain: `resume-preview-page-client.tsx` → `resume-preview-wrapper.tsx` → `resume-preview.tsx`.
- The CV is rendered unscaled at 794 px on a `bg-slate-100` background (`py-8 print:py-0 print:bg-white`, `resume-preview-page-client.tsx:60`).

**Page geometry:**
- The page-size constants are in `src/lib/resume-page-size.ts`: `PAGE_WIDTH_PX = 794`, `PAGE_HEIGHT_PX = 1123` (A4, 210 × 297 mm).
- `resume-page-size.test.ts` ties them to `globals.css`.

**PDF output:**
- The PDF is `window.print()` of the Preview page.
- Its print CSS (`src/app/globals.css:399-448`) sets `@page { margin: 0; size: A4 portrait; }` and zeroes the margins of `html` and `body`.
- Page *n* therefore starts at y = (n − 1) × `PAGE_HEIGHT_PX` in the printed document.
- `e2e/resume-print-geometry.spec.ts` asserts that print media lays out the document exactly as screen media does, for all five templates.
- `e2e/modern-long-sidebar-print.spec.ts:23-26` relies on the same equivalence.

**Templates and their one-page height:**

| Template | One-page rendering |
|---|---|
| `professional`, `modern` | Fills the page: `minHeight: PAGE_HEIGHT_CSS` |
| `classic`, `minimal`, `creative` | Shorter than a page when the content is short |

**One known difference between the preview and print:** Chromium does not split a line of text or an image across two sheets. A line that straddles a sheet edge moves to the top of the next page, so content after it sits slightly lower in the PDF than in the preview.

**Layout state:** both surfaces read `ResumeLayoutModel` (`src/lib/layout-settings.ts`) through `useResumeLayout`. The Preview page also reads the `resume_draft_${id}` draft from localStorage.

## Scope

- A page-boundary indicator in the editor's live preview, at every edge between two consecutive A4 sheets.
- The same indicator on the full Preview page.
- A short localized page label next to each indicator (for example « Page 2 »), in `fr`, `en`, `de` and `it`.
- Live updates when the document height changes for any reason: edits to content, sections, order or visibility, layout settings, font, template or photo.
- Automated proof that the number of indicators matches the page count of the printed PDF, for all five templates.

## Out of Scope

- Changing where the PDF breaks pages: no `break-inside`/`break-before` rules and no orphan or widow control.
- Inserting real gaps or splitting the preview into separate sheets. The document stays one continuous sheet, so its layout, and therefore the parity measurements, do not move.
- A page count or the indicator in the DOCX export. Word paginates on its own.
- Any change to the DOCX generators, the parity harness verdicts, the layout model or the database.
- Predicting the small downward shift caused by a line that straddles a sheet edge. The indicator marks the sheet edge itself (see Risks).
- Redesigning the editor toolbar, the Preview header or the preview frame.

## Impact Assessment

- **Frontend / UI:** Affected. A new visual overlay in `resume-editor.tsx` and on the Preview page.
- **Internationalization:** Affected. A new page label, `resumes.*` in `src/locales/{fr,en,de,it}/common.json`.
- **Resume model / templates:** Not affected. The five templates and `ResumeLayoutModel` stay unchanged; the indicator is drawn over the document, not inside it.
- **Exports:** Affected, as a constraint only. The indicator must never appear in the printed PDF; the DOCX output is not touched.
- **Database / persistence:** Not affected. Nothing is stored.
- **Security / authorization:** Not affected. No new data, input or route.
- **Testing / validation:** Affected. New e2e coverage, plus regression runs of `test:visual`, `test:parity` and the print-geometry spec.

## User Stories

### US-001: Page boundaries visible in the editor's live preview

**Description:**
As a user editing a CV, I want to see where each printed page ends in the live preview, so that I can adjust my content while I write.

**Acceptance Criteria:**

- [ ] When the unscaled document height is more than one `PAGE_HEIGHT_PX`, the live preview shows one indicator at each unscaled y = k × `PAGE_HEIGHT_PX` (k = 1 … pages − 1).
  - Each indicator lies within 1 px of that position, after applying `previewScale`.
- [ ] A document that fits on one page shows no indicator.
  - This includes `professional` and `modern` at their minimum height of exactly one page.
- [ ] Each indicator carries a localized label naming the page that starts below it (« Page 2 », « Page 3 », …), in the editor's current locale (`fr`, `en`, `de`, `it`).
- [ ] Adding content that pushes the document past a page edge makes a new indicator appear without a reload. Removing that content makes it disappear.
  - Also covered: changing a layout setting that changes the document height, such as font scale.
- [ ] The indicator never covers or intercepts the CV.
  - Clicks and text selection inside the preview behave as without it (`pointer-events: none`).
  - The label is not drawn over CV text.
- [ ] The indicator stays aligned at every preview scale the editor supports, including the narrow-screen layout and after the split divider is dragged.
- [ ] The indicator is outside `data-testid="resume-document"` and hidden in print media.

### US-002: Page boundaries visible on the Preview page

**Description:**
As a user who opened the Preview, I want to see where each printed page ends, so that I know how the PDF will be split before I print it.

**Acceptance Criteria:**

- [ ] The Preview page shows the same indicators and labels as US-001: same positions in unscaled document pixels, same count rule, same locales.
- [ ] The indicators follow the document actually rendered on the page.
  - This includes a document restored from the `resume_draft_${id}` localStorage draft.
  - When the rendered height changes after load (fonts or photo finishing loading), the indicators update without a reload.
- [ ] The indicator is outside `data-testid="resume-document"`, hidden in print media, and does not intercept pointer events.
- [ ] Printing the Preview page produces a PDF that contains no trace of the indicator or its label.

### US-003: The indicator count matches the printed PDF for every template

**Description:**
As the product owner, I want automated proof that the indicator is precise, so that it cannot drift from the real PDF pagination.

**Acceptance Criteria:**

- [ ] An e2e test renders the Preview page for each of the five templates, with one one-page fixture and one fixture of at least two pages.
  - It generates the print PDF of that page.
  - It asserts that (number of indicators + 1) equals the number of PDF pages.
- [ ] The same test asserts that the editor live preview of the same resume shows the same number of indicators as the Preview page.
- [ ] The fixtures are deterministic test data and contain no real user data.

## Functional Requirements

- **FR-1:** One shared computation, from the measured unscaled document height and `PAGE_HEIGHT_PX`, gives the page count and the boundary positions for both surfaces.
  - It uses the existing constants in `src/lib/resume-page-size.ts`; no second page-height value is introduced.
- **FR-2:** The count rule is pages = max(1, ceil(height / `PAGE_HEIGHT_PX`)), with a sub-pixel tolerance so that a document exactly one page tall (± 1 px) counts as one page.
  - US-003 is the authority: if the printed PDF disagrees on a fixture, the rule is wrong.
- **FR-3:** The indicator is derived state only. It is computed from the rendered DOM and is never persisted, never written into the resume or layout model, and never sent to an export.
- **FR-4:** The indicator is discreet: a thin line plus a small label, visually lighter than the CV content.
  - Its exact styling is validated by `ui-expert` on the rendered result.
- **FR-5:** The page label uses the existing dictionary under `resumes.*`, with all four locales filled in. No string is hardcoded.

## Regression Constraints

- `data-testid="resume-document"` renders pixel-identically to today on screen and in print for all five templates.
  - Evidence: `pnpm test:visual` passes with its existing baselines; no baseline is updated.
- `pnpm test:parity` stays at MATCH 206 / KNOWN 3 / NEW 0 on Windows.
- `e2e/resume-print-geometry.spec.ts` and `e2e/modern-long-sidebar-print.spec.ts` pass unchanged.
- The editor preview frame keeps its current scaling, height tracking and responsive behavior.
  - Evidence: `e2e/resume-editor-responsive.spec.ts` passes unchanged.
- The page count of a printed PDF does not change for any template.
- The DOCX generators and their output are not touched.

## Required Verification

- The CLAUDE.md §14 baseline, run on the final diff: typecheck, test, test:integration, test:e2e, build (or build:verify) and lint.
  - Lint is judged against the ceiling of 306 problems.
- `pnpm test:visual` and `pnpm test:parity`, for the regression constraints above.
- New e2e coverage for US-001, US-002 and US-003, run in the `test:e2e` suite.
- Unit tests for the computation in FR-1, including the boundary cases:
  - exactly one page, one page + 1 px, one page − 1 px;
  - exactly two pages;
  - a height of 0 or not yet measured.
- Rendered browser evidence (screenshots) reviewed by `ui-expert`:
  - the editor at desktop width and at a narrow width, with a two-page CV;
  - the Preview page with a three-page CV;
  - one locale other than `en`.
- A PDF printed from the Preview page, opened and checked: no indicator or label on any page, and the page count is unchanged.

## FAIL Conditions

- The number of indicators + 1 differs from the printed PDF page count for any template fixture.
- An indicator sits more than 1 px (unscaled) from k × `PAGE_HEIGHT_PX`.
- The indicator or its label appears in a printed PDF, a `test:visual` capture of `resume-document`, or a DOCX.
- Any `test:visual` baseline needs updating, or `test:parity` reports NEW > 0 or a changed MATCH / KNOWN count.
- The indicator blocks a click or text selection in the preview, or covers CV text.
- An indicator does not appear or disappear after a content or layout change until the page is reloaded.
- The label is missing or untranslated in any of `fr`, `en`, `de`, `it`.

## BLOCKER Conditions

- The local Supabase stack or the e2e authentication fixture is unavailable, so the editor and Preview cannot be exercised.
- The printed PDF page count cannot be obtained in the e2e environment, so US-003 cannot be proven.
- A template fixture's PDF page count cannot be reconciled with ceil(height / `PAGE_HEIGHT_PX`) without changing print CSS. That would contradict Out of Scope, so it returns to the owner.

## Risks

- **Straddling lines:** a line that straddles a sheet edge is moved to the next page by Chromium. The indicator then crosses that line in the preview, and later content sits slightly lower in the PDF than in the preview.
  - Accepted in this initiative: the indicator marks the physical sheet edge, and a crossed line correctly tells the user that this line starts page 2.
  - On long CVs, the accumulated shift could in theory add a page. US-003's fixtures guard against the count diverging.
- **Measuring too late:** if the height is measured before fonts or the photo finish loading, the indicators would be placed for a shorter document. Live re-measurement (US-002) covers this.
- **Overlay versus layout:** an overlay drawn inside `resume-document`, or one that changes layout, would break `test:visual` and parity. The regression constraints make this a FAIL.

## Evidence / References

- `src/components/dashboard/resume-editor.tsx:903-965, 1681-1698`: preview scale, height tracking, preview frame.
- `src/components/dashboard/resume-preview-page-client.tsx:60`, `resume-preview-wrapper.tsx`, `resume-preview.tsx`: the Preview page render chain.
- `src/lib/resume-page-size.ts`: the A4 constants.
- `src/app/globals.css:399-448`: the print CSS (`@page` margin 0, A4).
- `src/lib/layout-settings.ts`, `src/lib/hooks/use-resume-layout.ts`: the shared layout model.
- `e2e/resume-print-geometry.spec.ts`, `e2e/modern-long-sidebar-print.spec.ts`: screen/print equivalence and page-2 reasoning.
- `e2e/visual/resume-templates.spec.ts`, `e2e/parity/`: regression gates.
- `src/locales/{fr,en,de,it}/common.json` (`resumes.*`): the i18n target.
- `tasks/prds/prd-preview.md`: the earlier requirement that the Preview and the PDF have the same page count.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
