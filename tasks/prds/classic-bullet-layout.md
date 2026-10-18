# PRD: Classic template bullets sit on the same line as their text

**Status:** APPROVED 2026-10-09

## Objective

In the Classic template's Preview, and so in its PDF, each experience
achievement bullet renders on the same line as the start of its text, as the
Classic Word export and the other four templates already do.

## Context / Current Behavior

- **Where the bullets come from.** `src/components/dashboard/resume-templates/classic-template.tsx:198-200`
  renders the achievements as `<ul className="… list-inside list-disc …">` and
  `<li>{renderFormattedText(achievement)}</li>`.
- **Why the bullet ends up alone.** `renderFormattedText`
  (`src/lib/format-text.tsx:113-128`) always returns a block child:
  - plain text becomes `<div className="text-justify">` (`:78-87`);
  - HTML goes through `SanitizedHtml`, which renders `<div class="formatted-content">`
    (`src/components/sanitized-html.tsx:37`).

  `list-inside` places the `::marker` inline, so the line box holds only "•"
  and the text starts on the next line. The committed baseline shows it:
  `e2e/visual/__screenshots__/win32/classic.png` and `classic-print.png`.
- **The other templates do it differently.** They draw their own marker element
  and do not use a CSS list marker:
  - Minimal: `minimal-template.tsx:202-204`, `li.flex.gap-3`, a dot span plus a
    `flex-1` text span;
  - Creative: `creative-template.tsx:322-324`, same pattern;
  - Professional: `professional-template.tsx:698-700`, same pattern;
  - Modern: `modern-template.tsx:679-692`, `listStyle: none` and a flex `li`.
- **The Word export is already right.** `docx-classic.ts:562-596` writes
  `TextRun('• ')` followed by the text, in the same paragraph. So Preview and PDF
  disagree with Word today.
- **What the parity suite measures here.**
  - Parity has no row for bullet geometry. It samples the body text's
    typography inside `.formatted-content` / `div.text-justify`
    (`e2e/parity/profiles.ts:523`, `surfaces.ts:306-314, 456`).
  - KNOWN `US-016-html-body-line-height` covers the classic
    `html-body-and-skills` `line-height:bodyText` row
    (`e2e/parity/verdicts.ts:155-165`, signature at `:556-561`). It must not be
    broken by moving the text out of `.formatted-content`.
- Recorded as pre-existing defect D1 by ui-expert in
  `tasks/ralph/archive/2026-10-08-localize-adaptation-modal-and-templates/progress.txt`.

## Scope

- **Achievement list markup in `classic-template.tsx`.** The bullet and the
  first line of text share a line; continuation lines indent under the text,
  not under the bullet, as in Minimal.
- **Bullet glyph and colour** keep their current look: Classic's disc, with the
  text colour.
- **Visual baselines.** Classic `classic.png` and `classic-print.png` are
  re-baselined. This is the only intended visual change, and it is reviewed
  pixel by pixel.

## Out of Scope

- Other templates, the Word export, `renderFormattedText` and `SanitizedHtml`.
- Classic's description fallback (`classic-template.tsx:231-232`), which is not
  a list.
- New parity rows for bullet geometry.
- Fixing KNOWN US-016.

## Impact Assessment

- **Frontend / UI:** Affected. Classic Preview and print.
- **Internationalization:** Not affected.
- **Resume model / templates:** Affected. Classic only.
- **Exports:** Affected indirectly. The PDF follows the Preview; Word is
  unchanged.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected. The rendering path for user HTML
  is unchanged.
- **Testing / validation:** Affected. Classic visual baselines change;
  everything else must stay unchanged.

## User Stories

### US-001: Classic bullets start their line

**Description:**
As a user with the Classic template, I want each achievement bullet on the same
line as its text, so that my CV reads as a normal bulleted list in Preview and
PDF, as it does in Word.

**Acceptance Criteria:**

- [ ] **Plain text.** In the Classic Preview of a resume with plain-text
      achievements (the visual fixture), each bullet's box and the first line of
      its text share the same line: their vertical centres are within 4 px.
- [ ] **HTML.** The same holds for HTML achievements (`<p>…</p>`, as in the
      parity profile `html-body-and-skills`).
- [ ] **Wrapping.** A wrapped achievement's second line starts at the same x as
      its first line of text, not under the bullet.
- [ ] **Print.** The Classic print view (PDF path) shows the same layout.
- [ ] **Visual baselines.** `pnpm test:visual` passes after re-baselining only
      `classic.png` and `classic-print.png`. The other 8 baselines are
      unchanged, and the diff of the two Classic images is limited to the
      achievement blocks.
- [ ] **Parity.** `pnpm test:parity` keeps 0 NEW and KNOWN 3; the US-016 rows
      still reproduce.

## Functional Requirements

- **FR-1:** Only `classic-template.tsx` changes in `src/`.
- **FR-2:** User HTML still renders through `renderFormattedText`, and no new
  `sanitizeHtml` call is added. Templates are server-rendered, and
  `sanitizeHtml` needs `document`.
- **FR-3:** Existing Tailwind tokens only.

## Regression Constraints

- Every other template's visual baseline and every parity row stays unchanged.
- Word output is unchanged.
- The Classic page geometry (`e2e/resume-print-geometry.spec.ts`,
  `font-scale-rendered.spec.ts`) still passes.

## Required Verification

- The `CLAUDE.md` §14 baseline, plus `pnpm test:visual` (re-baselined for
  Classic only, with the before/after images attached as evidence) and
  `pnpm test:parity`.
- A new e2e on `/en/dashboard/resumes/<id>/preview` for a Classic resume with
  plain and HTML achievements. It asserts the bullet/text line alignment and
  the wrap indent.
- `ui-expert` on the Classic Preview and print in fr and en. `code-reviewer`.

## FAIL Conditions

- The bullet is still on its own line in either the plain or the HTML case.
- Any baseline other than the two Classic ones changes.
- Any NEW parity row, or US-016 stops reproducing.
- Any change outside `classic-template.tsx` in `src/`.

## BLOCKER Conditions

- The fix cannot keep the text inside `.formatted-content` / `div.text-justify`
  without changing the US-016 signature. Report it; the owner decides whether
  US-016 is fixed in the same initiative.

## Risks

- Changing the list markup could shift Classic page breaks for long resumes. The
  print-geometry spec covers it.

## Evidence / References

- `classic-template.tsx:198-200, 231-232`; `minimal-template.tsx:202-204`;
  `format-text.tsx:78-87, 113-128`; `sanitized-html.tsx:37`.
- `docx-classic.ts:562-596`.
- `e2e/visual/__screenshots__/win32/classic.png`, `classic-print.png`.
- `e2e/parity/verdicts.ts:155-165, 556-561`; `profiles.ts:253, 523`.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
