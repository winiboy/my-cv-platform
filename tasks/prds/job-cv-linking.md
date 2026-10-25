# PRD: A CV is always linked to its job application

**Status:** APPROVED 2026-10-24

## Objective

Every CV made for a job offer is linked to that offer's job application. A CV created from Job Search is linked automatically, and the offer is saved as an application if it isn't already. On Mes candidatures, the user can link an existing CV to an application card.

## Context / Current Behavior

**Job Search "Créer un CV"** (`/[locale]/dashboard/jobs`):
- The `CVAdaptationModal` in create mode (`src/components/jobs/job-detail-panel.tsx:814-827`, request built in `src/components/dashboard/cv-adaptation-modal.tsx:217-226`) posts `{ jobDescription, title, template, locale }` to `POST /api/ai/generate-from-job-description`.
- The route inserts the resume (`route.ts:128-129`) and links nothing: no `resumes.job_application_id`, no `job_applications.resume_id`. The CV is orphaned.

**Saving an offer today:**
- The detail panel's "Save" button posts to `POST /api/job-applications` (`job-detail-panel.tsx:173-187`). The mapping is: title → job_title, company → company_name, location, salary, application_url → job_url, description → job_description, `source: 'Adzuna'` (stored in notes), status `saved`.
- The route deduplicates on `user_id` + `job_url` and returns 409 `{ isDuplicate, jobApplication }` (`src/app/api/job-applications/route.ts:167-186`).
- There is no unique constraint and no external job id.
- The list card's bookmark is local state only, and `is_saved` is always false (`src/lib/adzuna-client.ts:191`).

**Link columns:**
- `job_applications.resume_id` (`001_initial_schema.sql:215`, ON DELETE SET NULL).
- `resumes.job_application_id` (`004_tri_directional_associations.sql:6`).
- Both directions are kept in sync by application code only.
- The resume editor's `handleJobApplicationChange` (`src/components/dashboard/resume-editor.tsx:602-680`) does this client-side and clears the previous application's `resume_id`.
- `POST /api/resumes/from-job-application` (cv-from-job-complete) does it server-side.

**Kanban card** (`src/components/dashboard/job-applications/kanban-card.tsx:432-487`):
- The ⋮ menu offers Edit, "Créer un CV pour cette offre", "Créer une lettre de motivation pour cette offre" and Delete.
- A linked CV is shown as a `ResumeLinkBadge` (`:505-513`).
- There is no way to link an existing CV from the card or from the application detail page (`job-applications/[id]/page.tsx:174-209`).

## Owner decisions (2026-10-24, in chat)

- Two PRDs: this one covers points 1 and 2. Cover-letter download and translation are in `tasks/prds/cover-letter-export-translate.md`.
- If the offer is already saved and its application already has a linked CV, the new CV replaces the link. The old CV is kept but no longer linked. This is the rule the resume editor already applies.

## Scope

- Job Search "Créer un CV": after the CV is created, the offer's application is found or created, and the CV and the application are linked both ways.
- Kanban card: a "Lier un CV existant" action directly under "Créer un CV pour cette offre". It lets the user pick one of their CVs and links it to the application both ways.
- Localized strings for the new action, its dialog and its messages, in fr, en, de and it.

## Out of Scope

- Unlinking a CV from an application, or linking from the application detail page.
- The list card's local-only bookmark and the `is_saved` flag on `/api/jobs`.
- Cover letters, which are covered by `tasks/prds/cover-letter-export-translate.md`.
- The CV's content, AI generation, language and template choice. These stay as cv-from-job-complete left them.
- A unique constraint or any schema change. Deduplication stays the existing `user_id` + `job_url` rule.
- Changing how the resume editor's job association works.

## Impact Assessment

- **Frontend / UI:** Affected. A new card action and dialog; the Job Search modal sends the offer's fields.
- **Internationalization:** Affected. New strings in four locales.
- **Resume model / templates:** Not affected. Only the link column is written.
- **Exports:** Not affected.
- **Database / persistence:** Affected, data only. Application rows are created and link columns are updated. No migration.
- **Security / authorization:** Affected. Ownership of the CV and of the application on every link write, and untrusted offer fields from Job Search.
- **Testing / validation:** Affected. Unit tests for the routes; e2e for both flows.

## User Stories

### US-001: A CV created from Job Search is linked to its saved offer

**Description:**
As a user creating a CV from an offer in Job Search, I want the offer saved and linked to the new CV automatically, so that I can find both together in Mes candidatures.

**Acceptance Criteria:**

- [ ] After "Créer un CV" succeeds for an offer that was not saved:
  - a job application exists for the user with that offer's title, company, location, URL and description, status `saved`;
  - the new CV's `job_application_id` points to it;
  - its `resume_id` points to the CV.
- [ ] If the user already has an application with the same `job_url`, no second application is created. The CV is linked to the existing one.
- [ ] If that existing application already had a linked CV, it now points to the new CV. The old CV still exists, and its `job_application_id` is cleared.
- [ ] If the offer has no URL, a new application is created and linked, since there is nothing to match on.
- [ ] If CV generation fails (AI error or rate limit), no application is created or changed, and the modal shows its existing error.
- [ ] If the CV is created but saving or linking the application fails:
  - the CV is kept and the user still lands in its editor;
  - the failure is logged without offer or CV content.
- [ ] The new CV's card on Mes candidatures shows the CV's badge (`ResumeLinkBadge`) after the redirect.

### US-002: An existing CV can be linked from an application card

**Description:**
As a user on Mes candidatures, I want to link one of my existing CVs to an application, so that the application shows the CV I actually sent.

**Acceptance Criteria:**

- [ ] The card's ⋮ menu shows "Lier un CV existant" directly below "Créer un CV pour cette offre", localized in fr, en, de and it.
- [ ] Choosing it opens a dialog listing the user's own CVs by title, most recently updated first. The application's currently linked CV, if any, is marked.
- [ ] Picking a CV and confirming links it both ways:
  - the application's `resume_id` points to it;
  - the CV's `job_application_id` points to the application;
  - the card's badge shows the new CV's title without a page reload.
- [ ] If the application had another CV linked, that CV's `job_application_id` is cleared.
- [ ] If the picked CV was linked to another application, that application's `resume_id` is cleared.
- [ ] A user with no CVs sees a localized empty state with a link to "Créer un CV pour cette offre".
- [ ] Linking another user's CV, or linking to another user's application, is refused server-side, and nothing changes.
- [ ] If the link fails, a localized error is shown in the dialog and nothing changes.
- [ ] The menu item and the dialog work with the keyboard: Escape closes the dialog and focus returns to the menu button.

## Functional Requirements

- **FR-1:** Every link write (both stories) goes through authenticated server code that:
  - reads the CV and the application with the user's session and explicit `user_id` checks;
  - updates both directions, plus clears the previous links described above.
  The client sends identifiers only.
- **FR-2:** The application created by US-001 uses the same field mapping and the same `user_id` + `job_url` deduplication as the existing Job Search "Save". There must be no second mapping that can drift from it.
- **FR-3:** Offer fields sent from Job Search are untrusted. They are validated and bounded with the existing limits before storage.
- **FR-4:** No schema migration, no new dependency.
- **FR-5:** New UI strings exist, non-empty, in fr, en, de and it (`src/locales/locale-parity.test.ts`).

## Regression Constraints

- The CV created from Job Search keeps its content, language, title and template, and its AI-failure behaviour (cv-from-job-complete US-003). `e2e/cv-from-job-search.spec.ts` stays green, with only link assertions added.
- Job Search's "Save" button and `POST /api/job-applications` (fields, 409 on a duplicate, quick-add) behave as before.
- The Kanban card's other actions, its drag and drop and its keyboard moves are unchanged. `e2e/job-applications-i18n.spec.ts` and the Kanban unit tests stay green.
- The resume editor's job association and `POST /api/resumes/from-job-application` are unchanged.

## Required Verification

- The `CLAUDE.md` §14 baseline, plus `pnpm test:parity`.
- Unit tests:
  - found vs created application;
  - same `job_url`, and no URL;
  - replacing a linked CV and clearing the previous links;
  - AI failure creates nothing;
  - link failure keeps the CV;
  - ownership of both the CV and the application;
  - bounded offer fields.
- e2e in fr and de:
  - Job Search "Créer un CV" for an unsaved offer and for an already-saved offer: the stored rows are checked both ways, and the card badge is shown;
  - the card's "Lier un CV existant": link, replace, empty state, keyboard;
  - another user's CV is refused.
- `security-review` on the link writes and the Job Search fields.
- `ui-expert` on the card menu and dialog in fr and de at 1440 and 375.
- `code-reviewer`.

## FAIL Conditions

- A CV created from Job Search is not linked both ways to an application.
- A second application is created for an offer whose `job_url` is already saved.
- An application is created or changed when the CV generation failed.
- A link leaves a stale reverse link: a CV pointing to an application that points elsewhere, or the reverse.
- A user can link another user's CV or application.
- Job Search's existing "Save", or the CV content of cv-from-job-complete, changes behaviour.

## BLOCKER Conditions

- Keeping both link directions consistent requires a schema change (a trigger or a constraint). Report it; the owner decides.

## Risks

- Offers without a URL can't be deduplicated, so creating several CVs from the same such offer gives several applications.
- The two link writes aren't one database transaction. A failure between them is handled by clearing back, but a crash in between could leave a half link. That is the same exposure as the resume editor today.

## Evidence / References

- `src/components/jobs/job-detail-panel.tsx`, `src/components/dashboard/cv-adaptation-modal.tsx`, `src/app/api/ai/generate-from-job-description/route.ts`: the Job Search CV flow.
- `src/app/api/job-applications/route.ts`: the Save mapping and the `job_url` dedupe.
- `src/components/dashboard/job-applications/kanban-card.tsx`: the ⋮ menu and `ResumeLinkBadge`.
- `src/components/dashboard/resume-editor.tsx:602-680`: the existing link and clear rules.
- `src/app/api/resumes/from-job-application/route.ts`: the server-side link pattern.
- `supabase/migrations/001_initial_schema.sql`, `004_tri_directional_associations.sql`: the link columns.

## Open Questions

- None. The material decisions are recorded under Owner decisions.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
