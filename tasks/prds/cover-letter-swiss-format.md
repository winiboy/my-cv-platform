# PRD: Cover letters follow the Swiss professional letter format

**Status:** APPROVED 2026-11-05

## Objective

Every cover letter is laid out to the Swiss business-letter format, the same in the editor preview, the PDF and the Word export:
- an A4 page with the sender's full details at top left;
- the recipient's address in a right-hand window position;
- a "place, date" line and a subject without a label;
- left-aligned text with Swiss closing wording;
- an "Annexes" block.

## Context / Current Behavior

**Owner request (2026-11-05):** cover letters must follow the Swiss professional standard and format.

**Owner decisions (chat, 2026-11-05):**
- the Swiss format replaces the current one for every letter;
- the sender's details are new, editable fields in the letter, prefilled from the linked CV;
- the recipient's address sits on the right, for a window envelope;
- an editable "Annexes" block is added.

**The Swiss format.** Sources: SN 010130 / SN 10130 as summarized by Swiss templates and the Swiss Post; cantonal career-guidance guides (berufsberatung.ch, ZHAW, canton of Graubünden).
- A4 paper, one page.
- Sender: name, street, postcode (NPA) and locality, phone and e-mail, at top left.
- Recipient: address placed so it shows in a window envelope. The Swiss Post recommends the right-hand window; SN 010130 allows left or right.
- "Place, date" line, e.g. "Lausanne, le 5 novembre 2026" or "Zürich, 5. November 2026".
- Subject in bold. In German no "Betreff:" label.
- Swiss German spelling ("ss", never "ß"): "Freundliche Grüsse".
- Left-aligned text, not justified. Margins of about 25 mm left and 20 mm right, 11–12 pt.
- An enclosures line: Annexes / Beilagen / Allegati.

**Today.** Three renderings share one canonical part order (`coverLetterParts`, `src/lib/cover-letter-pdf-html.ts`):
- **Editor preview:** `src/components/dashboard/cover-letter-templates/modern-letter-template.tsx`, a page of `w-[816px] min-h-[1056px]` (US Letter at 96 dpi). It prints the sender name, the date, the recipient block (name, title, company, address) at the left under the date, the bold subject, the greeting, the paragraphs (`text-justify`), the sign-off and the sender name. It has 64 px margins, serif, 14 px.
- **PDF:** `buildCoverLetterPdfHtml` (same file, L228: `width: 816px; min-height: 1056px`), printed by headless Chromium (`src/lib/pdf/render-cover-letter.ts`).
- **Word:** `src/app/api/cover-letters/[id]/download-docx/cover-letter-docx.ts`, a page of `TEMPLATE.pageWidthPx × pageHeightPx` (816 × 1056) in twips.
- **Wording:** `COVER_LETTER_WORDING` (`src/lib/cover-letter-language.ts`).
  - Subjects: en "Re: Application for…", fr "Objet : Candidature au poste de…", de "Betreff: Bewerbung als…", it "Oggetto: Candidatura per la posizione di…".
  - Default sign-offs: en "Sincerely,", fr "Veuillez agréer mes salutations distinguées,", de "Mit freundlichen Grüßen,", it "Cordiali saluti,".
  - The date has no place.
- **The zoom** (`src/lib/cover-letter-preview-zoom.ts`) fits 816 × 1056 ("show all" = first page, owner decision of 2026-11-03).
- **Data** (`cover_letters`, `src/types/supabase.ts`): the only sender column is `sender_name`. There is no sender address, phone, e-mail, locality or enclosures column.
  - The linked CV's `contact` (`ResumeContact`, `src/types/database.ts`) holds `name`, `email`, `phone` and `location`, and no street.
  - The latest migration is `009_adopt_swiss_localities.sql`.
- **Where letters are written or copied:**
  - `POST /api/cover-letters` (`route.ts` L28, L104–125) and `PATCH /api/cover-letters/[id]` (L31, L130) validate fields with zod.
  - The translate route copies columns into the new letter (`translate/route.ts` L68, L171).
  - The card's Duplicate copies listed columns (`cover-letter-card.tsx` L137–154).
  - `from-job-application` sets `sender_name` from the CV.
- **Out of this surface:** the marketing tool `/tools/cover-letter-generator` prints its own PDF with `src/lib/cover-letter-pdf-layout.ts` (jsPDF, US Letter). It is not the dashboard letter.

## Scope

- A4 page and the Swiss layout in all three renderings, from one canonical description of the parts and their positions.
- New editable fields on a cover letter:
  - sender street;
  - sender postcode and locality;
  - sender phone;
  - sender e-mail;
  - annexes.
- Editing the new fields in the editor, in the existing Signature section, prefilled from the linked CV when empty.
- Swiss wording per language:
  - the place-and-date line;
  - the subject without a label;
  - Swiss German "ss";
  - default sign-offs without a trailing comma;
  - the default annexes list.
- New letters (create, from a job application), translated copies and duplicates carry the new fields.
- The preview zoom's page size follows A4.
- Tests and the updates to existing tests that assert the US Letter size or the old wording.

## Out of Scope

- A choice between Swiss and international format (owner decision: Swiss for every letter).
- A left-hand window position.
- The marketing tools pages and their PDF (`cover-letter-pdf-layout.ts`).
- Resumes and their exports.
- Rewriting text the user wrote: their greeting, paragraphs, sign-off and annexes are printed as written.
- AI translation of the new sender fields or of user-written annexes. They are copied as they are.
- A handwritten-signature image.
- Letterheads and logos.
- Multi-page layout rules beyond what the template already does.

## Impact Assessment

- **Frontend / UI:** Affected. The letter template, the Signature section's new fields, and the zoom's page size.
- **Internationalization:** Affected.
  - New field labels in the four dictionaries.
  - Per-language letter wording in `COVER_LETTER_WORDING`: place-and-date, subject, default sign-off, annexes label and default list.
- **Resume model / templates:** Not affected. The CV is read only to prefill.
- **Exports:** Affected. The PDF and Word move to A4 and the Swiss layout.
- **Database / persistence:** Affected. A new forward migration adds five nullable columns to `cover_letters`, and the generated types change. RLS stays as it is: the columns belong to rows already owned per user.
- **Security / authorization:** Affected.
  - New user input reaches the API (zod limits) and the rendered PDF HTML (escaping).
  - Ownership checks stay as today.
- **Testing / validation:** Affected. Unit, integration, e2e and export validation; existing tests asserting 816 × 1056 or the old wording must be updated.

## User Stories

### US-001: A letter stores the sender's details and its annexes, editable in the editor

**Description:**
As a user, I want to enter my address, postcode and locality, phone, e-mail and enclosures once per letter, prefilled from my CV, so that the letter can carry the Swiss sender block, place and annexes.

**Acceptance Criteria:**

- [ ] **Migration.** A new forward migration `010_…` adds five nullable text columns to `cover_letters`: `sender_street`, `sender_postal_locality`, `sender_phone`, `sender_email` and `annexes`.
  - The generated types are updated.
  - Existing rows are unchanged, with the columns null.
  - RLS policies are unchanged and still restrict every row to its owner.
- [ ] **API.** `POST /api/cover-letters` and `PATCH /api/cover-letters/[id]` accept the five fields, validated with zod.
  - Each is a nullable string with a length limit in `COVER_LETTER_FIELD_LIMITS`; e-mail is format-checked when not empty.
  - Values over the limit are rejected with 400.
- [ ] **Editor fields.** The editor's Signature section shows the five fields with labels in fr/en/de/it, under the existing sender name. Saving stores them; reopening the letter shows them.
- [ ] **Prefill.** On a letter whose sender fields are all empty and that is linked to a CV:
  - phone, e-mail and the locality come from the CV's `contact.phone`, `contact.email` and `contact.location`;
  - they are prefilled in the editor and stored on the next save;
  - a field the user has filled is never overwritten.
- [ ] **Annexes.** An empty annexes field (null) prints the default list in the letter's language (FR-4). An annexes value the user cleared on purpose (empty string) prints no Annexes block.
- [ ] **Copies.** A translated copy and a duplicate carry the five fields unchanged. A letter created from a job application gets phone, e-mail and locality from its CV, as `sender_name` is today.

### US-002: The editor preview shows the letter in the Swiss format on A4

**Description:**
As a user, I want the preview to show my letter exactly as a Swiss letter on A4, so that what I check is what I send.

**Acceptance Criteria:**

- [ ] **Page.** The letter page is A4 at 96 dpi, 794 × 1123 px. The zoom's "show all" fits that page.
- [ ] **Order and placement** (FR-1 and FR-2, top to bottom):
  - the sender block at top left: name, street, postcode and locality, phone, e-mail, with empty lines omitted;
  - the recipient block in the right-hand window zone: recipient name, title, company, address;
  - the place-and-date line;
  - the subject in bold, without a label;
  - the greeting;
  - the opening, body and closing paragraphs;
  - the sign-off, a signature space, then the sender name;
  - the Annexes block (label and list).
- [ ] **Text alignment.** The paragraphs are left-aligned (not justified), within margins of 25 mm left and 20 mm right, at 11 pt.
- [ ] **Wording.**
  - The place-and-date line uses the sender's locality and the letter's language, e.g. fr "Lausanne, le 5 novembre 2026", de "Lausanne, 5. November 2026", it "Lausanne, 5 novembre 2026", en "Lausanne, 5 November 2026". Without a locality, it shows the date alone.
  - The subject and the default sign-off follow FR-4.
  - Text the user wrote is printed exactly as written.
- [ ] **A typical letter fits one page:** the default greeting, a three-paragraph body of about 250 words, the sign-off, the sender name and the Annexes block.

### US-003: The PDF export prints the same Swiss A4 letter

**Description:**
As a user, I want the downloaded PDF to be a Swiss A4 letter identical to the preview, so that it can be printed and put in a window envelope as it is.

**Acceptance Criteria:**

- [ ] The PDF's page size is A4 (595 × 842 pt, within 1 pt).
- [ ] The PDF shows the same blocks, in the same order, with the same text as the preview of the same stored letter (FR-1).
- [ ] The recipient block lies inside the right-hand window zone of FR-2, measured on the rendered PDF page.
- [ ] Text extraction of the PDF contains the sender block, the place-and-date line, the subject without a label, the paragraphs, the sign-off, the sender name and the Annexes block, in that order.
- [ ] User-entered text in the new fields is escaped: markup typed in any of them prints as text and never as markup.

### US-004: The Word export produces the same Swiss A4 letter

**Description:**
As a user, I want the downloaded Word file to be the same Swiss A4 letter, so that I can still edit it in Word.

**Acceptance Criteria:**

- [ ] The document's page size is A4 (11906 × 16838 twips) with the margins of FR-2.
- [ ] The document has the same blocks in the same order and with the same text as the preview (FR-1).
  - The recipient block is positioned in the right-hand window zone of FR-2, by indent or a frame, not by spaces.
  - The Annexes block is at the end.
- [ ] Opened in Microsoft Word, it is one A4 page for the typical letter of US-002, with no blank second page.
- [ ] Unicode text in the new fields ("Zürich", "1003 Lausanne", "+41 21 555 01 42") is kept exactly.

## Functional Requirements

- **FR-1:** One canonical description of the Swiss letter defines the parts, their order, their wording and their positions. The preview, the PDF and the Word export render from it (`CLAUDE.md` §10). No rendering adds, drops or reorders a part.
- **FR-2:** Positions on the A4 page (210 × 297 mm):
  - margins: left 25 mm, right 20 mm, top 15–20 mm;
  - sender block: at the top margin, left;
  - recipient window zone: left edge at 110 mm from the page's left edge, top at 50 mm, at most 85 mm wide, at most 6 lines;
  - the place-and-date line: at the left margin, below the window zone;
  - font: 11 pt.

  These values follow common Swiss right-window templates. They are constants in the canonical description, so they can be adjusted in one place.
- **FR-3:** Locality for the place line: `sender_postal_locality` with a leading four-digit postcode and the following space removed ("1003 Lausanne" → "Lausanne"). If nothing remains, the date is printed alone.
- **FR-4:** Swiss wording per letter language:

  | Language | Subject | Default sign-off | Annexes label | Default annexes |
  |---|---|---|---|---|
  | en | "Application for {job}" | "Kind regards" | "Enclosures" | "CV, references, diplomas" |
  | fr | "Candidature au poste de {job}" | "Meilleures salutations" | "Annexes" | "CV, certificats de travail, diplômes" |
  | de | "Bewerbung als {job}" | "Freundliche Grüsse" | "Beilagen" | "Lebenslauf, Arbeitszeugnisse, Diplome" |
  | it | "Candidatura per la posizione di {job}" | "Distinti saluti" | "Allegati" | "CV, certificati di lavoro, diplomi" |

  Default greetings stay as today, except Swiss German spelling. No default wording contains "ß".
- **FR-5:** The letter's language is resolved as today (`resolveCoverLetterLanguage`). The date is formatted as today (`formatCoverLetterDate`), with the place prefixed by FR-3.
- **FR-6:** New user-facing strings (field labels, placeholders) come from the dictionaries in fr/en/de/it, with parity kept. Letter wording stays in `COVER_LETTER_WORDING`.
- **FR-7:** No new dependency.

## Regression Constraints

- The editor's other sections, saving, the unsaved indicator, translation, Generate and Check, the preview window, the zoom controls, and the mobile layout (PR #121) behave as before.
  - Only the page size used for "show all" changes: A4 instead of US Letter.
- The cards (title and flag), the download routes' authentication, ownership checks, size limits and file names are unchanged.
- Resumes and their exports are untouched. `pnpm test:parity` and `pnpm test:visual` stay at their baselines.
- The marketing tool's PDF (`cover-letter-pdf-layout.ts`) is unchanged.
- Text the user wrote is never rewritten. That covers the greeting, paragraphs, sign-off and annexes; "ß" in a user's own text stays as written.

## Required Verification

- The `CLAUDE.md` §14 baseline, plus `pnpm test:parity` and `pnpm test:visual` unchanged.
- **Unit tests:**
  - the canonical description: order, positions and FR-4 wording per language;
  - the FR-3 locality rule (with and without postcode, empty);
  - the prefill rules;
  - the API zod limits;
  - the DOCX page size, margins and recipient indent;
  - the PDF HTML escaping of every new field.
- **Database:** the `database-migration` skill on a local Supabase.
  - The migration applies forward on a database with existing letters, which keep their data.
  - The types are regenerated.
  - RLS still denies another user's rows for select and update.
- **e2e:**
  - edit and save the five fields;
  - the prefill from a linked CV;
  - the annexes null → default and cleared → no block;
  - the preview's block positions on A4;
  - the translated copy and the duplicate carry the fields;
  - updates to existing specs that assert 816 × 1056 or the old subject and sign-off wording, changing only those expectations.
- **`export-validation` skill:**
  - the PDF page size, block order, text extraction and recipient position, in the four languages;
  - the Word page size, margins and text, opened in Microsoft Word, one page for the typical letter.
- **`security-review` skill:** the new API inputs and the PDF HTML path.
- **`ui-expert`:**
  - the preview and the exported PDF page, against the Swiss format, in fr/de/it/en;
  - the Signature section with the new fields at 1280 and 375.
- **`code-reviewer`** on each story.

## FAIL Conditions

- A rendering is not A4, or the three renderings differ in parts, order or text for the same stored letter.
- The recipient block is outside the FR-2 window zone in the preview or the PDF.
- Any default wording in de contains "ß", or a subject keeps a "Betreff:", "Objet :", "Oggetto:" or "Re:" label.
- A user's own text is changed.
- Prefill overwrites a field the user filled.
- A translated copy or a duplicate loses a new field.
- A new field's markup is interpreted in the PDF.
- Another user's letter is readable or writable after the migration.
- A typical letter (US-002) spills onto a second page in any rendering.

## BLOCKER Conditions

- The migration cannot be applied and verified on the local Supabase stack. Report it; do not change the hosted database.
- Fitting the typical letter on one A4 page is impossible at 11 pt with the FR-2 margins. Report it with the measured overflow; the owner decides.
- Microsoft Word is not available to open the Word export. Report it as a limitation.

## Risks

- The FR-2 window coordinates are an approximation of common Swiss right-window templates. Different envelope makers vary by a few millimetres. A printed test with a real C5 or C6/5 window envelope is advised; the constants are in one place.
- The CV's `contact.location` may hold "Lausanne, Switzerland" or a postcode. The prefill copies it into `sender_postal_locality` as it is, and the user may need to adjust it.
- Existing letters change appearance the next time they are previewed or exported. That is intended (owner decision), but users with exported files will see a different layout.
- The marketing tool keeps the old US Letter layout, so the two letter generators differ until a later change.

## Evidence / References

- `src/components/dashboard/cover-letter-templates/modern-letter-template.tsx`: the current preview layout (816 × 1056, part order).
- `src/lib/cover-letter-pdf-html.ts`: `coverLetterParts` and `buildCoverLetterPdfHtml` (L189, L228).
- `src/lib/pdf/render-cover-letter.ts`: the Chromium PDF renderer.
- `src/app/api/cover-letters/[id]/download-docx/cover-letter-docx.ts` L406: the DOCX page size.
- `src/lib/cover-letter-language.ts`: `COVER_LETTER_WORDING`, `formatCoverLetterDate`, `resolveCoverLetterLanguage`.
- `src/lib/cover-letter-preview-zoom.ts`: `PAGE_WIDTH_PX` and `PAGE_HEIGHT_PX`.
- `src/types/supabase.ts` L418–441: the `cover_letters` columns. `src/types/database.ts`: `ResumeContact`.
- `src/app/api/cover-letters/route.ts`, `[id]/route.ts`, `[id]/translate/route.ts`, `from-job-application/route.ts`; `src/components/dashboard/cover-letter-card.tsx` (Duplicate).
- `supabase/migrations/009_adopt_swiss_localities.sql`: the latest migration.
- External:
  - brief-wechsel.de, "Briefvorlage Schweiz": SN 010130 left/right window, Swiss Post preference, 25/20 mm margins;
  - mettler-couvert.ch, Swiss envelope formats;
  - berufsberatung.ch and ZHAW guides: sender details, one A4 page;
  - canton of Graubünden "Tipps zum Bewerbungsbrief": "ss" spelling and enclosures.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
