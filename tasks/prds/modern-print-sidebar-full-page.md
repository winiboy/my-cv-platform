# PRD: Modern printed PDF — the sidebar reaches the bottom of every page

**Status:** APPROVED 2026-10-13

## Objective

In the PDF printed from a Modern CV, the left sidebar band covers the full height of every page, including the last one. It has the CV's own sidebar colour and width, as the Word export has done since #104.

## Context / Current Behavior

Owner report, 2026-10-13, with a screenshot of a printed Modern CV: on the last page, the blue band stops where the content ends and the rest of the page is white. The Word document does not have this defect.

Diagnosis (scratch Playwright probe under print media, Preview page, Modern, the e2e `LONG_EXPERIENCE` fixture):

| Measurement | Value |
|---|---|
| Document height | 2354 px (3 printed pages) |
| Sidebar bottom | 2354 px |
| White below the band on page 3 | 1015 px |

- **#106 is not the cause.** The result is identical with PR #106's Preview frame present and with it removed (the pre-#106 DOM), so it predates #106.
- **Root cause:** Modern's sidebar is an in-flow flex column of `resume-document` (`src/components/dashboard/resume-templates/modern-template.tsx:720-744`). Its background therefore ends where the document ends. The root is `minHeight: PAGE_HEIGHT_CSS`, so it is at least one page tall, never a whole number of pages.
- **Professional already handles this.** It paints its print band on `body` (`src/app/globals.css:416-430`, `body:has(.professional-template)`), so the band covers every page whatever the content height.
  - Its colour is carried by `--professional-print-sidebar-color`, declared by a style element that the template renders (`professional-template.tsx:72-102`).
  - Its geometry is fixed at 238.2 px and does not follow `sidebarWidth`; `globals.css:421` states this.
- **Modern has never had a print band.** `git log -S "modern-template" -- src/app/globals.css` returns no commit.
- **Width and colour:** Modern's sidebar width is `sidebarWidth`% of the 794 px page (default 35), and its colour is the stored sidebar colour (`modern-template.tsx:223-225, 741-742`).
- **The Word export is a separate generator** (`src/app/api/resumes/[id]/download-docx/docx-modern.ts`). #104 already made its band reach the bottom of every page.
- **The PDF** is the browser's print of the Preview page (`window.print()`). The e2e and parity suites reproduce it with `page.pdf({ preferCSSPageSize: true })` under print media.

## Scope

- The printed PDF of a Modern CV: the sidebar band covers each page from top to bottom, on every page including the last.
- The band follows the CV's stored sidebar colour and sidebar width.
- Automated evidence that this holds, and that nothing else moves.

## Out of Scope

- **The Word / DOCX export, in any way. This is a non-negotiable owner constraint:** no file under `src/app/api/resumes/[id]/download-docx/` changes, and no generated DOCX changes by a single byte.
- The other four templates' print output, including Professional's fixed-width band and its Linux 1 px seam (`tasks/prds/linux-print-sidebar-column.md`).
- The on-screen editor preview and Preview page rendering. The change is print-only.
- How the PDF is produced (the print dialog). That is a separate, later request.
- Page-break placement, break-inside rules, or page count.

## Impact Assessment

- **Frontend / UI:** Affected, print media only. On-screen rendering is unchanged.
- **Internationalization:** Not affected. No text.
- **Resume model / templates:** Affected for Modern's print output only. The layout model and stored data are unchanged.
- **Exports:** Affected for the PDF (print). The DOCX is explicitly not affected.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected. If a user-controlled colour is written into CSS, it must be validated as Professional's band colour is (`EMITTABLE_COLOR_PATTERN`).
- **Testing / validation:** Affected. New PDF-level evidence, plus regression runs of visual, parity, print-geometry and DOCX.

## User Stories

### US-001: A printed Modern CV keeps its sidebar band down to the bottom of every page

**Description:**
As a user who downloads my Modern CV as a PDF, I want the coloured left band to run the full height of every page, so that the last page looks like the others and like my Word document.

**Acceptance Criteria:**

- [ ] For a Modern CV printing on at least two pages, with its last page only partly filled, the band covers that last page from the top edge to the bottom edge in the printed PDF.
- [ ] On every other page, the band covers the full page height, as today.
- [ ] The band's colour is the CV's stored sidebar colour, and its width is the CV's `sidebarWidth` (shown at the default 35 % and at one non-default width).
- [ ] A one-page Modern CV prints exactly as before.
- [ ] Nothing of the band shows on screen, in the editor or on the Preview page.
- [ ] The change applies only when a Modern CV is printed. A printed Professional, Classic, Minimal or Creative CV is unchanged.

## Functional Requirements

- **FR-1:** The band is print-only and drawn from the same stored layout values (sidebar colour, `sidebarWidth`) that the Preview draws Modern's sidebar from. No second source of these values is introduced.
- **FR-2:** A user-controlled colour reaching CSS is validated before it is emitted, as Professional's band colour is.
- **FR-3:** Zero DOCX impact: `git diff -- "src/app/api/resumes/[id]/download-docx"` is empty, and the generated `word/document.xml` of all five templates is byte-identical before and after.

## Regression Constraints

- `pnpm test:visual` passes with its existing baselines, no baseline updated. On-screen rendering does not move.
- `pnpm test:parity` keeps every existing row's verdict, NEW 0, KNOWN 3 on Windows (current base after #105 and #106: MATCH 211).
- `e2e/resume-print-geometry.spec.ts`, `e2e/modern-long-sidebar-print.spec.ts` and the page-break specs (`e2e/resume-*-page-breaks.spec.ts`, `e2e/resume-page-break-pdf-count.spec.ts`) pass unchanged.
- The printed PDF's page count does not change for any template.
- The DOCX of every template is byte-identical (FR-3).

## Required Verification

- The CLAUDE.md §14 baseline on the final diff (typecheck, test, test:integration, test:e2e, build or build:verify, lint), with lint judged against the ceiling of 306.
- `pnpm test:visual` and `pnpm test:parity`.
- **An automated e2e test that reads the printed PDF**, not a screenshot. For a multi-page Modern CV, the sidebar colour must cover the band's area down to the bottom of the last page. It must:
  - fail on the current code and pass after the fix;
  - include a default and a non-default `sidebarWidth`, and a non-default colour.
  - The parity harness's `readPrintSidebarColumn` (`e2e/parity/surfaces.ts:889`) shows how a PDF's sidebar column can be read.
- DOCX hashes of `word/document.xml` for all five templates at default and non-default layouts, before and after.
- A real PDF printed from the Preview page, opened and checked by eye, recorded as evidence. `ui-expert` reviews the printed result, the band's last page included.

## FAIL Conditions

- Any white strip remains between the end of the content and the bottom of the last page in the band area of a printed Modern PDF.
- The band's colour or width differs from the CV's stored sidebar colour or `sidebarWidth`.
- Any byte of any generated DOCX changes, or any file under `src/app/api/resumes/[id]/download-docx/` changes.
- Any visual baseline needs updating, parity reports NEW > 0 or a changed verdict, or a printed PDF's page count changes.
- Another template's printed output changes.

## BLOCKER Conditions

- The band cannot follow `sidebarWidth` without changing the document's own layout or the DOCX. In that case, stop and report to the owner.
- The printed PDF's sidebar area cannot be read automatically on this machine. Report it; do not substitute a screenshot of screen media.

## Risks

- **Linux seam:** Professional's body-painted band shows a 1 px seam on Linux print (`linux-print-sidebar-column`, KNOWN on CI). A body-painted Modern band could inherit the same seam. If it does, it must be recorded, not hidden.
- **Under the photo zone:** the band also paints beneath Modern's photo zone, which has its own background. The photo zone must still draw over it as today.

## Evidence / References

- Owner screenshot, 2026-10-13: printed Modern CV, the band stops on page 2 where the content ends.
- `src/components/dashboard/resume-templates/modern-template.tsx:720-744`: document root and in-flow sidebar.
- `src/app/globals.css:399-448`: print styles and Professional's `body:has(...)` band.
- `src/components/dashboard/resume-templates/professional-template.tsx:72-102`: validated print-band colour emission.
- `e2e/modern-long-sidebar-print.spec.ts`, `e2e/parity/surfaces.ts:889` (`readPrintSidebarColumn`), `e2e/parity/verdicts.ts:120-197`: existing print-sidebar evidence.
- `src/app/api/resumes/[id]/download-docx/docx-modern.ts`, `tasks/prds/docx-modern-sidebar-full-page.md`: the Word export's band (#104). Out of scope.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
