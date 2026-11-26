# PRD: Swiss templates only, with a preview, PDF and Word that show the same pages

**Status:** APPROVED 2026-11-25. The owner approved this PRD and every story it contains in advance, in chat, on 2026-11-25: "Je te donne exceptionnellement tous les droits … pour approuver les nouveaux PRD, chaque nouvelle US … Je T'APPROUVE TOUS !". The owner keeps one approval: the pull request, once all ten templates are verified.

## Objective

Keep only the ten Swiss CV templates. For each of them, the Preview shows the pages the PDF and the Word file will have, and the three formats agree page by page.

## Context / Current Behavior

The audit ran on 2026-11-25 against `origin/main` 630742b, on local Supabase. It used one fictional two-page resume (6 experiences, 3 educations, 3 skill categories, 4 languages, 3 certifications, 2 projects and a photo), in fr and de, for each of the ten templates. For each case it captured three things: the Preview page, the PDF from `POST /download-pdf`, and the Word file from `POST /download-docx`, rendered by Microsoft Word to PDF. All three gave 2 pages for every template. The defects below come from comparing them page by page.

- **D1: the Preview's second page is not the printed one (all ten templates).**
  - The Preview is a single continuous strip. `ResumePageBreakIndicators` draws a dashed line every 1123 px (`src/lib/resume-page-breaks.ts`).
  - Print fragments the document differently:
    - an entry marked `break-inside-avoid` that crosses the edge moves whole to page 2;
    - a section heading moves with its first entry;
    - six of the templates start page 2 below a top margin.
  - So in the Preview an entry is sliced by the line, a heading is left alone at the foot of page 1, and page 2 starts at a different item than in the PDF. Seen in all ten templates; for example, swissExecutive "Assistante administrative" is cut in the Preview and is whole on page 2 of the PDF.
- **D2: page 2 of the PDF has no top margin** for swissVocational, swissCommerce, swissTrades, swissHealth, swissFinance and swissEngineering: the text starts at the paper's top edge.
  - swissIt, swissExecutive, swissAcademic and swissFirstJob already have a 48 px top and foot margin on every page after the first (`src/app/globals.css`, `@page swiss-*`).
- **D3: Word breaks its pages elsewhere than the PDF (all ten).**
  - Most templates set their text in Inter. The Word file names the font without embedding it, so on a computer without Inter, Word uses a serif substitute with other widths. The lines then break differently and page 1 ends one or two entries earlier.
  - Entries are not kept together in Word: swissEngineering, swissIt and swissFirstJob split one experience across the two pages.
- **D4: Word drops content.** In swissVocational and swissCommerce, an experience that has both a description paragraph and a bullet list loses the paragraph ("Gestion des commandes de matériel médical et suivi des stocks.").
- **Legacy templates:** `professional`, `modern`, `classic`, `minimal` and `creative` are still offered.
  - They are the default in three places: `create-resume-form.tsx` (`modern`), `cv-adaptation-modal.tsx` (`professional`), and the `resumes.template` column default (`modern`).
  - They are the fallback for unknown ids in `resume-preview.tsx`, `resume-editor.tsx`, `layout-settings.ts` and the Word route.
  - About 45 production files and 90 test or baseline files reference them. The parity suite (`e2e/parity`, `pnpm test:parity`, CI job `parity`) exercises only them.
  - Production rows created before migration 011 hold legacy ids.

## Scope

- Remove the five legacy resume templates from the product, the code, the tests and the visual baselines.
- Migrate stored rows to a Swiss template, and narrow the database constraint and default.
- Give every printed page after the first a top margin, and every printed page a foot margin, in the six templates that lack them, in the PDF and in Word.
- Show the Preview, and the Editor's live preview, as the real A4 pages: the same items on each page as the PDF.
- Make the Word file use the template's typeface on any computer, keep entries together, and break its pages where the PDF does.
- Restore the description paragraph Word drops.

## Out of Scope

- Cover letters. They have their own `modern` template, which stays untouched.
- New resume fields, a new database column, or any change to resume content.
- Redesigning a Swiss template's look beyond what the margins and page fidelity require.
- A page-1 layout change in any template: page 1 of the PDF keeps its current look, apart from a foot margin where content reached the paper's foot.
- Removing layout-model fields that only legacy templates used (`fontScale`, `fontFamily`, sidebar colour). They stay stored, unused and unshown.
- Deleting historical PRDs, progress logs or archived Ralph contracts.

## Impact Assessment

- **Frontend / UI:** Affected — the template picker (10 options), the Preview and Editor live-preview pagination.
- **Internationalization:** Affected — the legacy template name keys are removed in all four locales. Any new user-facing string goes through `common.json` in fr, en, de and it.
- **Resume model / templates:** Affected — the template set shrinks to ten. Pagination becomes derived screen-only state, never stored.
- **Exports:** Affected — PDF page margins, and Word fonts, keep rules, margins and the missing paragraph.
- **Database / persistence:** Affected — a forward migration remaps legacy rows and narrows the CHECK constraint and the DEFAULT.
- **Security / authorization:** Not affected — no route, auth or RLS change. The embedded font data is a static asset.
- **Testing / validation:** Affected — legacy-only suites and the parity suite are removed with the code they test. New preview/PDF/Word page agreement tests are added.

## User Stories

### US-001: Only the ten Swiss templates exist

**Description:**
As a user, I want to choose only among the ten Swiss templates, and to find my existing CVs in a Swiss template, so that every CV I make follows the Swiss formats.

**Acceptance Criteria:**

- [ ] The template picker, everywhere it appears (new CV, CV from a job application, CV from a job offer), offers exactly the ten Swiss templates, in their current order.
- [ ] A new CV defaults to `swissCommerce` in every creation flow, and the database column default is `swissCommerce`.
- [ ] A forward migration remaps every stored row: `professional` to `swissTrades`, `modern` to `swissEngineering`, `classic` to `swissFinance`, `minimal` to `swissVocational`, `creative` to `swissFirstJob`.
  - It then narrows `resumes_template_check` to the ten Swiss identifiers.
  - Applied on local Supabase over rows holding each legacy id, it leaves no legacy id and changes no other column.
  - The generated types list the ten identifiers.
- [ ] The job-application and AI generation routes reject a legacy id (400), as they reject any unknown id.
- [ ] A stored or drafted template id that is not one of the ten renders as `swissCommerce` in the Editor, Preview, PDF and Word, and never throws.
- [ ] No production source file, registry entry, locale key or print rule exists only for a legacy resume template. Cover-letter `modern` is untouched.
- [ ] The tests, visual baselines and parity suite that exist only for legacy templates are removed. Shared-behaviour tests that used a legacy id use a Swiss id instead and still pass.
- [ ] The `pnpm test:parity` script and the CI `parity` job are removed with the suite. `.claude/rules/resumes.md` names the ten Swiss identifiers as the supported set.

### US-002: Every printed page has margins, in the PDF and in Word

**Description:**
As a user printing a two-page CV, I want page 2 to start below a top margin and every page to end above a foot margin, so that no text touches the paper's edge.

**Acceptance Criteria:**

- [ ] For swissVocational, swissCommerce, swissTrades, swissHealth, swissFinance and swissEngineering, the text on every PDF page after the first starts at least 48 px below the paper's top edge.
- [ ] On every page of those six templates, the last line of text ends at least 48 px above the paper's foot.
- [ ] Full-bleed backgrounds still reach the paper's edges on every page: the swissCommerce header band on page 1, the swissTrades dark column, the swissEngineering light column and blue bar, and the swissVocational red rule.
- [ ] Page 1 of the PDF is otherwise unchanged; the existing visual baselines for the six templates still pass, or the diff is limited to the foot margin.
- [ ] The Word file of each of the six templates uses the same top margin on pages after the first and the same foot margin as the PDF.
- [ ] The four templates that already had these margins are unchanged.

### US-003: The Preview shows the real pages

**Description:**
As a user, I want the Preview and the Editor's live preview to show my CV as the separate A4 pages it will print on, with the same items on each page as the PDF, so that I can judge page 2 before exporting.

**Acceptance Criteria:**

- [ ] The Preview page and the Editor's live preview draw the CV as separate A4 sheets, 794 × 1123 px each, with a visible gap between them. The last sheet is drawn full height.
- [ ] On screen, an item that print keeps whole moves whole to the next sheet, as it does in print.
  - Such an item is any element the template marks `break-inside-avoid`, and a section heading together with its first item.
  - Every sheet after the first starts its content at the template's print top margin.
  - No line of text is cut by a sheet edge or drawn in a sheet's margin.
- [ ] Full-bleed backgrounds that print on every page (sidebars and columns) are drawn on every sheet.
- [ ] For each of the ten templates and the audit fixture, in fr and de, the Preview's sheet count equals the PDF's page count.
  - The first text item of each Preview sheet is the first text item of the same PDF page.
  - This is asserted by an e2e test that runs locally and on the Linux CI.
- [ ] The pagination is screen-only derived state: the printed PDF is produced by print fragmentation exactly as before, and nothing about it is stored in the resume or its layout model.
- [ ] It follows edits in the Editor without a reload, and the page-count label and indicators agree with the sheets.

### US-004: Word keeps every paragraph of an experience

**Description:**
As a user exporting to Word, I want each experience's description paragraph to be kept next to its bullet list, as in the Preview.

**Acceptance Criteria:**

- [ ] In every Swiss template's Word file, an experience (and an education or project entry, where the template draws one) that has both a description paragraph and a list shows both. They appear in the Preview's order, and no text is lost.
- [ ] A unit test per affected generator asserts the paragraph's text in `word/document.xml`, and a Word render of the audit fixture shows it.

### US-005: Word shows the template's typeface and breaks its pages where the PDF does

**Description:**
As a user opening the Word file on any computer, I want it to look like the Preview and to break its pages at the same items as the PDF.

**Acceptance Criteria:**

- [ ] Every Swiss template's Word file embeds the faces of Inter it uses (as TrueType, obfuscated as Word requires). Word on a computer without Inter installed then renders those runs in Inter, not a substitute. Templates whose fonts are standard system fonts (Georgia, Arial) are unchanged.
- [ ] In Word, an entry that the template keeps whole in print is kept whole (keep lines together, and keep with next inside the entry). A section heading is kept with its first entry.
- [ ] For each of the ten templates and the audit fixture, in fr and de, the Word page count equals the PDF page count. The first entry of each Word page is the first entry of the same PDF page, verified on a Microsoft Word render.
- [ ] The Word file still opens in Word without a repair prompt. Its size grows by no more than the embedded font data.

## Functional Requirements

- **FR-1:** The only resume template identifiers are `swissVocational`, `swissCommerce`, `swissTrades`, `swissHealth`, `swissFinance`, `swissEngineering`, `swissIt`, `swissExecutive`, `swissAcademic` and `swissFirstJob`. The default and the unknown-id fallback is `swissCommerce`.
- **FR-2:** The legacy remap is fixed: `professional`→`swissTrades`, `modern`→`swissEngineering`, `classic`→`swissFinance`, `minimal`→`swissVocational`, `creative`→`swissFirstJob`.
- **FR-3:** One geometry per template defines its print page margins. The PDF print CSS, the Preview pagination and the Word generator all read it, and a unit test holds them equal.
- **FR-4:** The Preview's sheets and the PDF's pages contain the same items in the same order. The PDF remains the authority: the e2e compares the Preview with it, not the reverse.
- **FR-5:** Preview pagination never changes the printed output: it is applied only in screen media.

## Regression Constraints

- Page 1 of each template's PDF keeps its current look, except for the foot margin added in US-002.
- Content, section order, hidden items, contact visibility and the photo stay as they are in all three formats.
- The no-word-splitting rule holds in fr, en, de and it.
- Cover letters, their PDF and their Word export are unchanged.
- The PDF route's security behaviour is unchanged: auth, size limits, network policy.

## Required Verification

- `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm build` and `pnpm lint` (count compared with the ceiling), plus `pnpm test:visual` on the final diff of each story.
- US-001: migration evidence on local Supabase, with rows of each legacy id before and after, and the constraint and default after.
- US-002 and US-005: the audit fixture's PDF and Word file rendered for each of the ten templates in fr and de, pages compared side by side with the Preview, and the images inspected.
- US-003: rendered browser evidence of the Preview and the Editor live preview at two pages, plus the e2e page-agreement test.
- `ui-expert` validation for US-001, US-002, US-003 and US-005, and `code-reviewer` for every story.

## FAIL Conditions

- Any legacy template remains selectable, or a stored legacy row fails to render.
- In any template, a line of text is cut by a Preview sheet edge, or the Preview's sheet 2 starts at another item than PDF page 2.
- Any text touches the paper's top edge on page 2 or later.
- Word loses any text the Preview shows, or falls back to a substitute font for Inter.
- Word's page count, or the first entry of page 2, differs from the PDF's on the audit fixture.

## BLOCKER Conditions

- Microsoft Word is unavailable to render the Word files.
- Local Supabase is unavailable for the migration evidence.

## Risks

- **Line breaks in Word.** Word's line-breaking can still differ from Chromium's by a word with the same font, so a fixture designed near a page edge could break differently. The fixture is fixed; real CVs near an edge may still differ by one entry.
- **The production migration.** It rewrites the template id of legacy rows. It is applied to production only by the owner's `supabase db push` at merge time.

## Evidence / References

- The audit captures, kept as evidence in the scratchpad (`audit1/`): `SHEET-<template>-<locale>.png`, laid out as Preview | PDF | Word, page 1 above page 2.
- `src/lib/resume-page-breaks.ts`, `src/components/dashboard/resume-page-break-indicators.tsx` and `resume-preview-wrapper.tsx`.
- `src/app/globals.css`, the `@page swiss-*` rules.
- `src/app/api/resumes/[id]/download-docx/docx-swiss-*.ts` and `docx-helpers.ts`.
- `src/lib/pdf/sfnt.ts`, which decodes WOFF to sfnt for font embedding.
- `supabase/migrations/011_add_swiss_cv_templates.sql`.

## Open Questions

- None.
