# PRD: Hyphens and other punctuation print as crossed boxes in PDF exports

**Status:** APPROVED 2026-11-02

## Objective

On the production server, a PDF export never prints a character of the letter or CV as a missing-glyph box; hyphens such as the one in "decade‑long" print as hyphens.

## Context / Current Behavior

- **Reported (owner, 2026-11-02, screenshot):** in a cover letter PDF downloaded from production, the hyphen of "decade‑long" prints as a box with a cross (the missing-glyph shape). The same text in the editor shows a hyphen. The owner's Word export looks correct.
- **Why only on the server.** On Vercel the PDF is printed by `@sparticuz/chromium`, which has one system font (Open Sans). Georgia, Arial and Calibri are replaced there by metric-compatible substitutes (`src/lib/pdf/font-substitutes.ts`, `docs/engineering/pdf-export-runtime.md` "Fonts on the server"):
  - Georgia → Gelasio
  - Arial → Arimo
  - Calibri → Carlito

  On a developer machine, and in the e2e suite, the real fonts print, so the bug does not show.
- **Root cause (checked on the installed font files, 2026-11-02).**
  - Each substitute is registered with its Fontsource latin subset's `unicode-range`. That range includes the whole block U+2000–206F, so the browser takes those characters from the substitute.
  - Gelasio, Arimo and Carlito have no glyph for many of them, among them:

    | Code point | Character |
    |---|---|
    | U+2010 | hyphen |
    | U+2011 | non-breaking hyphen |
    | U+2012 | figure dash |
    | U+2015 | horizontal bar |
    | U+2020, U+2021 | dagger, double dagger |
    | U+2030 | per mille |
    | U+202F | narrow no-break space |

  - Gelasio and Carlito also lack U+00AD (soft hyphen).
  - The ASCII hyphen U+002D, the en dash U+2013, the em dash U+2014 and the bullet U+2022 are present.
- **Which character the owner's letter contains** is not known: the stored text was not read. U+2011 is the likeliest, because it is common in AI-generated and pasted text.
- **Cover letter PDF.** Printed in Georgia (`src/lib/cover-letter-pdf-html.ts`); its rich text can also name Arial or Calibri. Renderer: `src/lib/pdf/render-cover-letter.ts`, which inlines the substitutes as `@font-face` rules.
- **Resume PDF.** `src/lib/pdf/render-preview.ts` registers the same substitutes in the page. A CV in Arial, Helvetica (whose stack ends in Arial), Calibri, Georgia, or Classic's serif headings is therefore exposed to the same defect. Other families (Google Fonts, Inter, Open Sans, and fonts the server lacks) are not served by the substitutes; whether they have these glyphs is not known.
- **Word exports** use the reader's own fonts and embed no substitute; no defect is expected, but it has not been checked.

## Scope

- Cover letter PDF: none of the characters in the verification set (FR-2) prints as a missing-glyph box, in Georgia, Arial or Calibri, regular and bold, roman and italic.
- Resume PDF: the same for the families that use the substitutes (Arial, Helvetica, Calibri, Georgia, Classic's serif headings), and a check of the default template font.
- Word exports (cover letter and resume): verification only, with the same characters.
- An automated check that fails if a substitute face is registered for a character it cannot draw, so that a later font update cannot bring the defect back.

## Out of Scope

- Changing stored letters or CVs, or rewriting characters when the user types or saves them.
- Changing the editor, the Preview, or the fonts the user picks.
- Replacing the substitutes (Gelasio, Arimo, Carlito) or the serverless Chromium.
- Scripts other than Latin (Cyrillic, Greek, Vietnamese subsets), except that the change must not break them.
- Word export changes, unless the Word check finds the same defect (then it is a BLOCKER for an owner decision, not silent extra scope).

## Impact Assessment

- **Frontend / UI:** Not affected. The editor and the Preview do not change.
- **Internationalization:** Affected. French text commonly uses U+202F before « ; : ! ? », and AI text uses U+2011. No translation strings change.
- **Resume model / templates:** Not affected. Templates and the font picker do not change; only how the server prints.
- **Exports:** Affected. The server-side PDF output of cover letters and resumes changes.
- **Database / persistence:** Not affected. No stored data is read or changed.
- **Security / authorization:** Not affected. The renderer's isolation is not touched: no request leaves the page, and scripts stay off for the letter. Any new font data must come from installed packages, as today.
- **Testing / validation:** Affected. The defect appears only on the serverless runtime, so evidence must come from that runtime (a Vercel Preview deployment) or from a faithful reproduction of its fonts.

## User Stories

### US-001: The cover letter PDF prints every hyphen and punctuation mark

**Description:**  
As a user downloading my cover letter as a PDF, I want every hyphen, dash and space in my text to print as it does in the editor, so that the letter I send has no crossed boxes in it.

**Acceptance Criteria:**

- [ ] A cover letter containing every character of the FR-2 set (in the opening, body and closing), downloaded as PDF from the serverless runtime, shows no missing-glyph box on its rendered page. This is checked on the rendered page image, for Georgia, and for paragraphs in Arial and in Calibri.
- [ ] In that PDF:
  - "decade‑long" written with U+2010, with U+2011 and with U+002D prints a visible hyphen between "decade" and "long" in all three cases;
  - the PDF text extracts "decade" and "long" with a hyphen character between them.
- [ ] A line never breaks right after a U+2011, in the PDF as in the editor. The check is a line long enough that it would wrap there if the character could break.
- [ ] A U+00AD prints nothing on a line that does not break at it.
- [ ] A letter with no character of the FR-2 set prints a PDF identical in text, line breaks and page count to the current output, on both the local and the serverless runtime.
- [ ] The cover letter Word export of the same letter contains each FR-2 character as written. It is opened in Microsoft Word, and no box shows.

### US-002: The resume PDF prints every hyphen and punctuation mark

**Description:**  
As a user downloading my CV as a PDF, I want every hyphen, dash and space in my CV to print as it does in the Preview, so that the CV I send has no crossed boxes in it.

**Acceptance Criteria:**

- [ ] A CV with the FR-2 set in its summary and in one experience description, downloaded as PDF from the serverless runtime, shows no missing-glyph box on its rendered pages. It is checked in each of these fonts:
  - Arial
  - Helvetica
  - Calibri
  - Georgia
  - the Classic template's default fonts
  - the default font of the template used for the check
- [ ] In those PDFs, "decade‑long" written with U+2010 and with U+2011 prints a visible hyphen, and the text extracts with a hyphen character between "decade" and "long".
- [ ] A CV with no character of the FR-2 set prints a PDF identical in text, line breaks and page count to the current output, on both runtimes. Visual and parity suites stay unchanged.
- [ ] The resume Word export of the same CV contains each FR-2 character as written. It is opened in Microsoft Word, and no box shows.

## Functional Requirements

- **FR-1:** On the serverless runtime, no character of a letter or CV prints as a missing-glyph box when it is in a substitute face's registered `unicode-range` but has no glyph in that face.
- **FR-2:** The verification set is:
  - U+00AD soft hyphen
  - U+2010 hyphen
  - U+2011 non-breaking hyphen
  - U+2012 figure dash
  - U+2015 horizontal bar
  - U+2020 dagger
  - U+2021 double dagger
  - U+2030 per mille
  - U+2032 prime
  - U+202F narrow no-break space

  Also checked as controls, already correct today: U+002D, U+2013, U+2014, U+2022 and U+00A0.
- **FR-3:** The hyphens U+2010, U+2011 and U+2012 print with the width of the font's own hyphen. This keeps the substitutes' metric compatibility, so a line with them breaks where the user's own print breaks it.
- **FR-4:** U+2011 keeps its no-break meaning, and U+202F keeps its no-break meaning. U+00AD stays invisible unless the line breaks at it.
- **FR-5:** An automated check fails when a substitute face is registered for a code point it has no glyph for, unless that code point is handled by the FR-1 fix. A Fontsource update that changes coverage must fail the check, not print boxes.
- **FR-6:** The fix applies to both PDF renderers through one shared mechanism. There is no cover-letter-only or resume-only variant.
- **FR-7:** Stored text and the Word exports are unchanged.

## Regression Constraints

- On the local runtime (developer machines, the e2e suite) the PDFs print exactly as today: the real Georgia, Arial and Calibri are used, and no substitute is registered.
- On the serverless runtime, text without FR-2 characters prints with the same substitutes, line breaks and page count as today.
- The renderer's isolation is not weakened:
  - no network request for fonts beyond those the resume renderer already makes (Google Fonts);
  - fonts stay inline `data:` sources from installed packages;
  - the cover letter page keeps scripts off and every request aborted.
- The cover letter's 816 × 1056 px page, margins and paging, and the resumes' A4 output, are unchanged.
- Parity stays at MATCH 211 / KNOWN 3 / NEW 0, and the visual suite stays unchanged.

## Required Verification

- All checks of CLAUDE.md §14: typecheck, test, test:integration, test:e2e, build, lint (≤ the tracked 286), and test:parity.
- **Unit:** the FR-5 coverage check, run against the installed Fontsource files.
- **Serverless evidence (export-validation):** PDFs of US-001 and US-002 fixtures generated on the branch's Vercel Preview deployment, or on a local reproduction that registers the same substitutes and has only Open Sans as a system font. If the reproduction is used, its faithfulness must be shown, by reproducing the box with the current code before the fix.
  - Each PDF is rasterized and inspected for boxes.
  - Its text is extracted.
  - The before/after line breaks and page count are compared for a fixture with no FR-2 characters.
- **Word:** the cover letter and resume .docx are opened in Microsoft Word with the FR-2 set (US-001, US-002).
- **Security:** security-review if the change touches the renderer's page setup, font loading or request policy.

## FAIL Conditions

- Any FR-2 character prints as a box in any checked font, in a PDF from the serverless runtime.
- "decade‑long" with U+2010 or U+2011 prints without a visible hyphen, or its extracted text lacks the hyphen.
- A line breaks after a U+2011, or a U+00AD shows on a line that does not break at it.
- A PDF without FR-2 characters changes its text, line breaks or page count on either runtime.
- Stored text is modified, or the Word exports change.
- The fix works only in the cover letter or only in the resume renderer (FR-6).
- The local-runtime e2e passes but no serverless evidence exists.

## BLOCKER Conditions

- No serverless evidence can be produced: no Vercel Preview deployment for the branch and no faithful local reproduction.
- No font available to the serverless renderer, installed or from an installed package, can draw a hyphen of the same width as the substitute's own hyphen, and the only remaining way is to change the text as printed.
- The Word check shows the same defect in a Word export (scope decision for the owner).

## Risks

- Narrowing a substitute's `unicode-range` makes the browser fall back to Open Sans for the excluded characters. Open Sans's coverage of the FR-2 set is not known, and its hyphen has another width than the metric-compatible one (FR-3).
- Rewriting characters only in the printed copy (for example U+2011 → U+002D) changes what a reader copies from the PDF, and can add a break after the hyphen (FR-4).
- Fixes that touch the init script of the resume renderer also touch the Preview document, which React hydrates there.
- Other web fonts (Google Fonts) may lack some FR-2 characters. They are outside the substitutes and are not covered by FR-1; US-002 records what it sees for the default font.

## Evidence / References

- Owner screenshot, 2026-11-02 — "decade‑long" in the editor and in the PDF.
- `src/lib/pdf/font-substitutes.ts` — substitutes, Fontsource stylesheet parsing, `unicode-range` registration.
- `src/lib/pdf/render-cover-letter.ts` — `fontFaceCss`, the cover letter's inline `@font-face`.
- `src/lib/pdf/render-preview.ts` — the resume renderer, `registerFontSubstitutes`.
- `src/lib/cover-letter-pdf-html.ts` — letter markup, `font-family: Georgia, serif`.
- `src/lib/constants/fonts.ts` — the font picker.
- `node_modules/@fontsource/{gelasio,arimo,carlito}` — cmap check: the latin subset declares U+2000–206F, and U+2010/2011/2012/202F are missing in all three (U+00AD missing in Gelasio and Carlito).
- `docs/engineering/pdf-export-runtime.md` — "Fonts on the server".

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
