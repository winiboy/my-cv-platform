# PRD: Cover letter save status below the title

**Status:** APPROVED 2026-11-18

## Objective

In the cover letter editor, the save status ("Enregistré …" / "Modifications non enregistrées") is shown on its own line below the letter's title, so it never hides the title. The save time is shown in the interface language with hours and minutes, as in the CV editor.

## Context / Current Behavior

Owner request (2026-11-18, screenshot): when a cover letter is created or updated, the save time sits to the right of the title and hides it. The screenshot shows "Lettre de motivation - Médec", cut off at "Enregistré 3:51:09 PM". The owner wants the save time below the title.

Owner decision (2026-11-18): the time uses the CV editor's format: the interface language, hours and minutes.

Current behavior, from the repository (`src/components/dashboard/cover-letter-editor.tsx`, header around lines 810–864):
- **The header.** It holds the back link, then a container with the title `<input>` followed by one status `<span>`: "Unsaved changes" (`coverLetters.editor.unsavedChanges`, amber) or "Saved <time>" (`coverLetters.editor.lastSaved`, slate).
- **At xl and wider.** The span sits inline after the input (`ml-2 whitespace-nowrap`). The input's width is not tied to its text, so a long title is clipped where the status begins.
- **Below xl.** The status follows the title on the same line while both fit, and wraps under it otherwise (`flex-wrap`, the title keeps at least 6rem in the 44 px row). At 320 px, where even its own line is too narrow, it ends in an ellipsis.
- **The time.** It is `lastSaved.toLocaleTimeString()`, with no locale and no options. It therefore follows the browser's locale and shows seconds ("3:51:09 PM" on `/fr`).
- **Reference: the CV editor** (`src/components/dashboard/resume-editor.tsx` around lines 1092–1113). It puts the title on one line and the status as a `<p>` below it, and formats the time with `toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })`.
- **Labels.** They already exist in fr, en, de and it: `coverLetters.editor.lastSaved` ("Enregistré", …) and `coverLetters.editor.unsavedChanges`.

## Scope

- The cover letter editor's header: the save status ("Saved <time>" and "Unsaved changes") moves to its own line directly below the title, at every width.
- The title uses the width the status used to take, at every width.
- The save time is formatted in the interface locale with hours and minutes, as the CV editor does.

## Out of Scope

- The CV editor's header.
- The header's buttons, the "•••" menu, the back link, the bottom bar and the editor's navigation.
- When the letter is saved, autosave, and what counts as an unsaved change.
- The status labels' wording.
- Any database change, any export, the letter's content and template.

## Impact Assessment

- **Frontend / UI:** Affected. Layout of the cover letter editor header.
- **Internationalization:** Affected. The time now follows the interface locale. The labels are unchanged and already translated.
- **Resume model / templates:** Not affected.
- **Exports:** Not affected.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected.
- **Testing / validation:** Affected. e2e, browser evidence and `ui-expert`. Existing header specs that assert the status beside the title will need updating to the new layout.

## User Stories

### US-001: The save status sits below the letter's title and never hides it

**Description:**
As a user editing a cover letter, I want the save status below the title, so that I can read my letter's full title.

**Acceptance Criteria:**

- [ ] After a save, "Saved <time>" in the interface language (`/fr` "Enregistré …") is shown on its own line directly below the title input, left-aligned with it. This holds at 1440, 1280, 1024, 768, 375 and 320 px.
- [ ] With unsaved edits, "Unsaved changes" in the interface language is shown in the same place below the title, never beside it.
- [ ] The status never overlaps or clips the title: at every width above, the title input's right edge is not covered by the status, and the status's top is below the title input's bottom.
- [ ] A long title, such as "Lettre de motivation - Médecin adjoint·e en pédopsychiatrie", shows more of its text than before at 1440 px. It is no longer cut where the status began, but only at the end of the space the title area has.
- [ ] The save time shows hours and minutes in the interface locale, with no seconds: for example "15:51" on `/fr` and `/de`, "3:51 PM" on `/en`. It is the same format the CV editor uses for the same time.
- [ ] Below xl, the header row still holds the back link, the title with its status, and the "•••" menu on one row. Nothing overflows horizontally from 320 to 1279 px, and the back link and menu keep their 44 px size.
- [ ] At xl and wider, the header's buttons keep their current position and wrapping behaviour.
- [ ] The status is still announced as before: no status text is lost from the accessibility tree.

## Functional Requirements

- **FR-1:** The status is shown in one place, below the title, at every width. It is never beside the title.
- **FR-2:** The time is formatted from the interface locale with hours and minutes, matching `resume-editor.tsx`'s format.
- **FR-3:** The labels come from the existing `coverLetters.editor.lastSaved` and `coverLetters.editor.unsavedChanges` in fr, en, de and it. No string is hard-coded.

## Regression Constraints

- The CV editor's header is unchanged.
- The cover letter header's buttons (Generate, Check, Preview, translate, downloads, Save), the "•••" menu and the bottom bar behave and look as before.
- Editing the title still updates and saves it as before.
- The editor's other e2e specs stay green; any spec that asserted the old inline position is updated to the new layout, not deleted.
- `pnpm test:parity` and `pnpm test:visual` keep their current results: MATCH 211 / KNOWN 3 / NEW 0, and 10/10.

## Required Verification

- An e2e test, in fr, en, de and it, at 1440, 1024, 768, 375 and 320 px:
  - the status is below the title and left-aligned with it, for both "Saved" and "Unsaved changes";
  - the status does not overlap the title;
  - the page has no horizontal overflow;
  - the time format has hours and minutes in the interface locale, with no seconds.
- Browser evidence (screenshots) of the header with a long title, before and after a save, at those widths.
- `ui-expert` validation of the header against the CV editor's header.
- The CLAUDE.md §14 baseline, with lint at or below the tracked ceiling. Also `pnpm test:parity` and `pnpm test:visual`.

## FAIL Conditions

- **Beside the title:** the status appears beside the title at any width.
- **Title hidden:** the status overlaps or clips the title at any width.
- **Wrong time format:** the time shows seconds, or a format other than the interface locale's.
- **Header broken:** the header overflows horizontally, the "•••" menu or back link moves out of the row below xl, or the buttons change at xl.
- **Hard-coded text:** a label is hard-coded, or in English on `/fr`, `/de` or `/it`.
- **CV change:** the CV editor's header changes.

## BLOCKER Conditions

- The status's own line does not fit the mobile header (below xl) without growing the header past its current row height, and no layout keeps the back link, title and menu usable. In that case the mobile layout must go back to the owner.

## Risks

- **Taller header.** A second line adds height to the header, at xl and on mobile. On a phone that leaves a little less room for the form.
- **Existing specs.** `e2e/cover-letter-editor-mobile.spec.ts` and other header specs may assert the old "status beside the title while it fits" behaviour, and will need updating.

## Evidence / References

- `src/components/dashboard/cover-letter-editor.tsx`: the header, title input and status spans, and the comments explaining the current wrap rules.
- `src/components/dashboard/resume-editor.tsx`: the CV editor's title with its status below and the time format.
- `src/locales/{fr,en,de,it}/common.json`: `coverLetters.editor.lastSaved`, `coverLetters.editor.unsavedChanges`.
- `e2e/cover-letter-editor-mobile.spec.ts`: the existing mobile header coverage.
- The owner's screenshot (2026-11-18): the title cut off by "Enregistré 3:51:09 PM".

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
