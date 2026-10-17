# PRD: Adaptation modal polish — typography, wording, contrast and keyboard

**Status:** APPROVED 2026-10-09

## Objective

The CV adaptation / create-from-job modal reads correctly in every locale,
meets contrast requirements, and behaves as an accessible dialog: focus moves
in on open, Tab stays inside, Escape closes, and focus returns to the opener.

## Context / Current Behavior

- **Source of these items.** All were recorded by ui-expert and code-reviewer in
  `tasks/ralph/archive/2026-10-08-localize-adaptation-modal-and-templates/progress.txt`
  (US-001: W1–W3, D1, D3, D4). The modal is
  `src/components/dashboard/cv-adaptation-modal.tsx` with `diff-viewer.tsx`.
  Its strings come only from `jobs.json → cvAdaptation/createCV`, through
  `src/lib/cv-adaptation-strings.ts`.
- **W1, colons appended in JSX.**
  - `{dict.matchScore}:` (`:428`), `keyGaps` (`:440`), `strengths` (`:453`),
    `reasoning` (`:523, 570`; `diff-viewer.tsx:99`).
  - `{dict.addSkills}: {category}` (`:499`) and `enhanceSkills` (`:546`).
  - French needs a non-breaking space before ":". Today it renders
    "Ajouter des compétences: Design".
- **W2, de.** `enhanceSkills` is "Ergänzen", where "Erweitern" is better.
  `jobDescriptionCharacterCount` is "({count}/100 Zeichen Minimum)", which is
  mechanical.
- **W3, it.** `confidenceHigh/Medium/Low` read "… confidenza", where
  "affidabilità" is the right word. `optional` is "(opzionale)", where
  "(facoltativo)" is more idiomatic.
- **D1.** `createCV.helpText` tells the user to click a button that does not
  exist:

  | Locale | helpText names | Real button |
  |---|---|---|
  | fr | "Créer le CV" | "Analyser et générer un nouveau CV" |
  | en | "Create CV" | "Analyze and generate new CV" |
  | de | "Lebenslauf erstellen" | "Analysieren und neuen Lebenslauf generieren" |
  | it | "Crea CV" | "Analizza e genera nuovo CV" |

- **D3, contrast.**
  - "No content" is `italic text-gray-400` on `bg-gray-50`
    (`diff-viewer.tsx:80-81`), at 2.49:1.
  - The close icon is `text-gray-400` with no focus style
    (`cv-adaptation-modal.tsx:259`), at about 2.6:1.
  - `gray-500` gives about 4.6:1 on gray-50 and about 4.8:1 on white (Tailwind
    v4 default palette).
- **D4, no dialog behaviour.** The modal is a plain `div.fixed.inset-0`
  (`:240`) with no `role="dialog"`, `aria-modal` or `aria-labelledby`. It does
  not focus on open, trap Tab, handle Escape, or return focus, and it unmounts
  on `!isOpen` (`:230`).
  - Repo patterns: a native `<dialog>` with `showModal()` in
    `mobile-sidebar.tsx:18-94`, and a hand-written trap in
    `job-applications/quick-add-modal.tsx:153-205`, with `role="dialog"` at
    `:272-273`.
  - Callers: `job-detail-panel.tsx:770, 785` and `resume-editor.tsx:1865`.
- **Tests that pin the current text.**
  - `e2e/adaptation-modal-i18n.spec.ts` asserts the colon strings with `exact`
    (fr 113–121, de 159–167, en 205–213), and de `hintWithEmptyCounter` at
    144–145.
  - Its `modal()` helper finds the panel through `div.shadow-xl`, as does
    `e2e/job-search-mobile.spec.ts:336-346`.
  - `src/lib/cv-adaptation-strings.test.ts` pins the en wording (`EN_WORDING`
    23–56).

## Scope

- **W1.** The label + separator moves into the translations. Either new keys
  carry the full text (for example `matchScoreLabel`: en "Match Score:", fr
  "Score de correspondance :" with U+00A0), or `{category}` templates
  (`addSkillsHeading`: en "Add Skills: {category}"). The en rendered text stays
  exactly as today.
- **W2 / W3.** The de and it wording above is corrected.
- **D1.** The help text names the real button in all four locales. The button
  label is unchanged.
- **D3.** "No content" and the close icon reach at least 4.5:1 (text) and 3:1
  (icon), and the close button gets a visible focus ring.
- **D4.** The modal becomes an accessible modal dialog:
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to its
    title;
  - focus moves into it on open, and Tab / Shift+Tab stay inside;
  - Escape closes it, and focus returns to the element that opened it;
  - it uses an existing repo pattern and adds no dependency.
- **Tests.** Update the existing specs' text expectations and locators where
  this story changes them; the en text stays identical.

## Out of Scope

- `ResumeSelectorModal`, which has the same issues. That is a separate item.
- API error messages, the modal's flow, validation, requests and layout.
- Other locales' wording beyond W2 and W3.

## Impact Assessment

- **Frontend / UI:** Affected. Modal markup, focus behaviour and two colour
  tokens.
- **Internationalization:** Affected. New or changed keys in `jobs.json` × 4.
- **Resume model / templates:** Not affected.
- **Exports:** Not affected.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected.
- **Testing / validation:** Affected. Text expectations and the dialog
  behaviour in e2e.

## User Stories

### US-001: The modal's wording is correct in every locale

**Description:**
As a fr/de/it user, I want the modal's labels and help text to be typographically
correct and to name the real button, so that the modal reads naturally and
doesn't send me looking for a button that isn't there.

**Acceptance Criteria:**

- [ ] **fr colons.** Every label followed by ":" (match score, key gaps,
      strengths, reasoning, add skills, enhance) has a non-breaking space before
      the colon. de, it and en have none.
- [ ] **en unchanged.** en renders exactly the same text as before, including
      "Add Skills: …" and "Match Score:".
- [ ] **de and it wording.** de `enhanceSkills` reads "Erweitern", and the de
      character counter reads naturally (for example "(mind. 100 Zeichen:
      {count}/100)"). it confidence badges use "affidabilità", and `optional` is
      "(facoltativo)".
- [ ] **Help text.** `createCV.helpText` quotes the real submit-button label in
      fr, en, de and it.
- [ ] **One source.** All strings still come from `jobs.json` through
      `cv-adaptation-strings.ts`, and the locale-parity unit test covers every
      new key.

### US-002: The modal is readable and keyboard-accessible

**Description:**
As a keyboard or screen-reader user, I want the modal to behave as a dialog, so
that I can work in it and leave it without losing my place.

**Acceptance Criteria:**

- [ ] **Dialog semantics.** The modal root exposes `role="dialog"` and
      `aria-modal="true"`, and `aria-labelledby` points to its title.
- [ ] **Focus on open.** When it opens, focus is inside it, on its first field
      or on the close button.
- [ ] **Tab stays inside.** Tab and Shift+Tab cycle within the modal and never
      reach the page behind.
- [ ] **Escape.** Escape closes the modal, from the input and from the preview
      stage, and focus returns to the button that opened it. This holds for the
      editor's "Adapt to Job" button, Job Search's "Adapter mon CV" and "Créer
      un CV", and on phones (the mobile job detail).
- [ ] **Contrast.** "No content" has a contrast of at least 4.5:1 and the close
      icon at least 3:1. The close button shows a visible focus ring.
- [ ] **Unchanged behaviour.** The modal's flows (create, adapt, preview, apply)
      behave as before.

## Functional Requirements

- **FR-1:** No new dependency. Reuse a native `<dialog>` (like
  `mobile-sidebar.tsx`) or the existing focus-trap pattern (like
  `quick-add-modal.tsx`).
- **FR-2:** en text unchanged. New strings in all four locales.
- **FR-3:** Existing Tailwind tokens only.

## Regression Constraints

- Every modal flow e2e still passes; only text expectations for W1–W3 and D1
  and dialog locators change.
- The fixed-position modal still renders correctly on the phone detail
  (`job-search-mobile.spec.ts`).

## Required Verification

- The `CLAUDE.md` §14 baseline.
- e2e: fr/de/it/en text checks for W1–W3 and D1 (fr colon preceded by U+00A0),
  plus a keyboard test (open, focus inside, Tab cycle, Escape, focus returns)
  from the editor and from Job Search at desktop and 375 px.
- Measured contrast values recorded.
- `ui-expert` (fr, de, it captures, focus ring) and `code-reviewer`.

## FAIL Conditions

- Any en text changes.
- Focus escapes the modal, Escape does not close it, or focus is not returned.
- Contrast below the thresholds.
- A dependency is added.

## BLOCKER Conditions

- A native `<dialog>` breaks the fixed-modal behaviour on the phone detail, and
  the focus-trap pattern also conflicts. Report it with evidence.

## Risks

- Switching to `<dialog>` changes stacking (top layer); the template thumbnails
  and nested pickers must still render. The e2e covers it.

## Evidence / References

- `cv-adaptation-modal.tsx:230-259, 290-323, 428-639`;
  `diff-viewer.tsx:80-99`; `cv-adaptation-strings.ts:12-121`.
- `src/locales/*/jobs.json` lines 63–117.
- `mobile-sidebar.tsx:18-94`; `quick-add-modal.tsx:153-205, 272-273`.
- `e2e/adaptation-modal-i18n.spec.ts:113-213, 401-406, 471-644`;
  `e2e/job-search-mobile.spec.ts:336-346, 508-519`;
  `src/lib/cv-adaptation-strings.test.ts:23-115`.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
