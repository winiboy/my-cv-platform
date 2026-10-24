# PRD: A cover letter created from a job application is written from the offer and the linked CV

**Status:** APPROVED 2026-10-24

## Objective

When a user creates a cover letter from a saved job application, the letter is written by the AI from that offer and, when the application has a linked CV, from that CV. When the offer is no longer open, no letter is created and the user is told why.

## Context / Current Behavior

- Three entry points open `/{locale}/dashboard/cover-letters/new?jobApplicationId=<id>`:
  - the Kanban card on Mes candidatures (`src/components/dashboard/job-applications/kanban-card.tsx:462`, "Créer une lettre de motivation pour cette offre");
  - `src/components/dashboard/job-application-card.tsx:237`;
  - the application detail page (`src/app/[locale]/(dashboard)/dashboard/job-applications/[id]/page.tsx:246`).
- The page (`cover-letters/new/page.tsx`) reads the application server-side with an ownership filter. It passes the application and the user's resumes to `CreateCoverLetterForm`.
- `src/components/dashboard/create-cover-letter-form.tsx` inserts the letter from the browser:
  - `greeting: 'Dear Hiring Manager,'`, `opening_paragraph: null`, `body_paragraphs: []`, `closing_paragraph: null`, `sign_off: 'Sincerely,'`, `sender_name: null`;
  - the offer's `job_description` is copied in, but no text is generated. This is the "almost empty" letter;
  - the AI is never called;
  - then it links the application to the letter (`job_applications.cover_letter_id`).
- "Lier à un CV" (`resumeId` select) is pre-selected only from the `resume_id` query parameter (`initialResumeId`). The application's own `job_applications.resume_id` is ignored, even when a CV is linked to the card.
- An AI cover-letter route already exists: `POST /api/ai/generate-cover-letter`.
  - It is authenticated and rate-limited, with input limits.
  - It reads the caller's own resume (summary, 3 experiences, skills) and builds `buildCoverLetterGenerationPrompt` (`src/lib/ai/prompts.ts`) in the UI locale.
  - It returns greeting, opening, body paragraphs, closing and sign-off. It does not persist anything.
  - The editor's generation modal uses it (`src/components/dashboard/cover-letter-generation-modal.tsx`).
  - It requires `jobDescription`.
  - It logs the raw AI reply when parsing fails.
- What `job_applications` stores about the offer's availability (`supabase/migrations/001_initial_schema.sql`): `deadline DATE` and `job_url TEXT`. There is no "open/closed" column.
- `src/lib/security/safe-fetch.ts` (`safeFetch`) and the host allowlist in `src/app/api/jobs/fetch-external/route.ts` already provide bounded, redirect-checked server fetches of job-board pages.
- Reusable from cv-from-job-complete (merged in #114):
  - offer language detection (`src/lib/resume-from-job/detect-offer-language.ts`);
  - untrusted-text sanitizers (`untrusted-text.ts`);
  - the guarded server-side AI test stub (`src/lib/ai/test-stub.ts`, `test-stub-contract.ts`);
  - the pattern of an authenticated route that reads the application server-side (`src/app/api/resumes/from-job-application/route.ts`).

## Owner decisions (2026-10-23, in chat)

- **Closed offer.** An offer counts as closed if its deadline is past, or if its page answers 404 or 410. The page is checked server-side, only on the already-allowed job-board hosts. When the page cannot be checked, the letter is created. That covers no URL, a host outside the allowlist, a page behind a login, a timeout, or any other status.
- **No linked CV.** The AI writes the letter from the offer alone.
- **Language.** The letter is written in the offer's language. If that cannot be detected, it falls back to the page language.
- **AI failure.** The provider fails, or our rate limit or the provider's is hit: an error is shown, no letter is created, and the user can retry.

## Scope

- Creating a cover letter from a job application (`?jobApplicationId=`) through the three entry points above.
- A server-side creation path that:
  1. reads the application with the user's session and ownership;
  2. checks whether the offer is still open;
  3. reads the linked or selected CV (the user's own);
  4. generates the letter;
  5. stores it;
  6. links the application to it.
- "Lier à un CV" pre-selected with the application's linked CV.
- Localized messages for the closed-offer refusal, the AI-failure error and the busy state, in fr, en, de and it.

## Out of Scope

- Creating a cover letter without a job application (`/cover-letters/new` without `jobApplicationId`, or with only `?resume_id=`). It stays exactly as today.
- The editor's generation modal and `POST /api/ai/generate-cover-letter`: no behaviour change. The new path may reuse its prompt builder and parsing.
- Cover-letter templates, editor layout, PDF/Word export.
- Re-checking offers that already have letters; any periodic or background availability check; changing the application's status when the offer is closed.
- Adding an "open/closed" column or any schema change.
- Widening the job-board host allowlist.
- Changing the AI provider, model or rate limits.
- Job Search (`/dashboard/jobs`) cover-letter flows.

## Impact Assessment

- **Frontend / UI:** Affected. The creation form (pre-selected CV, busy state, closed-offer and error messages, submit through the server path).
- **Internationalization:** Affected. New messages in fr, en, de and it; the letter's language follows the offer.
- **Resume model / templates:** Not affected. The CV is read only.
- **Exports:** Not affected. The letter shape is unchanged, and the cover-letter PDF must keep rendering it (regression only).
- **Database / persistence:** Affected, data only. The letter is inserted server-side with generated text. No migration.
- **Security / authorization:**
  - Affected: the new authenticated route, application and CV ownership, untrusted offer and AI text, and a server-side fetch of a stored URL (SSRF boundary).
- **Testing / validation:** Affected. Unit tests, plus e2e with the guarded AI stub and a stubbed availability check.

## User Stories

### US-001: A letter created from an application is written from the offer and the linked CV

**Description:**
As a user creating a cover letter from a saved job application, I want the letter written for me from the offer and my linked CV, so that I start from a real draft instead of an empty letter.

**Acceptance Criteria:**

- [ ] Submitting the creation form from an application stores a letter whose `opening_paragraph`, at least one `body_paragraphs` entry and `closing_paragraph` are non-empty AI text.
  - Its `greeting` and `sign_off` are non-empty, in the letter's language.
  - Its `company_name`, `job_title` and `job_application_id` match the application.
  - Its `resume_id` is the CV selected in the form.
- [ ] When a CV is selected, its content is used in the prompt: summary, experience and skills, as the existing route reads them.
  - `sender_name` is the CV's contact name when that is non-empty.
- [ ] When no CV is selected, the letter is generated from the offer alone and `resume_id` is null.
- [ ] Language:
  - The letter is written in the offer's language when it is detected as fr, en, de or it, otherwise in the page language. The same detection as the CV flow is used.
  - A German offer opened under `/fr` gives a German letter.
- [ ] When the application has no job description, the letter is generated from the job title, the company and the CV (if any). Creation is not refused for that reason.
- [ ] If the AI fails or is rate-limited:
  - a localized error is shown on the form;
  - no letter is stored and the application's `cover_letter_id` is unchanged;
  - the form stays filled so the user can retry.
- [ ] The application's `cover_letter_id` points to the new letter, and the user lands in its editor showing the generated text.
- [ ] While the letter is created, the submit button shows a localized busy label and is disabled. A double submit creates one letter.
- [ ] Another user's application, or another user's CV id, is refused and nothing is created or linked.

### US-002: A closed offer creates no letter

**Description:**
As a user, I want to be told when the offer I am writing for is no longer open, so that I don't spend time on a letter for a closed position.

**Acceptance Criteria:**

- [ ] If the application's `deadline` is before today, submitting shows a localized message that the offer is no longer open. No letter is created and nothing is linked.
  - "Today" is evaluated server-side, in UTC.
- [ ] If the application's `job_url` is on an allowed job-board host and its page answers 404 or 410, the same message is shown and nothing is created. Redirects are followed and re-checked as `safeFetch` already does.
- [ ] In every other case the letter is created as in US-001:
  - no `job_url`;
  - a host outside the allowlist;
  - any other status (2xx, 3xx limit, 401/403, 429, 5xx);
  - a timeout or network error.
- [ ] The availability check runs server-side only, with a bounded time budget. The AI is not called when the offer is closed.
- [ ] The message names the reason: deadline passed, or page no longer available.

### US-003: "Lier à un CV" shows the application's CV

**Description:**
As a user whose application already has a linked CV, I want "Lier à un CV" to be set to that CV when I create the letter, so that the letter uses the right CV without my choosing it again.

**Acceptance Criteria:**

- [ ] Opening the creation form from an application whose `resume_id` is one of the user's CVs shows that CV selected in "Lier à un CV".
- [ ] The user can still change or clear the selection, and the letter uses the final selection (US-001).
- [ ] If the application has no linked CV, the select starts empty, unless `?resume_id=` names one of the user's CVs. In that case it starts on that CV, as today.
- [ ] If the application's `resume_id` is not among the user's CVs, the select starts empty.

## Functional Requirements

- **FR-1:** Creation from an application goes through one authenticated server route. That route reads the application and the CV with the user's session and explicit `user_id` checks. The client sends only identifiers and form fields (title, company, job title, selected CV id, locale). Offer and CV content is never trusted from the client.
- **FR-2:** The availability check (US-002) runs before any AI call. It uses `safeFetch` with the existing job-board allowlist, a bounded timeout and a bounded redirect count. Only 404 and 410 mean closed.
- **FR-3:** The AI prompt reuses `buildCoverLetterGenerationPrompt` and its JSON reply shape. The prompt states which language to write in, from the offer-language detection. The prompt's behaviour for the editor modal's existing calls is unchanged, which is pinned by test.
- **FR-4:** Offer text, CV text and AI output are untrusted.
  - AI output is sanitized as plain text before storage.
  - Lengths and entry counts are bounded by the existing AI input limits.
  - No raw AI reply or CV content is logged on the new path.
- **FR-5:** The AI test stub is the guarded server-side stub from cv-from-job-complete, extended to the cover-letter generation. Its enabling conditions are unchanged. The availability fetch is stubbable for e2e under the same guard, so no e2e test reaches a real job board.
- **FR-6:** No schema migration, no new dependency, no change to the host allowlist.
- **FR-7:** New UI strings exist, non-empty, in fr, en, de and it (`src/locales/locale-parity.test.ts`).

## Regression Constraints

- Creating a letter without an application stays exactly as today: client insert, the same default greeting and sign-off, no AI call, the `?resume_id=` pre-selection.
- The editor's generation modal and `POST /api/ai/generate-cover-letter` behave as before. Its existing prompt output is byte-identical, pinned by test.
- The three entry points keep their links and wording.
- Existing letters and applications are not modified, other than linking the new letter.
- The cover-letter editor, PDF export and the specs `e2e/cover-letter-editor-i18n.spec.ts`, `e2e/cover-letter-editor-spacing.spec.ts` and `e2e/cover-letter-pdf-export.spec.ts` stay green unchanged.

## Required Verification

- The `CLAUDE.md` §14 baseline.
- Unit tests:
  - Route: ownership of the application and of the CV; deadline past, today, future and none; availability 404, 410, 200, 403, 5xx, timeout, host outside the allowlist, no URL; AI provider error, provider 429, our limit, unparsable reply → error and no insert; language from the offer with fallback; sanitized output; no description.
  - Pre-selection: the application CV, `?resume_id=`, a foreign or missing id.
  - The existing modal prompt unchanged, pinned.
- e2e with the AI stub and a stubbed availability check, in fr and de:
  - an application with a linked CV gives a generated letter in the offer's language, with "Lier à un CV" pre-selected and the stored row checked;
  - an application without a CV gives a generated letter with no `resume_id`;
  - a past deadline, and a 404 page, each show the message and create nothing;
  - an AI failure shows the error and creates nothing;
  - creating without an application is unchanged.
- `security-review` on the new route, ownership, sanitization, the availability fetch (SSRF) and the stub guard.
- `ui-expert` on the creation form (pre-selected CV, busy state, closed-offer message, error) and the resulting editor, in fr and de at 1440 and 375.
- `code-reviewer`.

## FAIL Conditions

- A letter created from an open offer has an empty opening, body or closing.
- A letter is created, or linked, for an offer the check found closed (deadline past, or 404/410).
- An offer whose availability could not be determined is refused.
- A letter is created from another user's application or uses another user's CV.
- The availability check fetches a host outside the allowlist, or a private or internal address.
- "Lier à un CV" ignores the application's linked CV.
- Creation without an application, or the editor's generation modal, changes behaviour.
- An AI failure stores a letter.

## BLOCKER Conditions

- Detecting a closed offer reliably requires a schema change, a new dependency or widening the host allowlist. Report it; the owner decides.
- The AI cannot return the letter reliably within the current token budget and parsing. Report it with failure rates; the owner decides.

## Risks

- Many job boards answer 200 with an "offer expired" page, or need a login (LinkedIn). Those offers are treated as open by design, so the check finds only clear removals.
- The availability fetch adds latency to creation. It is bounded by the timeout and skipped when the deadline already decides.
- The real provider's failure rate for letters is unmeasured locally (no provider key in the test environment).

## Evidence / References

- `src/components/dashboard/create-cover-letter-form.tsx`: current client insert with an empty letter; the `initialResumeId` pre-selection.
- `src/app/[locale]/(dashboard)/dashboard/cover-letters/new/page.tsx`: server read of the application and resumes.
- `src/app/api/ai/generate-cover-letter/route.ts`, `src/lib/ai/prompts.ts` (`buildCoverLetterGenerationPrompt`): existing generation.
- `src/components/dashboard/job-applications/kanban-card.tsx:462`, `src/components/dashboard/job-application-card.tsx:237`, `src/app/[locale]/(dashboard)/dashboard/job-applications/[id]/page.tsx:246`: the entry points.
- `supabase/migrations/001_initial_schema.sql` (`job_applications.deadline`, `job_url`, `resume_id`), `004_tri_directional_associations.sql` (`cover_letter_id`).
- `src/lib/security/safe-fetch.ts`, `src/app/api/jobs/fetch-external/route.ts`: bounded fetch and allowlist.
- `src/lib/resume-from-job/detect-offer-language.ts`, `untrusted-text.ts`, `src/lib/ai/test-stub.ts`, `src/app/api/resumes/from-job-application/route.ts`: reusable pieces from cv-from-job-complete.

## Open Questions

- None. The four material decisions are recorded under Owner decisions.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
