# PRD: Realign the parity reader with the Word layout shipped in #88

**Status:** APPROVED 2026-10-06

> **Amendment 2026-10-06 (awaiting owner re-approval).** Approved as written on
> 2026-10-06. Implementing US-001 showed that the stale line-height rule is not
> specific to Professional.
>
> - **Shared cause.** #88 writes the exact spacing from the unrounded Preview
>   size in every generator whose run size is not a whole half-point. The reader
>   divides by the rounded run size.
> - **Example.** `primary · modern · line-height:sectionHeading` reads ×1.390
>   against ×1.400 (19.2 px → 28.8 half-points, written as 29). The same row at
>   fontScale 1 (`scale-control`) is MATCH.
> - **Unlisted rows.** It also hits `formatted-body · professional ·
>   line-height:bodyText`, which the original list did not name.
>
> What changes: US-002 now covers every line-height row affected by this rule,
> for any template and profile. US-001's "no NEW" criterion excludes the
> line-height rows that US-002 owns. Nothing else changes.

## Objective

`pnpm test:parity` is green again on `main`: 0 NEW divergences, with no failing
collect test. It gets there by teaching the parity reader the DOCX structures
that PR #88 introduced on purpose, without loosening any comparison and without
changing an export.

## Context / Current Behavior

- On `origin/main` (f07574d and later), `pnpm test:parity` reports 182 passed
  and 67 failed. The last green run, recorded in
  `tasks/ralph/archive/2026-09-26-milestone-c-part-3/progress.txt:823-824`, was
  249 passed (MATCH 206, KNOWN 3, LIMITATION 11, FINDING 3, DECISION 16).
  `e2e/parity/*` has not changed since 7cd97f6 (#78). The failures appeared with
  PR #88 (edc4947), which changed the Word generators to match the Preview.
- **Modern accent (8 collect tests fail, which drags down about 57 row tests).**
  - `e2e/parity/surfaces.ts:1229` reads the accent from the sidebar heading
    paragraph's own shading (`w:pPr/w:shd`, via `shadingColour`, `:1030-1038`,
    `:1068`). If it finds none, it throws `The DOCX accent has no shading`
    (`:1197`).
  - Since #88, `docx-modern.ts:831-871` draws each sidebar heading as a one-cell
    table. The accent sits on the cell (`w:tcPr/w:shd`, `ShadingType.CLEAR`,
    `fill` = accent, `:858`), and the paragraph has no shading.
  - Every Modern collect test therefore throws before it writes its observation,
    and every Modern row then fails with "No observation …"
    (`parity.spec.ts:131`).
- **Probable masked defect.** `sidebarBackground` (`surfaces.ts:1224-1228`)
  takes the innermost cell around the sidebar anchor (`cellShadingAt`,
  `:1077-1088`). If that anchor is a heading, the innermost cell is now the
  accent banner, not the sidebar cell. The accent throw hides this today.
- **Professional line height (NEW divergences).**
  - Since #88, `docx-professional.ts:256-275` writes the exact line spacing from
    the unrounded Preview size (`lineFontSizes`), while runs keep the rounded
    `w:sz`.
  - `surfaces.ts:1159` divides `w:line` by the rounded run size. That gives
    ×1.188 for documentTitle (475 / 20 / 20) and ×1.335 for bodyText, against
    ×1.200 and ×1.350 in Preview and PDF.
  - The pitch Word draws equals the Preview's line box. The reader's rule is
    stale; the generator is right.
  - The written rule, DECISION "line height: Word exact spacing"
    (`verdicts.ts:1019-1026`), describes the old method.
- **Classification rules** (`verdicts.ts:119-164`, `:142-153`, `:899-921`):
  - KNOWN is reserved for open defects that carry a signature. "Nothing that is
    NEW may be listed here." Registering these rows as KNOWN would break the
    suite's own rule.
  - LIMITATION / FINDING / DECISION annotate things that are not rows.
- `test:parity` runs in no CI job (`docs/engineering/ralph-pass-criteria.md:42-44`).
  That is how #88 merged with the suite red.
- pdf.js logs "Warning: FormatError: Unsupported ShadingType: 1" 40 times while
  the PDF is read. It is a warning, not a failure, and comes from
  `pdf-parse@1.1.4`'s bundled pdf.js.

## Scope

- **Modern accent.** The reader finds the Modern accent where #88 puts it: the
  shading of the cell that wraps the sidebar heading.
- **Modern sidebar background.** The reader takes it from the sidebar cell
  itself, not from a nested heading cell.
- **Professional line height.** The reader compares it on the quantity the
  generator now encodes (the exact pitch against the Preview's line box), and
  the DECISION text describing the method is updated to match.
- **Reader unit coverage.** Unit tests for the changed reader paths, using small
  synthetic DOCX XML fragments, prove that a missing accent and a wrong line
  pitch are still detected.

## Out of Scope

- Any change under `src/`: the DOCX/PDF generators, templates and Preview.
- Adding `test:parity` to CI. That is a separate owner decision.
- The pdf.js `Unsupported ShadingType` warning.
- Adding, removing or editing KNOWN entries. Re-baselining visual snapshots.
- Any parity profile other than what the two failure families require.

## Impact Assessment

- **Frontend / UI:** Not affected. No product code changes.
- **Internationalization:** Not affected.
- **Resume model / templates:** Not affected.
- **Exports:** Not affected in code. The DOCX output is the reference being read,
  not something being changed.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected.
- **Testing / validation:** Affected. `e2e/parity/surfaces.ts`, `verdicts.ts`
  (DECISION text) and new reader unit tests.

## User Stories

### US-001: The parity check reads the Modern accent and sidebar from the Word layout #88 ships

**Description:**
As the owner, I want the Modern collect tests to read the accent and the sidebar
background where the Word export now draws them, so that parity measures Modern
again instead of crashing.

**Acceptance Criteria:**

- [ ] All 8 Modern collect tests (primary, scale-control, per-property-control,
      modern-empty-main, modern-non-integer-hue, font-not-chosen,
      formatted-body, html-body-and-skills) complete and write their observation
      files.
- [ ] The DOCX accent colour the reader reports for Modern equals the accent the
      generator writes (`docx-modern.ts` cell `fill`) for each profile, including
      `modern-non-integer-hue`.
- [ ] The DOCX sidebar background the reader reports is the sidebar cell's
      shading, not the heading cell's. A profile where the accent and sidebar
      colours differ shows two different values.
- [ ] Every Modern row is MATCH, KNOWN (unchanged list) or an annotated
      LIMITATION/FINDING/DECISION. None is NEW, except `line-height:*` rows
      whose DOCX side is the exact spacing written from an unrounded size. Those
      rows are owned by US-002.
- [ ] A unit test on the reader proves that a sidebar heading whose cell carries
      no shading still raises "The DOCX accent has no shading", and that a
      paragraph-level-only shading (the pre-#88 shape) is still accepted or is
      explicitly rejected, with the choice documented in the test.

### US-002: The parity check compares Word line height on the pitch Word draws

**Description:**
As the owner, I want line-height rows to compare the line pitch Word actually
draws with the Preview's line box, for every template, so that a correct export
is not reported as a NEW divergence.

**Acceptance Criteria:**

- [ ] These rows are MATCH:
      - `primary · professional · line-height:documentTitle`
      - `primary · professional · line-height:bodyText`
      - `html-body-and-skills · professional · line-height:bodyText`
      - `formatted-body · professional · line-height:bodyText`
      - `primary · modern · line-height:sectionHeading`

      No other `line-height:*` row of any template and profile is NEW.
- [ ] The comparison stays at the existing tolerance (`verdicts.ts:333`). The
      fix is in the quantity compared, not in a wider tolerance.
- [ ] The DECISION "line height: Word exact spacing" text describes the new
      method and names #88 as the reason for it.
- [ ] A unit test on the reader proves that an exact line spacing 5% off the
      Preview line box is still reported as a divergence.
- [ ] Line-height rows that are MATCH today, at whole half-point sizes (for
      example every `scale-control` row), stay MATCH. The three KNOWN
      `US-016-html-body-line-height` rows still reproduce, as "expected to
      fail".

## Functional Requirements

- **FR-1:** Only files under `e2e/parity/`, plus new reader unit tests, change.
  `git diff -- src` is empty.
- **FR-2:** No tolerance, KNOWN entry or profile is loosened, removed or added to
  make a row pass.
- **FR-3:** Each reader change has a source comment naming the DOCX structure it
  reads and the PR that introduced it (#88).

## Regression Constraints

- KNOWN stays at 3 entries, and all 3 still reproduce.
- Non-Modern, non-Professional rows keep their verdicts.
- `pnpm test:e2e` and `pnpm test:visual` results are unchanged. The parity specs
  stay excluded from the default e2e config.

## Required Verification

- The `CLAUDE.md` §14 baseline on the final diff.
- `pnpm test:parity`: exit 0, 0 NEW, and the verdict totals (MATCH, KNOWN,
  LIMITATION, FINDING, DECISION) recorded. Two consecutive runs with
  byte-identical reports, with the report hash recorded.
- `git diff -- src` empty.
- The reader unit tests above, run by `pnpm test` (or the suite's own runner if
  the reader lives outside `src/`; state which).

## FAIL Conditions

- Any NEW divergence, or any collect test that does not complete.
- A tolerance widened, a KNOWN entry added or edited, or a profile removed.
- Any change under `src/`.
- The sidebar background read equal to the accent in a profile where the two
  differ.

## BLOCKER Conditions

- After the reader fix, a row turns out to be a real generator defect (Preview
  and PDF agree, and DOCX disagrees in a way #88 did not intend). Report it as a
  FINDING candidate. Fixing the generator needs a PRD update.
- The local Supabase stack or Playwright build cannot run the suite.

## Risks

- Fixing the accent will reveal rows the throw currently hides (for example the
  sidebar background). They must be explained, not silenced.
- The parity suite stays local-only, so it can go red again unnoticed.

## Evidence / References

- `e2e/parity/surfaces.ts:1030-1088, 1117-1120, 1159, 1197, 1224-1229`: the
  reader.
- `e2e/parity/verdicts.ts:119-164, 333, 792-808, 899-921, 1019-1026`:
  classification, tolerance and DECISION.
- `e2e/parity/profiles.ts:141, 585`: fontScale 1.2 and the Modern `accentDepth`.
- `src/app/api/resumes/[id]/download-docx/docx-modern.ts:831-871`,
  `docx-professional.ts:244-287`, `docx-helpers.ts:111-120`: what #88 writes.
- `tasks/ralph/archive/2026-09-26-milestone-c-part-3/progress.txt:823-824`: the
  last green run.
- `tasks/ralph/archive/2026-10-06-job-cv-template-picker/progress.txt`: 182/67 on
  clean main, with identical failing-name lists.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
