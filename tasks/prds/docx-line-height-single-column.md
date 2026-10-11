# PRD: Correct Word line height for Classic, Minimal and Creative at fractional font sizes

**Status:** APPROVED 2026-10-09

## Objective

At any font scale, the Classic, Minimal and Creative Word exports draw the same
line pitch as the Preview, as Professional and Modern have done since #88. A
parity profile at a fractional size proves it and guards it.

## Context / Current Behavior

- **What #88 did for Professional and Modern.** PR #88 (edc4947) made those two
  generators write exact line spacing from the unrounded Preview size:
  - `lineFontSizes` = px × fontScale × 1.5, at `D/docx-professional.ts:256-275`
    and through `lineOf()` in `docx-modern.ts:~598-635`;
  - runs keep the rounded `w:sz`.
  `D` = `src/app/api/resumes/[id]/download-docx/`.
- **Classic, Minimal and Creative still round.** They compute only rounded
  `scaledFontSizes` (`pxToHalfPoints` = `Math.round(px×1.5)`) and pass them to
  `exactLineSpacing`:
  - `D/docx-classic.ts:231-249`, with title at `:318` and heading at `:282`;
  - `D/docx-minimal.ts:225-244`;
  - `D/docx-creative.ts:291-302`, with heading and bar padding at `:439-441`.

  At a fractional size, Word's line pitch drifts from the Preview's. Computed
  from the current formulas:

  | Profile | Row | DOCX | Preview |
  |---|---|---|---|
  | scale-control | classic/creative bodyText | ×1.533 | ×1.500 |
  | scale-control | minimal bodyText | ×1.662 | ×1.625 |
  | per-property-control | classic/creative bodyText | ×1.488 | ×1.500 |
  | per-property-control | minimal bodyText | ×1.611 | ×1.625 |

  Recorded as a FINDING candidate in
  `tasks/ralph/archive/2026-10-07-parity-reader-docx-layout/progress.txt` (US-002).
- **Default output is unaffected.** At scale 1 with default sizes, every size is
  a whole half-point, so default exports are byte-identical before and after.
- **Why parity does not see it.** Line-height rows exist only in `primary`,
  `formatted-body` and `html-body-and-skills`, all at whole half-point sizes
  (`e2e/parity/profiles.ts:133-147, 275-284`). The control profiles
  (`scale-control`, `per-property-control`) have `rowGroups: []` and
  `control: true`, which `verdicts.ts:220` skips by design.
  - The DOCX side compares the exact pitch with the Preview size
    (`verdicts.ts:709-716`, `surfaces.ts:100-104`), at tolerance 0.01.
  - Only `bodyText` discriminates reliably: title is 0.007 off and heading 0.010.
- **Tests that pin the current behaviour.**
  - `D/docx-line-spacing.test.ts:293-320` checks classic, minimal and creative
    against the run's `w:sz`, with no `previewPx`, so it asserts the rounded
    behaviour. Its comment at `:204-210`, and the DECISION at
    `verdicts.ts:1025-1037`, say only professional and modern use unrounded
    sizes.
  - Not affected: the professional and modern geometry tests, the
    `e2e/docx-*-layout.spec.ts` specs (which assert `w:sz`), and the visual
    baselines (Preview only).
- **Word render method.** `docs/engineering/docx-word-parity.md` renders the DOCX
  in Word through COM and compares it with the Preview within ±1.5 px. It
  covers professional and modern only (`:3-9`).

## Scope

- **Generators.** Classic, Minimal and Creative get an unrounded
  `lineFontSizes`, the same as `scaledFontSizes` without rounding, and every
  `exactLineSpacing` call uses it. Run `size` stays rounded.
- **New parity profile `fractional-size`.** It is not a control profile. Its
  layout is `per-property-control`'s (all three sizes fractional), with
  `rowGroups: ['body-line-height']`, and it covers all five templates. Content
  is unset, so the plain-text body is sampled.
- **Tests and docs.**
  - Update `D/docx-line-spacing.test.ts`: add `previewPx` to the
    classic/minimal/creative cases and update its comment.
  - Update the `verdicts.ts` DECISION text so it names all five templates.
  - Extend `docx-word-parity.md` to these three templates, with a Word COM
    re-measure at a fractional size.

## Out of Scope

- A horizontal width scale (`w:w`) or tracking from unrounded sizes for these
  three templates. That would be a separate fidelity change.
- Baseline raise (`w:position`) for Georgia headings.
- Spacer lines, page layout, and any Preview change.
- The KNOWN `US-016-html-body-line-height` entry.

## Impact Assessment

- **Frontend / UI:** Not affected.
- **Internationalization:** Not affected.
- **Resume model / templates:** Not affected.
- **Exports:** Affected. The Classic, Minimal and Creative DOCX change at
  fractional sizes only.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected.
- **Testing / validation:** Affected. A new parity profile, an updated unit
  test, and a Word re-measure.

## User Stories

### US-001: Classic, Minimal and Creative Word line pitch follows the Preview at fractional sizes

**Description:**
As a user who scales their CV's font, I want the Word file's line spacing to
match the Preview for Classic, Minimal and Creative, so that pages break and
read the same everywhere.

**Acceptance Criteria:**

- [ ] **Every call.** In the three generators, every `exactLineSpacing` call
      receives the unrounded size of the element it spaces. Run `w:sz` values
      are unchanged.
- [ ] **Default exports.** At scale 1 with default sizes, the Classic, Minimal
      and Creative DOCX for the e2e fixture are byte-identical to before (hash
      of `word/document.xml` recorded before and after).
- [ ] **Professional and Modern.** Their DOCX are byte-identical to before for
      the same inputs (hashes recorded).
- [ ] **Unit test.** `D/docx-line-spacing.test.ts` asserts the pitch against
      the Preview px for all five templates, at scales 0.8, 1 and 1.2. It fails
      on the pre-story generators and passes after.
- [ ] **Word re-measure.** For each of the three templates at
      `per-property-control` sizes, Word's rendered body line pitch is within
      ±1.5 px of the Preview's, per baseline. Measured with the
      `docx-word-parity.md` method; the measurements are recorded in
      `progress.txt` and the doc.

### US-002: A parity profile guards line height at fractional sizes

**Description:**
As the owner, I want the parity check to compare line height at a fractional
size for every template, so that this drift can't come back unseen.

**Acceptance Criteria:**

- [ ] **The profile.** A `fractional-size` profile exists, with
      `per-property-control`'s layout and `rowGroups: ['body-line-height']`,
      covering all five templates. It is added to the `ProfileId` union.
- [ ] **MATCH.** Its five `line-height:bodyText` rows are MATCH. NEW stays 0,
      and KNOWN stays 3, unchanged.
- [ ] **It catches the defect.** With US-001's generator change reverted
      locally, the classic, minimal and creative rows of this profile are NEW.
      Run as evidence and not committed; the output is recorded.
- [ ] **Text.** The `verdicts.ts` DECISION text describes all five templates.
      The control profiles keep `control: true` and no rows.

## Functional Requirements

- **FR-1:** No change to `e2e/parity` comparison logic, tolerances or the KNOWN
  list, beyond the new profile and its id.
- **FR-2:** Only the three generator files, `docx-line-spacing.test.ts` and the
  docs change under `src/` and `docs/` for US-001.
- **FR-3:** The default-size output stays byte-identical. That is how the change
  stays safe for existing users.

## Regression Constraints

- `pnpm test:parity`: every existing row keeps its verdict, and only the new
  rows are added.
- `pnpm test:visual` is unchanged (Preview).
- The e2e DOCX layout specs and the geometry and letter-spacing tests pass
  unmodified.

## Required Verification

- The `CLAUDE.md` §14 baseline, plus `pnpm test:parity` (report sha recorded;
  row diff against the previous report: only the new rows) and
  `pnpm test:visual`.
- Export validation:
  - DOCX hashes for the unchanged cases (default sizes for all five templates;
    Professional and Modern at fractional sizes);
  - a Word COM measurement for the three templates at fractional sizes.
- `code-reviewer`. `ui-expert` is NOT_APPLICABLE (no UI).

## FAIL Conditions

- Any default-size DOCX or any Professional/Modern DOCX changes.
- A `fractional-size` row is NEW after the fix, or an existing row changes
  verdict.
- A tolerance is changed or a KNOWN entry is added to pass.

## BLOCKER Conditions

- The Word COM measurement cannot run on the machine (Word missing). Report it;
  the owner decides whether XML-level evidence is enough.
- A title or heading row at the new profile turns NEW after the fix, showing
  another rounding path. Report it; widen the scope only by PRD update.

## Risks

- Users who already exported at fractional scales will see slightly different
  line breaks in Word after the fix. This is intended, and it now matches the
  Preview.

## Evidence / References

- `D/docx-helpers.ts:62-66, 107-120`; `D/docx-professional.ts:244-287`;
  `D/docx-modern.ts:~598-666`; `D/docx-classic.ts:231-399`;
  `D/docx-minimal.ts:225-386`; `D/docx-creative.ts:291-302, 439-441`.
- `D/docx-line-spacing.test.ts:204-210, 293-348`.
- `e2e/parity/profiles.ts:61-93, 133-147, 275-311, 420-428`;
  `verdicts.ts:217-301, 334, 709-716, 1025-1037`; `surfaces.ts:100-104`.
- `docs/engineering/docx-word-parity.md:3-9, 42-77, 83-85, 129-139, 228-251`.
- `tasks/ralph/archive/2026-10-07-parity-reader-docx-layout/progress.txt`.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
