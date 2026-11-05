# PRD: Two flaky e2e specs pass deterministically

**Status:** DRAFT

## Objective

`e2e/resume-pdf-route.spec.ts` (the Preview-print fidelity tests) and `e2e/job-applications-i18n.spec.ts` (the quick-add validation and drag-and-drop announcement steps) pass on every run, locally and in CI. They keep checking the same product behaviour, and no assertion is weakened.

## Context / Current Behavior

**Owner request (chat, 2026-11-05):** stabilize these tests first. They were blocking every story of `cover-letter-swiss-format`, which is paused until this ships.

**Observed failures.** Full `pnpm test:e2e` runs on unrelated diffs failed at about one test per run. The two specs below cover most of them:

- **`resume-pdf-route.spec.ts:372`** ("<template>, non-default layout, multi-page: same pages, page size and text as the Preview print"):
  - **Seen:** 7 times, across the cover-letter-editor-mobile and cover-letter-swiss-format branches, for the classic, professional and creative templates. It also failed when run alone (2 of 21, 2026-11-04).
  - **What differs:** only the whitespace inside letter-spaced headings. The characters are identical and in the same order.
    - Preview print: `V I S U A L B A S E L I N E - C L A S S I C`, `S u m m a r y`.
    - Route PDF: `VISUAL BASELINE - CLASSIC`, `Summary`.
  - **Cause:** `readPdf` (`e2e/fixtures/pdf.ts` L34–51) joins pdf.js `getTextContent()` items with a space. pdf.js splits letter-spaced text into one item per glyph depending on the glyph gaps in that PDF. Two PDFs of the same page can therefore extract different whitespace.
  - `expectSamePdf` (`resume-pdf-route.spec.ts` L154–166) compares the page text with `toBe`.
  - On origin/main, another case of the same spec (`:239`, "401 without a session, and with a forged one") failed once, 2026-11-04.
- **`job-applications-i18n.spec.ts`:**
  - **`:492` ("fr: the board, quick add and toasts show no English")** has failed 3 times:
    - in CI twice in a row on PR #121;
    - locally once.
  - At L346–352 the test fills 256 characters into the title and company and a 2,000-character URL, presses save, and expects the three "too long" messages. In CI the title message appeared and the company message never did within 15 s. Locally the URL-invalid message at L359 failed the same way once. It passed 4/4 with `--repeat-each=4` locally on 2026-11-05.
  - **`:1142` ("<locale>: drag and drop is announced in the page language")** has failed 2 times. The announcement read was the pick-up text ("Hai preso … dalla colonna Candidato.") where the drop text was expected: the live region was read before it changed. It passed 50/50 alone with `--repeat-each=2`.

**Other one-off failures seen** (not in this PRD's scope):
- `layout-persistence.spec.ts:172`;
- `modern-print-sidebar-full-page.spec.ts:365` (on main's CI after #120);
- `cover-letter-editor-spacing.spec.ts:150`;
- `resume-pdf-route.spec.ts:333`.

The last two were 15 s `page.fill` timeouts.

**Tooling.** Playwright with `--repeat-each`. CI (`.github/workflows`) runs the E2E job on every PR.

## Scope

- `resume-pdf-route.spec.ts`: the Preview-print fidelity comparison, and the shared `readPdf` helper (`e2e/fixtures/pdf.ts`) if the fix belongs there.
- `job-applications-i18n.spec.ts`: the quick-add validation steps and the drag-and-drop announcement reads.
- Product code only if the diagnosis shows the flakiness is a real product defect, such as a validation message that can fail to appear. Such a fix must be the smallest one, and it is reported.

## Out of Scope

- The other one-off failures listed in Context.
- Playwright retries, longer global timeouts, or `test.fixme`/`skip` as the fix.
- Changing what the tests prove: page count, page size, text content and order; every localized message; every announcement.
- CI configuration.
- The cover-letter-swiss-format work.

## Impact Assessment

- **Frontend / UI:** Not affected, unless the diagnosis finds a product defect in the quick-add form or the drag announcements (then reported and fixed minimally).
- **Internationalization:** Not affected. The tests keep asserting the localized strings.
- **Resume model / templates:** Not affected.
- **Exports:** Not affected. The resume PDF route and Preview print are unchanged; only how the test compares them changes.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected.
- **Testing / validation:** Affected. These two e2e specs and possibly `e2e/fixtures/pdf.ts`.

## User Stories

### US-001: The resume PDF fidelity tests compare content, not pdf.js spacing

**Description:**
As the team, I want the route-versus-Preview-print comparison to ignore how pdf.js splits letter-spaced glyphs, so that it fails only when the two PDFs really differ.

**Acceptance Criteria:**

- [ ] The page-text comparison in `expectSamePdf` no longer depends on whitespace that pdf.js inserts between glyph items.
  - It still fails when a character is added, removed, changed or reordered.
  - It still fails when the text moves to another page.
- [ ] A unit-level or fixture check proves it: two page texts that differ only by spaces inside letter-spaced words compare equal; texts that differ by one character, or by two swapped words, do not.
- [ ] Page count, page size, the A4 check, the no-print-chrome check and the modern band check are unchanged.
- [ ] `e2e/resume-pdf-route.spec.ts` passes 10 times in a row (`--repeat-each=10`), run alone.
- [ ] Every other user of `readPdf` keeps its behaviour, or is checked to remain correct if the helper changes.

### US-002: The job-applications i18n spec waits for what it asserts

**Description:**
As the team, I want the quick-add and drag-and-drop steps to wait for the UI state they check, so that they never read too early.

**Acceptance Criteria:**

- [ ] **Diagnosis.** The cause of the quick-add failure is diagnosed and recorded: test timing, or the form showing its "too long" messages in sequence or late. If it is a product defect, the smallest product fix makes all three messages appear after one submit, and it is reported.
- [ ] **Quick-add assertions.** The steps still assert:
  - every "required" message;
  - the three "too long" messages;
  - the invalid-URL message;
  - the no-English scan;
  - in every locale the spec covers.
- [ ] **Drag-and-drop announcements.** Each announcement assertion waits for the expected text (for example a web-first `toHaveText` on the live region), instead of reading the region once. Each still asserts the exact localized pick-up, over, drop and cancel wording.
- [ ] **Repeat runs.** `e2e/job-applications-i18n.spec.ts` passes 10 times in a row (`--repeat-each=10`), run alone.

## Functional Requirements

- **FR-1:** No retries, no raised global timeouts, no skip or fixme. Per-assertion waits use Playwright's web-first assertions with their default timeout.
- **FR-2:** No assertion is removed or loosened beyond what the story names. Specifically, US-001 ignores only pdf.js inter-item whitespace.
- **FR-3:** A product change is made only for a diagnosed product defect. It is the smallest change, keeps every existing behaviour, and is covered by its own test.

## Regression Constraints

- Every other e2e spec is unaffected, and so is every other user of `e2e/fixtures/pdf.ts`.
- `pnpm test:parity` and `pnpm test:visual` keep their baselines.
- The resume PDF route, the Preview print, the job-applications board and the quick-add form behave as before, unless FR-3 applies.

## Required Verification

- The `CLAUDE.md` §14 baseline.
- Each changed spec passes `--repeat-each=10` alone.
- Two consecutive full `pnpm test:e2e` runs on the final diff with neither of these two specs failing. Another spec failing is recorded, with its error.
- CI's E2E job on the PR is green on its first attempt, or a failure in another spec is recorded.
- `code-reviewer` on each story, confirming no assertion was weakened beyond FR-2.
- `ui-expert` only if FR-3 changes product UI.

## FAIL Conditions

- Either spec fails in any `--repeat-each=10` run, or in a full-suite run on the final diff.
- The fidelity comparison would accept a changed or reordered character, or text on the wrong page.
- An assertion is removed, a locale dropped, a retry or skip added, or a global timeout raised.

## BLOCKER Conditions

- The quick-add failure turns out to be a product defect whose fix needs a product decision. Report it; the owner decides.
- The failures cannot be reproduced or understood locally, and no evidence ties a fix to them. Report it with what was tried.

## Risks

- A whitespace-insensitive comparison could hide a real word-boundary change. The character-order and per-page checks bound it; US-001 tests both directions.
- The CI failure on PR #121 may depend on runner speed. Ten local repeats cannot fully prove CI stability, so the first-attempt CI result is part of the evidence.

## Evidence / References

- `e2e/resume-pdf-route.spec.ts` L98–120 (`printPreview`), L154–166 (`expectSamePdf`), L367–389 (the fidelity tests).
- `e2e/fixtures/pdf.ts` L34–51 (`readPdf`: text items joined with a space).
- `e2e/job-applications-i18n.spec.ts` L330–360 (quick add), L1142–1146 (drag and drop), and the `walkDragAndDrop` helper.
- `tasks/ralph/progress.txt` on `ralph/cover-letter-editor-mobile` and `ralph/cover-letter-swiss-format`: the recorded failures and their errors.
- PR #121 CI run 41999923969: two E2E failures on `job-applications-i18n.spec.ts:492`, green on the third attempt.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
