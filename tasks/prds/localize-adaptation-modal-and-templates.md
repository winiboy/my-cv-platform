# PRD: No English in the CV adaptation modal and the resume templates for fr/de/it users

**Status:** APPROVED 2026-10-07

## Objective

A user in fr, de or it sees no English in the CV adaptation / create-from-job
modal, wherever it is opened, or in the text the five resume templates draw.
Preview, PDF and Word show the same localized words.

## Context / Current Behavior

- **Modal opened from the resume editor: fully English in every locale.**
  - `resume-editor.tsx:1873` passes `dict?.cvAdaptation`. The editor's `dict` is
    `common.json` (`dashboard/resumes/[id]/edit/page.tsx:73`), and
    `cvAdaptation` exists only in `jobs.json`, so every string falls back to
    English.
  - The same missing dictionary leaves the editor's "Adapt to Job" button
    (`:1142`) and its success alert (`:812`) in English.
  - From Job Search (`job-detail-panel.tsx:734, 749`), the modal is translated.
- **Hard-coded English in `cv-adaptation-modal.tsx`** (no key exists):

  | String | Line |
  |---|---|
  | "({n}/100 characters minimum)" | 330 |
  | "(optional)" | 351 |
  | placeholders "e.g., Senior Software Engineer" / "e.g., Google" | 343 / 357 |
  | "Job title is required." | 145 |
  | "Add Skills: " / "Enhance: " | 545 / 592 |
  | DiffViewer titles "Professional Summary" / "Experience Description" | 499 / 521 |
  | "Great News!" and its paragraph | 641-643 |

  - The default `createModeTitle` is English (`:81`).
  - `diff-viewer.tsx:78` hard-codes "No content".
  - The close button has no accessible name (`:283-287`).
- **Templates and their Word exports.** PDF is `window.print()` of the same
  templates, so PDF always equals Preview.

  | Template | Preview (= PDF) | Word | Today |
  |---|---|---|---|
  | Modern | contact labels "Phone/Email/Website/LinkedIn/GitHub/Location" hard-coded (`modern-template.tsx:277-347`); "Present" via a missing key `resumes.editor.present` (`:630, 635`) | same English (`docx-modern.ts:1070-1075, 1646`) | agree, both English |
  | Classic | literal "Present" (`classic-template.tsx:183, 189, 293`) | own table: fr Présent, de **Gegenwart**, it Presente (`docx-classic.ts:51-54`) | already diverge |
  | Creative | literal "Present" (`:304, 310, 410`) | `creativeDict.present` (`docx-creative.ts:76-79`) | already diverge |
  | Minimal | literal "Present" (`:185, 191, 331`) | `minimalDict.present` (`docx-minimal.ts:51-54`) | already diverge |
  | Professional | levels read from a missing `resumes.levels`, with the wrong case (`professional-template.tsx:470`) → raw "Native/Fluent…" | same bug (`docx-professional.ts:711`) | agree, both English |

- **Keys that already exist in all four `common.json` files:**
  - `resumes.template.present` (Present / Présent / Heute / Presente);
  - `resumes.editor.{phone,email,website,linkedin,github,location}`;
  - `resumes.editor.levels.{native,fluent,professional,intermediate,basic}`;
  - `resumes.editor.optional`.
- **en output must not move.**
  - Visual baselines render `/en/...` (`e2e/visual/resume-templates.spec.ts:198`).
  - Parity uses `en` (`e2e/parity/profiles.ts:513`, `parity.spec.ts:249`).
  - `docx-letter-spacing.test.ts:67` lists the en contact labels.
  - `docx-modern-geometry.test.ts:505-520` source-scans `modern-template.tsx`
    expressions, so it needs updating when they change.
- **Owner decision, 2026-10-06:** the scope is the modal, the templates and Word.

## Scope

- **Modal.**
  - Every user-facing string of `cv-adaptation-modal.tsx` and `diff-viewer.tsx`,
    in all stages (input, processing, preview, no-changes), comes from
    translations in fr/en/de/it.
  - The close button gets a localized accessible name.
- **Editor.**
  - The resume editor passes the modal the same translated strings Job Search
    does.
  - The editor's "Adapt to Job" button and its success alert are localized.
- **Templates and Word.**
  - Modern's contact labels come from `resumes.editor.*`.
  - "Present" comes from `resumes.template.present` in all five templates and
    all five Word generators (one source).
  - Professional's language levels come from `resumes.editor.levels.*` in the
    template and in Word.
- **Tests.** Update `docx-modern-geometry.test.ts` source scans as the
  expressions change, and add locale coverage (below).

## Out of Scope

- API error messages shown as-is by the modal (`data.error`), and the API routes.
- Placeholder text templates show only for empty fields ("Your Name", "CV TITLE",
  "PROFESSIONAL TITLE").
- The auto-generated resume title `CV - <company>` (data, not UI).
- Other pages' English: Job Search "Live Data" / "Notice", the `en-GB` date, and
  the missing `jobs.json` keys (`loading`, `viewInApplications`, …).
- Any layout or styling change in templates or Word. Date formats other than the
  "Present" word.

## Impact Assessment

- **Frontend / UI:** Affected. Modal and editor strings.
- **Internationalization:** Affected. New keys in `jobs.json` (and/or `common`)
  for 4 locales; existing keys reused for the templates.
- **Resume model / templates:** Affected. Text only, in Modern, Classic,
  Creative, Minimal and Professional.
- **Exports:** Affected. All five Word generators draw the same localized words
  as Preview and PDF. de "Present" changes from "Gegenwart" to "Heute" (the
  shared key).
- **Database / persistence:** Not affected. Stored levels stay the English enum.
- **Security / authorization:** Not affected.
- **Testing / validation:** Affected. Non-en checks for the modal, the templates
  and Word; en baselines must stay unchanged.

## User Stories

### US-001: The adaptation modal speaks the user's language wherever it opens

**Description:**
As a fr/de/it user, I want the CV adaptation and creation modal, opened from Job
Search or from the resume editor, to be entirely in my language.

**Acceptance Criteria:**

- [ ] Opened from the resume editor in fr, de and it, every visible string of the
      modal's input stage is localized. That covers the title, help text,
      labels, placeholders, "optional" marker, character counter, buttons,
      disclaimer, divider and browse block. No English fallback appears.
- [ ] Opened from Job Search ("Adapter mon CV" and "Créer un CV") in fr, de and
      it, the same holds, including the strings that were hard-coded before.
- [ ] The validation message for a missing job title and the
      too-short-description message are localized.
- [ ] The preview stage is localized: diff titles, "Add skills"/"Enhance"
      prefixes, confidence badges, "No content", the no-changes message, and the
      apply/select/cancel buttons.
- [ ] The editor's "Adapt to Job" button and its success alert are localized.
- [ ] The modal's close button has a localized accessible name.
- [ ] In en, every string reads as before (wording unchanged).

### US-002: Templates and Word draw localized contact labels, "Present" and language levels

**Description:**
As a fr/de/it user, I want my CV's Preview, PDF and Word file to show contact
labels, "Present" and language levels in my language, identically on all three.

**Acceptance Criteria:**

- [ ] In fr, de and it:
      - Modern shows its contact labels from `resumes.editor.*` in Preview and
        in Word, with the same words and the same uppercase transform as today.
      - A current role shows `resumes.template.present` ("Présent", "Heute",
        "Presente") in all five templates, in Preview and in Word.
      - Professional shows its levels from `resumes.editor.levels.*` in Preview
        and in Word.
- [ ] For each template and locale, the localized words in the Word file
      (inspected as `word/document.xml` text) equal those in the Preview DOM for
      the same resume.
- [ ] In en, Preview and Word text is unchanged. `pnpm test:visual` passes
      without re-baselining, `pnpm test:parity` has no new failure (compared
      against `main`'s failing-name set if the parity PRD has not landed), and
      `docx-letter-spacing.test.ts` passes unmodified.
- [ ] The per-generator "present" tables in `docx-classic.ts`,
      `docx-creative.ts` and `docx-minimal.ts` are gone. All generators read
      `resumes.template.present`.
- [ ] No template layout, spacing or styling changes (en visual baselines are the
      evidence).

## Functional Requirements

- **FR-1:** One translation source per word. Modal strings live in one
  namespace, and the editor and Job Search pass the same strings. "Present" is
  `resumes.template.present` everywhere. Levels are `resumes.editor.levels.*`.
  Contact labels are `resumes.editor.*`.
- **FR-2:** New keys are added in fr/en/de/it together. en values reproduce
  today's English wording.
- **FR-3:** Stored language levels stay the English enum. Only display is
  translated (lowercase lookup into `editor.levels`).
- **FR-4:** No new dependency, and no change to API routes or the database.

## Regression Constraints

- Existing en visual baselines and the en parity results are unchanged.
- The modal's behaviour (validation thresholds, requests, stages, apply flow) is
  unchanged.
- Word layout (geometry tests) is unchanged. `docx-modern-geometry.test.ts` is
  updated only where it scans source expressions that this PRD changes, with
  equivalent assertions.

## Required Verification

- The `CLAUDE.md` §14 baseline, plus `pnpm test:visual` and `pnpm test:parity`.
- A locale-parity unit test: every key used by the modal and the templates exists
  with a non-empty value in all four locales.
- An e2e in fr and de that opens the modal from the editor and from Job Search
  (endpoints stubbed) and asserts the absence of the previously hard-coded
  English strings, plus the presence of the localized ones.
- Export validation: for each of the five templates, in fr and de, a generated
  DOCX is inspected (`word/document.xml`) and its localized words are compared
  with the Preview DOM. Recorded per template.
- `ui-expert` on the modal (editor and Job Search) and on the Modern and
  Professional previews in fr. `code-reviewer`.

## FAIL Conditions

- Any listed English string visible in fr/de/it.
- Preview and Word disagree on a localized word for any template and locale.
- An en baseline changes, or an en string's wording changes.
- A second translation source introduced for the same word.

## BLOCKER Conditions

- A template's Word generator has no access to the `common` dictionary for its
  locale. Report it; do not hard-code a table.
- A new divergence found between PDF and Preview (they share the templates, so
  this would indicate a print-only path).

## Risks

- **de Word text changes** from "Gegenwart" to "Heute" for Classic, Creative and
  Minimal. This is intended: one source, matching the Preview.
- **Source-scan tests** break on refactoring. Update them with equivalent
  assertions, never delete them.

## Evidence / References

- `src/components/dashboard/cv-adaptation-modal.tsx:81, 145, 283-287, 330-357, 499-643`;
  `src/components/dashboard/diff-viewer.tsx:40-110`.
- `src/components/dashboard/resume-editor.tsx:812, 1142, 1873`;
  `src/app/[locale]/(dashboard)/dashboard/resumes/[id]/edit/page.tsx:73`;
  `src/components/jobs/job-detail-panel.tsx:734-759`.
- `src/components/dashboard/resume-templates/*.tsx` (lines above);
  `src/app/api/resumes/[id]/download-docx/docx-{modern,classic,creative,minimal,professional}.ts`
  and `docx-helpers.ts:802-825`.
- `src/locales/*/common.json` → `resumes.template.present`, `resumes.editor.*`;
  `src/locales/*/jobs.json` → `cvAdaptation`, `createCV`.
- `e2e/visual/resume-templates.spec.ts:198`, `e2e/parity/profiles.ts:513`,
  `docx-letter-spacing.test.ts:67`, `docx-modern-geometry.test.ts:505-520`.
- Owner decision, 2026-10-06: "Modale + modèles + Word".

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
