# PRD: "Télécharger PDF" downloads the resume PDF directly

**Status:** APPROVED 2026-10-13

## Objective

Clicking "Télécharger PDF" on a resume's Preview page downloads a PDF file, with no browser print dialog. The PDF is generated on the server and is the same document the Preview shows and prints today.

## Context / Current Behavior

Owner request (2026-10-13, FR):

> « Quand l'utilisateur presse sur "télécharger pdf", je veux que le téléchargement soit instantané. Je veux pas que cela lance l'utilitaire d'impression. »

Owner decision (2026-10-13, asked in chat): the PDF is generated **on the server** with a headless Chromium. Rejected: building it in the browser (image-based, text not selectable, breaks PDF parity) and an external PDF service (CV content sent to a third party).

**The current button:**
- `src/components/dashboard/download-button.tsx:86` calls `window.print()`, which prints the page the user is on.
- It is rendered only in the Preview page header (`resume-preview-page-client.tsx:52-55`, `print:hidden`).
- The same component holds the Word button.
- `download-pdf-button.tsx` also calls `window.print()`, but nothing imports it.
- The dashboard card's "Download PDF" menu item is a stub that shows `pdfExportComingSoon` (`resume-card.tsx:264-269`).

**What the Preview shows comes partly from the browser only:**

| State | Where it lives | Can the server see it? |
|---|---|---|
| Unsaved draft | `localStorage resume_draft_${id}`, replaces the whole resume, shows the amber banner (`resume-preview-wrapper.tsx:55-68`) | No |
| Photo | `localStorage resume_photo_${id}` only, never stored on the account (decision recorded in `download-docx/route.ts:22-50`) | No; the DOCX route receives it as `photoBase64` in a POST body, bounded by `boundedPhoto()` |
| Layout | Account `layout_settings`, written within ~500 ms of an edit (`layout-persistence.ts:44`) | Yes, through `resolveResumeLayout` |

**The reference export route** is `src/app/api/resumes/[id]/download-docx/route.ts`:
- authentication via `createServerSupabaseClient().auth.getUser()`, 401 without a user;
- ownership via `.eq('user_id', user.id)`, 404 on a miss;
- layout via `resolveResumeLayout(resume, null)`;
- `locale` from the query string.

**Auth:** `src/middleware.ts` skips `/api`. Dashboard pages require a Supabase session (cookie).

**Current PDF:** the print stylesheet in `src/app/globals.css` (`@page` A4, margin 0, print-only bands). The e2e and parity suites already reproduce it with Chromium `page.pdf({ preferCSSPageSize: true })` under print media (`e2e/parity/surfaces.ts:856-858` and others).

**Runtime:**
- No headless-browser dependency in `dependencies`; `@playwright/test` is a devDependency.
- No `vercel.json`, no `serverExternalPackages`.
- No server-side PDF generation anywhere.
- Hosting is Vercel; each PR gets a Vercel preview deployment (check "Vercel Preview Comments").

**i18n:** `resumes.downloadPDF` exists in all four locales. There is no resume-PDF error key and no "generating" key.

## Scope

- The Preview page's "Télécharger PDF" button downloads a `.pdf` file from a new authenticated server route. It never opens the print dialog.
- The server-generated PDF reproduces the Preview the user is looking at:
  - same template, content, layout and locale;
  - the unsaved draft and the photo when present, sent by the client;
  - same A4 pages, print styles, page count and text.
- The button shows a busy state while generating, cannot be double-clicked, and shows a localized error if generation fails.
- A meaningful, safe filename.
- The headless-browser dependency and runtime configuration needed to run in production on Vercel.
- Tests that prove the download, its fidelity and its security.

## Out of Scope

- The Word / DOCX export, in any way (owner constraint carried over from `modern-print-sidebar-full-page`): no change under `src/app/api/resumes/[id]/download-docx/`, and no DOCX byte change.
- Cover-letter PDFs (`html2pdf.js` / `jspdf`), which are a separate surface.
- The dashboard card's "Download PDF" stub.
- Storing the photo or the draft on the account.
- Changing the print stylesheet, the templates or the page geometry. Browser printing (Ctrl+P) keeps working as today.
- Deploying to production. Deployment stays an owner shipping action; this PRD only requires the change to work on the PR's Vercel preview deployment.

## Impact Assessment

- **Frontend / UI:** Affected. The PDF button's behaviour, busy and error states.
- **Internationalization:** Affected. New strings for "generating" and the PDF error, in fr, en, de and it.
- **Resume model / templates:** Not affected. Templates render as today.
- **Exports:** Affected. A new PDF export path; DOCX explicitly unaffected.
- **Database / persistence:** Not affected. Nothing is stored.
- **Security / authorization:** Affected:
  - a new authenticated route with an ownership check;
  - a client-supplied draft and photo, which are untrusted;
  - headless-browser hardening;
  - resource limits.
- **Testing / validation:** Affected. New e2e and route tests, PDF fidelity comparison, security tests, verification on the Vercel preview deployment.

## User Stories

### US-001: The server returns the resume PDF the Preview shows

**Description:**
As a signed-in user, I want the server to produce my resume's PDF, so that a file can be downloaded without printing.

**Acceptance Criteria:**

- [ ] A new route returns `application/pdf` with `Content-Disposition: attachment` for a resume the signed-in user owns.
- [ ] It returns 401 without a session, and 404 for a resume that does not exist or belongs to another user. Both are tested with two real users.
- [ ] For each of the five templates, at a default and a non-default layout, the route's PDF matches the PDF printed from the Preview page under print media:
  - same page count;
  - same text, page by page;
  - same page size (A4).
  - The Modern band reaches the bottom of every page, as `e2e/modern-print-sidebar-full-page.spec.ts` checks.
- [ ] When the client sends the unsaved draft and the photo, the PDF shows the draft's content and the photo exactly as the Preview does.
  - Without them, it shows the stored resume and no photo.
  - The draft is accepted only for the resume id in the URL; the photo is bounded as `boundedPhoto()` does.
- [ ] Anything the client sends is treated as untrusted: rich text is sanitized as the Preview sanitizes it, and oversized payloads are rejected with 413.
  - The renderer cannot be made to load an external URL or a local file. Tested with a malicious draft (script, iframe, remote image, `file://`).
- [ ] The filename comes from the resume title, safely encoded: non-ASCII titles are RFC 5987-encoded, quotes are neutralized, and an empty title gives `resume.pdf`.
- [ ] No print chrome: no browser header or footer, no date and no URL on any page.

### US-002: "Télécharger PDF" downloads the file instead of printing

**Description:**
As a user on the Preview page, I want "Télécharger PDF" to download my CV as a file straight away, without the print window.

**Acceptance Criteria:**

- [ ] Clicking the button never calls `window.print()`; an e2e test asserts it was not called. A `.pdf` file is downloaded, and its content is the US-001 route's PDF for that resume.
- [ ] While generating:
  - the button is disabled;
  - it shows a localized busy label;
  - a second click does not start a second request.
- [ ] On failure (route error, timeout, network), a localized error message shows and the button becomes usable again. New strings exist in fr, en, de and it.
- [ ] With an unsaved draft and a photo in the browser, the downloaded PDF contains them (US-001).
- [ ] The Word button behaves exactly as before.

### US-003: PDF generation works in the production runtime

**Description:**
As the owner, I want the PDF route to work on Vercel, not only on my machine.

**Acceptance Criteria:**

- [ ] The headless-browser dependency and the route's runtime configuration (Node.js runtime, duration and memory, and whatever bundling the dependency needs) are added and documented.
- [ ] On the PR's Vercel preview deployment, the route downloads a correct PDF for a Modern multi-page CV and a one-page Classic CV, signed in as a real test user. Recorded in `progress.txt` with response time, status and page count.
- [ ] Median generation time is measured locally and on the preview deployment, warm and cold, and recorded. The target is under 5 s warm.
- [ ] `pnpm build` and the CI checks pass with the new dependency.

## Functional Requirements

- **FR-1:** The PDF is produced by Chromium from the same template rendering and the same print stylesheet as the Preview. The new route renders no second, parallel layout of the CV.
- **FR-2:** The layout comes from the account through `resolveResumeLayout`, as for the DOCX. The content is the stored resume, or the client-sent draft for the same resume id. The photo is the client-sent photo, bounded as for the DOCX.
- **FR-3:** Authentication and ownership are enforced on the server. A client-sent draft never changes which resume is rendered or who owns it, and nothing it contains is persisted.
- **FR-4:** The renderer runs with JavaScript limited to what the page needs. Network access is limited to the app's own origin, or the page is fully self-contained. Generation has a hard timeout, and the browser is always closed, even on error.
- **FR-5:** No secret or session token reaches the rendered page, a log or an error response.
- **FR-6:** All new user-facing strings live in `src/locales/{fr,en,de,it}/common.json`.

## Regression Constraints

- The DOCX of every template is byte-identical (hashes of `word/document.xml` and `styles.xml`), and `git diff -- "src/app/api/resumes/[id]/download-docx"` is empty.
- Browser printing of the Preview page (Ctrl+P) produces the same PDF as before. The existing print e2e specs pass unchanged:
  - `resume-print-geometry`;
  - `modern-long-sidebar-print`;
  - `modern-print-sidebar-full-page`;
  - `resume-page-break-pdf-count`;
  - the page-break specs.
- `pnpm test:visual` passes with its existing baselines; `pnpm test:parity` keeps every row's verdict (MATCH 211 / KNOWN 3 / NEW 0 on the current base).
- The Preview page renders, behaves and is captured exactly as today, apart from the PDF button's own states.
- The CSP and security headers keep passing `e2e/security-headers.spec.ts`. Any change to them is explicit and reviewed.

## Required Verification

- The CLAUDE.md §14 baseline on the final diff, lint judged against the ceiling of 306. Plus `pnpm test:visual` and `pnpm test:parity`.
- **Route tests:**
  - 401;
  - 404 for another user's resume, with two real users;
  - 413 for an oversized payload;
  - content type, disposition and filename encoding.
- **Security tests:** the malicious-draft cases (script, iframe, remote image, `file://`, an oversized photo). No external request and no file access occurs, shown by request interception or logs. `security-review` validation is required.
- **Fidelity, for all five templates at a default and a non-default layout:**
  - route PDF vs Preview print PDF: page count, text per page, page size;
  - the Modern band check.
- **E2e for US-002:** the click downloads a PDF; `window.print` is not called; busy and error states; a draft and a photo included.
- **DOCX:** hashes before and after.
- **Vercel preview deployment (US-003):** a manual run, recorded with status, time and page count. Deploying to the preview environment happens through the PR, not through a `vercel` command.
- **ui-expert:** reviews the button's busy and error states (desktop and mobile), and the downloaded PDF opened in a viewer.

## FAIL Conditions

- The print dialog opens, or `window.print()` is called, when "Télécharger PDF" is clicked.
- For any template, the downloaded PDF differs from the Preview's print in page count, page text or page size, or loses the Modern band.
- The draft or the photo the user sees in the Preview is missing from the PDF when present.
- Any user can obtain another user's resume PDF, or the route answers without a session.
- The renderer fetches an external URL or a local file, or runs script supplied by the client.
- Any DOCX byte changes, any visual baseline needs updating, or parity reports NEW > 0 or a changed verdict.
- A user-facing string is hardcoded or missing in a locale.

## BLOCKER Conditions

- The headless-browser dependency cannot run within the Vercel plan's limits (function size, memory, duration). Report the measured numbers to the owner before any workaround.
- The PR's Vercel preview deployment cannot be exercised, for example because a protected deployment needs the owner's access. US-003 then waits for the owner.
- Fidelity with the Preview would require changing the templates or the print stylesheet, which is out of scope.

## Risks

- **Cold start:** a headless browser on serverless cold-starts slowly. "Instantané" is best approximated by fast warm generation and immediate feedback; the measured times are recorded, not assumed.
- **Function size:** the bundled browser may approach Vercel's function size limit.
- **Fonts:** the server Chromium may not have the fonts the user's browser has. Every picker font must be available to it, or text metrics, line breaks and page count will differ. US-001's fidelity criterion catches this.
- **SSR-unsafe sanitizer:** `sanitizeHtml` calls `document`, so it cannot run during server rendering (it is known to break server rendering of a template). The rendering approach must not route rich text through it on the server.
- **Linux vs Windows:** print rendering can differ between the two; Professional already shows a KNOWN 1 px seam on Linux. The production server is Linux.

## Evidence / References

- `src/components/dashboard/download-button.tsx:25-86`: the current PDF (print) and Word buttons.
- `src/components/dashboard/resume-preview-page-client.tsx:19, 52-55`: the Preview header and controls toggle.
- `src/components/dashboard/resume-preview-wrapper.tsx:47-68`: the draft and the photo from localStorage.
- `src/app/api/resumes/[id]/download-docx/route.ts:22-50, 96-109, 134-152, 170-183, 258-288`: the reference export route (auth, ownership, layout, photo bound).
- `src/lib/hooks/use-resume-layout.ts`, `src/lib/layout-persistence.ts:44`, `use-persisted-layout.ts:225-235`: layout persistence.
- `src/middleware.ts`, `src/lib/supabase/server.ts`: auth.
- `src/app/globals.css` (print styles), `e2e/parity/surfaces.ts:856-858`: the current PDF and how it is reproduced.
- `tasks/prd-preview.md:142-143, 223-226`: an earlier proposal to move off `window.print()`.

## Open Questions

- None. The generation location was decided by the owner on 2026-10-13. Vercel plan limits are handled as a BLOCKER condition, with measured evidence.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
