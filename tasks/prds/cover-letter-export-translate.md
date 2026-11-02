# PRD: Cover letters download as PDF and Word, and translate by flag

**Status:** APPROVED 2026-10-24

## Objective

A user can download any cover letter directly as a PDF file and as a Word (.docx) file, and can create a translated copy of a letter by clicking one of four language flags, the same flags as the grammar checker.

## Context / Current Behavior

**Download today:**
- The only download is "Télécharger PDF" in the ⋮ menu of the letters list (`src/components/dashboard/cover-letter-card.tsx:349-358`).
- It runs html2pdf.js in the browser (`:224`, `:253`) on HTML from `buildCoverLetterPdfHtml` (`src/lib/cover-letter-pdf-html.ts:44`), with workarounds in `src/lib/html2canvas-color-fallback.ts`. Covered by `e2e/cover-letter-pdf-export.spec.ts`.
- The PDF is a canvas capture, not a real text PDF.
- The editor (`src/components/dashboard/cover-letter-editor.tsx`) has no download at all.
- There is no Word export for dashboard letters. The public generator tool builds a .docx in the browser (`src/components/tools/cover-letter-generator-client.tsx:1366-1437`).

**How resumes do it:**
- PDF: `POST /api/resumes/[id]/download-pdf` renders in server-side headless Chromium (`src/lib/pdf/render-preview.ts`, `src/lib/pdf/browser.ts`), with at most 2 concurrent renders and a 30 s limit.
- DOCX: `GET /api/resumes/[id]/download-docx` uses the `docx` library server-side.
- Cover letters have one template: `cover-letter-templates/modern-letter-template.tsx`.

**Translation today:**
- No cover-letter translation exists.
- Resume sections translate through `POST /api/ai/translate` (fr/de/en/it), with text chips, not flags.
- The flags: the grammar checker (`/[locale]/tools/resume-grammar-checker`) draws four inline SVG components, `FlagGB`, `FlagFR`, `FlagDE` and `FlagIT`, with a language list. They live in `src/components/tools/grammar-checker-client.tsx:53-108` and are not shared.

## Owner decisions (2026-10-24, in chat)

- Two PRDs: this one covers points 3 and 4. CV ↔ application linking is in `tasks/prds/job-cv-linking.md`.
- The PDF and Word buttons go in the ⋮ menu of each letter in the list, replacing today's "Télécharger PDF", and in the editor.
- Translation creates a translated copy as a new letter, titled with the language suffix (e.g. "… (DE)"). The original is unchanged. The flags are in the editor.

## Scope

- A direct PDF download: a real file generated server-side, not a print dialog and not a canvas capture.
- A Word (.docx) download generated server-side.
- Both available from the list ⋮ menu and from the editor, for a saved letter.
- Translation flags in the editor. Clicking one creates a translated copy and opens it.
- The four flags moved to one shared component, which the grammar checker then uses unchanged.
- Localized strings in fr, en, de and it.

## Out of Scope

- The letter template's English date and "Re: Application for …" line. This is a separate PRD candidate recorded by cover-letter-from-job; the PDF and Word keep whatever the template prints today.
- New cover-letter templates or layout changes.
- Translating in place, or translating a letter not yet saved.
- Translating CVs, or changing the resume translate chips.
- Exporting from the public cover-letter generator tool.
- Changing the AI provider, model or rate limits.

## Impact Assessment

- **Frontend / UI:** Affected. The menu items, the editor's download buttons and translation flags, and the grammar checker's flags (same look, shared source).
- **Internationalization:** Affected. New strings; the translated letter is in the target language.
- **Resume model / templates:** Not affected.
- **Exports:** Affected. New cover-letter PDF and DOCX generation.
- **Database / persistence:** Affected, data only. Translation inserts a new `cover_letters` row. No migration.
- **Security / authorization:** Affected. Ownership on download and translate, untrusted AI output, and a server-side HTML render.
- **Testing / validation:** Affected. Unit and e2e tests, export validation and a visual check of the flags.

## User Stories

### US-001: A cover letter downloads as a real PDF file

**Description:**
As a user, I want to download my cover letter as a PDF file in one click, so that I can attach it to an application without going through printing.

**Acceptance Criteria:**

- [ ] "Télécharger PDF" in the list ⋮ menu, and a PDF button in the editor, download a `.pdf` file named after the letter's title. No print dialog opens.
- [ ] The file is a real PDF with extractable text, not a picture of the page.
- [ ] It contains every non-empty part of the letter, in order:
  - sender;
  - date;
  - recipient and company block;
  - subject;
  - greeting;
  - opening;
  - each body paragraph;
  - closing;
  - sign-off;
  - signature name.
- [ ] Its layout matches today's PDF export of the same letter: the same template and the same section order. Fonts may be embedded rather than rasterized.
- [ ] Rich text in the paragraphs (bold, italic, lists) keeps its meaning.
- [ ] A long letter flows onto a second page without clipping.
- [ ] From the editor, the PDF reflects the saved letter. If there are unsaved changes, the user is told to save first; the download does not silently save.
- [ ] Another user's letter id is refused, with no file.
- [ ] A generation failure shows a localized error, and no broken file is downloaded.

### US-002: A cover letter downloads as a Word file

**Description:**
As a user, I want to download my cover letter as a Word document, so that I can edit it in Word or send it where Word is required.

**Acceptance Criteria:**

- [ ] "Télécharger Word" in the list ⋮ menu, and a Word button in the editor, download a `.docx` file named after the letter's title.
- [ ] The file opens as a valid Word document. It contains the same parts as US-001, in the same order, with paragraphs as real paragraphs and bold, italic and lists preserved.
- [ ] Accents and special characters (é, ü, ß, ’, «») are intact.
- [ ] The same saved-state, ownership and error rules as US-001 apply.

### US-003: A letter can be translated by flag into a new copy

**Description:**
As a user, I want to click a flag to get my letter in another language, so that I can apply in that language without rewriting it.

**Acceptance Criteria:**

- [ ] The editor shows four flags (EN, FR, DE, IT). They are drawn by the same SVGs as the grammar checker, from one shared component.
- [ ] The grammar checker's flags look identical before and after, by a pixel comparison of the checker's language selector.
- [ ] Each flag has an accessible name in the page language (e.g. "Traduire en allemand"), works with the keyboard, and shows a localized busy state while translating.
- [ ] Clicking a flag creates a new letter and opens it. The new letter:
  - is titled "<original title> (DE)" (or EN/FR/IT);
  - has the greeting, opening, body paragraphs, closing and sign-off translated into that language, through the existing AI translation path;
  - keeps the recipient, company, sender name, template, `resume_id` and `job_application_id`.
- [ ] The original letter is unchanged, and the application's `cover_letter_id` still points to the original.
- [ ] If the translation fails or is rate-limited, a localized error is shown and no letter is created.
- [ ] The translated text is untrusted AI output. It is sanitized with the same rules as cover-letter-from-job before storage, and paragraphs keep their bold, italic and list meaning.
- [ ] Translating another user's letter is refused.

## Functional Requirements

- **FR-1:** The PDF is generated server-side, reusing the resume PDF infrastructure (`src/lib/pdf/browser.ts`): the same browser launch, concurrency limit and time limit. The HTML source is the existing `buildCoverLetterPdfHtml`, so there is no second letter layout.
- **FR-2:** The DOCX is generated server-side with the `docx` library already in the project. There is no new dependency.
- **FR-3:** Download and translate routes are authenticated. They read the letter with the user's session and an explicit `user_id` check.
- **FR-4:** The flags exist once, in a shared component used by both the grammar checker and the cover-letter editor.
- **FR-5:** Translation reuses the existing AI translation route or its core, with its fr/en/de/it validation and the AI rate limit. The guarded AI test stub covers it in e2e.
- **FR-6:** No schema migration and no new dependency.
- **FR-7:** New UI strings exist, non-empty, in fr, en, de and it (`src/locales/locale-parity.test.ts`).

## Regression Constraints

- The grammar checker's language selection behaves and looks as before.
- The cover-letter editor's existing sections, autosave and AI generation modal are unchanged. The specs `cover-letter-editor-i18n` and `cover-letter-editor-spacing` stay green.
- Resume PDF and DOCX exports are unchanged. Parity stays NEW 0 / KNOWN 3, and the resume PDF/DOCX e2e specs stay green.
- `e2e/cover-letter-pdf-export.spec.ts` is updated to the new direct PDF, and its content assertions still pass.

## Required Verification

- The `CLAUDE.md` §14 baseline, plus `pnpm test:parity`.
- Unit tests:
  - DOCX content and order;
  - ownership;
  - error paths;
  - the translation copy (fields kept, fields translated, sanitized, nothing created on failure).
- e2e in fr and de, for downloads from the list and from the editor:
  - PDF: magic bytes, extractable text containing every part in order;
  - DOCX: `word/document.xml` containing every part in order;
  - translate by flag: the new letter opens in the target language, and the original is unchanged.
- `export-validation` on generated PDF and DOCX artifacts of a full letter and a long letter, including the comparison with today's PDF for the same letter.
- `visual-regression` on the grammar checker's flags, before and after.
- `security-review` on the routes and the server-side render.
- `ui-expert` on the menu, the editor buttons and the flags, in fr and de at 1440 and 375.
- `code-reviewer`.

## FAIL Conditions

- The PDF download opens a print dialog, or produces an image-only PDF.
- Any non-empty part of the letter is missing from the PDF or the DOCX.
- The flags differ from the grammar checker's, or the grammar checker's flags change.
- Translation modifies the original letter or re-points the application to the copy.
- A failed translation creates a letter.
- A user can download or translate another user's letter.

## BLOCKER Conditions

- The server-side PDF cannot reuse the resume PDF browser setup on the deployment target. Report it; the owner decides.
- A Word rendering requirement needs a renderer that isn't available. Content checks still run, and visual Word parity is reported as BLOCKED.

## Risks

- The server-side PDF uses the same constrained browser pool as resume PDFs, so heavy use is shared.
- The translated copy's template lines (date, "Re: Application for …") stay English until the separate template PRD.

## Evidence / References

- `src/components/dashboard/cover-letter-card.tsx`, `src/lib/cover-letter-pdf-html.ts`, `e2e/cover-letter-pdf-export.spec.ts`: today's PDF.
- `src/app/api/resumes/[id]/download-pdf/route.ts`, `src/lib/pdf/*`, `src/app/api/resumes/[id]/download-docx/*`: resume exports.
- `src/components/tools/cover-letter-generator-client.tsx:1366-1437`: an existing letter DOCX build in the browser.
- `src/components/tools/grammar-checker-client.tsx:53-108`: the flags.
- `src/app/api/ai/translate/route.ts`: the existing translation route.
- `src/components/dashboard/cover-letter-editor.tsx`, `cover-letter-templates/modern-letter-template.tsx`: the editor and the template.

## Open Questions

- None. The material decisions are recorded under Owner decisions.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
