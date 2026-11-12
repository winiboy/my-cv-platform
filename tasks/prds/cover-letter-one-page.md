# PRD: Cover letters that fit on one page, and show when they do not

**Status:** DRAFT

## Objective

A cover letter written by the AI fits on one printed page. Whenever a letter runs longer than one page, the letter's preview shows where each printed page ends, with the same marking the CV previews use and labelled in the interface language.

## Context / Current Behavior

Owner request (2026-11-12, FR):

> « rajoute la même indication visuelle qu'utilisé pour les CV pour informer l'utilisateur si la lettre fait plus d'une page · par défaut lors de la création de la lettre, celle-ci ne devrait pas dépasser une page · l'indication visuelle doit être adaptée à la langue que l'utilisateur a choisie »

Owner decisions (2026-11-12):
- **Label language:** the interface language, as for the CVs.
- **One page at creation:** the AI is given a length limit sized to one page. If the letter still overflows, one more AI call shortens it, once.
- **Paths covered:** the letter created from a job application, and the AI "Generate" button in the letter editor. A blank letter stays blank.

**The CV reference (PRD `preview-page-break-indicator`, approved 2026-10-12):**
- `src/components/dashboard/resume-page-break-indicators.tsx` draws one marker per edge between two printed A4 sheets:
  - a dashed teal line across the page;
  - a label "Page {n}", written vertically, in the gutter to the right of the page.
- The overlay is `aria-hidden`, ignores pointer events and is hidden in print.
- It keeps a constant on-screen size at any preview scale.
- The label is hidden when the gutter is too narrow (`labelClassName`); the line is always drawn.
- The label text is `resumes.pageBreakLabel` in `src/locales/{fr,en,de,it}/common.json`: "Page {page}", "Page {page}", "Seite {page}", "Pagina {page}". The text follows the interface locale.
- `src/lib/resume-page-breaks.ts` places the edges at k × 1123 px, because the CV's PDF prints with zero page margins.

**The letter preview today:**
- `src/components/dashboard/cover-letter-preview.tsx` renders `ModernLetterTemplate` as one continuous sheet, 794 px wide.
- That sheet is scaled by the zoom controls inside its own scroll area.
- It is used twice:
  - the editor's preview pane (`variant="pane"`: fitted to the width, no side padding);
  - the preview window (`cover-letter-preview-dialog.tsx`).
- The unscaled page height is already measured (`pageHeight`, ResizeObserver on `offsetHeight`).
- The template has `min-height: 1123px`, so a short letter is exactly one sheet. Its padding is the Swiss letter margins (`src/lib/cover-letter-swiss-letter.ts`: top 18 mm, bottom 15 mm).
- No page boundary is shown. A letter longer than one page simply makes the sheet taller.

**How the letter's PDF pages break** (`src/lib/pdf/render-cover-letter.ts`, `COVER_LETTER_PRINT_CSS`):
- The page is A4.
- Page 1 has no `@page` top margin (the markup's own top padding stands in for it) and a 15 mm bottom margin.
- Every later page has an 18 mm top margin and a 15 mm bottom margin.
- The template's `min-height` and bottom padding are lifted for print.
- The printed page edges are therefore **not** at k × 1123 px of the preview:
  - page 1 holds the preview's first 1123 px − 15 mm of content;
  - each later page holds 1123 px − 33 mm.
- The CV's `computePageBreaks` cannot be reused as is.

**How a letter gets its text:**
- `POST /api/cover-letters/from-job-application` creates a letter from a job application. It makes one AI call through `generateCoverLetter` (`src/lib/ai/cover-letter-generation.ts`) with `buildCoverLetterGenerationPrompt` (`src/lib/ai/prompts.ts`).
- `POST /api/ai/generate-cover-letter` (the editor's "Generate" modal, `cover-letter-generation-modal.tsx`) uses the same prompt. It returns the parts, and the editor puts them into the letter.
- The prompt asks for 250–400 words: an opening paragraph, 2–3 body paragraphs of 3–4 sentences, and a closing paragraph.
- With the Swiss letter's header, 400 words can exceed one page. The header holds the sender block, the recipient window at 50 mm, the place and date, and the subject.
- A blank letter (`create-cover-letter-form.tsx`) starts with no text.
- The tools-page generator (`/api/tools/generate-cover-letter`) uses its own prompt and creates no stored letter.

## Scope

- A page-break marker in both letter previews (the editor pane and the preview window) at every printed page edge. It looks and behaves like the CV's marker.
- The marker's label in the interface language (fr, en, de, it), with the same wording as the CV's label.
- An AI length limit sized to one printed page, for both AI paths that write a letter's text.
- One shortening call when the generated letter still prints on more than one page.

## Out of Scope

- The CV page-break indicator and its page computation.
- The tools-page cover-letter generator (`/api/tools/generate-cover-letter`), the letter checker, and translation (`/api/cover-letters/[id]/translate`).
- Letters already stored, and text the user types or edits: they are never shortened.
- Any blocking, warning dialog or toast. The marker is the only signal.
- The letter's PDF and Word export: their layout and pagination stay as they are.
- The letter template's layout, fonts and margins.
- Any change to the database.

## Impact Assessment

- **Frontend / UI:** Affected — a marker overlay in `CoverLetterPreview`, in both variants.
- **Internationalization:** Affected — the label is localized in fr, en, de and it, following the interface locale.
- **Resume model / templates:** Not affected — the CV components and page computation are unchanged.
- **Exports:** Not affected — PDF and Word output stay as they are. The PDF is only the reference for where the pages break.
- **Database / persistence:** Not affected — no schema change. The stored fields keep their meaning; the shorter text goes into the same columns.
- **Security / authorization:** Affected — a possible second AI call on two authenticated routes. It must respect the existing auth, rate limits and input limits, and its output is untrusted text like the first call's.
- **Testing / validation:** Affected — the page computation needs unit tests. The marker needs browser evidence. The page count must be compared with the PDF. The shortening needs route tests through the AI test stub.

## User Stories

### US-001: The letter preview marks where each printed page ends

**Description:**  
As a user writing a cover letter, I want the preview to show where the printed page ends when my letter is longer than one page, so that I can shorten it before I print or send it.

**Acceptance Criteria:**

- [ ] A letter that prints on one page shows no marker in either preview.
- [ ] A letter that prints on n > 1 pages shows exactly n − 1 markers in the editor pane and in the preview window. Marker k is labelled with page k + 1.
- [ ] Each marker sits where the printed PDF's page k ends. The first and later pages are computed with their own margins, as `COVER_LETTER_PRINT_CSS` sets them, within 2 px of the unscaled preview at the fixture's content.
- [ ] Each marker looks like the CV's marker:
  - a dashed teal line across the sheet, with a constant on-screen thickness at every zoom level;
  - the label written vertically in the gutter to the right of the sheet, never over the letter.
- [ ] The label reads "Page 2" in `/fr` and `/en`, "Seite 2" in `/de` and "Pagina 2" in `/it`. It follows the interface locale, not the letter's language.
- [ ] When there is no room for the label beside the sheet, the label is not drawn, the line still is, and no horizontal scroll appears. This includes the editor pane fitted to its width.
- [ ] The markers follow the text as it is typed, and every zoom change, without a reload.
- [ ] The marker overlay is `aria-hidden`, does not take clicks or text selection, and does not appear in the downloaded PDF or Word file.

### US-002: A letter written by the AI fits on one page

**Description:**  
As a user creating a cover letter from a job application, or generating one in the editor, I want the AI's letter to fit on one page, so that I do not have to cut it myself.

**Acceptance Criteria:**

- [ ] The prompt for both paths (`from-job-application` and `/api/ai/generate-cover-letter`) asks for a length that fits on one printed page, in place of the current 250–400 words.
- [ ] After the first AI call, the server decides whether the letter, with its header, prints on more than one page. The decision is deterministic for a given letter.
- [ ] When the letter fits, nothing else happens: there is one AI call, as today.
- [ ] When it does not fit, exactly one more AI call asks for a shorter version of the same letter, in the same language, with the same structure (greeting, opening, body paragraphs, closing, sign-off). That shorter version is stored or returned instead.
- [ ] When the shorter version still does not fit, it is kept as it is. Nothing is truncated, creation is not refused, and the preview's marker shows the overflow.
- [ ] When the shortening call fails, or returns no usable letter, the first letter is kept. Creation and generation succeed as they would without the shortening.
- [ ] The shortening call does not use another unit of the user's AI rate limit. Each creation or generation counts as one unit, as today.
- [ ] A blank letter is still created blank.
- [ ] The company address taken from the offer (`cover-letter-recipient-address-from-offer`) is unchanged by the shortening.

## Functional Requirements

- **FR-1:** A letter's printed page count and page edges come from one computation, shared by both previews and by the server's one-page check.
- **FR-2:** The printed PDF is the authority on page breaks. Whenever the computation and the PDF of a fixture disagree on the page count, the computation is wrong.
- **FR-3:** The marker is derived state only. It is never stored, never sent to an export, and never changes the letter's layout or the preview's measured height.
- **FR-4:** The label text is localized through the existing i18n dictionaries for fr, en, de and it. It must not be hard-coded.
- **FR-5:** At most two AI calls are made per creation or generation: the letter, and at most one shortening.
- **FR-6:** The shortened text is treated as untrusted AI output, exactly like the first: the same parsing, cleaning and field limits.
- **FR-7:** Only text the AI has just written is shortened. Text the user wrote or edited is never changed.

## Regression Constraints

- The CV page-break indicator, `computePageBreaks` and their tests are unchanged.
- The letter preview's zoom: fit to width, fit to page, zoom in and out, the announced level, and the scroll area that ends at the letter's last line. All of these behave as before.
- The letter PDF and Word output are byte-for-byte unchanged for the same letter. The export e2e and unit suites stay green.
- A letter that already fits on one page is created with a single AI call. Its text is produced from the new length instruction, but its fields, its company address and its 409 or AI-failure handling are unchanged.
- `pnpm test:parity` and `pnpm test:visual` keep their current results: MATCH 211 / KNOWN 3 / NEW 0, and 10/10.

## Required Verification

- Unit tests for the page computation:
  - one page, exactly one page plus or minus the tolerance, two pages and three pages;
  - the first page's and later pages' margins;
  - invalid heights.
- Comparison with the PDF:
  - Use letter fixtures of one, two and three printed pages.
  - Render the real PDF through the download route.
  - Compare its page count, and the first line of each page, with the computed edges.
- Browser evidence for US-001 (e2e plus screenshots), in the editor pane and the preview window:
  - no marker on a one-page letter;
  - the markers on a two-page letter;
  - the label in fr, en, de and it;
  - the marker following typing and zoom;
  - the label hidden in the narrow pane, with no horizontal scroll;
  - no marker in print media.
- Route tests for US-002 for both routes, through the AI test stub:
  - fits on the first call: one call;
  - overflows, and the shorter version fits: two calls, the shorter version is stored or returned;
  - overflows, and the shorter version still overflows: the shorter version is kept;
  - the shortening fails: the first version is kept;
  - one rate-limit unit in every case;
  - a blank letter makes no call.
- An e2e test for the creation from a job application with a stubbed long letter: the stored letter prints on one page.
- `ui-expert` validation of the rendered marker against the CV's marker.
- `security-review` of the second AI call.
- The CLAUDE.md §14 baseline, with lint at or below the tracked ceiling. Also `pnpm test:parity` and `pnpm test:visual`.

## FAIL Conditions

- **Wrong count:** the number of markers differs from the PDF's page count minus one, for any fixture.
- **Wrong place:** a marker is more than 2 px from where the PDF's page ends.
- **Wrong language:** the label is in the letter's language instead of the interface language, or is hard-coded.
- **Layout change:** the marker changes the letter's layout, its measured height, its print output or its export.
- **Extra cost:** more than two AI calls per creation or generation, or more than one rate-limit unit.
- **Lost content:** creation or generation fails, or loses the letter, because the shortening failed or did not fit.
- **User text changed:** a stored letter, or text the user typed, is shortened.
- **Scope:** the CV indicator, the tools-page generator, translation or the exports change.

## BLOCKER Conditions

- The letter PDF cannot be rendered locally, so the page computation cannot be compared with it.
- The server cannot decide deterministically whether a letter fits on one page without a measurement it does not have, for example the font metrics of the letter's text. In that case the method must be brought back to the owner before US-002 is implemented.

## Risks

- **The server-side check is an estimate of the browser's layout.**
  - Fonts, line wrapping and rich text, such as lists and bold text, change the height.
  - A check that is too generous lets a letter overflow. One that is too strict shortens letters that fit.
  - The fixtures compared with the PDF bound this risk; they cannot remove it.
- **Shorter letters read differently.** The prompt's new length changes the wording of every generated letter, not only the long ones.
- **A second AI call adds latency** to the creations that need it.
- **The header's height varies with the letter.** It depends on the sender lines, the recipient address lines and the subject. The length budget is therefore only a target, and the check must use the actual letter.

## Evidence / References

- `tasks/prds/preview-page-break-indicator.md`: the CV indicator's approved requirements.
- `src/components/dashboard/resume-page-break-indicators.tsx`: the CV marker's look and behaviour.
- `src/lib/resume-page-breaks.ts`: the CV page computation, with zero print margins.
- `src/locales/{fr,en,de,it}/common.json`: `resumes.pageBreakLabel`.
- `src/components/dashboard/cover-letter-preview.tsx`: the letter preview, its zoom and its height measurement.
- `src/components/dashboard/cover-letter-templates/modern-letter-template.tsx`: the letter template's minimum height and padding.
- `src/lib/cover-letter-swiss-letter.ts`: the letter's page geometry and margins.
- `src/lib/pdf/render-cover-letter.ts`: `COVER_LETTER_PRINT_CSS`, which sets how the letter's PDF pages break.
- `src/lib/ai/prompts.ts`: `buildCoverLetterGenerationPrompt`, which asks for 250–400 words.
- `src/lib/ai/cover-letter-generation.ts`, `src/app/api/cover-letters/from-job-application/route.ts`, `src/app/api/ai/generate-cover-letter/route.ts`: the two AI paths.
- `src/lib/ai/test-stub.ts`: the AI test stub.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
