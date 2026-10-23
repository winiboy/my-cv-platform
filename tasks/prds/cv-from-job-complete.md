# PRD: A CV created from a job offer is complete

**Status:** APPROVED 2026-10-22

## Objective

When a user creates a CV from a job offer, the new CV opens with every field
filled. The content is tailored to the offer where the offer allows it. Every
other field holds an explicit sample value whose wording shows what belongs
there, so the user knows at a glance what to replace. This applies to a saved
job application (Mes candidatures) and to Job Search, and the content is
written in the offer's language.

## Context / Current Behavior

Reported by the owner on 2026-10-22: a CV created from a saved job application
on `/fr/dashboard/job-applications` is empty.

**Entry points from a saved job application.** The Kanban card menu
(`src/components/dashboard/job-applications/kanban-card.tsx:448`), the list-view
card (`src/components/dashboard/job-application-card.tsx:228`) and the detail
page (`src/app/[locale]/(dashboard)/dashboard/job-applications/[id]/page.tsx:205`)
all link to `/[locale]/dashboard/resumes/new?jobApplicationId=<id>`.

- That page (`src/app/[locale]/(dashboard)/dashboard/resumes/new/page.tsx:34-86`)
  loads the application and shows a banner with its job title and company.
- `src/components/dashboard/create-resume-form.tsx`:
  - the title field starts blank, and the user must type one (`:25`, `:35`);
  - the insert (`:57-73`) is hard-coded empty: `contact: {}`, `summary: ''`,
    and `experience`, `education`, `skills`, `languages`, `certifications` and
    `projects` all `[]`;
  - only `title`, `template` and `job_application_id` carry data, and the
    application's `resume_id` is set (`:89-100`).
- The job's title, company, description, location and URL are never used. This
  path never had content generation; the original spec only asked it to
  navigate (`tasks/prds/Job-Application - US.md:236`).
- The banner's strings `resumes.new.creatingForJob` and `common.at`, and
  `resumes.new.titleRequired`, exist in no locale, so they show English
  fallbacks.

**Job Search "Créer un CV"** (`src/components/jobs/job-detail-panel.tsx:399`,
`cv-adaptation-modal.tsx:214-237`) posts the job description to
`/api/ai/generate-from-job-description` (`src/app/api/ai/generate-from-job-description/route.ts`).

- The route fills only `summary`, `experience`, `skills` and `projects` from the
  AI (`:94-109`). `contact` stays `{}`, and `education`, `languages` and
  `certifications` stay `[]`.
- The AI's experience entries have no `achievements`.
- The prompt (`src/lib/ai/prompts.ts:420-530`) receives only the description
  and the UI locale. It writes in the UI locale, not the offer's language.
- The AI is Groq (`src/lib/ai/client.ts`): `maxTokens` 2000, and a reply that is
  cut off fails JSON parsing with a 500 (`transformations.ts:138-178`). Rate
  limit: 60 requests per 600 s per user (`src/lib/api/ai-rate-limit.ts`).
- There is no server-side AI stub, so e2e tests stub it in the browser only.

**Resume data model** (`supabase/migrations/001`, `004`, `007`;
`src/types/database.ts:48-120`; editor sections in
`src/components/dashboard/resume-sections/*`):

| Section | Fields |
|---|---|
| Title | `title`; templates show it as the headline |
| Contact | name, email, phone, location, LinkedIn, GitHub, website |
| Summary | rich text |
| Experience | company, position, start and end date (`YYYY-MM`), current, location, description (rich text), achievements[] |
| Education | school, degree, field, start and end date, GPA, description (rich text), achievements[] |
| Skills | category, `skillsHtml` (rich text) / items[] |
| Languages | language, level (Native, Fluent, Professional, Intermediate, Basic) |
| Certifications | name, issuer, date, expiry date, credential id, URL |
| Projects | shown as "Key achievements": name, description (rich text), URL, start and end date, technologies[] |

- The photo is stored only in the browser (`resume-editor.tsx:290-434`), not in
  the database.
- `custom_sections` has no editor UI.
- There is no column for the content language.

**Precedents.**

- `src/lib/template-sample-resume.ts` is a complete invented resume used by the
  template picker thumbnails.
- `src/components/dashboard/create-cover-letter-form.tsx:32-40,96` already
  pre-fills a cover letter from the job (title, company, job description).
- `.claude/rules/resumes.md` forbids hardcoding resume content "to satisfy
  visual acceptance criteria". The sample values here are a product
  requirement stated by the owner, not test data, and must be documented as
  such.

**Owner decisions (2026-10-22, in chat):**

- **Source:** the AI writes offer-specific content; explicit sample values fill
  everything else. If the offer has no usable description or the AI fails,
  sample values fill every field.
- **Language:** content and sample values are written in the offer's language.
- **Photo:** no photo. It is the only field left empty.
- **Scope:** both entry points, Mes candidatures and Job Search, through one
  shared logic.

## Scope

- **One shared server-side builder.** From a job offer (title, company,
  location, description), it produces a complete resume: AI-tailored content
  where the offer allows, and sample values for every field the offer or the AI
  does not provide. Both entry points use it.
- **Sample-value sets** in fr, en, de and it. Each value states what the field
  is for, for example fr name "Prénom Nom" and email "prenom.nom@exemple.com".
  Only one set is chosen per resume.
- **Offer-language detection**, falling back to the UI locale when the language
  is unsupported or cannot be detected.
- **The Mes candidatures flow:**
  - the title is pre-filled from the job;
  - the CV is filled through the builder and linked to the application, as
    today;
  - the missing banner and validation keys are added in four locales.
- **The Job Search flow:** the same builder fills contact, education,
  languages, certifications and experience achievements. It no longer leaves
  any field empty.
- **A server-side AI stub for e2e tests.** It can never be active in production.

## Out of Scope

- The photo, which is stored in the browser only.
- `custom_sections`, which has no editor UI.
- Layout and template settings, section order and visibility, and template
  rendering.
- The quality-analysis badge and the unused iterative generator
  (`src/lib/ai/iterative-generator.ts`).
- Changing the AI provider or model, or the rate limits.
- Cover letters.
- Creating a CV from scratch (`/dashboard/resumes/new` without a job), which
  stays empty.
- Translating an existing CV.
- A schema change: no new column. If one turns out to be needed, raise a
  BLOCKER.

## Impact Assessment

- **Frontend / UI:** Affected. The `/dashboard/resumes/new` form when it has a
  job, its banner and validation strings, and progress and error feedback while
  the CV is generated.
- **Internationalization:** Affected. Sample-value sets in four languages, the
  missing `resumes.new.*` and `common.at` keys, and AI output in the offer's
  language.
- **Resume model / templates:** Affected (content only). New resumes get every
  existing field filled; no schema, template or layout change.
- **Exports:** Not affected. PDF and Word render whatever content the resume
  holds.
- **Database / persistence:** Affected (data only). Inserts carry full content;
  the application's `resume_id` link is unchanged; no migration.
- **Security / authorization:**
  - Affected. A new server path reads the user's job application, so ownership
    must be enforced server-side.
  - The AI stub must be impossible to enable in production.
  - AI output and offer text are untrusted input; rich text stays sanitized.
- **Testing / validation:** Affected. Unit tests for the builder and the sample
  sets, e2e for both entry points with a server-side AI stub, and render checks.

## User Stories

### US-001: A complete CV draft can be built from any job offer

**Description:**
As the product, I want one builder that turns a job offer into a complete
resume, so that every CV created from an offer has every field filled the same
way.

**Acceptance Criteria:**

- [ ] **Every field.** Given a job offer (title, company, location, description)
      and optional AI content, the builder returns a resume in which every field
      listed in Context is non-empty, except the photo.
  - This covers title, the 7 contact fields and summary.
  - It covers at least 1 experience with company, position, start and end
    date, location, description and at least 1 achievement.
  - It covers 1 education with school, degree, field, dates, GPA, description
    and at least 1 achievement.
  - It covers at least 1 skill category with content, at least 1 language with
    a level, and 1 certification with name, issuer, date, expiry date,
    credential id and URL.
  - It covers at least 1 project with name, description, URL, dates and at
    least 1 technology.
  - Every entry is visible.
- [ ] **Offer data first.** The title (headline) is the job title. The contact
      location is the job's location when it has one. The summary names the job
      title, or the job title and company.
- [ ] **AI content where available.** When AI content is given, its summary,
      experiences, skills and projects are used, and any of their fields left
      empty is filled from the sample set.
- [ ] **Sample values describe their field.** Each sample value makes the
      field's purpose obvious without the label. Examples for fr:
  - name "Prénom Nom", email "prenom.nom@exemple.com", phone
    "+41 00 000 00 00", LinkedIn "linkedin.com/in/votre-profil";
  - school "Nom de votre école", certification "Nom de votre certification".

  Equivalent sets exist in en, de and it. No sample value names a real person,
  company or institution.
- [ ] **One language per CV.** The builder takes a content language (fr, en, de
      or it), and every sample value in the result comes from that one set.
- [ ] **Valid formats.** Dates are `YYYY-MM`, email and URLs are well-formed,
      language levels are stored values, and rich-text fields are sanitized
      HTML that renders in all five templates.

### US-002: A CV created from a saved job application is complete

**Description:**
As a user creating a CV from a job in Mes candidatures, I want the new CV
already filled with the job's information and clear sample values, so that I
edit it rather than start from nothing.

**Acceptance Criteria:**

- [ ] **Title.** Opening `/[locale]/dashboard/resumes/new?jobApplicationId=<id>`
      pre-fills the CV title from the application's job title. The user can
      still change it, and still choose a template.
- [ ] **Complete content.** Submitting creates a CV filled through the US-001
      builder. When the application has a usable description, AI content in the
      offer's language is used. The CV opens in the editor with every section
      showing its content.
- [ ] **Language.** The content language is the offer's language when it is fr,
      en, de or it, otherwise the UI locale. A German offer opened from
      `/fr/...` gives a German CV.
- [ ] **No description, or AI failure.** If the application has no usable
      description, or the AI fails or is rate-limited, the CV is still created,
      complete with sample values and the job's own fields. The user sees a
      short notice in the page language that the content could not be tailored.
- [ ] **Link and ownership.** The CV is linked to the application, both ways, as
      today. A request for another user's application, or a missing one, is
      refused server-side and creates nothing.
- [ ] **Banner and validation.** The banner ("CV pour la candidature … chez …")
      and the title-required message read in fr, de and it, and en is unchanged.
- [ ] **Feedback.** While the CV is generated, the submit button shows a
      localized busy state and cannot be submitted twice.

### US-003: A CV created from Job Search is complete

**Description:**
As a user creating a CV from an offer in Job Search, I want the same complete
CV, so that both ways of starting from an offer give the same result.

**Acceptance Criteria:**

- [ ] **Shared builder.** The Job Search "Créer un CV" flow (the create mode of
      the adaptation modal and the route `/api/ai/generate-from-job-description`)
      fills the CV through the US-001 builder. Contact, education, languages,
      certifications and experience achievements are no longer empty.
- [ ] **Language.** The AI writes in the offer's language, using the same
      fallback as US-002.
- [ ] **AI failure.** If the AI fails or is rate-limited, behaviour is unchanged
      from today: the error is shown and no CV is created. The flow does not
      silently fall back.
- [ ] **Unchanged flow.** The modal's steps, template picker, validation,
      redirect to the editor and request fields behave as before
      (`e2e/job-cv-template-picker.spec.ts` stays green; only assertions about
      content may be added).

## Functional Requirements

- **FR-1:** One builder, used by both entry points. Sample values are defined
  once per language. No second copy of the resume shape or of the sample
  values is introduced (`.claude/rules/resumes.md`, `CLAUDE.md` §10).
- **FR-2:** The sample values are product content requested by the owner, not
  test fixtures. They live in their own module with a comment stating that
  intent. They must not reuse `e2e/fixtures/resume.ts`, and they must differ
  from `TEMPLATE_SAMPLE_RESUME` in style: values that describe their field,
  not a realistic invented person.
- **FR-3:** The application is read server-side with the user's session, and
  ownership is enforced. The client never sends job content that the server
  trusts for the application path.
- **FR-4:** AI output and offer text are untrusted. Rich text is sanitized
  before storage or rendering with the project's existing path; lengths stay
  within the existing input limits.
- **FR-5:** The AI test stub is enabled only by an explicit server env flag set
  in the Playwright web server config. It is ignored when `NODE_ENV` is
  `production` or the request is not local, and it has a unit test proving it
  cannot activate in production.
- **FR-6:** No schema migration and no new dependency.
- **FR-7:** New UI strings exist, non-empty, in fr, en, de and it
  (`src/locales/locale-parity.test.ts`).

## Regression Constraints

- Creating a CV without a job (`/dashboard/resumes/new` with no
  `jobApplicationId`) stays exactly as today: empty content, template picker,
  title required.
- The template picker (`e2e/template-picker*.spec.ts`), the adaptation modal
  (`e2e/adaptation-modal-*.spec.ts`), Job Search mobile and the
  job-applications specs pass unchanged, apart from added content assertions.
- Existing CVs are not modified.
- Exports (PDF, Word) and parity are unchanged. `pnpm test:parity` stays
  NEW 0 / KNOWN 3, and the Word generators get no diff.

## Required Verification

- The `CLAUDE.md` §14 baseline, plus `pnpm test:parity`.
- Unit tests:
  - the builder returns every field non-empty (except the photo) for an offer
    with AI content and for one without;
  - each of the four sample sets is complete and in one language;
  - formats are valid;
  - AI content takes precedence and its gaps are filled;
  - the language falls back for an unsupported or undetectable language;
  - the stub cannot activate in production.
- e2e with the server-side AI stub, in fr and de:
  - Mes candidatures creates a complete, linked CV, with the language taken
    from a German offer opened under `/fr`;
  - an application with no description, and the AI failing, still produce a
    complete CV and show the notice;
  - another user's application is refused;
  - Job Search creates a complete CV;
  - the editor shows every section filled, read from the stored row and the
    rendered editor.
- `export-validation`: the PDF and Word of a CV created from an offer contain
  every section, checked on the generated artifacts.
- `security-review` on the new server path, ownership, sanitization and the stub
  guard.
- `ui-expert` on the creation page and the new CV in the editor and Preview, in
  fr and de at 1440 and 375, all five templates for one created CV.
  `code-reviewer`.

## FAIL Conditions

- Any field of a CV created from an offer is empty, other than the photo.
- A sample value names a real person, company or institution, or does not show
  which field it stands for.
- A CV mixes two languages in its sample values.
- A CV is created from another user's application, or the AI stub can be
  enabled in production.
- The no-job CV creation, the Job Search modal flow, or exports change
  behaviour.

## BLOCKER Conditions

- The offer's language cannot be determined reliably without a new dependency
  or a schema change. Report it; the owner decides.
- Filling every field requires a schema change, a new AI provider or new rate
  limits.
- The AI cannot return the extra fields reliably within the current token
  budget and parsing. Report it with failure rates; the owner decides between
  more budget and sample values.

## Risks

- Users may export a CV that still holds sample values. Values that describe
  their field make this visible; a warning before export is not in scope.
- The AI call adds latency and cost to the Mes candidatures flow, which today is
  instant. The busy state and the rate limit apply.
- Detecting the language from short or mixed-language offers can be wrong. The
  UI-locale fallback limits the damage.

## Evidence / References

- `src/app/[locale]/(dashboard)/dashboard/resumes/new/page.tsx:34-86`;
  `src/components/dashboard/create-resume-form.tsx:25-103`.
- `src/components/dashboard/job-applications/kanban-card.tsx:448`;
  `src/components/dashboard/job-application-card.tsx:228`;
  `src/app/[locale]/(dashboard)/dashboard/job-applications/[id]/page.tsx:205`.
- `src/components/jobs/job-detail-panel.tsx:399-454, 813-826`;
  `src/components/dashboard/cv-adaptation-modal.tsx:197-237`;
  `src/app/api/ai/generate-from-job-description/route.ts`.
- `src/lib/ai/prompts.ts:420-530`; `src/lib/ai/transformations.ts:138-178`;
  `src/lib/ai/client.ts`; `src/lib/api/ai-rate-limit.ts`.
- `src/types/database.ts:48-120`; `supabase/migrations/001`, `004`, `007`;
  `src/components/dashboard/resume-sections/*`.
- `src/lib/template-sample-resume.ts`;
  `src/components/dashboard/create-cover-letter-form.tsx:32-40, 96`.
- `.claude/rules/resumes.md`; `e2e/job-cv-template-picker.spec.ts`;
  `playwright.config.ts:106-114`.
- Earlier specs: `tasks/prds/CreateCV-from-Job.md`,
  `tasks/prds/job-cv-template-picker.md`.

## Open Questions

- None. The four design decisions were made by the owner on 2026-10-22.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
