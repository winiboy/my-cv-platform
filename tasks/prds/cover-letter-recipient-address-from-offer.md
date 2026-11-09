# PRD: The company's address from the job offer, in a letter created from an application

**Status:** DRAFT

## Objective

When a cover letter is created from a job application, its "Adresse de l'entreprise" field is filled with the company's postal address found in the original job offer. If no address is found, the field stays empty.

## Context / Current Behavior

- **Creating a letter from an application.** `POST /api/cover-letters/from-job-application` (`src/app/api/cover-letters/from-job-application/route.ts`) creates the letter. It reads the application's `job_title`, `company_name`, `job_description`, `deadline` and `job_url`:
  - it stores `company_name`;
  - it never sets `company_address`, so the field is always empty.
- **The offer's page is already fetched.** Before generating, the route checks whether the offer is still online (`createOfferPageChecker`, `src/lib/cover-letter-from-job/offer-availability.ts`):
  - the URL goes through `safeFetch`, with the shared job-board allowlist (`src/lib/security/job-board-allowlist.ts`);
  - every redirect hop is re-checked and private addresses are refused;
  - one 5-second budget covers the whole chain;
  - only the status is read: the body is cancelled.
  - In tests and e2e, `offerPageCheckerFor(request)` (`src/lib/ai/test-stub.ts`) replaces the real checker.
- **Where the address can be found:**
  - **The page.** Job boards such as jobs.ch, LinkedIn and Indeed publish the offer as schema.org `JobPosting` data in a `<script type="application/ld+json">` block. It can include `hiringOrganization.address` and `jobLocation.address`, each a `PostalAddress` (`streetAddress`, `postalCode`, `addressLocality`, `addressCountry`). `/api/jobs/fetch-external` already reads `hiringOrganization` from this block for the company name.
  - **The offer's text.** `job_description` holds the text stored with the application. The same route already sends it to the AI to write the letter (`coverLetterGeneratorFor`, `src/lib/ai/cover-letter-generation.ts`).
- **The field.** `company_address` is a stored `TEXT` column (migration 003), up to 1,000 characters (`src/lib/cover-letter-limits.ts`). It is edited in the "Destinataire" tab as "Adresse de l'entreprise" (`recipient-section.tsx`), a textarea with one line per address line. The preview, the PDF and the Word export already print it, with the line breaks, under the company name in the envelope window (`swissLetterRecipientLines`). The editor warns when the block is longer than 6 lines.

## Scope

- When a letter is created from a job application, look for the company's postal address:
  - first in the structured data of the offer's page;
  - if the page gives none, in the offer's stored text.
- When a complete address is found, store it in the new letter's `company_address`.
- When none is found, the letter is created as today, with `company_address` empty.

## Out of Scope

- **Other fields:** "Nom du destinataire", "Fonction du destinataire" and "Nom de l'entreprise" are unchanged. The company name is still set as today.
- **Existing letters:** they are not updated. There is no button to look for the address again.
- **Other creation paths:** a letter created by hand, duplicated or translated. The editor's Generate button.
- **The job application:** nothing is stored on it.
- **Messages:** no message tells the user whether an address was found.
- **Other changes:** the job-board allowlist, the availability check's verdicts (a closed offer is still refused as today), `/api/jobs/fetch-external`, and the Destinataire tab's UI.

## Impact Assessment

- **Frontend / UI:** Not affected. The existing field shows the stored value; no component changes.
- **Internationalization:** Not affected. No new user-facing text. The address is stored as the offer writes it.
- **Resume model / templates:** Not affected.
- **Exports:** Not affected in code. The preview, PDF and Word already print `company_address`; a letter created from an offer now has one.
- **Database / persistence:** Not affected in schema. The existing `company_address` column is now filled at creation.
- **Security / authorization:** Affected:
  - the server now reads the body of a page from an outside website;
  - text from the page, and possibly AI output, is stored on the letter.
  - Both are untrusted input.
- **Testing / validation:** Affected. Unit tests for reading the page and the text, route tests, e2e with a stubbed offer page.

## User Stories

### US-001: The address comes from the offer's page

**Description:**  
As a job seeker creating a letter from a saved application, I want the company's address taken from the offer's page, so that I don't have to look it up and type it.

**Acceptance Criteria:**

- [ ] When the offer's page has a schema.org `JobPosting` with a complete postal address, the new letter's "Adresse de l'entreprise" holds that address:
  - from `hiringOrganization.address` first;
  - otherwise from `jobLocation.address`.
- [ ] An address is complete when it has a street, a postcode and a locality. A locality alone, or a postcode and locality without a street, is not used.
- [ ] The stored address has one line per part, the same shape the field's example shows:
  - line 1: the street, as written (e.g. "Avenue de la Gare 10");
  - line 2: the postcode, a space, then the locality (e.g. "1003 Lausanne");
  - line 3, only when the country is given and is not Switzerland: the country.
  - The company name is not repeated in the address.
- [ ] The page is the one the availability check already fetches. It is fetched once per creation, with the same allowlist, redirect checks and time budget.
- [ ] An offer that is closed (deadline past, page 404 or 410) is still refused as today, and no address is read.
- [ ] After creation, the Destinataire tab shows the address in "Adresse de l'entreprise". The preview prints it under the company name.

### US-002: Otherwise, the address comes from the offer's text

**Description:**  
As a job seeker whose offer page gives no address, I want the address found in the offer's text, so that the field is still filled when the text names it.

**Acceptance Criteria:**

- [ ] When the page gives no complete address (no URL, no structured data, an incomplete address, a host outside the allowlist, a timeout or any other failure), the address is looked for in the application's stored offer text.
- [ ] An address taken from the text is used only if it appears in the text: its street and its postcode-and-locality are both found there, ignoring case and spacing.
- [ ] An address found in the text is stored in the same shape as in US-001.
- [ ] When neither the page nor the text gives a complete address, the letter is created as today and "Adresse de l'entreprise" is empty.
- [ ] Not finding an address never prevents the letter from being created, and never changes the error the route returns.

## Functional Requirements

- **FR-1:** The address is looked for only by `POST /api/cover-letters/from-job-application`, and only for the letter it creates.
- **FR-2:** Order of sources:
  - (1) `hiringOrganization.address` on the offer's page;
  - (2) `jobLocation.address` on the offer's page;
  - (3) the offer's stored text.
  - The first complete address wins.
- **FR-3:** The page is read with the existing `safeFetch` path and job-board allowlist. The read must stay inside the existing time budget and cap how much of the body it reads. Only an HTML answer with a success status is read. The checker's existing verdicts (`gone`, `answered`, `undetermined`) are unchanged.
- **FR-4:** The address is untrusted text:
  - it is cleaned like the other untrusted text this route stores (`sanitizeUntrustedPlainText`);
  - it is capped by the existing `company_address` limit.
- **FR-5:** The text fallback spends no additional unit of the per-user AI rate limit. The creation already spends one.
- **FR-6:** In tests and e2e, the offer page is served by the existing stub seam (`offerPageCheckerFor`); no test reaches a real job board.
- **FR-7:** No new dependency, column, route or migration.

## Regression Constraints

- A closed offer is still refused with 409 and the same reason.
- An AI failure still stores nothing and returns the same status.
- The letter's other stored values are unchanged for the same inputs:
  - title, company name, job title, offer text, greeting, paragraphs, sign-off;
  - sender details, template;
  - the link to the application.
- `/api/jobs/fetch-external` and the job-board allowlist are unchanged.
- Letters created by hand, duplicated or translated are unchanged.
- The preview, PDF and Word output of a letter whose `company_address` is empty are unchanged.

## Required Verification

- The mandatory baseline from `CLAUDE.md` §14: typecheck, test, test:integration, test:e2e, build, and lint at or below the tracked ceiling (286).
- `pnpm test:visual` and `pnpm test:parity` stay at their current results (visual 10/10; parity MATCH 211 / KNOWN 3 / NEW 0).
- **Unit tests, reading the page.** With HTML fixtures:
  - an address in `hiringOrganization` only;
  - in `jobLocation` only;
  - in both (the first wins);
  - incomplete: locality only, no street;
  - a non-Swiss country;
  - a `@graph` or array JSON-LD;
  - malformed JSON-LD;
  - no JSON-LD;
  - a non-HTML answer;
  - a body over the read cap.
- **Unit tests, reading the text.** The text fallback:
  - an address present in the text is used;
  - an address not present in the text is rejected;
  - no address gives an empty field.
- **Route tests:**
  - the page address is stored;
  - the text address is stored when the page has none;
  - neither: `company_address` is `null`;
  - a closed offer is still refused;
  - an AI failure still stores nothing;
  - the page is fetched once;
  - no extra rate-limit unit is spent.
- **e2e,** with the stubbed offer page:
  - a letter created from an application whose page has an address shows it in "Adresse de l'entreprise", and the preview prints it;
  - a letter whose page and text have none shows the field empty.
- **Export:** the PDF of a letter created with an address prints it in the window, under the company name.
- **`security-review` PASS:**
  - the server reading the body of an outside page (allowlist, redirects, size and time bounds);
  - storing page and AI text.
- `code-reviewer` PASS. `ui-expert` is not required, since no UI changes; the e2e covers the rendered field.

## FAIL Conditions

- **Invented address:** an address is stored that is not on the page's structured data and not in the offer's text.
- **Partial address:** an address without a street, postcode or locality is stored.
- **Wrong shape:** the stored address is not "street", then "postcode locality", then the country only when it is not Switzerland. Or it repeats the company name.
- **Second fetch:** the offer's page is fetched more than once per creation, or outside `safeFetch` and the allowlist.
- **Blocked creation:** a missing address, or a failure while reading it, prevents the letter from being created or changes the route's answer.
- **Changed verdict:** a closed offer is no longer refused, or an open one is refused.
- **Extra cost:** the text fallback spends an additional rate-limit unit.
- **Scope:** another field, another creation path, or an existing letter is changed.

## BLOCKER Conditions

- The stub seam cannot serve a page body to the route in tests and e2e without a real network request.
- The text fallback cannot be done without an additional rate-limit unit.
- A required check cannot run.

## Risks

- **Few offers carry a street.** Many boards publish only a locality in `jobLocation`. Those letters keep an empty field, by design.
- **Workplace or head office.** `jobLocation` is where the job is, which may not be the address the company wants letters sent to. `hiringOrganization` is preferred for that reason.
- **Reading the body.** It costs more than reading the status. The time budget and the read cap keep it bounded.
- **AI accuracy.** The AI can misread or invent an address. The check that the address appears in the text guards against invention, not against picking the wrong address in the text (e.g. a branch office).

## Evidence / References

- `src/app/api/cover-letters/from-job-application/route.ts`: the creation route; `company_address` is never set.
- `src/lib/cover-letter-from-job/offer-availability.ts`: the page check; it reads the status only.
- `src/lib/security/safe-fetch.ts`, `src/lib/security/job-board-allowlist.ts`: the fetch guard and allowed hosts.
- `src/lib/ai/test-stub.ts`: the test seams `offerPageCheckerFor` and `coverLetterGeneratorFor`.
- `src/app/api/jobs/fetch-external/route.ts`: reads `JobPosting.hiringOrganization` from JSON-LD for the company name.
- `src/lib/ai/cover-letter-generation.ts`: the shared generation call and its JSON reply.
- `src/components/dashboard/cover-letter-sections/recipient-section.tsx`: the "Adresse de l'entreprise" field.
- `src/lib/cover-letter-swiss-letter.ts`: `swissLetterRecipientLines`, the printed recipient block.
- `src/lib/cover-letter-limits.ts`: `company_address` limit 1,000.
- `supabase/migrations/001_initial_schema.sql`: `job_applications` (`job_url`, `job_description`, `location`).
- Owner request (2026-11-09): take the recipient's address from the application's original offer and put it in "Adresse de l'entreprise".
- Owner answers in chat (2026-11-09):
  - the page first, then the offer's text;
  - fill only "Adresse de l'entreprise";
  - only when the letter is created;
  - an empty field, with no message, when nothing is found.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
