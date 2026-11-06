# PRD: The e2e PDF reader parses every valid PDF on the first try

**Status:** APPROVED 2026-11-06

Amendment 1 (2026-11-06) is awaiting the owner's re-approval. The failure does not reproduce on `origin/main` (150 of 150 passed), because main's PDFs for this case are too large to take the faulty path, so the before/after measurement moves to the Swiss branch, where it does. This follows the owner's decision in chat on 2026-11-06 ("Amend the PRD"). The rest of this PRD was approved on 2026-11-06.

## Objective

Every e2e test that reads a PDF with `pdf-parse` reads a valid PDF on the first attempt, on every run, locally and in CI. The tests keep checking the same product behaviour, and no assertion is weakened.

## Context / Current Behavior

**Owner request (chat, 2026-11-06):** "Fix flake first". The flake blocks the US-004 commit of `cover-letter-swiss-format`, as the flakes fixed in #122 (`e2e-flaky-stabilization`) blocked it before. That initiative is paused until this ships.

**Observed failure.**
- **Where:** `e2e/cover-letter-template-language.spec.ts:235`, the case "a letter too short to tell follows the page, keeping its stored greeting".
- **What fails:** at line 277, `readPdf(pdf)` (`e2e/fixtures/pdf.ts`) throws `UnknownErrorException: bad XRef entry`, which pdf.js raises when an xref offset does not point at the expected `N 0 obj`.
- **Frequency:**
  - once in the full `pnpm test:e2e` run of US-004 (527 passed, 1 failed);
  - run alone with `--repeat-each`, 2 of 3, 3 of 10, and from 6 to 15 of 30 depending on the variant below;
  - on `ce945fe` (US-003, before any US-004 change), 3 of 10 alone.
- **Pre-existing:** the failure predates US-004; the case was added in #118.

**The PDF is valid.** Measured 2026-11-06:
- The failing PDF (31258 bytes, Chromium/Skia) has every xref offset pointing at its object. It parses outside Playwright with the same pdf.js build on the first call.
- Its SHA-256 is the same right after the download, just before the parse, and when the parse fails. The bytes never change.
- In the same test, a second `readPdf` of the same Buffer passes (12 of 12 retries).

**What decides it is the type handed to pdf.js.**

`readPdf` passes the Node `Buffer` from the download to `pdf-parse`, which hands it to pdf.js 2.0.550 (`node_modules/pdf-parse/lib/pdf.js/v2.0.550`) unchanged, because a Buffer is a `Uint8Array`. The in-process "fake worker" then copies it with `new value.constructor(value)` (`LoopbackPort.postMessage`, `build/pdf.js`). For a Buffer that is `new Buffer(buffer)`. The Playwright worker runs with `Buffer.poolSize` = 65536 (Node's default is 8192), so a copy of this size comes from Node's shared Buffer pool.

30 runs of the failing case per variant:

| What `readPdf` hands to pdf-parse | Failed |
|---|---|
| The downloaded Buffer (unchanged code) | 6 to 15 of 30, by variant |
| A Buffer copy with its own ArrayBuffer, made before the parse | 8 of 30 |
| A Buffer copy made right after the download | 9 of 30 |
| The Buffer, after a warm-up parse of another PDF | 6 of 30 (the warm-up passed 30 of 30) |
| The Buffer, parsed before the Word file | 15 of 30 |
| A plain `Uint8Array` copy (`new Uint8Array(pdf)`) | **0 of 30** |

At the measured base rate of about 27%, 30 clean runs in a row happen by chance about once in 10,000.

**Why `main` passes and the Swiss branch fails** *(Amendment 1)*. Node draws a Buffer copy from its shared pool only when it is smaller than half the pool, here 32768 bytes.
- **`origin/main` (75a350b):** the case passed 150 of 150 (`--repeat-each=30`, 5 tests). Its PDFs, still the US Letter template, measured 37872 to 42793 bytes: above the threshold, so never pooled.
- **`ce945fe` (US-003 of `cover-letter-swiss-format`):** the case failed 3 of 10. The Swiss A4 letter's PDF is 31258 bytes: under the threshold.

So the defect is latent on `main`, and the first PDF under 32 KB that a test reads exposes it. That makes the Swiss branch the place to measure before and after.

**Not reproduced: the exact corrupting write.** Outside Playwright, with `Buffer.poolSize` set to 65536 and the pool's offset moved, the same bytes parse on the first call. Which allocation in the Playwright process overwrites pdf.js's pooled copy is not identified. The fix does not depend on it: a plain `Uint8Array` is copied by pdf.js with `new Uint8Array(value)`, which never uses Node's Buffer pool.

**Why full suites rarely show it.** The failure needs this case's PDF parse to meet that pool state. In a full suite the worker has done other work first. Run alone, every repetition starts the same way.

**Where else this can happen.** Every `pdf-parse` call in `e2e/` passes a Node Buffer the same way:
- `e2e/fixtures/pdf.ts`: `readPdf` and `readPdfTextItems`, used by 4 cover letter and resume specs;
- `e2e/parity/surfaces.ts:713`;
- `e2e/modern-long-sidebar-print.spec.ts:188`;
- `e2e/pdf-font-substitutes.spec.ts:115`;
- `e2e/resume-page-break-pdf-count.spec.ts:85`;
- `e2e/resume-preview-page-breaks.spec.ts:201`.

`rasteriseColumns` (`e2e/fixtures/pdf.ts`) hands the PDF to pdf.js inside Chromium as base64 and does not go through this path.

## Scope

- Every `pdf-parse` call in `e2e/` receives a plain `Uint8Array` copy of the PDF bytes, not a Node Buffer. That covers the seven call sites listed above, through one shared helper in `e2e/fixtures/pdf.ts`.
- A comment at the helper records why: the measured cause, with a pointer to this PRD.
- A unit-level guard against handing a Buffer to pdf-parse again, if one can be written without Playwright. Otherwise a code comment at each call site.

## Out of Scope

- Product code: routes, PDF rendering, the Word builder, templates. Nothing under `src/` changes.
- Upgrading or replacing `pdf-parse` or its bundled pdf.js, or adding a dependency.
- Changing `Buffer.poolSize` or any Playwright or Node configuration.
- Retrying a failed parse, warming pdf.js up, or catching `bad XRef entry`.
- **The mixed pdf.js versions (recorded under Risks).** Three call sites pass no `version`, and pdf-parse keeps whichever pdf.js build loads first in a process. Pinning them is a separate decision.
- Any other flaky test.
- The `cover-letter-swiss-format` stories; US-004 is committed after this merges.

## Impact Assessment

- **Frontend / UI:** Not affected — no product code changes.
- **Internationalization:** Not affected — no strings change.
- **Resume model / templates:** Not affected — the resume PDF specs only change how their test reads a PDF.
- **Exports:** Not affected — the exported files are unchanged; only the e2e reader of them changes.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected.
- **Testing / validation:** Affected — the e2e PDF reader and every spec that calls `pdf-parse` directly.

## User Stories

### US-001: A valid PDF parses on the first try in every e2e test

**Description:**
As the owner, I want every e2e PDF check to read the PDF it was given, so that a red run means a real defect and no story is blocked by a test that fails on a correct file.

**Acceptance Criteria:**

- [ ] Every `pdf-parse` call in `e2e/` receives a plain `Uint8Array` (its constructor is `Uint8Array`, not `Buffer`), through one shared helper in `e2e/fixtures/pdf.ts`. A search for `pdfParse(` in `e2e/` lists no call that passes a Buffer.
- [ ] *(Amendment 1)* With this story's change applied on top of `ce945fe` (the Swiss branch at US-003, where the failure reproduces), `pnpm test:e2e cover-letter-template-language --repeat-each=30` passes: 0 failed out of every test the spec runs, 30 times each. The same run without the change is recorded first and shows the failure.
- [ ] *(Amendment 1)* On this story's branch (`origin/main` plus the change), the same `--repeat-each=30` run also passes with 0 failed.
- [ ] The other specs that read PDFs with `pdf-parse` pass alone with `--repeat-each=5`: `cover-letter-pdf-export`, `cover-letter-swiss-pdf`, `resume-pdf-download-button`, `modern-long-sidebar-print`, `pdf-font-substitutes`, `resume-page-break-pdf-count`, `resume-preview-page-breaks`.
- [ ] No assertion, expected value, timeout or test is changed, skipped or removed. The diff touches only how bytes are handed to `pdf-parse`, plus the comments explaining why.
- [ ] `pnpm test:parity` keeps its baseline: MATCH 211, KNOWN 3, NEW 0, or the counts on `origin/main` when the story runs, recorded before and after.

## Functional Requirements

- **FR-1:** One helper in `e2e/fixtures/pdf.ts` turns PDF bytes into the value every `pdf-parse` call receives: a plain `Uint8Array` with its own ArrayBuffer, holding exactly the PDF's bytes.
- **FR-2:** The PDF bytes the tests download or print are not changed or re-encoded. Only the type pdf-parse receives changes.
- **FR-3:** No new dependency (`CLAUDE.md` §9).

## Regression Constraints

- Every spec that reads a PDF reads the same text, page sizes, positions and image counts as before.
- `rasteriseColumns` and the parity report keep their output. The parity report's counts are unchanged.
- No file under `src/` changes.

## Required Verification

- The `CLAUDE.md` §14 baseline on the final diff: `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`, and `pnpm lint` against the tracked ceiling.
- `pnpm test:parity`, compared with the count before the change.
- *(Amendment 1)* `pnpm test:e2e cover-letter-template-language --repeat-each=30` on `ce945fe`, first without the change (showing the failure), then with it (0 failures). The change is applied on a local scratch branch that is never pushed. Also run once on this story's branch, with 0 failures.
- `--repeat-each=5` for each of the other specs named in US-001.
- `code-reviewer` on the story.

## FAIL Conditions

- Any `pdf-parse` call in `e2e/` still receives a Node Buffer.
- The repeat run of `cover-letter-template-language` has any failure.
- An assertion, expected value, timeout or test is changed, skipped or removed.
- A file under `src/` changes, or a dependency is added.
- The parity counts change.

## BLOCKER Conditions

- *(Amendment 1)* The failure does not reproduce on `ce945fe` without the change, so the before/after comparison cannot be made. Report it; do not claim a fix.
- A plain `Uint8Array` changes what pdf-parse reads (text, page sizes, positions) for any spec. Report it with the difference; the owner decides.

## Risks

- **The corrupting write is not identified.** The evidence shows the type handed to pdf.js decides the outcome (0 of 30 against 6 to 15 of 30), but not which allocation corrupts the pooled copy. If another path reaches the pool, a rarer failure could remain. The repeat runs would show it.
- **Mixed pdf.js versions, out of scope.** `pdf-parse` caches the first pdf.js build it loads in a process (`PDFJS = PDFJS ? PDFJS : require(...)`). Three call sites pass no `version`, so in a worker that runs one of them first, the `version: 'v2.0.550'` of the others is silently ignored, and the reverse. Which pdf.js a spec really uses can depend on test order.

## Evidence / References

- `e2e/fixtures/pdf.ts` — `readPdf` and `readPdfTextItems` hand the Buffer to pdf-parse.
- `e2e/cover-letter-template-language.spec.ts:235`, `:277` — the failing case and line.
- `node_modules/pdf-parse/lib/pdf-parse.js` L62–94 — the cached pdf.js build, and `getDocument(dataBuffer)`.
- `node_modules/pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js` — `getDocument` keeps a `Uint8Array` as is; `LoopbackPort.postMessage` copies with `new value.constructor(value)`.
- `node_modules/pdf-parse/lib/pdf.js/v2.0.550/build/pdf.worker.js` L10280–10289 — where `bad XRef entry` is thrown.
- `tasks/prds/e2e-flaky-stabilization.md` (#122) — the precedent: a flake blocking `cover-letter-swiss-format`, fixed in its own initiative.
- The diagnostic runs (2026-11-06), recorded in the scratchpad logs `diag*.log` of the US-004 session — the table under Context.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
