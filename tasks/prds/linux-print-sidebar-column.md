# PRD: Remove the 1-px near-white seam below the last text in Linux-printed Professional PDFs

**Status:** DRAFT

## Objective

When Chromium on Linux prints a multi-page Professional resume, the paper below
the last text on the last page carries no painted near-white line. The print
sidebar column then reads exactly as it does on Windows, and the parity check's
Linux-only KNOWN entry `linux-print-sidebar-column` stops reproducing and is
removed.

## Context / Current Behavior

- **What the CI trial found.** The parity CI trial on ubuntu-latest (draft PR
  #99, run 37892980945, 2026-10-09; Microsoft core fonts installed and
  resolving) reported one NEW row, `multi-page · professional ·
  colour:print-sidebar-column`. Its observation (`printSidebarColumn.runs`,
  from the run's `parity-results` artifact) shows:

  | Platform | Runs |
  |---|---|
  | Linux | page 1 y0-841 `#1E7A4C`; page 2 y0-242 `#1E7A4C`; y243-244 `#FFFFFF` paper below the last text; **y245 `#FDFEFD` painted below the last text**; y246-841 `#FFFFFF` paper |
  | Windows (local) | page 1 y0-841 `#1E7A4C`; page 2 y0-258 `#1E7A4C`; y259 `#8EBCA5` edge between the sidebar colour and white; y260-841 `#FFFFFF` paper |

- **What actually differs.** On both platforms the column stops at the last text
  on the last page, which is the expected, accepted behaviour. The only
  difference is a single 1-px near-white line painted inside the paper region
  on Linux, two pixels below where the colour ends. It looks like an
  anti-aliasing seam, or a 1-px element edge rendered separately by Chromium's
  Linux print path. It is not a white band inside the column.
- **User impact: negligible.** A 1-px line at 99.6% white on white paper is not
  visible. This PRD is about removing a known divergence from the parity
  baseline, not a visible defect.
- **Recorded as KNOWN on Linux.** It is recorded as a Linux-only KNOWN entry by
  `tasks/prds/parity-in-ci.md` (owner decision of 2026-10-09). The signature is
  pinned to this exact shape.
- **Where to look.**
  - The Professional template's print CSS for the sidebar column end and the
    last section's bottom edge (`professional-template.tsx`, `globals.css`
    print rules).
  - The parity reader's run classification (`e2e/parity/surfaces.ts:864`,
    `sidebar-column.spec.ts`). It may reveal that the line is a 1-px border or
    box edge.

## Scope

- **Investigate.** Find what paints the 1-px line on Linux, with evidence: a
  Linux PDF raster, or a minimal reproduction.
- **If it is a template element** (border, box-shadow, background edge) **that
  Windows rounds away:** remove or align it so the Linux print shows no painted
  line, then remove the Linux-only KNOWN entry.
- **If it is purely Chromium's Linux rasteriser** (no element owns it): report
  it as a BLOCKER. The owner decides whether to keep the KNOWN entry, or to
  amend the reader's tolerance for painted lines of 1 px or less in the paper
  region. That amendment would be a parity-rules change and needs its own
  decision.

## Out of Scope

- Other templates, unless the cause is shared (report it if so).
- The Word export.
- Any parity tolerance or reader change, unless the owner decides it under the
  BLOCKER above.

## Impact Assessment

- **Frontend / UI:** Possibly affected. Professional print CSS, with no visible
  change intended.
- **Internationalization:** Not affected.
- **Resume model / templates:** Possibly affected. Professional only.
- **Exports:** Affected. The PDF (print) path on Linux.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected.
- **Testing / validation:** Affected. CI parity on Linux.

## User Stories

### US-001: Linux prints of Professional carry no painted seam below the last text

**Description:**
As the owner, I want the Linux PDF of a multi-page Professional resume to read
like the Windows one, so that the parity check has no platform-specific KNOWN
entry.

**Acceptance Criteria:**

- [ ] **Cause.** The source of the 1-px line is identified, with evidence
      recorded in `progress.txt`.
- [ ] **Linux CI.** The CI Parity job reports
      `multi-page · professional · colour:print-sidebar-column` as MATCH, and
      the Linux-only KNOWN entry is removed. The job exits 0 with KNOWN rows 3
      and NEW 0.
- [ ] **Windows.** Local `pnpm test:parity` and `pnpm test:visual` are
      unchanged: same report hash and baselines.
- [ ] **Print specs.** The print geometry specs pass.

## Functional Requirements

- **FR-1:** Only Professional's template or print styles change, and only if an
  element owns the line.
- **FR-2:** No parity tolerance or comparison change. The only parity edit is
  removing the Linux KNOWN entry.

## Regression Constraints

- The Windows print output, and every other template's output, is unchanged.

## Required Verification

- The `CLAUDE.md` §14 baseline, plus local `test:visual` and `test:parity`.
- A Linux CI Parity run, green with KNOWN rows 3, and its artifact showing the
  page-2 runs without the painted line.
- `code-reviewer`. `ui-expert` only if a visible change is made.

## FAIL Conditions

- The row is still NEW or KNOWN on Linux after the fix.
- Any Windows baseline changes.
- Any tolerance change without an owner decision.

## BLOCKER Conditions

- The line is produced by Chromium's Linux rasteriser with no owning element.
  The owner then decides between keeping the KNOWN entry and changing the
  parity rules.

## Risks

- Investigating needs Linux PDF output. CI artifacts provide it, and so would a
  Linux container locally.

## Evidence / References

- Draft PR #99, run 37892980945, artifact `parity-results`
  (`observations/multi-page__professional.json`).
- Local Windows observation `test-results-parity/observations/multi-page__professional.json`.
- `e2e/parity/surfaces.ts:864`; `e2e/parity/sidebar-column.spec.ts`;
  `tasks/prds/parity-in-ci.md` (amendment of 2026-10-09).

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
