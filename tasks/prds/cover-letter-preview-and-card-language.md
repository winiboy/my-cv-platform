# PRD: Cover letter preview window, zoom, and cards in the letter's language

**Status:** APPROVED 2026-11-03

## Objective

On cover letters only, a user can open a full-screen preview of the letter, scroll and zoom the letter both there and in the editor's preview pane, and see each cover-letter card's title and flag in the letter's own language.

## Context / Current Behavior

- **Header buttons.** The cover-letter editor's header (`src/components/dashboard/cover-letter-editor.tsx`) has Generate, Check, PDF, Word and Save. There is no Preview button. The resume editor has one, which opens a separate page `/dashboard/resumes/[id]/preview`. No cover-letter preview route exists.
- **Preview pane.** The editor's right-hand pane (`cover-letter-preview.tsx`) is wrapped in `overflow-hidden`. It scales the A4 letter with a CSS `transform: scale(...)` (at most 0.85, fitted to width).
  - A transform does not change the layout height, so the pane's scroll height does not follow the scaled page.
  - In the outer wrapper, the lower part of a long letter cannot be scrolled into view.
  - There is no zoom control.
- **Card titles.** The cover-letter card (`src/components/dashboard/cover-letter-card.tsx`) shows `coverLetter.title`, a free-text column.
  - The creation form (`create-cover-letter-form.tsx`, line 37) prefills the title for a letter made from a job application with the English pattern `Cover Letter - <job title> at <company>`, whatever the page or letter language.
  - The translate route (`api/cover-letters/[id]/translate`, `translatedTitle` in `letter-segments.ts`) copies the original title and appends ` (DE)`, ` (FR)`, ` (IT)` or ` (EN)`.
  - So a French or German letter shows the English pattern on its card.
- **No language column.** No column stores a letter's language. `resolveCoverLetterLanguage` (`src/lib/cover-letter-language.ts`) detects it from the opening, body and closing paragraphs, with the page's locale as the fallback. The PDF, the Word export and the editor preview already print the date, subject and default greeting in that language (PRD `cover-letter-template-language`). The resolver imports nothing server-only.
- **Flags.** The translation buttons draw the four flags from `src/components/ui/language-flags.tsx` (`LANGUAGE_FLAG_OPTIONS`: en→GB, fr→FR, de→DE, it→IT). The grammar checker's language picker uses the same source.
- **Cards today.** No card shows a flag.

## Scope

- A Preview button in the cover-letter editor header, placed beside the PDF and Word buttons. It opens a full-screen preview window over the editor, showing the letter as currently edited, unsaved changes included.
- In the preview window: the letter scrolls vertically, and small zoom controls sit at the window's bottom-right: zoom out, zoom in, the current zoom level, and a "show all" (fit whole page) button.
- In the editor's preview pane: the same vertical scrolling and the same zoom controls at the pane's bottom-right.
- On the cover-letter cards (`/[locale]/dashboard/cover-letters`):
  - the default title is shown in the letter's language;
  - a small flag of the letter's language sits at the bottom-right of every card.
- Default titles written in the letter's language:
  - in the creation form's prefill;
  - in a translated copy's title.

## Out of Scope

- Resumes, the resume preview page, and resume zoom.
- The cover-letter tools pages (`/tools/cover-letter-generator`, `/tools/cover-letter-checker`) and their previews.
- Translating a title the user wrote, with AI or otherwise.
- A database column for the letter's language, any migration, and rewriting stored titles.
- The PDF and Word exports: their content, layout and file names.
- The editor's layout below 1280px (draft PRD `cover-letter-editor-responsive`), apart from keeping the new controls usable at the widths the editor already supports.
- Printing from the preview window.
- Remembering the zoom level between visits.

## Impact Assessment

- **Frontend / UI:** Affected. New header button, a preview window, zoom controls in two places, and a title and flag on the card.
- **Internationalization:** Affected.
  - New labels: Preview, close, zoom in/out, show all, zoom level, and the flag's accessible name.
  - Default-title patterns in fr/en/de/it.
  - The card title follows the letter's language.
- **Resume model / templates:** Not affected. Resume code is untouched; the letter template (`modern-letter-template.tsx`) is rendered, not changed.
- **Exports:** Not affected. The PDF and Word routes are unchanged; only a translated copy's stored title changes (US-004).
- **Database / persistence:** Affected, data only. The prefilled title and a translated copy's title are stored in the new pattern. No schema change, no migration, existing rows untouched.
- **Security / authorization:** Not affected. No new route or data access. The title shown is still rendered as text.
- **Testing / validation:** Affected. Unit tests (title pattern, language resolution on the card), e2e (preview window, zoom, scrolling, card title and flag), browser evidence in the four locales, and a ui-expert review.

## User Stories

### US-001: A Preview button opens the letter in a full-screen window

**Description:**  
As a user writing a cover letter, I want a Preview button next to PDF and Word, so that I can read the whole letter large, as it is now, before exporting it.

**Acceptance Criteria:**

- [ ] The editor header shows a Preview button directly beside the PDF and Word buttons, in the same style as them, with an icon and a localized label in fr/en/de/it.
- [ ] Clicking it opens a full-screen window over the editor. It shows the letter with the same template and content as the editor's preview pane, including unsaved changes (for example, a greeting typed and not saved appears in the window).
- [ ] The window is a modal dialog (`role="dialog"`, `aria-modal="true"`) with an accessible name. Focus moves into it on open, stays inside it while open, and returns to the Preview button on close.
- [ ] The window closes with a visible close button (localized accessible name) and with the Escape key.
- [ ] Opening and closing the window does not save the letter and does not change the unsaved-changes indicator.
- [ ] A letter taller than the window scrolls vertically inside the window with the mouse wheel, touch, and the keyboard (arrow keys, Page Up/Down) until its last line is fully visible.

### US-002: Zoom controls in the preview window and the editor pane

**Description:**  
As a user, I want small zoom buttons at the bottom-right of the preview window and of the editor's preview pane, including one that shows the whole page, so that I can read details or see the letter at a glance.

**Acceptance Criteria:**

- [ ] The preview window and the editor's preview pane each show, at their bottom-right, a compact group of controls. The group stays in place while the letter scrolls:
  - zoom out;
  - the current zoom level as a percentage;
  - zoom in;
  - "show all".
- [ ] Zoom in and zoom out change the letter's size in fixed steps within the bounds of FR-3. At a bound, the matching button is disabled.
- [ ] "Show all" sets the zoom so the whole first A4 page is visible in the area without scrolling, in both width and height.
- [ ] At any zoom, the letter's full height and width can be scrolled into view, and the scroll area holds no empty space below the last page larger than the area's padding.
- [ ] When opened, the preview window starts at the "show all" zoom. The editor pane keeps today's starting size: fit to width, at most 85%.
- [ ] Every control is a button with a localized accessible name in fr/en/de/it, operable by keyboard with visible focus. The zoom level is announced politely when it changes.
- [ ] Zooming in the pane does not change the window's zoom, and the reverse holds as well.

### US-003: The card shows the default title in the letter's language

**Description:**  
As a user with letters in several languages, I want each card's title in the letter's own language, so that a German letter's card does not read "Cover Letter - … at …".

**Acceptance Criteria:**

- [ ] A card whose stored title is the English default pattern `Cover Letter - <job title> at <company>` shows the title in the letter's language (FR-5), with the same job title and company.
  - The stored pattern may end with a translation suffix ` (XX)`; the suffix is not shown.
- [ ] A card whose stored title is already a default pattern in the letter's language shows that title unchanged.
- [ ] A card whose title does not match a default pattern shows its stored title exactly as today, for any language.
- [ ] The language used is the one `resolveCoverLetterLanguage` gives for that letter, the same one its PDF prints the date in, with the page's locale as the fallback.
- [ ] The displayed title is never written back to the database by viewing the card.

### US-004: New default titles are written in the letter's language

**Description:**  
As a user creating or translating a letter, I want its default title written in the letter's language, so that new titles are right everywhere, not only on the card.

**Acceptance Criteria:**

- [ ] Creating a letter from a job application prefills the title with the default pattern in the page's locale (FR-5) instead of the English one. The user can still edit it before creating.
- [ ] Translating a letter whose title is a default pattern, in any language, with or without a ` (XX)` suffix, gives the copy that pattern in the target language, with the same job title and company, and no ` (XX)` suffix.
- [ ] Translating a letter whose title is not a default pattern keeps today's behavior: the original title plus ` (XX)`.
- [ ] The new titles respect the existing title length limit.

### US-005: Each card shows a flag of the letter's language at its bottom-right

**Description:**  
As a user, I want a small flag on each cover-letter card showing the letter's language, so that I can find the right version at a glance.

**Acceptance Criteria:**

- [ ] Every cover-letter card shows exactly one flag at its bottom-right corner.
  - The flag is the SVG `LANGUAGE_FLAG_OPTIONS` draws for that language, the same one the translation buttons use: GB for en, FR for fr, DE for de, IT for it.
- [ ] The language is the same one US-003 uses for that card.
- [ ] The flag has a localized accessible name naming the language in fr/en/de/it (for example "Langue : allemand"), and a matching tooltip.
- [ ] The flag overlaps no other card content (title, badges, "Updated" date, menu) at the card widths of the dashboard grid, 375px included.

## Functional Requirements

- **FR-1:** The preview window and the editor pane render the letter from the same source as today's pane: `CoverLetterPreview` and `ModernLetterTemplate`, fed the editor's current in-memory letter. There is no second rendering of the letter.
- **FR-2:** The zoom controls are one shared component, used in both places.
- **FR-3:** Zoom bounds and step: from 25% to 200% of the A4 page's natural size, in 10-point steps. "Show all" may give a value between steps, and the next step moves from that value to the next step value.
- **FR-4:** The letter's language for the card title and the flag comes from `resolveCoverLetterLanguage` over the letter's opening, body and closing paragraphs, with the page's locale as the fallback. No new language detection.
- **FR-5:** Default-title patterns, one per language. Placeholders are filled from the letter's job title and company:
  - en: `Cover Letter - {jobTitle} at {company}`
  - fr: `Lettre de motivation - {jobTitle} chez {company}`
  - de: `Anschreiben - {jobTitle} bei {company}`
  - it: `Lettera di presentazione - {jobTitle} presso {company}`
- **FR-6:** A title "matches a default pattern" only when it equals one of the FR-5 patterns built from that letter's own job title and company. An optional single ` (EN|FR|DE|IT)` suffix may follow. Anything else is a user title and is never rewritten.
- **FR-7:** New user-facing strings come from the existing dictionaries in fr/en/de/it, with locale parity kept.

## Regression Constraints

- The editor's preview pane starts at the same size it has today: fit to width, at most 85%.
- The PDF and Word buttons, their notices, the save behavior, the translation flags, and the Generate and Check modals behave as today.
- PDF and Word exports are byte-for-byte unaffected for a given stored letter. `pnpm test:parity` stays at its baseline.
- Card behaviors stay as today:
  - the kebab menu: Edit, Duplicate, Download PDF/Word, Delete, with its hover and Escape dismissal;
  - the badges;
  - the "Updated" date;
  - the title link.
- Duplicate keeps copying the stored title with ` (Copy)`.
- The resume editor, the resume preview page, and the tools pages are untouched.

## Required Verification

- The mandatory baseline of `CLAUDE.md` §14:
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:integration`;
  - `pnpm test:e2e`;
  - `pnpm build`;
  - `pnpm lint` at or below the tracked ceiling.
- `pnpm test:parity` (export renderers share the letter template), unchanged from baseline.
- Unit tests:
  - FR-5 and FR-6: every language; suffix and no suffix; a user title untouched; the length limit;
  - FR-3 bounds and steps;
  - the translate route's title for a default and for a user title.
- e2e:
  - the preview window: open, unsaved content shown, scroll to the last line, Escape and the close button, focus returning to the Preview button;
  - zoom in, zoom out and show all, with their bounds, in the window and in the pane;
  - the card title and flag for one letter in each of the four languages, and for a user-written title.
- Browser evidence, as screenshots on the production build:
  - the preview window at "show all" and zoomed in;
  - the editor pane zoomed and scrolled to the bottom;
  - the cards page with letters in fr/en/de/it, on the four locales, at desktop width and at 375px.
- ui-expert PASS on the rendered result.
- code-reviewer PASS.

## FAIL Conditions

- The preview window shows the saved letter instead of the current unsaved edits, or opening it saves the letter.
- Any part of a long letter cannot be reached by scrolling, at any zoom, in the window or the pane.
- "Show all" leaves part of the first page outside the visible area.
- A user-written title is changed on the card or in a translated copy, other than today's ` (XX)` suffix.
- A card shows a flag different from the one its PDF's language implies, or a flag drawn from a source other than `language-flags.tsx`.
- Any control lacks a localized accessible name in one of fr/en/de/it, or cannot be operated by keyboard.
- Any change to export output, the parity baseline, a resume surface, or the database schema.

## BLOCKER Conditions

- The editor's current in-memory letter cannot be passed to the preview window without a second source of state.
- The FR-5 wording is rejected by the owner for a language. Implementation of US-003 and US-004 waits until it is settled.

## Risks

- Detection may resolve a letter with very little text, or none, to the page's locale. Such a card then shows the page language's flag and title; this is the same language its PDF already prints in.
- A letter whose job title or company changed after creation no longer matches FR-6. Its title is then shown as written, by design.
- A scaled transform inside a scroll container needs a sized wrapper; a wrong one recreates today's unreachable lower part.

## Evidence / References

- `src/components/dashboard/cover-letter-editor.tsx`: header buttons (lines ~623–699), translation flags, preview pane (lines ~831–838).
- `src/components/dashboard/cover-letter-preview.tsx`: the transform scale and `overflow-hidden` wrapper.
- `src/components/dashboard/cover-letter-card.tsx`: card title, badges, date.
- `src/components/dashboard/create-cover-letter-form.tsx` line 37: the English title prefill.
- `src/app/api/cover-letters/[id]/translate/letter-segments.ts`: `translatedTitle`.
- `src/lib/cover-letter-language.ts`: `resolveCoverLetterLanguage`, `COVER_LETTER_WORDING`.
- `src/components/ui/language-flags.tsx`: `LANGUAGE_FLAG_OPTIONS`.
- `src/components/dashboard/resume-editor.tsx`: the resume Live Preview's sized-wrapper scaling, the closest reference for the scroll fix.
- Owner decisions in chat, 2026-11-03:
  - the preview is a full-screen window over the editor;
  - scrolling and zoom go in both the window and the editor pane;
  - default titles are translated, user titles are kept, and there is no database change.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
