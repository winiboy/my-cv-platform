# PRD: Clearer sender fields in the cover letter's Signature tab

**Status:** DRAFT

## Objective

In the cover letter editor's Signature tab, the name field asks for first and last name, and the two address fields show a neutral example in the letter's language.

## Context / Current Behavior

The Signature tab is `src/components/dashboard/cover-letter-sections/signature-section.tsx`, rendered by `src/components/dashboard/cover-letter-editor.tsx`.

- **Name field.** Its label is `coverLetters.editor.signature.nameLabel`:
  - fr "Votre nom", en "Your Name", de "Ihr Name", it "Il tuo nome".
  - Its placeholder is `namePlaceholder` ("Votre nom complet", etc.).
- **Street and postcode fields.** Their placeholders come from the interface dictionary, so they follow the page language, not the letter's:

  | Key | fr | en | de | it |
  |---|---|---|---|---|
  | `streetPlaceholder` | "ex. : Rue de Bourg 12" | "e.g., Rue de Bourg 12" | "z.B. Bahnhofstrasse 1" | "es. Via Nassa 5" |
  | `postalLocalityPlaceholder` | "ex. : 1003 Lausanne" | "e.g., 1003 Lausanne" | "z.B. 8001 Zürich" | "es. 6900 Lugano" |

  A German letter opened under `/fr` therefore shows French examples. The examples name real places.
- **The letter's language** is already resolved in the editor, with the same function and inputs as the preview and the exports:
  - `coverLetterLanguage({ opening_paragraph, body_paragraphs, closing_paragraph }, locale)`, then `COVER_LETTER_WORDING[language]` (`src/lib/cover-letter-language.ts`).
  - Since cover-letter-swiss-format US-005, the greeting placeholder and the default sign-off already follow it.
- **When a placeholder shows.** It shows only when the field is empty. These fields fall back to the linked CV's contact, so a letter linked to a CV with an address shows the CV's values instead.
- **Printing.** A placeholder is never printed or stored.

## Scope

- **Name label.** Rename the Signature tab's name label in the four interface languages:
  - fr "Votre prénom et nom"
  - en "Your first and last name"
  - de "Ihr Vorname und Name"
  - it "Il tuo nome e cognome"
- **Example text.** Replace the placeholders of "Rue et numéro" and "NPA et localité" with neutral examples, without an "ex. :" / "e.g.," / "z.B." / "es." prefix.
- **Example language.** The examples are chosen by the letter's language, not the interface language.

## Out of Scope

- **Other fields:** the name field's placeholder, the phone, e-mail and annexes fields, and the Recipient tab's fields and labels.
- **Output:** what is stored or printed. The preview, PDF and Word output are unchanged.
- **Other wording:** the other labels, which keep following the interface language.
- **Language detection:** how the letter's language is detected.
- **Pre-existing decisions** carried over from cover-letter-swiss-format: the ß in the sign-off options, the Generate fallback, and placeholder contrast.

## Impact Assessment

- **Frontend / UI:** Affected. The Signature tab has one label and two placeholders.
- **Internationalization:** Affected:
  - one label changes in fr/en/de/it;
  - the two address examples become letter-language wording in four languages;
  - the interface dictionary keys `streetPlaceholder` and `postalLocalityPlaceholder` are no longer read.
- **Resume model / templates:** Not affected. Cover letters only.
- **Exports:** Not affected. Placeholders are never printed.
- **Database / persistence:** Not affected. No stored value changes.
- **Security / authorization:** Not affected. The texts are static, with no new input or route.
- **Testing / validation:** Affected. Unit, e2e and the rendered Signature tab need checking.

## User Stories

### US-001: The name field asks for first and last name

**Description:**  
As a job seeker filling in my signature, I want the name field to say it expects my first and last name, so that the letter is signed with my full name.

**Acceptance Criteria:**

- [ ] The Signature tab's name field label reads exactly:
  - "Votre prénom et nom" under `/fr`;
  - "Your first and last name" under `/en`;
  - "Ihr Vorname und Name" under `/de`;
  - "Il tuo nome e cognome" under `/it`.
- [ ] The label follows the interface language, like the other labels of the tab.
- [ ] The name field's placeholder, value, saving and printing are unchanged.

### US-002: The address fields show a neutral example in the letter's language

**Description:**  
As a job seeker, I want the street and postcode fields to show a neutral example in my letter's language, so that I know what to type without the example naming a real place in another language.

**Acceptance Criteria:**

- [ ] When empty, the "Rue et numéro" field shows exactly this placeholder, according to the letter's language:

  | Letter language | Placeholder |
  |---|---|
  | fr | "Rue du Bourg 12" |
  | de | "Dorfstrasse 12" |
  | it | "Via del Borgo 12" |
  | en | "12 Main Street" |

- [ ] When empty, the "NPA et localité" field shows exactly this placeholder, according to the letter's language:

  | Letter language | Placeholder |
  |---|---|
  | fr | "1234 Ma ville" |
  | de | "1234 Mein Ort" |
  | it | "1234 La mia città" |
  | en | "1234 My town" |

- [ ] Neither placeholder has an "ex. :", "e.g.,", "z.B." or "es." prefix.
- [ ] The letter's language is the one the preview prints in. Two cases must hold:
  - a German letter opened under `/fr` shows "Dorfstrasse 12" and "1234 Mein Ort";
  - a French letter opened under `/de` shows "Rue du Bourg 12" and "1234 Ma ville".
- [ ] If the user edits the letter's text so that its detected language changes, the two placeholders follow, as the greeting placeholder does.
- [ ] Labels, values, saving, the CV fallback and the printed letter are unchanged. A placeholder is never stored or printed.

## Functional Requirements

- **FR-1:** The two address examples come from the same per-language letter wording the editor already resolves (`COVER_LETTER_WORDING` for `coverLetterLanguage(...)`). The language is not resolved a second time.
- **FR-2:** The name label stays an interface-dictionary string with parity across fr/en/de/it (`coverLetters.editor.signature.nameLabel`).
- **FR-3:** The interface dictionary keys that are no longer read (`streetPlaceholder` and `postalLocalityPlaceholder`) are removed from all four locales, and nothing reads them. The same was done for `greetingPlaceholder` in cover-letter-swiss-format US-005.
- **FR-4:** No new dependency, column, route or migration.

## Regression Constraints

- The other Signature tab labels and placeholders still follow the interface language and keep their current text.
- The preview, the PDF and the Word export of an unchanged letter print the same text as before.
- Saving the sender fields still stores what the user typed. An emptied field still stores `''`, and a never-set field is still `null`, which falls back to the linked CV.
- The Recipient tab is unchanged.
- The e-mail validation and length limits of the sender fields are unchanged.

## Required Verification

- The mandatory baseline from `CLAUDE.md` §14: typecheck, test, test:integration, test:e2e, build, and lint at or below the tracked ceiling (286).
- `pnpm test:visual` and `pnpm test:parity` must stay at their current results (visual 10/10; parity MATCH 211 / KNOWN 3 / NEW 0). A changed baseline is a FAIL unless the only difference is the text this PRD changes.
- e2e:
  - under each of `/fr`, `/en`, `/de` and `/it`, the name label text;
  - a German letter under `/fr` and a French letter under `/de`: the two exact placeholders with empty fields and no linked CV address;
  - an existing spec that asserts the old label or placeholders is updated only as far as this change requires.
- Unit: the per-language address examples, for the four languages.
- Browser: rendered evidence of the Signature tab in fr and de, at 1280 and 375, showing the label in full (not clipped) and both placeholders.
- `ui-expert` PASS and `code-reviewer` PASS.

## FAIL Conditions

- **Wrong text:** any label or placeholder differs from the exact text above.
- **Wrong language:** a placeholder follows the interface language instead of the letter's language.
- **Prefix:** a placeholder keeps an "ex. :" / "e.g.," / "z.B." / "es." prefix.
- **Leak into output:** a placeholder is stored, or printed in the preview, PDF or Word.
- **Clipping:** the new label is clipped at 375 or 1280.
- **Scope:** another field, label or tab changes text.
- **Second resolver:** the letter language is resolved by a second, separate rule.

## BLOCKER Conditions

- The letter's language cannot be read in the Signature tab without resolving it a second way.
- A required check cannot run.

## Risks

- **German label length.** "Ihr Vorname und Name" is longer than "Ihr Name". It fits a full-width label, but must be checked at 375.
- **Mixed languages.** With the interface in one language and the letter in another, the labels and the two examples are in different languages. This is intended: the examples match what the letter prints.

## Evidence / References

- `src/components/dashboard/cover-letter-sections/signature-section.tsx`: the label, the placeholders, and their dictionary fallbacks.
- `src/components/dashboard/cover-letter-editor.tsx`: `letterWording` (L175), which is passed to the Opening and Signature sections.
- `src/lib/cover-letter-language.ts`: `COVER_LETTER_WORDING`, the per-language letter wording.
- `src/lib/cover-letter-pdf-html.ts`: `coverLetterLanguage`, the one language resolver.
- `src/locales/{fr,en,de,it}/common.json`: `coverLetters.editor.signature`.
- `e2e/cover-letter-editor-i18n.spec.ts`: asserts `signature.nameLabel`.
- `tasks/prds/cover-letter-swiss-format.md`, US-005: the same letter-language placeholder pattern, for the greeting.
- Owner request (2026-11-08):
  - the name label;
  - "Rue du Bourg 12", and "1234 Ma_ville" translated to the letter's language.
- Owner answers in chat (2026-11-08):
  - the street example also follows the letter's language;
  - no underscore;
  - no prefix.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
