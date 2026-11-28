# PRD: One text toolbar at the top of the cover letter editor

**Status:** Status: APPROVED 2026-11-28

## Objective

In the cover letter editor, the only place to format text is one toolbar at the top of the page, under the letter's title, which formats the opening, every body paragraph and the closing.

## Context / Current Behavior

Owner request (2026-11-28, FR), with a screenshot of the "Accroche" section:

> Je veux que les options de configuration du texte soient déplacées comme indiqué sur l'image attachée. […] je veux que tu le fasses pour les 3 champs suivants : accroche, corps et conclusion. In fine, le seul endroit pour configurer son texte sera situé au top de la page comme indiqué sur l'image attachée.

The screenshot moves the formatting toolbar from above the "Paragraphe d'introduction" field to the header band under the letter's title and its save status, left of the "Traduire" row and below the Générer / Vérifier / Aperçu / PDF / Word / Enregistrer buttons.

Owner decisions (2026-11-28, confirmed in the session before drafting):
- **One shared toolbar** replaces the toolbar of the opening, of each body paragraph and of the closing.
- **Bold, italic, underline, bullet list, numbered list, font and font size** act on the selection in the field that holds the cursor, as today.
- **The four alignments (left, center, right, justify) act on all three fields at once**: the opening, every body paragraph and the closing. Owner's words: « Pour tous les alignements elle agit sur tous les champs Accroche, corps et conclusion. »
- **No field focused:** the toolbar stays visible, greyed out.
- **Scrolling:** the toolbar stays visible while the letter scrolls. **Mobile:** it stays on one line that scrolls horizontally.

This reverses one decision of the approved PRD `cover-letter-alignment-and-job-banner.md` (2026-11-16): there, alignment applied **per paragraph, as in Word**. Here one click aligns the whole letter.

Current behavior, from the repository (`origin/main` cea31e9):
- `RichTextEditor` (`src/components/dashboard/rich-text-editor.tsx`) renders its own `FormattingRibbon` (`formatting-ribbon.tsx`) above its contentEditable unless `showRibbon` is false. The ribbon holds bold, italic, underline, bullet list, numbered list, font and font size, and the four alignment buttons when `showAlignment` is set.
- The cover letter uses it in `cover-letter-sections/opening-section.tsx` (`#opening-paragraph`), `body-section.tsx` (one editor per paragraph, `#body-paragraph-<n>`) and `closing-section.tsx` (`#closing-paragraph`), all with `showAlignment`.
- The same editor and ribbon serve the CV's summary, experience, education, projects and skills fields, without alignment.
- Font and size wrap the selection in a `<span style>`. Alignment writes `text-align` on the blocks the selection touches. Everything is stored in the field's HTML; the preview, the PDF and the Word export already read it (`download-docx/rich-text-blocks.ts`, `cover-letter-pdf-html.ts`).
- The editor page (`src/components/dashboard/cover-letter-editor.tsx`) has a header (`data-testid="cover-letter-editor-header"`: back, title, save status, action buttons), then at `xl` a "Translate" row, then the section nav and the scrolling form column (`overflow-y-auto`) beside the preview pane. Below `xl` the actions sit in the "•••" menu and the Translate row is hidden.
- `e2e/cover-letter-paragraph-alignment.spec.ts` asserts the per-paragraph behavior and finds the alignment buttons inside each field.

## Scope

- One formatting toolbar in the editor's header area, in the band left of the "Translate" row at `xl`, and in a row of its own under the header below `xl`.
- Removal of the per-field toolbar from the opening, every body paragraph and the closing.
- Selection-based commands (bold, italic, underline, bullet list, numbered list, font, font size) applied to the field that holds, or last held, the cursor.
- Alignment applied to every block of the opening, of every body paragraph and of the closing.
- The toolbar's enabled, disabled and active states.
- Updating the existing alignment e2e to the new behavior.

## Out of Scope

- The CV editor: it stays unchanged — its fields have no formatting toolbar, and its key-achievements toolbar is unchanged. (Corrected 2026-11-28 with the owner's agreement.)
- The greeting, sign-off, recipient, sender, subject, date, signature and annexes fields: they are not rich text and get no formatting.
- New formatting commands, keyboard shortcuts, or a letter-wide default font or size.
- The Preview, the PDF export and the Word export: they already render the stored HTML and must not change.
- The header's action buttons, the "•••" menu, the Translate row's content and the section nav.
- Any database or API change.

## Impact Assessment

- **Frontend / UI:** Affected — new toolbar placement, per-field toolbars removed, focus tracking across fields.
- **Internationalization:** Affected — the toolbar reuses the existing `resumes.editor.richTextToolbar` labels; a new accessible name for the toolbar may need keys in fr, en, de, it.
- **Resume model / templates:** Not affected — the CV editor and templates are unchanged.
- **Exports:** Not affected — alignment, font and size stay in the field HTML that the PDF and Word already read. Verified by the existing export assertions in the alignment e2e.
- **Database / persistence:** Not affected — same columns, same HTML format.
- **Security / authorization:** Not affected — HTML still passes the existing sanitizer; no new input path.
- **Testing / validation:** Affected — the alignment e2e changes from per-paragraph to whole-letter; new e2e for the toolbar.

## User Stories

### US-001: One toolbar at the top formats the field the cursor is in

**Description:**
As a user writing a cover letter, I want a single formatting toolbar at the top of the page, so that I format the opening, the body and the closing from one place.

**Acceptance Criteria:**

- [ ] At 1440×900, the toolbar is inside the band under the header, left of the "Translate" label, and its top is below the bottom of the letter title's save-status line.
- [ ] The opening, every body paragraph and the closing show no toolbar of their own: inside `#opening-paragraph`'s field, each `#body-paragraph-<n>`'s field and `#closing-paragraph`'s field, no bold, italic, underline, list, alignment, font or size control exists.
- [ ] With text selected in the opening, then in body paragraph 2, then in the closing, clicking Bold in the top toolbar makes only that selection bold; the other two fields' HTML is unchanged.
- [ ] Italic, underline, bullet list, numbered list, font and font size act the same way: on the selection of the field holding the cursor only.
- [ ] Choosing a font or a size from the toolbar's selects applies it to the selection made before opening the select.
- [ ] With the cursor in no rich-text field since the section was opened (e.g. the Recipient section, or the greeting input), the toolbar is visible and its selection-based controls are disabled (`disabled` or `aria-disabled="true"`).
- [ ] After the cursor leaves a field for a toolbar control, that field stays the target; clicking into the greeting input or another section clears the target and the controls are disabled again.
- [ ] The toolbar's bold, italic and underline buttons show the active state of the selection in the target field.
- [ ] The CV editor is unchanged: its summary field shows no formatting controls, and the CV page does not show the letter's toolbar. (Corrected 2026-11-28 with the owner's agreement: the CV fields have had no ribbon since before this PRD.)

### US-002: An alignment button aligns the whole letter

**Description:**
As a user, I want one alignment click to align the opening, the body and the closing together, so that the letter is aligned the same way throughout.

**Acceptance Criteria:**

- [ ] In a letter with text in the opening, two body paragraphs and the closing, clicking Justify sets `text-align: justify` on every block of the four fields, wherever the cursor is.
- [ ] The same holds for left, center and right.
- [ ] A text block with no wrapping element is wrapped so that it carries the alignment; no text is lost or reordered.
- [ ] After Justify, the editor pane preview and the preview window show every paragraph of the opening, body and closing justified.
- [ ] After Justify and Save, the downloaded PDF and the Word file show those paragraphs justified (Word: `w:jc` both).
- [ ] When every block of the three fields has the same alignment, that alignment's button shows as active; otherwise none does.
- [ ] Alignment buttons are enabled whenever the opening, body or closing holds text, whether or not a field has the cursor.
- [ ] A body paragraph added after an alignment was applied to the whole letter starts with that alignment.
- [ ] Bold, italic, underline, lists, font and size in the existing text are unchanged by an alignment click.

### US-003: The toolbar stays reachable while scrolling and on a phone

**Description:**
As a user on any screen size, I want the toolbar to stay reachable while I scroll a long letter, so that I never scroll back up to format.

**Acceptance Criteria:**

- [ ] At 1440×900, after scrolling the form column to its bottom, the toolbar is still within the viewport at the same position.
- [ ] At 390×844, the toolbar is a single row under the header, visible after scrolling the form to its bottom.
- [ ] At 390×844 and 320×568, the toolbar does not wrap; controls beyond the width are reached by horizontal scroll of the toolbar only, and the page has no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`).
- [ ] Every toolbar control is reachable with Tab, has a visible focus ring and an accessible name in fr, en, de and it.
- [ ] On a phone, tapping a toolbar control does not dismiss the selection in the target field before the command applies.

## Functional Requirements

- **FR-1:** The cover letter editor renders exactly one formatting toolbar, owned by the editor page, not by the fields.
- **FR-2:** The opening, body and closing editors render without a ribbon. The CV editor's use of `RichTextEditor` and `FormattingRibbon` keeps its current behavior.
- **FR-3:** The toolbar's target for selection-based commands is the opening, body or closing field that last held the cursor, until the user acts in another field or control that is not part of the toolbar (types, clicks it, or changes it). Moving focus through other controls with Tab or Shift+Tab without acting in them keeps the target, so the toolbar stays reachable by keyboard. (Clarified 2026-11-28 with the owner's agreement.)
- **FR-4:** An alignment command writes the chosen `text-align` on every block of the opening, every body paragraph and the closing, and each changed field reports its new HTML through its existing `onChange`, so the letter becomes "unsaved" as with any edit.
- **FR-5:** Formatting is stored only in the field HTML, as today. No new stored property.
- **FR-6:** All toolbar labels come from the existing i18n dictionaries; any new key exists in fr, en, de and it.

## Regression Constraints

- Ctrl/Cmd+B, I, U still work inside each field.
- Pasting still inserts plain text.
- Existing letters open with their stored formatting, including mixed per-paragraph alignments, unchanged until the user clicks an alignment button.
- Adding, moving and removing body paragraphs works as today.
- The header keeps its action buttons, the "•••" menu below `xl`, the save status under the title, and its single-row height below `xl`.
- The Translate row keeps its flags and status at `xl`.
- The CV editor is unchanged: its summary, experience, education, projects and skills fields show no formatting toolbar, and its key-achievements toolbar is unchanged. (Corrected 2026-11-28 with the owner's agreement.)
- PDF and Word export code is unchanged.

## Required Verification

- The CLAUDE.md §14 baseline on the final diff: `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm build` (or `pnpm build:verify`), `pnpm lint` compared to the baseline.
- Unit tests for the toolbar's enabled/disabled/active states and for the whole-letter alignment transform.
- E2E: `e2e/cover-letter-paragraph-alignment.spec.ts` rewritten to the whole-letter behavior, keeping its editor → previews → PDF → Word chain.
- E2E for US-001 (target field, disabled state, no per-field toolbar) and US-003 (scroll and the 1440, 390 and 320 widths), including a check that the CV editor shows no formatting toolbar on its fields and no letter toolbar. (Corrected 2026-11-28 with the owner's agreement.)
- `ui-expert` rendered review with screenshots at 1440×900, 390×844 and 320×568, in fr and de (longest labels), with the toolbar disabled, enabled and after scrolling.
- `code-reviewer` review of each story.

## FAIL Conditions

- Any formatting control remains inside the opening, a body paragraph or the closing.
- A selection-based command changes a field other than the one holding the cursor.
- An alignment click leaves a block of the opening, body or closing with another alignment, or changes text, bold, italic, font or size.
- The PDF or Word file does not show the alignment shown in the editor.
- The toolbar scrolls out of view, wraps, or causes horizontal page scroll at the widths above.
- The CV editor's ribbon changes.
- A user-facing string is hardcoded or missing in one of fr, en, de, it.

## BLOCKER Conditions

- This PRD is not marked approved by the owner.
- An acceptance criterion cannot be met without changing the PDF or Word export code, the CV editor's ribbon, or the stored HTML format.

## Risks

- Clicking a toolbar control or opening a native `<select>` can take the selection away from the field; the target and its range must survive that, on desktop and touch.
- Whole-letter alignment edits several fields at once; undo (Ctrl+Z) may only revert the field that has focus.
- Moving formatting out of `RichTextEditor` touches a component the CV editor shares.

## Evidence / References

- `src/components/dashboard/rich-text-editor.tsx` — editor, its ribbon and every command's implementation.
- `src/components/dashboard/formatting-ribbon.tsx` — the controls, alignment group and active-alignment tracking.
- `src/components/dashboard/cover-letter-sections/opening-section.tsx`, `body-section.tsx`, `closing-section.tsx` — the three fields.
- `src/components/dashboard/cover-letter-editor.tsx` — header (≈ line 820), Translate row (≈ line 976), scrolling form column (≈ line 1151).
- `e2e/cover-letter-paragraph-alignment.spec.ts` — current per-paragraph alignment chain to the PDF and Word.
- `tasks/prds/cover-letter-alignment-and-job-banner.md` — the per-paragraph decision this PRD reverses.
- Owner screenshot of 2026-11-28 (Accroche section, red arrow to the header band).

## Open Questions

- None.

Resolved by the owner on 2026-11-28 (« Approuvez-vous le PRD avec les choix proposés pour Q1 et Q2 ? » — « Oui, approuvé »):
- Q1: alignment buttons stay enabled when no field has the cursor (US-002).
- Q2: a body paragraph added after a whole-letter alignment starts with that alignment (US-002).

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
