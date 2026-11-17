# PRD: Cover letter paragraph alignment, and the job banner in the user's language

Status: APPROVED 2026-11-16

## Objective

A user can align any paragraph of the cover letter's opening, body and closing fields left, center, right or justified, as in Microsoft Word, and every place the letter appears shows that alignment. The banner shown when a letter is created from a job application reads in the user's interface language.

## Context / Current Behavior

Owner request (2026-11-16, FR):

> - In the cover letter editor, the "Accroche", "Corps" and "Conclusion" fields need MS Word's standard text-alignment option (4 possible settings).
> - When a cover letter is created from a job-application card, the window's header is in English whatever language the user chose for the site. Fix it to follow the user's language (screenshot: "Creating cover letter for job application" above "Médecin adjoint·e … chez MindRH Recrutement", on `/fr`).

Owner decisions (2026-11-16):
- Alignment applies **per paragraph, as in Word**: a button aligns the paragraph or paragraphs that the cursor or selection is in. Paragraphs in the same field can have different alignments.
- **Buttons only.** No keyboard shortcuts: Ctrl+L and Ctrl+R are browser shortcuts.

Current behavior, from the repository:
- **Editor fields.** The opening paragraph (`opening-section.tsx`), each body paragraph (`body-section.tsx`, one editor per paragraph) and the closing paragraph (`closing-section.tsx`) use the shared `RichTextEditor`. Its toolbar is `FormattingRibbon`: bold, italic, underline, bullet list, numbered list, font and font size. It has no alignment control. The same editor and ribbon serve the CV's summary, experience, education, projects and skills fields.
- **Stored HTML already carries alignment.** `rich-html-sanitizer.ts` keeps `text-align` in a `style` attribute.
- **Word export already uses it.** `download-docx/rich-text-blocks.ts` reads a paragraph's `text-align` as left, center, right or justify, and `cover-letter-docx.ts` maps it to Word's paragraph alignment, defaulting to left.
- **The PDF wraps each field in `text-align: left`** (`cover-letter-pdf-html.ts`). A paragraph's own `text-align` takes precedence inside that wrapper. Whether alignment survives every step, from editor to sanitizing to preview to PDF, has not been verified.
- **Precedent.** The CV's key-achievements toolbar (`key-achievements-toolbar.tsx`) already has left, center and justify buttons. The dictionaries already hold `resumes.editor.richTextToolbar.alignLeft`, `alignCenter` and `alignJustify` in fr, en, de and it. There is no `alignRight`.
- **The banner.** `src/app/[locale]/(dashboard)/dashboard/cover-letters/new/page.tsx` reads `coverLetters.new.creatingForJob`. No locale defines that key; only `resumes.new.creatingForJob` exists. So the English fallback "Creating cover letter for job application" always shows. The second line already uses the translated `common.at` ("chez", "at", "bei", "presso").

## Scope

- Four alignment buttons in the toolbar of the letter's opening paragraph, every body paragraph and the closing paragraph: left, center, right, justify.
- Alignment stored in the letter's existing rich-text HTML, and shown in the editor, both previews (the editor pane and the preview window), the PDF and the Word file.
- The banner title translated through the existing dictionaries in fr, en, de and it.

## Out of Scope

- Any alignment control on the CV's fields, or any change to the CV's ribbon or key-achievements toolbar.
- The greeting, sign-off, sender, recipient, subject, date and annexes fields: they are not rich text.
- Keyboard shortcuts for alignment.
- Line spacing, indentation, or any other Word paragraph option.
- The tools-page cover-letter generator, the letter checker, and the AI's output: an AI letter is created left-aligned, as today.
- Translation (`/api/cover-letters/[id]/translate`): it is not changed. Its effect on alignment is recorded under Risks.
- The banner's layout, colour and second line. The CV's "new" page and its banner.
- Any database change.

## Impact Assessment

- **Frontend / UI:** Affected. New toolbar buttons in the letter's three rich-text fields, and the banner title.
- **Internationalization:** Affected. The button labels and the banner title in fr, en, de and it.
- **Resume model / templates:** Not affected. CV fields and templates are unchanged. The letter template only renders the stored HTML.
- **Exports:** Affected. The PDF and Word file must show each paragraph's alignment. Word already reads it; the PDF's effect is unverified.
- **Database / persistence:** Not affected. The alignment is stored in the existing rich-text columns. No schema change.
- **Security / authorization:** Not affected. No new route or input. The sanitizer's existing `text-align` allowance is reused, and no new style property is allowed.
- **Testing / validation:** Affected. Unit, e2e, browser evidence, export validation and `ui-expert`.

## User Stories

### US-001: A letter's paragraphs can be aligned left, center, right or justified

**Description:**
As a user editing a cover letter, I want to align a paragraph of my opening, body or closing as I would in Word, so that the letter is laid out the way I want.

**Acceptance Criteria:**

- [ ] The toolbar of the opening paragraph, of every body paragraph (including one added with "add paragraph"), and of the closing paragraph shows four alignment buttons: left, center, right and justify, in that order.
- [ ] Clicking a button aligns the paragraph that holds the cursor. With a selection spanning several paragraphs of the same field, it aligns each of them. Other paragraphs in the field keep their alignment.
- [ ] The button for the alignment of the paragraph holding the cursor is shown as active, and moves when the cursor moves to a paragraph aligned differently. A paragraph with no alignment set shows left as active.
- [ ] Each button has an accessible name and a tooltip in the interface language (fr, en, de, it), reachable and operable with the keyboard, with visible focus.
- [ ] The alignment is saved with the letter and is still there after a reload.
- [ ] Both previews (the editor pane and the preview window) show each paragraph with its alignment.
- [ ] The downloaded PDF shows each paragraph with its alignment.
- [ ] The downloaded Word file gives each paragraph the matching Word alignment: left, centered, right or justified.
- [ ] A letter whose paragraphs have no alignment set looks the same as today in the editor, both previews, the PDF and the Word file: left-aligned.
- [ ] The CV's rich-text fields show no new button.

### US-002: The banner for a letter created from a job application is in the user's language

**Description:**
As a user creating a cover letter from a job-application card, I want the banner above the form in my interface language, so that the page does not switch to English.

**Acceptance Criteria:**

- [ ] On `/fr`, `/en`, `/de` and `/it`, the banner title on `/dashboard/cover-letters/new?jobApplicationId=…` is a cover-letter wording in that locale, from the dictionaries. It does not show the English fallback outside `/en`.
- [ ] The banner's second line is unchanged: the job title, the translated "at" word, and the company.
- [ ] The CV's banner (`resumes.new.creatingForJob`) is unchanged.

## Functional Requirements

- **FR-1:** Alignment is a property of a paragraph inside the field's existing rich-text HTML, as `text-align` with one of `left`, `center`, `right` or `justify`. Nothing new is stored and there is no separate setting.
- **FR-2:** The editor, both previews, the PDF and the Word file all read the alignment from that same stored HTML (CLAUDE.md §10). There is no second source.
- **FR-3:** The sanitizer allows no new style property or value. Any alignment value outside the four is dropped or treated as left.
- **FR-4:** The alignment controls appear only on the cover letter's opening, body and closing fields.
- **FR-5:** Every new user-facing string comes from the existing i18n dictionaries in fr, en, de and it.

## Regression Constraints

- The CV editor's ribbon, key-achievements toolbar and every CV field behave and look as before. `pnpm test:parity` and `pnpm test:visual` keep their current results: MATCH 211 / KNOWN 3 / NEW 0, and 10/10.
- The letter's existing formatting buttons (bold, italic, underline, lists, font, size) behave as before in the three fields.
- A stored letter without alignment produces the same PDF and Word output as before.
- The page-break marker and the one-page check (`cover-letter-one-page`) behave as before. Alignment never changes how many lines a paragraph takes.
- The banner's second line, and the rest of the "new letter" page, are unchanged.

## Required Verification

- Unit tests for the alignment command on the letter's fields: setting each of the four values, a multi-paragraph selection, and the active state.
- Unit tests showing that the stored HTML keeps each of the four values through sanitizing, and drops any other value.
- An e2e test: align paragraphs in the opening, body and closing differently, save, reload, then check the editor, the preview window and the downloaded PDF.
- Export validation: a letter with one paragraph per alignment, downloaded as PDF and Word. In the PDF, check each paragraph's position on the page. In the Word file, check each paragraph's `w:jc`.
- Browser evidence (e2e plus screenshots) of the toolbar in the editor pane at the widths the editor already supports, in fr, en, de and it, and of the banner on `/fr`, `/en`, `/de` and `/it`.
- `ui-expert` validation of the buttons next to the existing ribbon and the CV's key-achievements toolbar, and of the banner.
- The CLAUDE.md §14 baseline, with lint at or below the tracked ceiling. Also `pnpm test:parity` and `pnpm test:visual`.

## FAIL Conditions

- **Missing control:** a button is missing in any of the three fields, including a newly added body paragraph.
- **Wrong scope:** a button aligns a whole field or another paragraph, contrary to the owner's per-paragraph decision.
- **Lost alignment:** the editor, a preview, the PDF or the Word file shows a paragraph with a different alignment from the one stored.
- **Output change:** a letter without alignment looks different from before in any of those places.
- **CV change:** an alignment button appears on a CV field, or the CV ribbon changes.
- **Hard-coded or wrong text:** a button label or the banner title is hard-coded, or appears in English on `/fr`, `/de` or `/it`.
- **Weaker sanitizer:** the sanitizer allows a new style property or value.

## BLOCKER Conditions

- The editor's alignment command cannot produce `text-align` on a paragraph in a form the existing sanitizer keeps without widening it. If so, the method must go back to the owner.

## Risks

- **Browser alignment markup.** `document.execCommand('justify…')` may write `text-align` on a `div` or wrap text differently from browser to browser. The stored form has to be the one the sanitizer, the PDF and the Word parser read.
- **Translation.** Translating a letter (`/api/cover-letters/[id]/translate`) may not keep paragraph styles, so a translated copy could lose its alignment. Translation is out of scope; this needs a check during implementation, and any loss is recorded as a follow-up.
- **Centered and right-aligned body text in a formal Swiss letter.** These are the user's choice. The default stays left.

## Evidence / References

- `src/components/dashboard/rich-text-editor.tsx`, `formatting-ribbon.tsx`: the shared editor and toolbar.
- `src/components/dashboard/cover-letter-sections/{opening,body,closing}-section.tsx`: the three fields.
- `src/components/dashboard/key-achievements-toolbar.tsx`: the existing alignment buttons on the CV.
- `src/lib/rich-html-sanitizer.ts`: keeps `text-align`.
- `src/lib/cover-letter-pdf-html.ts`: the PDF wrapper `text-align: left`.
- `src/app/api/cover-letters/[id]/download-docx/rich-text-blocks.ts`, `cover-letter-docx.ts`: Word alignment mapping.
- `src/app/[locale]/(dashboard)/dashboard/cover-letters/new/page.tsx`: the banner, which reads the missing key `coverLetters.new.creatingForJob`.
- `src/locales/{fr,en,de,it}/common.json`: `resumes.editor.richTextToolbar.align*`, `resumes.new.creatingForJob`, `common.at`.
- The owner's screenshot (2026-11-16): the English banner on `/fr`.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
