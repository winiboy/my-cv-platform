# PRD: Fill the translation gaps (cover-letter editor in French, Job Search in every locale)

**Status:** APPROVED 2026-10-09

## Objective

No user-facing English appears in French on the cover-letter editor, and none
appears in any non-English locale on Job Search. A whole-namespace locale-parity
test keeps translation files from drifting again.

## Context / Current Behavior

- **Locale files are complete except for one gap.** Flattening all 4
  namespaces (common, jobs, marketing, tools) in all 4 locales (en is the
  reference), the only missing keys are **31 in `fr/common.json`**, all under
  `coverLetters.editor.{recipient, opening, body, closing, signature}.*`. de and
  it are complete, and no locale has extra keys.
- **Cover-letter editor (fr).** `getTranslations` (`src/lib/i18n.ts`) does not
  merge from en. The section components therefore fall back to hard-coded
  English (`(xDict.key as string) || 'English'`) in:
  - `src/components/dashboard/cover-letter-sections/recipient-section.tsx:20-76`
  - `opening-section.tsx:18-53`
  - `body-section.tsx:17-115`
  - `closing-section.tsx:16-37`
  - `signature-section.tsx:16-60`

  French users see "Recipient Information", "Dear Hiring Manager,", and so on.
  Separately, the sign-off options in `signature-section.tsx:19-26` ("Sincerely,",
  "Best regards,", …) are hard-coded English with no key in any locale.
- **Job Search (all locales).** The components read 12 `jobs.json` keys that
  exist in **no** locale, en included, so the English fallback shows everywhere:
  - `loading`, `loadingMore`, `allJobsLoaded`, `preview`, `fullDetailsNote`;
  - `viewFullDetails`, `viewInApplications`, `jobSavedSuccess`,
    `jobAlreadySaved`, `jobSaveError`;
  - `saving`, `filters.allCantons`.

  Hard-coded literals with no key:
  - "Live Data" and "Notice" (`job-search-layout.tsx:249, 259`);
  - the error messages at `:151, :155`;
  - `${city}, Switzerland` (`job-card.tsx:46`, `job-detail-panel.tsx:166, 599`);
  - the generic error toasts (`job-detail-panel.tsx:218, 352, 464`);
  - "Failed to load resumes" (`resume-selector-modal.tsx:71`; also
    `job-detail-panel.tsx:331, 449`, which reuse a key whose text doesn't fit);
  - "Updated" (`resume-selector-modal.tsx:197`).

  Dates are formatted `toLocaleDateString('en-GB')` regardless of locale
  (`job-card.tsx:56`, `job-detail-panel.tsx:613`).
- **Existing parity tests check subsets only.** They are
  `template-names.test.ts`, `cv-adaptation-strings.test.ts`,
  `resume-template-strings.test.ts` and `template-picker-strings.test.ts`, each
  covering hand-picked keys. A whole-namespace key diff would fail today on
  exactly the 31 fr keys.

## Scope

- **Cover-letter editor.** Add the 31 `coverLetters.editor.*` keys to
  `fr/common.json`, translated. Add keys for the sign-off options in all four
  locales and read them in `signature-section.tsx`.
- **Job Search.**
  - Add the 12 missing `jobs.json` keys in all four locales, with en values
    equal to today's English fallbacks.
  - Add keys for the hard-coded literals listed above.
  - Format dates with the page locale.
  - Translate "Switzerland" through a key.
- **Parity test.** Add a vitest test that, for every namespace, requires each of
  fr/de/it to have exactly en's flattened key set, with no empty values.

## Out of Scope

- Changing en wording.
- Values that are legitimately identical across languages ("LinkedIn",
  "E-Mail"); there is no "must differ" rule.
- API error messages (server text), canton names (codes shown as today), and
  other pages.
- Merging en into other locales at runtime.

## Impact Assessment

- **Frontend / UI:** Affected. Text only, on the cover-letter editor and Job
  Search.
- **Internationalization:** Affected. Keys in `common.json` (fr) and
  `jobs.json` × 4; sign-off keys × 4.
- **Resume model / templates:** Not affected.
- **Exports:** Not affected. The cover-letter PDF uses the stored content, not
  these labels.
- **Database / persistence:** Not affected. Stored sign-off values are user
  content: existing letters keep their text, and only the option list is
  localized.
- **Security / authorization:** Not affected.
- **Testing / validation:** Affected. A new namespace-parity test and e2e text
  checks.

## User Stories

### US-001: The cover-letter editor is fully French in French

**Description:**
As a French user writing a cover letter, I want every label, hint and
placeholder of the editor in French, including the sign-off options.

**Acceptance Criteria:**

- [ ] **Locale files.** `fr/common.json` has all 31 `coverLetters.editor.*`
      keys, translated, and the namespace-parity test passes for every
      namespace and locale.
- [ ] **No English on the page.** On `/fr/dashboard/cover-letters/<id>/edit`,
      the recipient, opening, body, closing and signature sections show no
      English label, hint or placeholder (an e2e asserts the absence of the
      previous English fallbacks).
- [ ] **Sign-offs.** The sign-off options come from keys in all four locales
      (for example fr "Cordialement,", "Bien à vous,"), and en is unchanged.
- [ ] **Stored values.** A letter that already stores an English sign-off still
      displays it unchanged.

### US-002: Job Search shows no English in fr, de or it

**Description:**
As a fr/de/it job seeker, I want Job Search's labels, toasts and dates in my
language.

**Acceptance Criteria:**

- [ ] **Keys.** The 12 missing `jobs.json` keys and the new keys for the
      literals exist in all four locales. en values equal the current English
      text.
- [ ] **No English on the page.** In fr, de and it on `/[locale]/dashboard/jobs`,
      none of the listed English strings is visible: "Live Data", "Notice", "All
      Cantons", "Loading…", "All N jobs loaded", "Preview", the
      full-details note, "View Full Job Details", "View in Applications",
      "Saving...", the save toasts, "Switzerland" and "Updated".
- [ ] **Dates.** Dates on the job card and in the detail are formatted with the
      page locale (for example de "15.1.2026", fr "15/01/2026").
- [ ] **en unchanged.** en text is unchanged.

## Functional Requirements

- **FR-1:** One source per string: `jobs.json` for Job Search and `common.json`
  for the cover-letter editor. No hard-coded English remains on these surfaces
  except as an unreachable type-safety fallback, and the parity test makes any
  missing key fail.
- **FR-2:** The parity test covers all namespaces and fails on any missing,
  extra or empty key.
- **FR-3:** No dependency.

## Regression Constraints

- Existing e2e for Job Search (`job-search-mobile`, `job-cv-template-picker`,
  `adaptation-modal-i18n`) and the cover-letter specs pass. Only assertions on
  the English text these stories replace may change, and en stays identical.
- Cover-letter save, generate and export flows are unchanged.

## Required Verification

- The `CLAUDE.md` §14 baseline.
- The new namespace-parity unit test, which fails today on the 31 fr keys.
- e2e text checks in fr and de for both surfaces.
- `ui-expert` on both surfaces in fr and de, plus a text overflow check for
  longer translations. `code-reviewer`.

## FAIL Conditions

- Any listed English string visible in fr, de or it.
- Any en text change.
- The parity test does not fail when a key is removed from one locale (a control
  case is required).

## BLOCKER Conditions

- A string comes from the server or data rather than the UI. Report it; it
  stays out of scope.

## Risks

- Longer German strings may wrap in the job detail action grid; ui-expert
  checks it.

## Evidence / References

- `src/lib/i18n.ts` (getTranslations, no merge).
- `cover-letter-sections/*.tsx` (lines above); `cover-letter-editor.tsx:371-407`.
- `src/components/jobs/job-search-layout.tsx:151-296`; `job-filters.tsx:42-46`;
  `job-list.tsx:67, 81`; `job-card.tsx:46, 56`;
  `job-detail-panel.tsx:166-727`; `resume-selector-modal.tsx:71, 161, 197, 224`.
- `src/locales/*/{common,jobs,marketing,tools}.json`.
- Existing subset tests: `src/locales/template-names.test.ts`,
  `src/lib/cv-adaptation-strings.test.ts`.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
