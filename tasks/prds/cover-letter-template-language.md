# PRD: The cover letter's date, subject and default formulas follow the letter's language

**Status:** APPROVED 2026-11-02

## Objective

The date line, the subject line, and the default greeting and sign-off of a cover letter appear in the letter's own language. The editor preview, the PDF and the Word export all show the same wording.

## Context / Current Behavior

**The parts.** `coverLetterParts()` in `src/lib/cover-letter-pdf-html.ts` is the single ordered list of a letter's parts, used by both the PDF and the Word export (cover-letter-export-translate, US-002). It hard-codes four English values:
- the date, through `formatCoverLetterPdfDate`, which uses `toLocaleDateString('en-US', …)`, for example "October 25, 2026";
- the subject, `Re: Application for ${job_title}`;
- the default greeting, `DEFAULT_GREETING` ("Dear Hiring Manager,"), used when the greeting is empty;
- the default sign-off, `DEFAULT_SIGN_OFF` ("Sincerely,"), used when the sign-off is empty.

**The editor preview.** `src/components/dashboard/cover-letter-templates/modern-letter-template.tsx`, rendered by `cover-letter-preview.tsx`:
- does not use `coverLetterParts()`;
- builds its own en-US date (line 17) and its own "Re: Application for …" subject (line 60);
- has its own "Dear Hiring Manager," fallback (line 66).

So the preview and the exports repeat the same rules separately (CLAUDE.md §10).

**The effect.** A French, German or Italian letter shows an English date and subject above its own paragraphs, in the preview, the PDF and the Word file. This is more visible since cover-letter-from-job and the translate-by-flag copies, which write whole letters in fr, de or it.

**Detecting the language.** No column stores a letter's language. `src/lib/resume-from-job/detect-offer-language.ts` (`detectOfferLanguage`) already detects fr, en, de or it from text by stopword votes. It returns `null` when unsure, and callers fall back to the page language.

## Owner decisions (2026-11-02, in chat)

- **Source of the language.** It is detected from the letter's own text, with the page language as fallback. A German letter therefore shows a German date and subject even when opened under `/fr`. No migration.
- **Default formulas.** When the greeting or sign-off is empty, the displayed default (preview, PDF, Word) follows the letter's language. Values already stored in the database are not changed.

## Scope

- One function that decides a letter's display language: detected from its text, falling back to the page language.
- In that language:
  - the date line;
  - the subject line;
  - the default greeting and sign-off.
- This applies in `coverLetterParts()`, so the PDF and the Word export get it at once.
- The editor preview is rendered from the same parts and formatting, so it shows exactly what the exports show.
- The four languages: fr, en, de, it. Subject wording and date format follow each language's usual business-letter convention, as stated in FR-2.

## Out of Scope

- Storing a language column, or letting the user choose the letter's language.
- Translating the letter's own text, recipient, title or any stored value.
- Changing the greeting and sign-off values that creation flows store in the database (e.g. "Dear Hiring Manager," written by the form without an application).
- Template layout, fonts and spacing.
- The editor header overflow at 375 (draft PRD `cover-letter-editor-responsive`).
- The public cover-letter generator tool.

## Impact Assessment

- **Frontend / UI:** Affected. The editor preview shows the localized date, subject and defaults.
- **Internationalization:** Affected. Subject prefixes and default formulas exist for fr, en, de and it, and dates use the locale's format.
- **Resume model / templates:** Not affected. Only the cover-letter template is touched; no resume template.
- **Exports:** Affected. The PDF and Word text changes for these four parts. Layout does not change.
- **Database / persistence:** Not affected. No schema change; stored values are untouched.
- **Security / authorization:** Not affected. No new input or route; the detector already bounds its input.
- **Testing / validation:** Affected. Unit tests for language resolution and wording; e2e for the preview, PDF and Word text; export validation.

## User Stories

### US-001: The exports show the date, subject and defaults in the letter's language

**Description:**
As a user downloading a French, German or Italian cover letter, I want its date and subject line in that language, so that the letter does not mix languages.

**Acceptance Criteria:**

- [ ] For a letter whose text is detected as French, the PDF and the Word file show:
  - the date in French format, e.g. "2 novembre 2026";
  - the subject "Objet : Candidature au poste de <job title>";
  - when greeting or sign-off is empty, the French defaults "Madame, Monsieur," and "Veuillez agréer mes salutations distinguées,".
- [ ] The same holds for German (e.g. "2. November 2026", "Betreff: Bewerbung als <job title>", "Sehr geehrte Damen und Herren," / "Mit freundlichen Grüßen,") and Italian (e.g. "2 novembre 2026", "Oggetto: Candidatura per la posizione di <job title>", "Gentili Signore e Signori," / "Cordiali saluti,").
- [ ] An English letter keeps today's wording exactly: "November 2, 2026", "Re: Application for <job title>", "Dear Hiring Manager,", "Sincerely,".
- [ ] When the language cannot be detected, the page language is used. The PDF and Word routes know it from the request's locale.
- [ ] A non-empty stored greeting or sign-off is printed as stored, in any language.
- [ ] The PDF and the Word file of the same letter show identical text for these four parts.

### US-002: The editor preview shows exactly what the exports show

**Description:**
As a user editing a cover letter, I want the preview's date, subject and default formulas to be the ones I will download, so that what I see is what I get.

**Acceptance Criteria:**

- [ ] The editor preview takes the date, the subject and the default greeting and sign-off from the same parts and formatting as the PDF and Word exports. No second copy of these rules exists in the template.
- [ ] For the same letter and page, the preview's text for these four parts equals the PDF's text.
- [ ] Changing the letter's paragraphs to another language updates the preview's date, subject and defaults once the language is detected. The preview follows the current editor content, saved or not.
- [ ] Apart from these four parts, the preview looks the same as before: same layout, fonts, spacing and section order.

## Functional Requirements

- **FR-1:** One resolver decides the display language of a letter.
  - Input: its opening, body and closing text with the markup removed.
  - Detection: through the existing `detectOfferLanguage`.
  - Fallback: the page or request locale.
  - The preview, the PDF and the Word file all use this resolver.
- **FR-2:** Wording per language lives in the existing i18n locale files, or in one shared constant set, with one entry per language. The date uses `Intl.DateTimeFormat` with the resolved locale (`fr-CH`/`de-CH`/`it-CH` or `fr-FR`/`de-DE`/`it-IT`, chosen once and documented) in long format.
- **FR-3:** `coverLetterParts()` stays the single source of parts, order and defaults. The preview template consumes it, or the same helpers, instead of its own copies.
- **FR-4:** No schema migration, no new dependency, no change to stored data.
- **FR-5:** New strings exist in fr, en, de and it (`src/locales/locale-parity.test.ts`).

## Regression Constraints

- The English output of the PDF and Word export is byte-identical for these parts to today's ("Re: Application for …", "Dear Hiring Manager,", "Sincerely,", en-US date).
- Every other part of the PDF and Word output is unchanged, and so are their layout, page size and paging. The specs `e2e/cover-letter-pdf-export.spec.ts` and `e2e/cover-letter-docx-export.spec.ts` stay green, with only expected-text updates where a test fixture is non-English.
- The preview's layout and the editor's other behaviour are unchanged (`e2e/cover-letter-editor-i18n.spec.ts`, `e2e/cover-letter-editor-spacing.spec.ts`).
- The translate-by-flag copies and cover-letter-from-job letters are unchanged in what they store.
- Resume exports and parity are unchanged (NEW 0 / KNOWN 3).

## Required Verification

- The `CLAUDE.md` §14 baseline, plus `pnpm test:parity`.
- Unit tests:
  - the resolver: fr/en/de/it detected, undetectable text falling back to the locale, markup ignored;
  - the wording and date for each language;
  - `coverLetterParts()` in each language;
  - English output pinned to today's text.
- e2e:
  - preview, PDF and Word for a French letter opened under `/de` and a German letter opened under `/fr`: the four parts follow the letter;
  - an undetectable short letter follows the page;
  - an English letter is unchanged.
- `export-validation`: PDF and Word for fr, de and it letters. Extracted text shows the localized parts, and PDF and Word agree.
- `ui-expert` on the preview in fr and de at 1440 and 375.
- `code-reviewer`.

## FAIL Conditions

- A letter detected as fr, de or it shows an English date, subject or default formula in the preview, the PDF or the Word file.
- The preview, the PDF and the Word file disagree on any of the four parts for the same letter.
- English output changes.
- A stored greeting or sign-off is replaced by a default.
- A second copy of the date, subject or default rules remains in the template.

## BLOCKER Conditions

- Detecting the language reliably on typical letter text needs a new dependency or a schema change. Report it; the owner decides.

## Risks

- Short letters may not give the detector enough words. They then follow the page language, which may differ from the letter's.
- A mixed-language letter follows whichever language the detector picks.

## Evidence / References

- `src/lib/cover-letter-pdf-html.ts`: `coverLetterParts`, `formatCoverLetterPdfDate`, `DEFAULT_GREETING`, `DEFAULT_SIGN_OFF`.
- `src/components/dashboard/cover-letter-templates/modern-letter-template.tsx` and `src/components/dashboard/cover-letter-preview.tsx`: the preview's own date, subject and greeting fallback.
- `src/app/api/cover-letters/[id]/download-pdf/route.ts` and `download-docx/route.ts`: the export routes that call `coverLetterParts`.
- `src/lib/resume-from-job/detect-offer-language.ts`: the existing detector.

## Open Questions

- None. The material decisions are recorded under Owner decisions.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
