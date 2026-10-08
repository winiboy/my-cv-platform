# PRD: Retire the legacy /[locale]/resumes/* routes

**Status:** APPROVED 2026-10-08

## Objective

The unlinked legacy resume routes under `/[locale]/resumes/*` are removed. Each
old URL permanently redirects to its live `/[locale]/dashboard/...` equivalent,
and the code and translation keys only those routes used are deleted.

## Context / Current Behavior

- **Two parallel trees.** `src/app/[locale]/(dashboard)/resumes/` mirrors the
  live `src/app/[locale]/(dashboard)/dashboard/resumes/`. Both were added in the
  initial commit 8895a31; `from-job` followed in 7ac2d66. Nothing in `src/`
  links to the legacy tree. Its own links already point to `/dashboard/...`.

  | Legacy route | File | Live equivalent | Visited by |
  |---|---|---|---|
  | `/[locale]/resumes` | `resumes/page.tsx` | `/[locale]/dashboard/resumes` | none |
  | `/[locale]/resumes/new` | `resumes/new/page.tsx` → `resume-creation-form.tsx` | `/[locale]/dashboard/resumes/new` | none |
  | `/[locale]/resumes/from-job` | `resumes/from-job/page.tsx` → `job-description-form.tsx` | `/[locale]/dashboard/jobs` (the job-to-CV flow now lives in its modal) | none |
  | `/[locale]/resumes/[id]/edit` | `resumes/[id]/edit/page.tsx` | `/[locale]/dashboard/resumes/[id]/edit` | `e2e/security-headers.spec.ts:194` |
  | `/[locale]/resumes/[id]/preview` | `resumes/[id]/preview/page.tsx` (uses `download-resume-buttons.tsx`) | `/[locale]/dashboard/resumes/[id]/preview` | `e2e/security-headers.spec.ts:197` |

- **Defects that would go with the tree.**
  - `job-description-form.tsx` labels both `professional` and `modern` as
    "Modern".
  - `resume-creation-form.tsx` has English-only template names.
  - Neither uses the shared `TemplatePicker` from #92.
- **No auth gate in middleware.** `src/middleware.ts` protects only
  `/dashboard`, so the legacy pages rely on their own `getUser` redirects.
- **No redirect mechanism today.** `next.config.js` has `headers()` but no
  `redirects()`.
- **Code used only by the legacy tree:**
  - `src/components/dashboard/resume-creation-form.tsx`;
  - `job-description-form.tsx`;
  - `download-resume-buttons.tsx`;
  - the locale keys `resumes.fromJob.*` in all 4 `common.json` files.
  `resume-preview-wrapper.tsx` stays, because the live preview client uses it.
- **Owner decision, 2026-10-06:** retire the whole legacy tree, with redirects.

## Scope

- Delete the five legacy `page.tsx` files and their now-empty folders.
- Add permanent redirects (308) in `next.config.js` `redirects()` for the four
  locales:
  - `/:locale/resumes` → `/:locale/dashboard/resumes`
  - `/:locale/resumes/new` → `/:locale/dashboard/resumes/new`
  - `/:locale/resumes/from-job` → `/:locale/dashboard/jobs`
  - `/:locale/resumes/:id/edit` → `/:locale/dashboard/resumes/:id/edit`
  - `/:locale/resumes/:id/preview` → `/:locale/dashboard/resumes/:id/preview`
- Delete `resume-creation-form.tsx`, `job-description-form.tsx` and
  `download-resume-buttons.tsx`, after a final grep confirms no importer.
- Remove `resumes.fromJob.*` from all four `common.json` files, after a grep
  confirms no reader.
- Retarget `e2e/security-headers.spec.ts:194/197` to the dashboard edit and
  preview pages, keeping every header assertion.
- Add an e2e that checks each redirect.

## Out of Scope

- The live `/dashboard/resumes/*` pages, their components, and any behaviour
  change on them.
- Middleware changes. Redirects go in `next.config.js`.
- Any other route clean-up (cover letters, tools…).
- Removing translation keys that the live pages still use (`resumes.new.*`,
  `resumes.errors.*`, …).

## Impact Assessment

- **Frontend / UI:** Affected. Routes and components removed. No visible change
  on live pages.
- **Internationalization:** Affected. `resumes.fromJob.*` removed in 4 locales,
  keeping parity across them.
- **Resume model / templates:** Not affected.
- **Exports:** Not affected. The live preview and downloads are unchanged.
- **Database / persistence:** Not affected.
- **Security / authorization:** Affected positively. Fewer routes that bypass the
  middleware's `/dashboard` gate. The security-header coverage moves to the live
  pages.
- **Testing / validation:** Affected. A redirect e2e is added and the
  security-headers spec is retargeted.

## User Stories

### US-001: Old resume URLs land on the live pages

**Description:**
As anyone holding an old `/[locale]/resumes/...` URL, I want to land on the live
dashboard page, so that bookmarks keep working while the duplicate code is gone.

**Acceptance Criteria:**

- [ ] For each of fr, en, de and it, requesting each of the five legacy paths
      answers 308 with a `Location` header equal to the live equivalent in the
      table above. `:id` is preserved. `from-job` goes to `/:locale/dashboard/jobs`.
- [ ] Following each redirect while signed in reaches the live page with HTTP
      200. While signed out, the middleware's existing login redirect applies.
- [ ] The five legacy `page.tsx` files and the three legacy-only components no
      longer exist. A grep of `src/` and `e2e/` finds no import of them.
- [ ] `resumes.fromJob` is absent from all four `common.json` files. The
      locale-parity tests pass, and a grep finds no code reading `fromJob`.
- [ ] `e2e/security-headers.spec.ts` visits
      `/en/dashboard/resumes/:id/edit` and `/preview`, with every header
      assertion unchanged, and passes.
- [ ] `pnpm build` lists no `/[locale]/resumes` route outside `/dashboard`.

## Functional Requirements

- **FR-1:** All redirects are permanent (308) and declared once in
  `next.config.js`. The locale segment is limited to `fr|en|de|it`.
- **FR-2:** No live page, component or translation key that a live page uses is
  modified.
- **FR-3:** Deletion is preceded by a recorded grep proving there is no other
  importer or reader.

## Regression Constraints

- `/[locale]/dashboard/resumes`, `/new`, `/[id]/edit` and `/[id]/preview`, and
  `/dashboard/jobs`, behave exactly as before.
- All existing e2e, visual and unit assertions pass. The only spec edited is
  `security-headers.spec.ts`, and only its two URLs change.

## Required Verification

- The `CLAUDE.md` §14 baseline (`pnpm build` route list recorded).
- A redirect e2e over 4 locales × 5 paths, checking status and `Location`.
- The retargeted security-headers e2e.
- The greps (imports, `fromJob`) recorded in `progress.txt`.
- `code-reviewer`. `ui-expert` is NOT_APPLICABLE unless a live page changes.

## FAIL Conditions

- Any legacy URL returning 404, 200 or a non-permanent redirect.
- Any live page or live translation key changed.
- A header assertion removed or weakened.

## BLOCKER Conditions

- A remaining importer or reader of a component or key planned for deletion
  turns up.
- Next.js `redirects()` cannot express the locale constraint. Report it before
  choosing another mechanism.

## Risks

- External bookmarks or emails may hold legacy URLs. The 308s cover them.
- Moving the security-headers check to the live preview changes which component
  tree that check covers. That is intended: it now covers what users see.

## Evidence / References

- `src/app/[locale]/(dashboard)/resumes/**`: the legacy tree.
- `src/components/dashboard/resume-creation-form.tsx`, `job-description-form.tsx`,
  `download-resume-buttons.tsx`.
- `src/middleware.ts:26-63`, `next.config.js:310-318`.
- `e2e/security-headers.spec.ts:194, 197`.
- `src/locales/*/common.json` → `resumes.fromJob`.
- `tasks/prds/job-cv-template-picker.md:31-34, 75-76`: first noted as unlinked.
- Owner decision, 2026-10-06: "Tout l'ancien arbre".

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
