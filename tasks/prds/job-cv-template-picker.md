# PRD: One template picker, with live thumbnails, wherever a CV is created

**Status:** APPROVED 2026-10-06

## Objective

Everywhere a user creates a CV, they choose its template from one shared
picker. The picker shows a live miniature of each template, and the created CV
uses the chosen template. This includes the "Create CV from Job" modal on Job
Search, which today offers no choice.

## Context / Current Behavior

- **Live CV-creation surfaces.** Two surfaces create a CV and are reachable from
  the product:
  1. `/[locale]/dashboard/resumes/new`, rendered by
     `src/components/dashboard/create-resume-form.tsx`. It has a local list of
     five template cards (icon, name, description). The selected card has a
     `border-teal-600 bg-teal-50` style and a `bg-teal-600` icon tile. Order:
     modern, classic, minimal, creative, professional. Default: `modern`. It
     inserts the resume client-side with the chosen template. Links to it come
     from `dashboard/resumes/page.tsx`, the job-application card, the kanban card
     and the cover-letter resume association.
  2. The **"Create CV from Job"** modal on `/[locale]/dashboard/jobs`
     (`CVAdaptationModal` with `isCreateNewCV={true}`,
     `src/components/jobs/job-detail-panel.tsx:738-755`). It opens from the
     **"Créer un CV"** button and from **"Adapter mon CV" → "Nouveau CV"**. It has
     no picker: it posts `template: 'professional'` hard-coded
     (`src/components/dashboard/cv-adaptation-modal.tsx:144`) to
     `/api/ai/generate-from-job-description`, then redirects to the editor.
- **Unlinked surfaces.** `/[locale]/resumes/new` (`resume-creation-form.tsx`)
  and `/[locale]/resumes/from-job` (`job-description-form.tsx`) each have their
  own picker, but nothing in `src/` links to them. The latter labels both
  `professional` and `modern` as "Modern".
- **API.** `/api/ai/generate-from-job-description` (`route.ts:79-97`) already
  whitelists the five ids and stores the posted value in `resumes.template`.
- **Template names.** `common.json → resumes.templates` has names and
  descriptions for `modern`, `classic`, `minimal`, `creative` in all four
  locales, but **no `professional` / `professionalDesc`**. So
  `/dashboard/resumes/new` shows the English fallback "Professional" in every
  locale.
- **Template rendering.** `src/components/dashboard/resume-preview.tsx`
  dispatches on `resume.template` to the five template components. It takes the
  `common` dictionary (section headings come from
  `dict.resumes.editor.sections.*`). Interactive affordances (resize handles,
  photo upload) appear only when their setter or callback props are passed.
- **SSR hazard.** The templates are server-prerendered. Rich text routed through
  `renderFormattedText` / `sanitizeHtml` (`src/lib/html-utils.tsx`, which needs
  `document`) makes the server render fail. React then re-renders on the client,
  hiding the failure from tests that do not check the HTTP status.
- **Dictionaries.** The Job Search page loads only the `jobs` namespace
  (`dashboard/jobs/page.tsx:10`). `/dashboard/resumes/new` loads `common`.

## Scope

- One shared template-picker component, used by both live surfaces.
- In each option, a **live thumbnail** rendered by `ResumePreview` with the
  option's template id and one fixed, invented sample resume, scaled down from
  page width. There is no separate rendering path, no image file, and no change
  to the templates.
- Localized names and descriptions for all five templates in `fr`, `en`, `de`,
  `it`, read from one place (`common.json → resumes.templates`), including the
  missing `professional` entries.
- `/dashboard/resumes/new` replaces its local list with the shared picker.
- The "Create CV from Job" modal shows the shared picker in create-new-CV mode
  only, and posts the selected template.
- Each surface keeps its current default: `modern` on `/dashboard/resumes/new`,
  `professional` in the modal.
- Visual style follows the platform theme and today's `create-resume-form.tsx`
  look: teal selection, slate neutrals, lucide icons, and the existing `dark:`
  variants.

## Out of Scope

- `/resumes/new` and `/resumes/from-job` (unlinked), including the duplicate
  "Modern" label. Removing those routes is a separate owner decision.
- The adapt-existing-CV flow of `CVAdaptationModal` and its purple styling.
- Any change to the five template components, `resume-preview.tsx`, the layout
  settings, the exports, `/api/ai/generate-from-job-description`, the AI
  prompt, or the `resumes` schema.
- Thumbnails that reflect the user's own data, photo, colours or layout
  settings.
- Static image or SVG thumbnails.
- Remembering the last-chosen template.

## Impact Assessment

- **Frontend / UI:** Affected. New shared picker. It replaces the list in
  `create-resume-form.tsx` and is added to the create-new-CV mode of
  `cv-adaptation-modal.tsx`.
- **Internationalization:** Affected. New `professional` / `professionalDesc`
  keys in four `common.json` files, and the Job Search surface must receive the
  `common` strings the picker and the thumbnails need.
- **Resume model / templates:** Not affected in code. The templates are rendered
  read-only for thumbnails and are not modified; `resumes.template` already
  holds all five ids.
- **Exports:** Not affected.
- **Database / persistence:** Not affected. No migration. Both surfaces already
  persist the template they send.
- **Security / authorization:** Not affected. The sample resume is static,
  invented, plain text. The server-side template whitelist is unchanged.
- **Testing / validation:** Affected. New unit and e2e coverage; `ui-expert`
  must validate the rendered pickers and thumbnails.

## User Stories

### US-001: Choose a template from live thumbnails when creating a CV

**Description:**
As a user creating a CV on `/dashboard/resumes/new`, I want to see what each
template looks like before choosing, in my language, so that I pick the right
design the first time.

**Acceptance Criteria:**

- [ ] `/[locale]/dashboard/resumes/new` shows exactly five options in this order:
      Modern, Classic, Minimal, Creative, Professional. Each has an icon, a
      localized name, a localized one-line description and a thumbnail.
- [ ] Each thumbnail is `ResumePreview` rendering the option's own template id
      with the shared sample resume. A template's thumbnail matches the Preview of
      that template with the same sample resume at the same scale.
- [ ] Thumbnails keep the A4 page proportion (210:297), scale the page to the
      card width without horizontal overflow, and show section headings in the
      page's locale.
- [ ] Thumbnails are not interactive: no resize handle, photo upload or editable
      area; no element inside a thumbnail can receive focus; they are hidden from
      assistive technology (`aria-hidden`), so each option's accessible name is
      its template name.
- [ ] Modern is selected on page load, and exactly one option is selected at any
      time.
- [ ] Each option can be reached and selected with the keyboard, and its selected
      state is exposed to assistive technology (`aria-checked` or
      `aria-pressed`).
- [ ] The selected option uses the teal selection style (`border-teal-600`,
      `bg-teal-50`, `bg-teal-600` icon tile); unselected options use slate
      borders; the existing `dark:` variants still apply.
- [ ] Creating the resume stores the selected template in `resumes.template` and
      redirects to its editor, as today. The title field, validation, error
      display and job-application linking behave as before.
- [ ] In `fr`, `en`, `de` and `it`, all five names and descriptions are
      translated. "Professional" no longer shows in English in non-English
      locales.
- [ ] The page's server response is HTTP 200, and the browser console shows no
      `document is not defined`, hydration-mismatch or React error while the
      thumbnails render.
- [ ] At a 375 px viewport the picker has no horizontal overflow and every
      option, thumbnail included, is fully visible by scrolling the page.

### US-002: Choose the template of a CV created from a job offer

**Description:**
As a job seeker creating a CV from a job offer, I want the same template picker
in the creation modal, so that the new CV opens in the design I chose.

**Acceptance Criteria:**

- [ ] In the "Create CV from Job" modal (create-new-CV mode, from both "Créer un
      CV" and "Adapter mon CV" → "Nouveau CV"), the shared picker from US-001
      shows the same five options, order, names, descriptions and thumbnails,
      between the company field and the submit button.
- [ ] Professional is selected when the modal opens.
- [ ] Submitting sends a POST to `/api/ai/generate-from-job-description` whose
      JSON body has `template` equal to the selected id. `jobDescription`,
      `title` and `locale` are unchanged from today.
- [ ] After a successful response, the browser navigates to
      `/{locale}/dashboard/resumes/{resumeId}/edit` as today.
- [ ] While the request is in flight, the selection cannot be changed.
- [ ] Names, descriptions and thumbnail section headings are localized in `fr`,
      `en`, `de` and `it`.
- [ ] In adapt-existing-CV mode (`isCreateNewCV` false) the picker is not
      rendered, and that mode is visually and behaviourally unchanged.
- [ ] `/[locale]/dashboard/jobs` still returns HTTP 200, and opening the modal
      logs no `document is not defined`, hydration-mismatch or React error.
- [ ] At a 375 px viewport the modal has no horizontal overflow and every option
      is fully visible by scrolling the modal body.

## Functional Requirements

- **FR-1:** There is exactly one template-picker component. Both live surfaces
  use it, and neither keeps its own template list.
- **FR-2:** The option ids are exactly `modern`, `classic`, `minimal`,
  `creative` and `professional`, in that order. The caller sets the default.
- **FR-3:** Thumbnails are produced only by `ResumePreview`, with the option's id
  as `resume.template`, the default layout, no setter, photo or callback props,
  and one fixed sample resume.
- **FR-4:** The sample resume is invented (no real person's data), deterministic
  (no dates relative to now, no generated ids), and contains plain text only (no
  HTML markup), so no template routes it through `sanitizeHtml`. It lives in
  application source, not in an e2e fixture.
- **FR-5:** Template names and descriptions come only from
  `common.json → resumes.templates`, with entries for all five ids in all four
  locales. The Job Search surface receives these strings and the `common`
  section headings from the server through the existing i18n loader.
- **FR-6:** The modal posts the selected id as `template`; no other request field
  changes. `/dashboard/resumes/new` inserts the selected id as today.
- **FR-7:** Styling uses Tailwind tokens already used by the platform. No new
  colour, font or dependency.

## Regression Constraints

- The five template components, `resume-preview.tsx`, `src/lib/layout-settings.ts`,
  the PDF/DOCX export code and `/api/ai/generate-from-job-description` are not
  modified.
- `resume-creation-form.tsx`, `job-description-form.tsx` and their routes are not
  modified.
- The adapt-existing-CV mode of `CVAdaptationModal` is unchanged: purple
  styling, analyze button, preview/apply stages, "Browse Job Listings" block.
- Without touching the picker, `/dashboard/resumes/new` still creates a `modern`
  CV and the modal still creates a `professional` CV.
- The modal's job description, title and company keep their prefill,
  validation (100-character minimum, title required) and error display.
- No existing test changes its assertions; existing visual baselines and parity
  tests stay green without re-baselining.

## Required Verification

- The mandatory baseline from `CLAUDE.md` §14 on the final diff. Lint is judged
  against the tracked baseline. Because templates are rendered in a new
  context, `pnpm test:visual` and `pnpm test:parity` must also pass unchanged.
- Unit tests for the shared picker: five options in order, default handled by
  the caller, single selection, keyboard selection, the selected-state attribute,
  thumbnails `aria-hidden` with no focusable descendant.
- Locale parity: a test that `resumes.templates` has non-empty names and
  descriptions for all five ids in all four `common.json` files.
- Sample-resume test: the sample contains no `<` character in any string field
  (no HTML).
- Playwright e2e (US-001) on `/[locale]/dashboard/resumes/new`: asserts HTTP 200
  on navigation, the default selection, five thumbnails, choosing a non-default
  template, and that the created resume has that template. Console errors from
  the list above fail the test.
- Playwright e2e (US-002) on `/[locale]/dashboard/jobs`: stubs the job data,
  `/api/jobs/fetch-external` and `/api/ai/generate-from-job-description` with
  `page.route`, makes no real AI call, and asserts HTTP 200, the default
  Professional, the posted `template` for each of the other four options, the
  redirect, and no picker in adapt mode.
- `ui-expert` validation with screenshots at desktop and 375 px, in `fr` and one
  other locale, of both surfaces: default state, a non-default selection, and
  each thumbnail compared with the Preview of its template rendering the same
  sample resume.
- `code-reviewer` validation of each story's final diff.

## FAIL Conditions

- A surface keeps its own template list, or a thumbnail is produced by anything
  other than `ResumePreview` (an image, an SVG, a copy of a template).
- A thumbnail shows a different template from its option, or a template file,
  `resume-preview.tsx` or the export code is modified.
- The modal posts a template other than the selected one, or always
  `professional`.
- A surface's default differs from its current default (`modern` /
  `professional`).
- An option is missing, duplicated, mislabelled, or shows an English fallback or
  empty string in a non-English locale.
- Either page returns a non-200 status, or the console shows
  `document is not defined`, a hydration mismatch or a React error.
- A thumbnail is focusable, interactive, or announced by assistive technology;
  the picker cannot be operated by keyboard.
- Horizontal overflow or clipped options at 375 px on either surface.
- An existing visual or parity baseline is changed to make it pass.

## BLOCKER Conditions

- `ResumePreview` cannot render a template read-only without passing setter or
  callback props (for example, a template that throws or shows edit affordances
  when they are absent). Report it; do not modify the template to work around
  it.
- The Job Search page cannot be loaded deterministically in e2e because the job
  data or the external fetch cannot be stubbed. Do not replace the e2e with a
  component-only test.
- The five thumbnails make either surface unusable on the developer machine (for
  example, the modal takes seconds to open). Report it with a measurement; a
  change of approach (lazy or deferred rendering, a different thumbnail kind)
  needs an owner decision and a PRD update.

## Risks

- Rendering five full templates per picker costs more than a static card. The
  sample resume should stay short, and rendering may be deferred until after
  mount, as long as the acceptance criteria hold.
- Any template that still calls `renderFormattedText` on content would break the
  server render. A plain-text sample avoids it, and the HTTP-200 assertions catch
  it if it happens.
- The Job Search page will load extra `common` strings. Passing only the needed
  subset keeps the payload small.
- Changes to the templates now show up in the pickers automatically. That is the
  intended behaviour, but it widens what a template change affects visually.

## Evidence / References

- `src/components/dashboard/create-resume-form.tsx:24-58, 163-212`: current list,
  default, order and look of `/dashboard/resumes/new`.
- `src/app/[locale]/(dashboard)/dashboard/resumes/new/page.tsx:20, 86`: loads
  `common` and renders the form.
- `src/components/dashboard/cv-adaptation-modal.tsx:135-159`: create-new-CV
  submit with the hard-coded `template: 'professional'`.
- `src/components/jobs/job-detail-panel.tsx:704-755`: both entry points into
  create-new-CV mode.
- `src/app/[locale]/(dashboard)/dashboard/jobs/page.tsx:10`: Job Search loads only
  `jobs`.
- `src/app/api/ai/generate-from-job-description/route.ts:79-97`: template
  whitelist and persistence.
- `src/components/dashboard/resume-preview.tsx:122-142`: the single dispatch from
  template id to template component.
- `src/lib/html-utils.tsx:19-27`: `sanitizeHtml` requires `document`.
- `src/locales/*/common.json → resumes.templates`: existing names; no
  `professional`.
- `src/components/dashboard/resume-creation-form.tsx` and
  `job-description-form.tsx`: unlinked pickers (out of scope).
- `e2e/fixtures/resume.ts`: precedent for a deterministic invented resume (not
  reused, because it is an e2e fixture).
- Owner screenshots, 2026-10-06: the "Créer un CV" button and the modal without a
  template choice. Owner decisions, 2026-10-06: live scaled thumbnails; the two
  live surfaces only.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
