# PRD: Ten Swiss CV templates

**Status:** DRAFT — amendment 1 (2026-11-19), awaiting owner re-approval. Previously APPROVED 2026-11-18.

**Amendment 1 (owner feedback after checking US-001 locally, 2026-11-19):** adds US-011, executed next (before US-002); changes FR-4 and FR-5; adds FR-12 to FR-14; narrows two Out of Scope items. US-001 stays committed (e5d8ea7); the parts it built that this amendment changes are reworked in US-011.

## Objective

Add ten new CV templates, each fitted to one of the most common Swiss CV profiles (sector × level of education). Each is drawn only from the resume fields the platform already has, and each can be chosen, edited, previewed and exported to PDF and Word like the five existing templates.

## Context / Current Behavior

- **The five templates today:** `professional`, `modern`, `classic`, `minimal` and `creative`.
  - The database allows only these five values: `resumes_template_check`, migrations `001_initial_schema.sql` and `002_add_professional_template.sql`.
  - The generated type `ResumeTemplate` (`src/types/supabase.ts`, `src/types/database.ts`) is the union of these five.
- **Every template exists in each of these places:**
  - a React component in `src/components/dashboard/resume-templates/<id>-template.tsx`;
  - a case in the Editor's live preview (`src/components/dashboard/resume-editor.tsx`) and in `src/components/dashboard/resume-preview.tsx`, which the Preview page, the PDF and the picker thumbnails all use;
  - an entry in `TEMPLATE_OPTIONS` (`src/components/dashboard/template-picker.tsx`), the one list that every CV-creation surface shows;
  - a name and a description in `resumes.templates` of `src/locales/{fr,en,de,it}/common.json`, guarded by `src/locales/template-names.test.ts` and `locale-parity.test.ts`;
  - its layout controls and editor sections (`TEMPLATE_LAYOUT_CONTROLS`, `TEMPLATE_EDITOR_SECTIONS` in `src/lib/layout-settings.ts`);
  - a Word generator in `src/app/api/resumes/[id]/download-docx/docx-<id>.ts`, picked in `route.ts` (`SUPPORTED_TEMPLATES`);
  - the template lists accepted by `src/app/api/resumes/from-job-application/route.ts` (`RESUME_TEMPLATES`) and `src/app/api/ai/generate-from-job-description/route.ts` (`validTemplates`).
- **PDF:** `POST /api/resumes/[id]/download-pdf` prints the Preview page in headless Chromium (`src/lib/pdf/render-preview.ts`), so a template's PDF is its Preview.
- **Photo:** stored only in the browser (`resume_photo_${id}` in localStorage). It is sent to the PDF and Word routes as `photoBase64`. Only `modern` draws it today, with an upload zone in the Editor.
- **Section headings:** existing labels in `resumes.template` are `summary`, `experience`, `education`, `training`, `skills`, `languages`, `keyAchievements`.
- **Data fields that exist and are reused:**
  - `contact` (name, email, phone, location, linkedin, github, website);
  - `title`, `summary`;
  - `experience` (position, company, location, dates, current, description, achievements);
  - `education` (degree, field, school, dates, description, achievements);
  - `skills` (category, items / skillsHtml);
  - `languages` (language, level: Native | Fluent | Professional | Intermediate | Basic);
  - `certifications` (name, issuer, date);
  - `projects` (name, description, url, technologies);
  - the per-item `visible` flags, `layout_settings` and the photo.
- **Validated mockups (owner, 2026-11-18):** the ten A4 mockups in `tasks/prds/swiss-cv-templates/` (`t1-cfc.png` … `t10-premier-emploi.png`, overview in `overview.png`). They use fictional people and fictional employers. They are the visual reference for this PRD.

## Scope

- Ten new template identifiers, added to the set of supported templates:

  | # | Id | fr name | en name | de name | it name | Mockup |
  |---|---|---|---|---|---|---|
  | 1 | `swissVocational` | Formation professionnelle (CFC) | Vocational training (VET) | Berufslehre (EFZ) | Formazione professionale (AFC) | `t1-cfc.png` |
  | 2 | `swissCommerce` | Commerce & administration | Business & administration | Kaufmännisch & Verwaltung | Commercio e amministrazione | `t2-commerce.png` |
  | 3 | `swissTrades` | Métiers techniques & manuels | Technical & skilled trades | Technische & handwerkliche Berufe | Mestieri tecnici e manuali | `t3-technique-manuel.png` |
  | 4 | `swissHealth` | Santé & social | Health & social care | Gesundheit & Soziales | Sanità e sociale | `t4-sante-social.png` |
  | 5 | `swissFinance` | Banque, finance & assurance | Banking, finance & insurance | Bank, Finanzen & Versicherung | Banca, finanza e assicurazioni | `t5-finance.png` |
  | 6 | `swissEngineering` | Ingénierie & technique | Engineering | Ingenieurwesen & Technik | Ingegneria e tecnica | `t6-ingenierie.png` |
  | 7 | `swissIt` | Informatique & IT | IT & software | Informatik & IT | Informatica e IT | `t7-informatique.png` |
  | 8 | `swissExecutive` | Cadre & direction | Executive & management | Kader & Geschäftsleitung | Quadri e direzione | `t8-cadre-direction.png` |
  | 9 | `swissAcademic` | Académique & recherche | Academic & research | Akademisch & Forschung | Accademico e ricerca | `t9-academique.png` |
  | 10 | `swissFirstJob` | Premier emploi | First job | Erste Stelle | Primo impiego | `t10-premier-emploi.png` |

- **For each new template:**
  - its Editor live preview, Preview page, PDF and Word export;
  - its picker card, with a thumbnail and a localized name and description in fr, en, de and it.
- One forward migration that adds the ten identifiers to the allowed values of `resumes.template`, with the generated types updated to match.
- The ten identifiers are accepted wherever the five existing ones are accepted:
  - template picker;
  - CV from a job application;
  - AI generation from a job description;
  - Word route.

## Out of Scope

- Any new resume field, column, JSON property or stored setting, including nationality, permit, date of birth, skill level or a CEFR language level. Sole exception (amendment 1): the contact-visibility list of FR-14, stored inside the existing `layout_settings` value.
- Any change to the five existing templates, their Word generators, their layout controls or their visual and parity baselines. Exceptions (amendment 1): the contact-visibility ticks of FR-14 apply to them, and the Preview page loses its "Show Controls" switch (FR-13), for every template.
- Any change to the Editor's form fields, sections or save behavior, other than the Contact-tab ticks and photo row of FR-12 and FR-14; the photo storage, its upload handler or its background removal; the PDF rendering pipeline; or the cover letter.
- Any new database migration for amendment 1: FR-14 needs none.
- Skill-level bars. The `t6-ingenierie.png` mockup shows bars; the platform stores no level per skill, so `swissEngineering` lists skills without bars.
- A "CFC" badge detected from the degree text (shown in `t1-cfc.png`). It would be locale-specific text detection, so it is not built.
- Removing, renaming or reordering the existing templates in the picker.
- A version bump.

## Impact Assessment

- **Frontend / UI:** Affected — ten new template components, ten picker cards, Editor and Preview cases.
- **Internationalization:** Affected — ten names and descriptions, plus the few new section headings (FR-6), in fr, en, de and it.
- **Resume model / templates:** Affected — the supported template set grows from five to fifteen; no resume field changes.
- **Exports:** Affected — a PDF (through Preview) and a new Word generator for each template.
- **Database / persistence:** Affected — one forward migration widening `resumes_template_check`; no column, row or RLS change.
- **Security / authorization:** Not affected — no new route, input or trust boundary; the existing template lists only grow. The new templates render user text through the same paths as the existing ones (FR-9).
- **Testing / validation:** Affected — unit, Word, e2e, visual and parity coverage for each new template.

## User Stories

### US-001: The "Formation professionnelle (CFC)" template is available and the template set is ready for the ten Swiss templates

**Description:**
As a job seeker with an apprenticeship (CFC), I want a CV template that follows Swiss conventions for vocational profiles, so that my CV looks like what Swiss employers expect.

**Acceptance Criteria:**

- [ ] A forward migration adds the ten identifiers in the Scope table to the allowed values of `resumes.template`. The five existing values stay allowed and no stored row changes. The checked-in generated types list the fifteen values.
- [ ] Until its own story lands, each of the other nine identifiers is offered nowhere: not in the template picker, not accepted by the job-application and AI routes, not accepted by the Word route.
- [ ] `swissVocational` appears in the template picker after the five existing templates, with its live thumbnail and its fr, en, de and it name and description. A CV can be created with it from the new-CV page and from a job application.
- [ ] The Editor live preview, the Preview page, the PDF and the Word export of a `swissVocational` CV match `t1-cfc.png`:
  - **Page and accent:** one column, with a thin red accent at the left edge.
  - **Header:** name, CV title and contact details on the left, photo top right. The contact details show labelled address, phone, e-mail and LinkedIn.
  - **Section order:** summary, experience, education, continuing education (certifications), then skills and languages side by side.
  - **Dated sections:** the dates sit in a left column.
- [ ] The template satisfies FR-1 to FR-11.

### US-011: Contact fields and photo can be hidden, and controls that do not belong to a template are gone (amendment 1, executed before US-002)

**Description:**
As a CV author, I want to choose which contact details and whether my photo appear on my CV, and to see only the controls that actually affect my template, so that the editor is clear and my CV shows only what I want.

**Acceptance Criteria:**

- [ ] **Contact ticks:** in the Editor's Contact tab, every field except Full Name has a visible, labelled tick box: CV name, e-mail, phone, location, LinkedIn, GitHub and website. Ticked means shown. A new CV and every existing CV start with every box ticked.
- [ ] Unticking a field removes it from the Editor live preview, the Preview page, the PDF and the Word export of every template (the five existing and the Swiss ones). Its label and its separator go with it, and the value stays stored and in the form field. Ticking it again brings it back. The choice survives saving and reopening the CV.
- [ ] **Photo row:** for every template that draws a photo (`modern` and every Swiss template except `swissAcademic`), the Contact tab shows a photo row. The row holds the upload / change button, which reuses the existing upload handler and storage key, and a tick box "show photo on CV". Unticking it hides the photo in all four outputs and keeps the stored photo.
- [ ] **Swiss photo slot:** the Swiss templates no longer show the dashed "Upload photo" box in the CV. The photo frame appears only when a photo exists and is ticked, in the Editor live preview too.
- [ ] **Swiss font controls:** when a Swiss template is selected, the font carousel and the font-size slider above the Editor live preview are not shown. The five existing templates keep them.
- [ ] **Preview page:** the "Show Controls" switch and the per-element size handles it turns on are gone from the Preview page for every template. The stored layout values still apply to the rendering.
- [ ] US-001's `swissVocational` evidence is re-run for the parts this story changes: the photo, the font and the contact fields.
- [ ] The story satisfies FR-12 to FR-14 and the unchanged FR-1 to FR-11.

### US-002: The "Commerce & administration" template is available

**Description:**
As an office or administration professional, I want a sober template built for commercial and administrative roles, so that my organisational and office skills stand out.

**Acceptance Criteria:**

- [ ] `swissCommerce` appears in the template picker after `swissVocational`, with its localized name and description. A CV can be created with it.
- [ ] The Editor live preview, the Preview page, the PDF and the Word export match `t2-commerce.png`:
  - **Header:** a full-width navy band holding a round photo, the name, the CV title and the contact details.
  - **Body:** one column, with the dates of dated sections in a left column.
  - **Skills:** in two columns.
  - **Languages:** as labelled pills.
- [ ] The template satisfies FR-1 to FR-11.

### US-003: The "Métiers techniques & manuels" template is available

**Description:**
As a skilled tradesperson, I want a template that puts my practical skills and certificates first, so that an employer sees at once what I can do.

**Acceptance Criteria:**

- [ ] `swissTrades` appears in the template picker after `swissCommerce`, with its localized name and description. A CV can be created with it.
- [ ] The Editor live preview, the Preview page, the PDF and the Word export match `t3-technique-manuel.png`:
  - **Left column (dark):** the photo, then contact, skills as tags, certificates (certifications) and languages.
  - **Main column:** name, CV title in orange, then summary, experience and education.
- [ ] The template satisfies FR-1 to FR-11.

### US-004: The "Santé & social" template is available

**Description:**
As a health or social-care professional, I want a template that puts my diplomas first, so that the regulated qualifications employers check are seen first.

**Acceptance Criteria:**

- [ ] `swissHealth` appears in the template picker after `swissTrades`, with its localized name and description. A CV can be created with it.
- [ ] The Editor live preview, the Preview page, the PDF and the Word export match `t4-sante-social.png`:
  - **Page and accent:** one column with a teal accent.
  - **Header:** a round photo beside the name.
  - **Section headings:** drawn as pills.
  - **Section order:** summary, education, experience, continuing education (certifications), then skills and languages side by side.
- [ ] The template satisfies FR-1 to FR-11.

### US-005: The "Banque, finance & assurance" template is available

**Description:**
As a banking, finance or insurance professional, I want a conservative, serif template, so that my CV fits the expectations of a traditional sector.

**Acceptance Criteria:**

- [ ] `swissFinance` appears in the template picker after `swissHealth`, with its localized name and description. A CV can be created with it.
- [ ] The Editor live preview, the Preview page, the PDF and the Word export match `t5-finance.png`:
  - **Type and accent:** a serif typeface and a dark-green accent.
  - **Header:** the name in capitals, the CV title in italics, a double rule under it, and a small rectangular photo on the right.
  - **Dated sections:** the dates are right-aligned.
  - **Section order:** summary, experience, education, certifications, then skills and languages in one table.
- [ ] The template satisfies FR-1 to FR-11.

### US-006: The "Ingénierie & technique" template is available

**Description:**
As an engineer, I want a template that puts my key projects forward, so that my technical results are visible before my job history.

**Acceptance Criteria:**

- [ ] `swissEngineering` appears in the template picker after `swissFinance`, with its localized name and description. A CV can be created with it.
- [ ] The Editor live preview, the Preview page, the PDF and the Word export match `t6-ingenierie.png`, except for the skill bars, which are not drawn:
  - **Main column:** name, CV title, summary, key achievements (projects) as cards, then experience.
  - **Right column (light):** a round photo, then contact, education, skills, languages and certifications.
- [ ] The template satisfies FR-1 to FR-11.

### US-007: The "Informatique & IT" template is available

**Description:**
As an IT professional, I want a template that shows my technologies and projects clearly, so that a technical recruiter can scan my stack quickly.

**Acceptance Criteria:**

- [ ] `swissIt` appears in the template picker after `swissEngineering`, with its localized name and description. A CV can be created with it.
- [ ] The Editor live preview, the Preview page, the PDF and the Word export match `t7-informatique.png`:
  - **Header:** a dark band holding the name, the CV title in a monospace face, the contact details (including GitHub and website when filled) and a round photo.
  - **Section headings:** in a monospace face.
  - **Skills:** each category shows its skills as tags.
  - **Projects:** as cards in two columns, each with its technologies as tags.
  - **Section order:** summary, skills, experience, projects, education, then languages and certifications.
- [ ] The template satisfies FR-1 to FR-11.

### US-008: The "Cadre & direction" template is available

**Description:**
As an executive, I want an elegant template that opens with my profile and my key achievements, so that my impact is read before my career history.

**Acceptance Criteria:**

- [ ] `swissExecutive` appears in the template picker after `swissIt`, with its localized name and description. A CV can be created with it.
- [ ] The Editor live preview, the Preview page, the PDF and the Word export match `t8-cadre-direction.png`:
  - **Header:** a large serif name, the CV title in burgundy capitals, and a round photo.
  - **Profile:** the summary sits in a highlighted box under a gold rule.
  - **Key achievements:** the projects, shown in a two-column grid.
  - **Section order after that:** experience, education, then languages and certifications.
- [ ] The template satisfies FR-1 to FR-11.

### US-009: The "Académique & recherche" template is available

**Description:**
As a researcher or academic, I want a template that leads with my education and lists my publications and distinctions, so that my CV follows academic conventions.

**Acceptance Criteria:**

- [ ] `swissAcademic` appears in the template picker after `swissExecutive`, with its localized name and description. A CV can be created with it.
- [ ] The Editor live preview, the Preview page, the PDF and the Word export match `t9-academique.png`:
  - **Type and photo:** a serif typeface and no photo, even when the CV has one.
  - **Section order:** summary, education, experience, then "Publications and projects" (projects, as a numbered list), "Distinctions" (certifications), and skills and languages.
- [ ] The template satisfies FR-1 to FR-11, except the photo requirement in FR-5.

### US-010: The "Premier emploi" template is available

**Description:**
As a first-time job seeker or a person without a certified vocational qualification, I want a friendly, short template that puts my skills and languages forward, so that a thin work history does not weaken my CV.

**Acceptance Criteria:**

- [ ] `swissFirstJob` appears in the template picker after `swissAcademic`, with its localized name and description. A CV can be created with it.
- [ ] The Editor live preview, the Preview page, the PDF and the Word export match `t10-premier-emploi.png`:
  - **Left column (light violet):** a round photo, then contact, skills, languages and certificates (certifications).
  - **Languages:** each shows five dots filled according to FR-7.
  - **Main column:** name, CV title, then summary, experience and education.
- [ ] The template satisfies FR-1 to FR-11.

## Functional Requirements

- **FR-1:** A template renders only data already stored for the resume (the fields listed in Context). It writes nothing back and adds no new stored state; its only output is the rendered CV. Sample text is never hard-coded into a template.
- **FR-2:** Items with `visible: false` and sections hidden through the existing layout settings are absent from the Editor live preview, the Preview page, the PDF and the Word export. An empty section, including one whose items are all hidden, is not drawn: no heading without content.
- **FR-3:** The template's section order is the order its story states. The template is registered in `TEMPLATE_LAYOUT_CONTROLS` and `TEMPLATE_EDITOR_SECTIONS` with only controls whose effect it actually draws. A control it does not draw is not offered.
- **FR-4 (amended):** A Swiss template uses its own typeface (the face its story names, otherwise the platform default) at font scale 1.0 in all four outputs. It ignores the stored font family and font scale, and leaves them stored unchanged, so switching back to an existing template restores them. The font carousel and font-size slider are not offered for it (FR-3).
- **FR-5 (amended):** When the CV has a photo and the photo tick of FR-14 is on, every template except `swissAcademic` draws it at the place and in the shape its mockup shows, in all four outputs.
  - **No photo, or photo unticked:** no photo frame in any of the four outputs, the Editor live preview included.
  - **Upload:** from the Contact tab photo row (FR-14), reusing the existing photo upload handler and storage. No upload box is drawn inside the CV.
- **FR-6:** Section headings use the existing `resumes.template` labels. Three new labels are added in fr, en, de and it, and are used only by the new templates:
  - `projects` ("Projets");
  - `publications` ("Publications et projets");
  - `distinctions` ("Distinctions").

  A heading whose wording in a mockup differs from an existing label uses the existing label. For example, "Profil" in a mockup reads as the summary label.
- **FR-7:** Language levels use the existing level values, shown with the existing localized level names. Where `swissFirstJob` draws dots, the filled count is: Native 5, Fluent 4, Professional 3, Intermediate 2, Basic 1.
- **FR-8:** The name and description of each template live in `resumes.templates` of all four `common.json` files. `templateLabels` finds them, and the locale-parity and template-name tests cover them.
- **FR-9:** Rich text (summary, descriptions, `skillsHtml`) is rendered through the same sanitizing and formatting helpers that the existing templates use for each output. The Preview stays server-renderable (no SSR-unsafe call in the template's render path).
- **FR-10:** The Word export of a template is produced by its own generator. The export:
  - contains every visible section and item of the Preview, in the same order;
  - draws the photo per FR-5;
  - follows the template's layout (columns, header band, colours) to the degree Word supports it.

  Any difference from the Preview is recorded as a validation finding, not assumed acceptable.
- **FR-11:** In its own story, a template's identifier is added to every list that offers or accepts the existing templates:
  - `TEMPLATE_OPTIONS`;
  - `RESUME_TEMPLATES` in the job-application route;
  - `validTemplates` in the AI route;
  - `SUPPORTED_TEMPLATES` in the Word route.
- **FR-12 (amendment 1):** The Editor shows the font carousel and font-size slider only for templates whose rendering applies them: the five existing templates, not the Swiss ones.
- **FR-13 (amendment 1):** The Preview page has no "Show Controls" switch and no per-element size handles, for any template. The Preview renders the stored layout values read-only. The now-unused `showControls` locale key is removed from all four locales together.
- **FR-14 (amendment 1):** Contact visibility is stored in the existing `layout_settings` value as `hiddenContactFields`. The property is a list drawn only from `title`, `email`, `phone`, `location`, `linkedin`, `github`, `website` and `photo`.
  - **Missing or empty:** everything is shown, so existing CVs render exactly as before.
  - **Validation:** unknown entries are dropped by the existing validation in `src/lib/layout-settings.ts`, and the value stays within the existing 4096-byte bound.
  - **Readers:** the Editor live preview, the Preview page, the PDF and every Word generator, all reading this same value. No second copy is kept.
  - **Labels:** tick-box labels are localized in fr, en, de and it.

## Regression Constraints

- With every contact tick on (the default), the five existing templates render, export to PDF and export to Word exactly as before:
  - their visual baselines in `e2e/visual` do not change, except where a baseline captures the Preview page's "Show Controls" switch or its handles (FR-13). Each such change is listed and shown in that story's evidence;
  - `pnpm test:parity` keeps its verdicts for them (MATCH 211, KNOWN 3, NEW 0 at origin/main f0a2e75).
- Existing resumes keep their stored template. A CV created before the migration opens, edits, previews and exports unchanged.
- The template picker keeps its radio-group keyboard behaviour across all fifteen options, and its existing order for the first five.
- The photo upload handler, the background removal and the photo's storage key are unchanged. `modern` keeps its existing upload zone and also gains the Contact-tab photo row (FR-14).
- The cover letter templates are unchanged.

## Required Verification

- **Mandatory checks:** the mandatory baseline of `CLAUDE.md` §14 on each story's final diff.
  - Lint is compared with the tracked ceiling.
  - Each story also runs `pnpm test:visual` and `pnpm test:parity`.
- **Database (US-001):** the `database-migration` evidence for the migration:
  - applied to the local Supabase;
  - the constraint accepts the fifteen values and rejects any other;
  - existing rows unchanged;
  - generated types aligned.
- **Browser evidence, for each template:**
  - **What is captured:** the Editor live preview, the Preview page, and the picker card with its thumbnail.
  - **Data:** a sample CV filled in every field the template draws, plus a variant with hidden items and empty sections, plus a variant with and without a photo.
  - **Locales:** at least fr and one other locale.
  - **Comparison:** side by side with the template's mockup.
- **Export evidence, for each template:**
  - **Artifacts:** a generated PDF and a generated `.docx`, both inspected.
  - **Content:** every visible section and item present, in order, and hidden content absent.
  - **Photo:** present or absent per FR-5.
  - **Word layout:** checked against the Preview at the strength the available renderer allows; a limit is reported as a finding.
- **Visual:** a new `e2e/visual` baseline for each new template, created in its story; the existing baselines unchanged.
- **Unit:** tests for each template's Word generator, the language-dot mapping (FR-7), the registry entries (FR-3, FR-8) and the template lists of the job and AI routes.
- **Reviews:** `ui-expert` validation on the rendered result and an independent `code-reviewer` PASS for each story.

## FAIL Conditions

- A template draws a value that is not in the resume's stored data, or adds a new stored field or setting other than FR-14's `hiddenContactFields`.
- An unticked contact field or photo appears in any of the four outputs of any template, or a ticked one is missing.
- A hidden item or section appears in any of the four outputs, or a heading appears with no content under it.
- The Word export omits, reorders or rewrites visible content, or the PDF differs from the Preview.
- Any visual baseline or parity verdict of the five existing templates changes.
- A template name, description or heading is missing or untranslated in one of fr, en, de or it.
- A template's Preview returns a non-200 response on the server render.
- A layout control is offered for a template whose rendering ignores it.

## BLOCKER Conditions

- The local Supabase is not available to apply and verify the migration.
- A template's mockup requires data the platform does not store, beyond the two exclusions already listed (skill bars, CFC badge).
- The Word renderer available cannot show a template's layout well enough to judge FR-10. The content checks still run; the layout verdict is BLOCKED and reported.

## Risks

- **Size:** fifteen thumbnails make the picker long, and each one renders a full template, which may slow the new-CV page.
- **Word fidelity:** dark header bands, pills, tags and cards (templates 2, 4, 7 and 8) have only approximate equivalents in Word.
- **Photo:** the photo lives only in the browser, so a CV opened on another device shows no photo in any template. This is the existing behaviour, not changed here.
- **Breadth:** ten Word generators add a large amount of code that must be maintained alongside the five existing ones.

## Evidence / References

- `tasks/prds/swiss-cv-templates/*.png` — the ten validated mockups and their overview (owner, 2026-11-18).
- `supabase/migrations/001_initial_schema.sql`, `002_add_professional_template.sql` — the template check constraint.
- `src/types/database.ts`, `src/types/supabase.ts` — the resume fields and `ResumeTemplate`.
- `src/components/dashboard/template-picker.tsx` — `TEMPLATE_OPTIONS`, `templateLabels`, thumbnails.
- `src/components/dashboard/resume-editor.tsx`, `resume-preview.tsx` — where each template is drawn.
- `src/components/dashboard/resume-templates/` — the five existing templates.
- `src/lib/layout-settings.ts` — `TEMPLATE_LAYOUT_CONTROLS`, `TEMPLATE_EDITOR_SECTIONS`.
- `src/app/api/resumes/[id]/download-docx/` — the Word route and its generators.
- `src/app/api/resumes/[id]/download-pdf/route.ts`, `src/lib/pdf/render-preview.ts` — the PDF prints the Preview.
- `src/app/api/resumes/from-job-application/route.ts`, `src/app/api/ai/generate-from-job-description/route.ts` — the template lists of the job and AI routes.
- `src/locales/{fr,en,de,it}/common.json` — `resumes.templates` and `resumes.template` labels.
- `e2e/visual/resume-templates.spec.ts`, `e2e/parity/` — visual and parity suites.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
