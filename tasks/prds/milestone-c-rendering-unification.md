# PRD: Resume Rendering Unification (Milestone C)

**Status:** DRAFT

## Objective

Make one persisted, typed layout model the single source of truth for how a
resume renders, so that the Editor, Live Preview, Preview, PDF and DOCX all
derive from it rather than from four competing stores.

## Context / Current Behavior

`CLAUDE.md` §10 requires one canonical source of truth for shared resume state,
and `.claude/rules/resumes.md` forbids URL parameters and localStorage as
canonical layout sources. Neither holds today. What follows was established by
reading the code, not from memory.

### Four competing stores

| Store | Holds | Authority |
|---|---|---|
| Supabase `custom_sections.layoutSettings` | `sidebarOrder`, `mainContentOrder`, `hiddenSidebarSections`, `hiddenMainSections` — four fields, all of them order/visibility | persisted, server-readable |
| `localStorage` key `resume_slider_settings_${id}` | typography, colour, margins, sidebar width, **and the same four fields** | **overrides Supabase** |
| URL query parameters | all of the above, 14 of them | what the DOCX generator actually renders from |
| React `useState` | ~20 in `resume-preview-wrapper.tsx`; independently again in `resume-editor.tsx` | what the user sees on screen |

The overlap is explicit, not accidental. `resume-preview-wrapper.tsx:78` reads
the Supabase settings and then deliberately lets localStorage win, under the
comment *"localStorage settings override Supabase values (supports local
customization)"*. Four fields therefore have two homes and a precedence rule
that only exists in that one component.

### What is never persisted

`ResumeLayoutSettings` (`src/types/database.ts:126`) contains exactly four
fields. Typography (`fontFamily`, `fontScale`), colour (`sidebarHue`,
`sidebarSaturation`, `sidebarBrightness`), spacing (`sidebarTopMargin`,
`mainContentTopMargin`), `sidebarWidth`, and the photo all live **only** in
localStorage. Three consequences, all user-visible:

1. The same resume renders differently on a second device.
2. Clearing browser data destroys the customization silently.
3. **The server cannot render the user's actual resume.**

Consequence 3 is why `download-button.tsx` reads localStorage and packs 14
query parameters onto the DOCX request, which `download-docx/route.ts` reads
back out of `searchParams`. That is the rule violation in
`.claude/rules/resumes.md`, and it is a symptom rather than a cause: with the
settings unavailable server-side, there was no other way to export them.

This is pre-existing debt. It is described here as a starting condition, not as
a fault to be attributed.

### Three rendering implementations

| Surface | Implementation |
|---|---|
| Preview, Live Preview | Five React templates in `src/components/dashboard/resume-templates/` |
| PDF | The **print stylesheet** of those same templates — `window.print()`, no library. `html2pdf.js` and `jspdf` exist in the dependency tree but serve cover letters; `pdf-parse` reads uploaded files |
| DOCX | Five generators totalling ~6,500 lines, reimplementing the same five layouts programmatically |

PDF sharing the templates is a strength worth preserving. DOCX not sharing them
is the largest single source of divergence risk in the product.

### Test coverage as it stands

`pnpm test:visual` (PR #38) compares the five templates against committed
baselines. It captures **screen media only**. The print path — every PDF the
product produces — has no automated coverage of any kind.

## Scope

- A single typed layout model covering every layout property that affects
  rendering, with one set of defaults.
- Server-side persistence of that model, with localStorage demoted to a cache.
- A one-time migration of existing localStorage settings into that store.
- Exports (DOCX) reading the persisted model rather than URL parameters.
- Editor and Preview sharing one state owner.
- Reducing the DOCX generators' duplication of template layout.
- Automated visual coverage of the print path.
- Parity validation across Preview, PDF and DOCX from one fixture.

## Out of Scope

- Any change to how a resume *looks*. This milestone changes where layout state
  lives, not what it renders to. Visual output is the invariant.
- New layout capabilities, new templates, or removing existing ones.
- Cover letter rendering and its separate template.
- The AI tools, the job-application surfaces, and the dashboard.
- Redesigning the editor's UI.
- Migrating the PDF path off `window.print()`.

## Impact Assessment

- **Frontend / UI:** Affected — the editor, the preview wrapper, and all five
  templates consume layout state.
- **Internationalization:** Not affected — layout state carries no user-facing
  copy. Locale continues to reach templates as it does today.
- **Resume model / templates:** Affected — this is the milestone's subject.
- **Exports:** Affected — DOCX changes its input source; PDF changes only
  insofar as the print stylesheet is touched.
- **Database / persistence:** Affected — the persisted layout shape widens, via
  migration.
- **Security / authorization:** Affected — a widened `custom_sections` payload
  is user-controlled input written to the database and read back into
  rendering. RLS and ownership are unchanged in principle but must be
  re-evidenced.
- **Testing / validation:** Affected — print coverage is new; visual baselines
  are the primary regression evidence throughout.

## User Stories

### US-001: The print path is covered before any rendering changes

**Description:**
As a maintainer, I want the PDF output under visual regression before layout
code is touched, so that a print-only regression cannot pass unseen.

**Acceptance Criteria:**

- [ ] `pnpm test:visual` captures each of the five templates under emulated
      print media in addition to screen media.
- [ ] Print baselines are committed and are visibly distinct from the screen
      baselines where the print stylesheet differs (`print:hidden`,
      `print:shadow-none`, `print:p-8`).
- [ ] The suite is proven to detect a print-only change: a mutation to a
      `print:` utility fails the print baseline while the screen baseline
      passes. The mutation is reverted.
- [ ] The truncation guard in `e2e/visual/resume-templates.spec.ts` applies to
      print captures as it does to screen captures.
- [ ] No production code changes beyond what capture requires.

### US-002: One typed layout model with one set of defaults

**Description:**
As a developer, I want every layout property defined once with one default, so
that four copies of the same default cannot drift apart.

**Acceptance Criteria:**

- [ ] A single exported type describes every layout property currently held in
      `resume_slider_settings_*`, `ResumeLayoutSettings`, and the DOCX query
      parameters.
- [ ] One exported constant provides the defaults; `resume-preview-wrapper.tsx`,
      `resume-editor.tsx`, `download-docx/route.ts` and each generator consume
      it rather than declaring their own.
- [ ] Parsing and serialization of the model exist in one module with unit
      tests, including malformed and partial input.
- [ ] Every current default value is preserved exactly. Any divergence found
      between the existing four copies is reported as a finding and resolved
      explicitly, not silently.
- [ ] `pnpm test:visual` passes unchanged — screen and print.

### US-003: Layout settings persist to the account, not the browser

**Description:**
As a user, I want my typography, colour and spacing choices to follow my
account, so that my resume looks the same on another device.

**Acceptance Criteria:**

- [ ] The full layout model persists server-side via a version-controlled
      migration.
- [ ] Settings saved on one browser session are present on a different session
      for the same user, evidenced by an E2E test that saves in one context and
      reads in another.
- [ ] localStorage is a cache: it may serve a fast first paint, but the
      persisted value is authoritative on conflict, and the precedence is
      stated in one place.
- [ ] RLS evidence covers the widened payload: `OWNER_B` cannot read or write
      `OWNER_A`'s layout settings.
- [ ] Malformed or oversized persisted settings degrade to defaults rather than
      failing the render.
- [ ] `pnpm test:visual` passes unchanged — screen and print.

### US-004: Existing local customization survives the move

**Description:**
As an existing user with settings in my browser, I want them preserved when
persistence ships, so that my resume does not silently revert.

**Acceptance Criteria:**

- [ ] On first load after deploy, existing `resume_slider_settings_${id}` values
      are read and written to the persisted store for that resume.
- [ ] The migration runs once per resume and is idempotent.
- [ ] A resume with no local settings is unaffected — no defaults are written
      over an intentional server-side value.
- [ ] A resume with *both* local settings and persisted settings resolves by a
      single stated rule, and that rule is tested.
- [ ] The migration is evidenced by a test that seeds localStorage, loads the
      resume, and asserts the persisted result.

### US-005: Exports read the persisted model

**Description:**
As a user, I want my DOCX to match what I see, without the browser having to
describe my layout to the server.

**Acceptance Criteria:**

- [ ] `download-docx/route.ts` derives layout from the resume record.
- [ ] The 14 layout query parameters and their client-side assembly in
      `download-button.tsx` and `download-resume-buttons.tsx` are removed.
- [ ] A generated DOCX reflects layout settings saved on a different device.
- [ ] Export output is validated as a generated artifact, not by a successful
      HTTP response.
- [ ] The photo path is resolved explicitly: either persisted like other layout
      state, or documented as a deliberate exception with its reason.

### US-006: Editor and Preview share one state owner

**Description:**
As a developer, I want one component to own layout state, so that the editor
and the preview cannot disagree about it.

**Acceptance Criteria:**

- [ ] Layout state is owned in one place and consumed by both surfaces.
- [ ] The duplicated `useState` declarations in `resume-editor.tsx` and
      `resume-preview-wrapper.tsx` no longer both hold authoritative copies.
- [ ] Editing a layout control updates the Live Preview with no additional
      synchronisation code.
- [ ] `pnpm test:visual` passes unchanged — screen and print.

### US-007: DOCX stops reimplementing template layout

**Description:**
As a developer, I want the DOCX generators to consume a shared description of
each template's layout, so that a template change does not require a parallel
edit in a second implementation.

**Acceptance Criteria:**

- [ ] Section order, visibility and typography scaling derive from the shared
      model rather than from per-generator logic.
- [ ] Duplicated layout constants are removed from the generators in favour of
      the shared defaults.
- [ ] Each template is converted independently, with export evidence per
      template, so a defect is attributable to one conversion.
- [ ] Format-specific rendering remains permitted; semantic content, order,
      visibility and typography intent are preserved per
      `.claude/rules/exports.md`.
- [ ] Every converted template's DOCX is validated as a generated artifact.

### US-008: Parity across the three surfaces is demonstrated

**Description:**
As a maintainer, I want one fixture proven to render consistently to Preview,
PDF and DOCX, so that "unified" is evidenced rather than asserted.

**Acceptance Criteria:**

- [ ] One fixture resume, with non-default layout settings, renders to all
      three surfaces under test.
- [ ] Section order and visibility match across all three.
- [ ] Typography intent and colour match to the degree each format supports,
      with any format limitation recorded as an explicit finding rather than
      accepted silently.
- [ ] The comparison runs as a repeatable command.

## Functional Requirements

- **FR-1:** One typed model is the single source of truth for resume layout
  state; no surface may hold an independent authoritative copy.
- **FR-2:** Layout state persists to the account and is readable server-side.
- **FR-3:** localStorage may cache layout state but must never be authoritative.
- **FR-4:** URL parameters must not carry canonical layout state.
- **FR-5:** Defaults are declared once and consumed everywhere.
- **FR-6:** Untrusted persisted state must be validated before it reaches
  rendering, and must degrade to defaults rather than failing.
- **FR-7:** Rendered output must not change except where a story explicitly
  requires it; visual baselines are the contract.
- **FR-8:** Template isolation holds — a change for one template must not alter
  another through shared defaults or fallbacks.

## Regression Constraints

- The five template identifiers remain `modern`, `classic`, `minimal`,
  `creative`, `professional`.
- Existing resume content, section order and visibility render identically for
  a resume whose settings are untouched.
- Existing saved resumes remain loadable; no resume becomes unopenable.
- The Preview's editing controls continue to function and remain excluded from
  visual captures.
- PDF continues to work via `window.print()`.
- The `custom_sections` legacy shapes handled by `embedLayoutSettings` (null,
  array, wrapped object) continue to be handled.
- Locale routing and translated template labels are unchanged.
- `pnpm lint` does not exceed its 311-problem baseline.

## Required Verification

- `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`,
  `pnpm build` on every story.
- `pnpm test:visual` — screen **and** print — on every story that touches
  rendering, layout state, or template code.
- Baseline changes require an explicit approval decision per
  `docs/engineering/visual-regression.md`; a baseline updated to make a run
  green without an understood cause is a FAIL.
- `database-migration` evidence for US-003, including forward migration against
  a non-production database.
- `security-review` for US-003 and US-005: widened user-controlled payload,
  ownership, and the removal of the export parameter surface.
- `export-validation` for US-005 and US-007: a generated DOCX inspected for
  content and fidelity, not an HTTP 200.
- `ui-expert` for US-006 with rendered evidence per its contract.
- `code-reviewer` on every story.

## FAIL Conditions

- Rendered output changes without a story requiring it.
- A visual baseline is updated to absorb an unexplained diff.
- A visual threshold is widened rather than the nondeterminism being found.
- Any surface retains an independent authoritative copy of layout state at the
  end of the story that claimed to remove it.
- Existing user customization is lost by the persistence change.
- A template's rendering changes as a side effect of work on another template.
- DOCX or PDF silently omits, reorders or rewrites supported content while
  claiming Preview parity.
- Layout state is read from URL parameters after US-005.

## BLOCKER Conditions

- The precedence rule for a resume holding both local and persisted settings
  cannot be decided from this PRD (see Open Questions).
- The photo's storage destination is undecided at US-005.
- Print-media capture proves infeasible in the harness, leaving US-001
  unsatisfiable — the remaining stories must not proceed on screen coverage
  alone.
- A required migration cannot be validated against a non-production database.
- Linux visual baselines are needed for CI promotion and do not exist; this
  blocks CI promotion only, not local verification.

## Risks

- **Silent data loss at US-003/US-004.** Real users hold settings in
  localStorage now. Shipping persistence without the migration destroys them on
  the day it deploys, with no error and no obvious cause. This is the single
  highest risk in the milestone.
- **Baselines absorbing regressions.** Eight stories all gated by the same
  screenshots creates sustained pressure to update a baseline rather than
  explain a diff. The approval rule exists for this; it will be tested.
- **US-007 is large.** ~6,500 lines across five generators. Converting all five
  in one story would make any defect unattributable.
- **Photo as base64 in localStorage** may be large; moving it to persistence has
  storage and payload implications not yet measured.
- **The professional template's justified sidebar headings** are a known
  pre-existing defect with a fix in flight. Sequencing must avoid two changes
  to that template's baseline colliding.

## Evidence / References

- `src/types/database.ts:126` — `ResumeLayoutSettings`, four fields.
- `src/lib/layout-settings.ts` — `extractLayoutSettings`, `embedLayoutSettings`,
  `migrateSidebarOrder`, `mapEditorOrderToModern`.
- `src/components/dashboard/resume-preview-wrapper.tsx:78` — the localStorage
  override, with the comment stating it.
- `src/components/dashboard/resume-editor.tsx` — 1,796 lines; the parallel state
  and six localStorage key families.
- `src/components/dashboard/download-button.tsx` — 14 `queryParams.set` calls;
  `window.print()` at line 104.
- `src/app/api/resumes/[id]/download-docx/route.ts` — the `searchParams` read.
- `src/app/api/resumes/[id]/download-docx/docx-*.ts` — ~6,500 lines of
  generators.
- `e2e/visual/resume-templates.spec.ts`, `playwright.visual.config.ts` — the
  screen-only baselines this milestone must extend.
- `docs/engineering/visual-regression.md` — baseline approval rules, thresholds,
  truncation guard.
- `.claude/rules/resumes.md`, `.claude/rules/exports.md`, `CLAUDE.md` §10.

## Open Questions

1. **Precedence when a resume has both local and persisted settings.** Newest
   wins requires a timestamp that localStorage does not currently carry.
   Persisted wins is simplest but discards local edits made while offline.
   Local wins reproduces today's bug. **Blocking for US-003 and US-004.**
2. **Where does the photo belong?** Persisted with layout state, moved to
   Supabase Storage, or left in localStorage as a documented exception.
   **Blocking for US-005.**

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
