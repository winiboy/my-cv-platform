# PRD: Job details and actions reachable on phones

**Status:** APPROVED 2026-10-08

> **Amendment 2026-10-08 (re-approved by the owner 2026-10-08).** Approved as written on
> 2026-10-08.
>
> - **Why.** Implementing US-001 showed that tapping a job necessarily selects
>   it, so after coming back the highlighted card is the job just viewed rather
>   than the one highlighted before the tap.
> - **Owner decision (2026-10-08, "L'offre consultée").** Keep the job just
>   viewed highlighted, so the user sees where they were.
>
> Only that acceptance criterion is reworded. Nothing else changes.

## Objective

Below 768 px, a user on Job Search can open a job's details, use all of its
actions ("Postuler", "Enregistrer", "Adapter mon CV", "Créer un CV") and return
to the same results. Tapping a job shows its details in place of the list, and
both a "back to results" control and the phone's back gesture return to the list
with its filters, loaded results and scroll position intact.

## Context / Current Behavior

- **Page layout.** `/[locale]/dashboard/jobs` renders `JobSearchLayout`
  (`src/components/jobs/job-search-layout.tsx`). Inside a
  `flex flex-1 gap-6 overflow-hidden` row (`:209`):
  - the list is `w-full md:w-1/2 lg:w-2/5` (`:211`) and scrolls inside
    `job-list.tsx:45` (`h-full overflow-y-auto`);
  - the detail panel sits in `hidden md:block md:w-1/2 lg:w-3/5` (`:225`).
  Below 768 px the detail panel, and every action in it, is unreachable.
- **Selection.** It is client state only: `selectedJobId` (`:29-31`), with the
  first job auto-selected (`:76-78`, `:144-149`). Cards call `onSelectJob` on
  click (`job-list.tsx:50`, `job-card.tsx:24-29`). The URL never changes, and
  there is no `/dashboard/jobs/[id]` route. Jobs come from `/api/jobs` and live
  only in memory, so the browser back gesture today leaves Job Search entirely.
- **Detail panel** (`src/components/jobs/job-detail-panel.tsx`):
  - The root is a single scroll container (`h-full overflow-y-auto`, `:544`).
  - The actions grid is already narrow-ready (`grid grid-cols-2 … sm:flex`,
    `:573`).
  - Its modals render inline as `fixed inset-0 z-50`
    (`resume-selector-modal.tsx:100`, `cv-adaptation-modal.tsx:267`). Any
    ancestor with `transform`, `filter` or `contain` would trap them.
- **Owner decision, 2026-10-06** (`tasks/ralph/archive/2026-10-06-job-cv-template-picker/progress.txt`):
  phone access to the detail is a separate initiative. The owner chose the
  "list, then detail" pattern with a back control for this PRD.
- **Dashboard layout** (`src/app/[locale]/(dashboard)/layout.tsx`): `main` is
  the page scroll container (`flex-1 overflow-y-auto`). The mobile "Dashboard
  menu" drawer (`mobile-sidebar.tsx`) is the existing narrow-screen pattern and
  uses 44 px touch targets (`min-h-11`).
- **Test that encodes the current limit.** `e2e/job-cv-template-picker.spec.ts:436-470`
  force-unhides the `.hidden` wrapper at 375 px. It will need to tap the card
  instead.
- **i18n.** `jobs.json` has no "back to results" string. `common.json`
  `common.back` exists ("Retour" / "Back" / "Zurück" / "Indietro").

## Scope

- Below 768 px only:
  - tapping a job card shows that job's detail panel full-width in place of the
    list;
  - a visible, localized "back to results" control returns to the list;
  - the browser/phone back gesture also returns to the list.
- Returning to the list keeps the filters, every loaded page of results, the
  selected job highlight and the list's scroll position.
- All detail actions and the modals they open work at 375 px.
- Update `e2e/job-cv-template-picker.spec.ts`'s 375 px test to reach the modal by
  tapping the card (no force-unhide), and add a new mobile e2e for Job Search.
- New localized string(s) in `jobs.json` for fr/en/de/it.

## Out of Scope

- The layout at 768 px and above: unchanged, side by side, with the first job
  auto-selected.
- Deep links or a `/dashboard/jobs/[id]` route, and restoring a detail view after
  a page reload.
- Keyboard operability of job cards (they are click-only `div`s today, on every
  width). That is a separate accessibility item.
- The panel's state leaking between jobs (`isSaved`, fetched data: the panel has
  no `key`).
- Other English strings on the page ("Live Data", "Notice", the date formatted
  as `en-GB`, missing `jobs.json` keys). Those are covered by the localization
  PRD or a later one.
- Any change to the actions themselves or to the modals' content.

## Impact Assessment

- **Frontend / UI:** Affected. Narrow-screen behaviour of `job-search-layout.tsx`
  and possibly `job-detail-panel.tsx` spacing.
- **Internationalization:** Affected. A "back to results" label in 4 locales.
- **Resume model / templates:** Not affected.
- **Exports:** Not affected.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected.
- **Testing / validation:** Affected. A new mobile e2e, an updated 375 px picker
  test, and `ui-expert` validation at 375 and 768 px.

## User Stories

### US-001: Open a job's details on a phone and come back to the same results

**Description:**
As a job seeker on a phone, I want to tap a job to read it and act on it, then go
back to my results where I left them.

**Acceptance Criteria:**

- [ ] At 375×812, the list is shown first and no detail panel is visible.
- [ ] Tapping a job card shows that job's detail (title as the panel heading)
      full-width in place of the list. The list is not visible, and there is no
      horizontal overflow.
- [ ] A "back to results" control is visible at the top of the detail. It is
      localized in fr/en/de/it, has a touch target of at least 44×44 px, and is
      reachable and operable by keyboard.
- [ ] Activating that control returns to the list. The filters, every loaded
      result (including pages added by infinite scroll) and the list scroll
      position are as they were before the tap. The highlighted job is the one
      just viewed.
- [ ] Using the browser back action from the detail returns to the list in the
      same state, and does not leave `/[locale]/dashboard/jobs`. A second back
      action leaves the page as it does today.
- [ ] From the detail at 375 px, "Postuler", "Enregistrer", "Adapter mon CV" and
      "Créer un CV" are visible and work. The "Créer un CV" and "Adapter mon CV"
      modals open, fit the viewport (no horizontal overflow, every template
      option reachable by scrolling) and close back to the detail.
- [ ] Tapping a different job after coming back shows that job's detail.
- [ ] At 768 px and 1440 px, the page behaves and looks as before: side by side,
      first job auto-selected, and no back control rendered.
- [ ] `/[locale]/dashboard/jobs` returns HTTP 200 at every width, and the console
      shows no hydration mismatch or React error.

## Functional Requirements

- **FR-1:** The narrow-screen behaviour is driven by the existing `md` breakpoint
  (768 px), the same one that hides the panel today.
- **FR-2:** Back navigation from the detail uses the browser history (one entry
  per opened detail), so the system back gesture and the on-screen control behave
  the same.
- **FR-3:** No ancestor of the detail panel introduces `transform`, `filter` or
  `contain`, so the panel's fixed-position modals keep the viewport as their
  containing block.
- **FR-4:** New user-facing strings come from `jobs.json` (or an existing
  `common` key) in all four locales. No hard-coded English.
- **FR-5:** No new dependency. Reuse existing tokens and the 44 px touch-target
  convention.

## Regression Constraints

- Desktop and tablet (≥ 768 px): DOM structure, auto-selection and styling are
  unchanged.
- The job detail actions, the save flow and both modals behave as before.
- Every existing e2e keeps its assertions, except the 375 px test in
  `e2e/job-cv-template-picker.spec.ts`. That test is rewritten to tap the card
  and keeps all of its assertions about the modal.

## Required Verification

- The `CLAUDE.md` §14 baseline.
- A Playwright e2e at 375×812, with `/api/jobs` stubbed to return enough results
  for a second page and the external fetch and AI endpoints stubbed. It covers:
  - the list first;
  - tap → detail;
  - the back control → list in the same state (filters, result count, highlight,
    `scrollTop` within 1 px);
  - `page.goBack()` → list in the same state;
  - each action reachable;
  - both modals open and fit.
- The 768 px and 1440 px no-change checks.
- `ui-expert` validation at 375 px (list, detail, back, modal) and 768 px, in fr
  and one other locale.
- `code-reviewer` validation.

## FAIL Conditions

- Any detail action is unreachable at 375 px.
- Back (the control or browser history) loses the filters, the loaded results or
  the scroll position, or leaves the page.
- The layout at ≥ 768 px changes.
- A modal is clipped or trapped by an ancestor at 375 px.
- Any English fallback for the new string in fr/de/it.

## BLOCKER Conditions

- History-based back conflicts with Next.js App Router navigation in a way that
  breaks other dashboard routes. Report it with evidence. Switching to a
  non-history approach needs an owner decision.
- `/api/jobs` cannot be stubbed for multiple pages.

## Risks

- The auto-selection logic (`:76-78`, `:144-149`) must not show a detail on
  first load on phones.
- Infinite scroll uses an IntersectionObserver with the viewport as its root.
  Hiding and showing the list must not trigger spurious page loads.

## Evidence / References

- `src/components/jobs/job-search-layout.tsx:20-36, 76-78, 119-149, 209-231`.
- `src/components/jobs/job-list.tsx:45-67`, `job-card.tsx:24-61`.
- `src/components/jobs/job-detail-panel.tsx:544-683, 708-759`.
- `src/app/[locale]/(dashboard)/layout.tsx`: the scroll containers.
- `src/components/dashboard/mobile-sidebar.tsx`: the narrow-screen precedent and
  touch targets.
- `src/lib/hooks/use-media-query.ts:55`: `useIsMobile()` (max-width 767 px),
  SSR-safe.
- `e2e/job-cv-template-picker.spec.ts:436-470`, `e2e/resume-editor-responsive.spec.ts`
  (helpers: `expectNoHorizontalScroll`, `expectTouchTarget`).
- Owner decisions, 2026-10-06: "Accepter + backlog" (job-cv-template-picker) and
  the "list, then detail" pattern.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
