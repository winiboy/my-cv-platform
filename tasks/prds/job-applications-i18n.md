# PRD: "Mes candidatures" speaks the page language (Kanban, quick add, detail page)

**Status:** APPROVED 2026-10-19

## Objective

On `/[locale]/dashboard/job-applications` and its detail page
`/[locale]/dashboard/job-applications/[id]`, no user-facing English interface
text appears in fr, de or it. That includes visible text, validation messages,
toasts, alerts and screen-reader labels and announcements. en stays exactly as
it is today.

## Context / Current Behavior

Observed in production on 2026-10-19 (`/fr/dashboard/job-applications`, logged in
as the owner): the Kanban column headers read "Saved", "Applied", "Interviewing",
"Offer", "Rejected", "Accepted", "Declined", and the screen-reader labels "Add job
to Saved", "… at Johnson and Johnson" are in English. The rest of the header,
search, filters and cards is already French.

The page passes `dict={{ ...common.json, jobs: jobs.json }}` down to every
component (`src/app/[locale]/(dashboard)/dashboard/job-applications/page.tsx:16-17, 58`).
`getTranslations` (`src/lib/i18n.ts`) does not merge en into other locales, so a
missing key shows the component's hard-coded English fallback.

Six causes. Paths are under `src/components/dashboard/job-applications/` unless
a full path is given.

1. **Status labels come from the English constant, not the dictionary.**
   `kanban-board.tsx:450` passes `JOB_STATUS_CONFIG[status]`
   (`src/lib/constants/job-statuses.ts`), and the column prints its `.label`:
   - `kanban-column.tsx:104, 152, 164, 176, 223, 240-242` (visible header, the
     collapsed vertical label, and aria-labels including "Add job to {status}");
   - `quick-add-modal.tsx:308` (status badge in the modal header).

   `jobs.statuses.*` already exists in all four locales (fr "Enregistré",
   "Postulé", "En entretien", "Offre", "Refusé", "Accepté", "Décliné"). The card,
   filters, pills, list-view card and detail page already use it.
2. **Validation messages are fixed at module load.** `quick-add-modal.tsx:21-32`
   builds its Zod schema outside the component, so it cannot read the
   dictionary:
   - "Job title is required", "Company name is required" and "Please enter a
     valid URL" ignore existing keys (`kanban.quickAdd.jobTitleRequired`,
     `companyRequired`, `invalidUrl`);
   - "… must be less than 255 characters" (×2) and "URL must be less than 2000
     characters" have no key.
3. **Strings without a key.**
   - Toasts: `kanban-board.tsx:210` "Failed to update status. Please try
     again." and `:253` "Failed to delete application. Please try again.".
   - Quick-add fallback errors: `quick-add-modal.tsx:238` "Failed to create job
     application. Please try again." and `:257-259` "An unexpected error
     occurred. Please try again.".
   - Labels: `kanban-card.tsx:296` aria-label `` `${job_title} at ${company_name}` ``;
     `filter-pills.tsx:104` `` `Remove ${label} filter` ``;
     `filter-dropdown.tsx:357` "Close filters".
   - `src/components/dashboard/job-application-card.tsx:206` hard-codes "Job
     application actions" although `kanban.card.menuLabel` exists.
4. **Keys the code reads but no locale has.**
   - `jobApplications.detail.*`: the whole detail page (`[id]/page.tsx:92-299`)
     shows English fallbacks in every locale. "Back to Job Applications", "View
     Original Posting", "Linked CV", "Edit CV", "No CV linked…", "Create CV for
     this Job", "Linked Cover Letter", "Edit Cover Letter", "No cover letter
     linked…", "Create Cover Letter for this Job", "Notes", "Timeline",
     "Created", "Last Updated", "Deadline". The trailing ":" at `:290, 294, 299`
     is appended in the code.
   - `kanban.preview.interviewTypes.*`: `kanban-card-preview.tsx:88-89` falls
     back to the raw type ("phone screen", "technical").
   - `common.notLoggedIn`: the alerts at `job-application-card.tsx:88, 130`,
     `job-application-status-changer.tsx:72` and
     `job-application-delete-button.tsx:44` show "You must be logged in to
     perform this action".
5. **Drag-and-drop screen-reader text is the library's English.**
   `kanban-board.tsx:417-423` sets no `accessibility` prop on `<DndContext>`
   (`@dnd-kit/core` 6.3.1). Screen readers hear "To pick up a draggable item,
   press the space bar…", "Picked up draggable item {id}." and so on, with raw
   UUIDs and status keys. `kanban-card.tsx:327-328` also leaves
   `aria-roledescription="draggable"`.
6. **English plural rule.** `src/components/dashboard/entity-link-badge.tsx:98`
   appends "s" for counts above 1.

**Already localized, no change needed:** the header, search, view toggle, sort
dropdown, filter labels, empty states, card menu, card confirm dialog, preview
labels, quick-add labels and placeholders, and every date (all go through
`Intl.DateTimeFormat(locale, …)`).

**Tests today:** no e2e covers this page, and no unit test covers its components.
`src/locales/locale-parity.test.ts` passes despite the missing keys, because they
are missing from en too.

## Scope

- **Status labels.** The Kanban column (every visible label and aria-label) and
  the quick-add badge read `jobs.statuses[status]`, as the card already does.
- **Quick-add validation.** All six messages come from `kanban.quickAdd.*` keys:
  the three existing ones, plus three new keys for the length limits. They
  follow the page locale.
- **Toasts, fallback errors and labels** listed under cause 3 get keys in all
  four locales. The list-view card uses `kanban.card.menuLabel`.
- **Missing key groups** `jobApplications.detail.*`,
  `kanban.preview.interviewTypes.*` and `common.notLoggedIn` are added in all
  four locales. Their en values equal today's fallbacks, so the detail page is
  localized. The detail page's label colons move into the translations: en
  unchanged, fr with a non-breaking space before ":".
- **Drag and drop.** `<DndContext>` gets localized screen-reader instructions and
  announcements that name the card (job title, company) and the column (its
  localized status), not raw ids. The draggable card's role description is
  localized. en wording is new, because today's en is the library default
  naming UUIDs.
- **Link badge plural** uses a translated singular/plural pair instead of
  appending "s".

## Out of Scope

- Server/API error text shown verbatim. Examples: "Job already saved" and
  "Validation failed" from `src/app/api/job-applications/route.ts`, and the
  browser's "Failed to fetch".
- The global toast container's labels "Notifications" and "Dismiss
  notification" (`src/components/ui/toast.tsx:131, 161`). It is mounted on every
  page.
- The French "0 candidatures" header plural (`job-applications-header.tsx:70`)
  and its `=== 1` rule.
- Date-only values parsed as UTC (`new Date('YYYY-MM-DD')`), which is a timezone
  issue.
- The H1 "Candidatures" vs the sidebar's "Mes candidatures" wording.
- Changing en wording other than the dnd-kit announcements, layout, behaviour,
  the status colours in `JOB_STATUS_CONFIG`, and other pages.

## Impact Assessment

- **Frontend / UI:** Affected. Text and aria attributes on the list and detail
  pages; no layout change.
- **Internationalization:** Affected. New keys in `common.json` and `jobs.json`
  in all four locales; status labels reuse `jobs.statuses`.
- **Resume model / templates:** Not affected.
- **Exports:** Not affected.
- **Database / persistence:** Not affected. Statuses are stored as keys
  (`saved`, `applied`…), and only their labels change.
- **Security / authorization:** Not affected. No change to auth checks or API
  routes; only the alert text changes.
- **Testing / validation:** Affected. The first e2e for this page, and the
  existing parity test covering the new keys.

## User Stories

### US-001: The Kanban board and quick add speak the page language

**Description:**
As a fr/de/it user tracking applications, I want the board's columns, quick-add
form, toasts and labels in my language, so that the page doesn't switch to
English.

**Acceptance Criteria:**

- [ ] **Columns.** In fr, de and it on `/[locale]/dashboard/job-applications`,
      each column header and the collapsed vertical label show the
      `jobs.statuses` value (fr "Enregistré", "Postulé", "En entretien",
      "Offre", "Refusé", "Accepté", "Décliné"). No column aria-label contains an
      English status.
- [ ] **Quick add.** The quick-add modal's status badge is localized. Each of
      the six validation messages appears in the page language when its rule is
      broken: empty title, empty company, title over 255 characters, company
      over 255 characters, invalid URL, URL over 2000 characters.
- [ ] **Toasts and fallbacks.** A failed status change, a failed delete, and a
      quick-add failure with no server message each show their message in the
      page language.
- [ ] **Labels.** The card aria-label, the "remove status filter" pill label,
      the mobile "close filters" button, the list-view card menu button and the
      interview-type tooltip contain no English in fr, de and it. The link
      badge uses the locale's singular/plural form.
- [ ] **Not logged in.** The "must be logged in" alert from the list-view card
      reads in the page language.
- [ ] **en unchanged.** Every en string listed above renders exactly as before.

### US-002: The detail page speaks the page language

**Description:**
As a fr/de/it user opening one application, I want its detail page in my
language, so that it matches the rest of the dashboard.

**Acceptance Criteria:**

- [ ] **Keys.** `jobApplications.detail.*` exists in all four locales. The en
      values equal today's fallbacks exactly.
- [ ] **No English.** In fr, de and it, `/[locale]/dashboard/job-applications/<id>`
      shows none of the 15 English fallbacks listed in Context, cause 4. This
      holds both with and without a linked CV and cover letter.
- [ ] **Colons.** The "Created", "Last Updated" and "Deadline" labels carry
      their colon in the translation. fr has U+00A0 before ":", and en renders
      exactly as before.
- [ ] **Alerts.** The "must be logged in" alerts from the status changer and
      the delete button read in the page language.

### US-003: Drag and drop is announced in the page language

**Description:**
As a screen-reader user, I want drag-and-drop instructions and announcements in
my language that name the card and the column, so that I can move an
application with the keyboard.

**Acceptance Criteria:**

- [ ] **Instructions.** The `<DndContext>` screen-reader instructions are
      localized in all four locales.
- [ ] **Announcements.** On pick-up, move-over, drop and cancel, the live
      region text is in the page language. It names the card by job title and
      company and the column by its localized status label, never a UUID or a
      raw status key.
- [ ] **Role description.** The draggable card's `aria-roledescription` is
      localized.
- [ ] **Behaviour unchanged.** Dragging a card between columns by mouse and by
      keyboard still changes its status as before.

## Functional Requirements

- **FR-1:** One source per string. Status labels come from `jobs.statuses`, and
  the other strings from `common.json` (`kanban.*`, `jobApplications.*`, root
  keys) or `jobs.json`. Hard-coded English remains only as an unreachable
  type-safety fallback.
- **FR-2:** Every new key exists, non-empty, in all four locales. The existing
  `src/locales/locale-parity.test.ts` enforces this.
- **FR-3:** No new dependency. The dnd-kit `accessibility` prop is part of the
  installed `@dnd-kit/core`.
- **FR-4:** en text unchanged, except the drag-and-drop announcements and
  instructions (US-003), whose en wording replaces the library default.

## Regression Constraints

- Statuses are stored and sent as the same keys. Moving, creating, editing and
  deleting applications behave as before.
- Filters, search, sort, view toggle and the empty states render as today in
  every locale.
- `e2e/job-search-i18n.spec.ts`, which saves a job into applications, still
  passes.

## Required Verification

- The `CLAUDE.md` §14 baseline.
- New e2e for `/[locale]/dashboard/job-applications` and its detail page, in fr
  and de, plus an en run proving en is unchanged. It covers:
  - column headers and aria-labels;
  - the quick-add badge and each validation message;
  - the two toasts and the quick-add fallback (via a failing stubbed request);
  - the card, pill and close-filters labels;
  - the detail page with and without linked documents;
  - the drag-and-drop live-region text for a keyboard move.

  The "no English" scan reads text nodes plus
  placeholder/title/aria-label/aria-roledescription, and a control case shows
  it catches an English status.
- `ui-expert` on both pages in fr and de at desktop and 375 px, including the
  board with collapsed columns and longer German labels. `code-reviewer`.

## FAIL Conditions

- Any listed English string visible or announced in fr, de or it.
- Any en text change outside the US-003 announcements.
- A new key missing or empty in any locale.
- A status change, create, edit or delete behaving differently from before.

## BLOCKER Conditions

- A listed English string turns out to come from the server or stored data
  rather than the UI. Report it; it stays out of scope.

## Risks

- Longer German status labels ("In Vorstellungsgespräch"…) may truncate in
  narrow or collapsed columns. ui-expert checks it.
- dnd-kit announcements run outside React render. The localized dictionary
  must be in scope of the callbacks.

## Evidence / References

- Production check, 2026-10-19: `/fr/dashboard/job-applications` column headers
  and aria-labels in English.
- `src/lib/constants/job-statuses.ts`; `kanban-board.tsx:210, 253, 417-423, 450`;
  `kanban-column.tsx:104-242`; `kanban-card.tsx:296, 327-328`;
  `kanban-card-preview.tsx:88-89`; `quick-add-modal.tsx:21-32, 238, 257-259, 308`;
  `filter-pills.tsx:104`; `filter-dropdown.tsx:357`.
- `src/components/dashboard/job-application-card.tsx:88, 130, 206`;
  `job-application-status-changer.tsx:72`; `job-application-delete-button.tsx:44`;
  `entity-link-badge.tsx:98`.
- `src/app/[locale]/(dashboard)/dashboard/job-applications/page.tsx`,
  `[id]/page.tsx:92-299`.
- `src/locales/*/{common,jobs}.json` (`jobs.statuses`, `kanban.*`,
  `jobApplications.*`); `src/locales/locale-parity.test.ts`.
- Precedent: `tasks/prds/fill-translation-gaps.md` (#110), the same approach
  for Job Search.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
