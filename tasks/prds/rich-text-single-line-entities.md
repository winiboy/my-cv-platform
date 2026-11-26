# PRD: A single typed line shows its symbols, not their codes

**Status:** APPROVED 2026-11-26

## Objective

A line typed into an empty rich-text field (experience description, summary, achievement) without pressing Enter shows the same text — e.g. `R&D < 5%` — in the Preview, the PDF and Word, after save and reload.

## Context / Current Behavior

- `src/components/dashboard/rich-text-editor.tsx` `handleInput` stores the contenteditable's `innerHTML`. When the user types one line into an empty field and never presses Enter, the editor holds a bare text node, so the stored value is that node serialized: tagless but entity-encoded, e.g. `R&amp;D &lt; 5%` (a trailing typed space becomes `&nbsp;`).
- `renderFormattedText` (`src/lib/format-text.tsx`) classifies a value as HTML with `rendersAsFormattedContent` (`/<[^>]+>/`, `src/lib/resume-line-height.ts`). The tagless value goes to `formatText`, which renders the string as React text, so the Preview shows `R&amp;D &lt; 5%` literally.
- The PDF is the Preview page printed (`src/app/api/resumes/[id]/download-pdf/route.ts` → `src/lib/pdf/render-preview.ts`), so it shows the same literal entities.
- Word already shows `R&D < 5%`: `parseHtmlToDocxRuns` (`src/app/api/resumes/[id]/download-docx/docx-helpers.ts`) decodes `&nbsp;` up front and then `&amp; &lt; &gt; &quot; &#39; &#x27;` in one pass (`decodeHtmlEntities`, as changed by PR winiboy/my-cv-platform#131 US-004), so `&amp;lt;` is the text `&lt;`.
- The editor itself shows `R&D < 5%` on reload: the value is tagless, so the editor's sync effect passes it to `migrateTextToHtml` (`src/lib/html-utils.tsx`), which decodes entities and re-wraps the line in `<p>`. That decode-on-load behavior and the stability of the save/load round trip are pinned by `e2e/rich-text-migrate.spec.ts` and `e2e/rich-text-untrusted-value.spec.ts`.
- `formatText` runs during server rendering as well as in the browser. `sanitizeHtml` and `migrateTextToHtml` require `document` and cannot be used there (see `src/components/sanitized-html.tsx`).

So the three outputs disagree for one stored shape, and only the Preview/PDF are wrong.

## Scope

- Tagless values rendered by `renderFormattedText` show the entities the editor writes as the characters they encode, in the Preview (live and full-page) and therefore the PDF, across the ten Swiss templates.
- The decoding is server-render safe (no `document`), happens in one pass, and covers the same entity set Word decodes, from one shared function used by both the Preview and Word.
- One e2e regression test: type a single line with `&` and `<` into an empty field without Enter, save, reload, and assert the Preview, the generated PDF and the generated DOCX all contain `R&D < 5%`.

## Out of Scope

- Changing what the editor stores (e.g. always wrapping a single line in `<p>`). That would move single-line values onto the HTML branch and change their line height and justification in every template.
- Migrating or rewriting stored rows.
- Any change to values that contain tags (the `SanitizedHtml` branch), to `sanitizeHtml`, `migrateTextToHtml` or `htmlToPlainText`.
- Bullet / numbered-list detection, paragraph splitting and justification in `formatText`, except that they now see decoded text.
- Cover letters and any non-resume rich text.
- Entities outside the Word set (e.g. `&eacute;`, `&#233;`), which the editor does not write.

## Impact Assessment

- **Frontend / UI:** Affected — the Preview's text for tagless values with entities changes from codes to characters.
- **Internationalization:** Not affected — no user-facing strings added; entity decoding is locale-independent.
- **Resume model / templates:** Affected — all ten Swiss templates render through `renderFormattedText`; no template file needs changing.
- **Exports:** Affected — PDF output changes (it prints the Preview); Word output must stay as it is today.
- **Database / persistence:** Not affected — no schema, migration or stored-value change.
- **Security / authorization:** Affected — decoded `<` must stay text: `formatText` output is React text, never `dangerouslySetInnerHTML`, so a stored `&lt;img onerror=…&gt;` must render as visible text and run nothing.
- **Testing / validation:** Affected — new unit cases and one e2e regression test.

## User Stories

### US-001: A single typed line reads the same in the Preview, the PDF and Word

**Description:**
As a resume author, I want a line I typed without pressing Enter to show `R&D < 5%` everywhere, so that my CV does not print `&amp;` and `&lt;`.

**Acceptance Criteria:**

- [ ] `renderFormattedText('R&amp;D &lt; 5%')` renders the text `R&D < 5%` (unit test).
- [ ] `renderFormattedText('&amp;lt;')` renders the text `&lt;` — decoded once, not twice (unit test).
- [ ] `renderFormattedText('a&nbsp;b')` renders `a` and `b` separated by whitespace, no literal `&nbsp;` (unit test).
- [ ] `renderFormattedText('&lt;img src=x onerror=alert(1)&gt;')` renders the visible text `<img src=x onerror=alert(1)>` and creates no element (unit test on the rendered markup).
- [ ] `renderFormattedText('• one\n• two')` and the other existing `formatText` cases render byte-identically to before (existing unit tests pass unchanged).
- [ ] The decoding function used by `renderFormattedText` is the same function `parseHtmlToDocxRuns` uses, and it references no `document`/`window` (unit test runs in the node environment).
- [ ] e2e: on a seeded resume, typing `R&D < 5%` into an empty experience description without Enter, saving and reloading shows `R&D < 5%` in the Preview, and neither `&amp;` nor `&lt;` appears there.
- [ ] e2e, same resume: the PDF from `download-pdf` contains `R&D < 5%` in its extracted text and no `&amp;` / `&lt;`.
- [ ] e2e, same resume: the DOCX from `download-docx` contains `R&D < 5%` in `word/document.xml` text (XML-escaped as Word stores it) and no literal `&amp;amp;` / `&amp;lt;`.
- [ ] e2e: the stored column value after the reload has not gained a layer of escaping (no `&amp;amp;`).

## Functional Requirements

- **FR-1:** For a value with no complete tag, `renderFormattedText` decodes `&nbsp; &amp; &lt; &gt; &quot; &#39; &#x27;` in one pass before `formatText` splits it into paragraphs and lists.
- **FR-2:** The Preview and Word decode tagless text with one shared, DOM-free function; `docx-helpers.ts` no longer keeps its own copy.
- **FR-3:** Decoded text is rendered only as React text nodes.
- **FR-4:** Values with tags render exactly as before.

## Regression Constraints

- HTML values (any value matching `/<[^>]+>/`) render byte-identically in the Preview; their DOCX runs are unchanged.
- Tagless values without entities render byte-identically in the Preview (existing `src/lib/format-text.test.ts` and template unit tests pass unchanged).
- Word output for every value is unchanged (existing `docx-helpers` unit tests and `e2e/docx-export-layout.spec.ts` pass unchanged).
- `e2e/rich-text-migrate.spec.ts` and `e2e/rich-text-untrusted-value.spec.ts` pass unchanged.
- Line height chosen by `formattedTextLineHeight` for tagless values is unchanged (they stay on the plain-text branch).
- Swiss template visual baselines show no diff for fixtures without entities.

## Required Verification

- `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm build` (or `pnpm build:verify`), `pnpm lint` compared to the tracked baseline — per CLAUDE.md §14, on the final diff.
- `pnpm test:visual` for the Swiss templates, since every template renders through the changed function.
- Export evidence per `.claude/rules/testing.md`: the e2e test inspects the generated PDF text and DOCX XML, not only the HTTP status.
- Rendered browser evidence (screenshot of the Preview showing `R&D < 5%`) for `ui-expert`.
- `code-reviewer` review including the security criterion above.

## FAIL Conditions

- The Preview, PDF or DOCX shows `&amp;`, `&lt;` or `&nbsp;` for the typed line.
- `&amp;lt;` renders as `<` (double decode).
- Any decoded `<` produces an element or runs a handler.
- Any existing unit, e2e or visual test changes outcome, or is edited to pass.
- Preview or Word keep separate decoders.
- The fix changes what the editor stores, or stored rows.

## BLOCKER Conditions

- PR winiboy/my-cv-platform#131 changes `decodeHtmlEntities` before merge in a way this PRD does not describe.
- The e2e cannot drive the editor to store the tagless shape (e.g. the editor starts wrapping the line itself), so the regression cannot be reproduced.

## Risks

- Legacy tagless text that literally means `&amp;` (not editor-written) will now show `&`. Word and the editor already show it that way, so this aligns the Preview with them.
- Tagless values holding only encoded tags (`&lt;p&gt;Hi&lt;/p&gt;`) will show `<p>Hi</p>` as text in the Preview/PDF, as Word does since #131 US-004, instead of the codes. How many stored rows have this shape is unknown (Open Question 1).

## Evidence / References

- `src/components/dashboard/rich-text-editor.tsx` — `handleInput` stores `innerHTML`; sync effect re-wraps tagless values.
- `src/lib/format-text.tsx` — `renderFormattedText` / `formatText`.
- `src/lib/resume-line-height.ts` — `rendersAsFormattedContent`, `formattedTextLineHeight`.
- `src/lib/html-utils.tsx` — `migrateTextToHtml` decode-on-load.
- `src/components/sanitized-html.tsx` — why DOM helpers cannot run on the server.
- `src/app/api/resumes/[id]/download-docx/docx-helpers.ts` (branch `ralph/swiss-templates-only-page-fidelity`) — `decodeHtmlEntities`, `parseHtmlToDocxRuns`.
- `src/lib/pdf/render-preview.ts` — PDF is the printed Preview.
- `e2e/rich-text-untrusted-value.spec.ts`, `e2e/rich-text-migrate.spec.ts`, `e2e/docx-export-layout.spec.ts` — existing coverage and patterns.
- `tasks/ralph/progress.txt` (PR #131, US-004) — where the defect was recorded as an owner decision.

## Open Questions

1. **Non-blocking, needs the owner's OK:** may a read-only count be run against production for tagless `description` / `summary` / `achievements` values that start with `&lt;` (encoded tags only)? It sizes the second risk; it does not change the requirements. No production data has been read.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
