# PRD: Resume Rendering Unification — Part 2, Exports and Parity (Milestone C)

**Status:** DRAFT

**Depends on:** `tasks/prds/milestone-c-part-1-layout-state.md`. Every story
here assumes a persisted, typed layout model exists and is authoritative. None
of them can start before Part 1 is complete.

**Story numbering:** restarted at `US-001` so this document is a self-contained
Ralph contract. The mapping to the original eight-story draft is:

| Here | Originally |
|---|---|
| US-001 | US-005 — exports read the persisted model |
| US-002 | US-006 — Editor and Preview share one state owner |
| US-003 to US-007 | US-007 — DOCX stops reimplementing template layout, now split one story per template |
| US-008 | US-008 — parity across the three surfaces |

The DOCX work was one story until 2026-09-10. It required "each template
converted in its own commit", which contradicts CLAUDE.md §7 and §16 — one
user story is exactly one commit — so it could not be executed as written.
Splitting it per template preserves the attributability that criterion existed
for, without breaking the one-story-one-commit rule.

## Objective

Make the export and editing surfaces consume the canonical layout model
established in Part 1, so that no surface reimplements or re-transports resume
layout.

## Context / Current Behavior

Part 1 establishes one typed layout model, persisted server-side, with
localStorage demoted to a cache. That removes the *reason* the remaining
divergences exist, but does not remove the divergences themselves.

Three remain after Part 1 lands:

**Exports still receive layout over the wire.**
`src/components/dashboard/download-button.tsx` reads localStorage and packs 14
query parameters onto the DOCX request; `download-docx/route.ts` reads them back
out of `searchParams`. This exists only because the server could not previously
read the user's settings. Once it can, the parameters are redundant — and
`.claude/rules/resumes.md` forbids URL parameters as a canonical layout source.

**Editor and Preview hold parallel state.** `resume-editor.tsx` (1,796 lines)
and `resume-preview-wrapper.tsx` each declare their own `useState` for layout
properties. Part 1 gives them a shared model to read; it does not by itself make
one of them the owner.

**DOCX reimplements the templates.** Five generators totalling ~6,500 lines
(`docx-professional.ts`, `docx-modern.ts`, `docx-classic.ts`, `docx-minimal.ts`,
`docx-creative.ts`) reproduce layouts that the five React templates already
express. A template change requires a parallel edit in a second implementation,
and nothing enforces that the second edit happens. This is the largest
divergence risk remaining in the product.

For contrast, PDF is not in that list: it is `window.print()` over the same
React templates, with no library, so it shares the templates' source of truth by
construction. Part 1 puts the print path under visual regression; this document
does not change how PDF is produced.

## Scope

- DOCX export deriving layout from the persisted model.
- Removal of the 14 layout query parameters and their client-side assembly.
- One state owner for layout across Editor and Live Preview.
- Reducing the DOCX generators' duplication of template layout, one template at
  a time.
- A repeatable parity check across Preview, PDF and DOCX from one fixture.

## Out of Scope

- Any change to how a resume *looks*. This part changes where surfaces read
  layout from, not what they render. Visual output is the invariant.
- Migrating PDF off `window.print()`.
- Moving the photo out of localStorage — decided against; see Resolved
  Decisions.
- New layout capabilities, new templates, or removing existing ones.
- Cover letter rendering and its separate template and export path.
- Rewriting the DOCX generators wholesale. The goal is removing duplicated
  layout decisions, not a new document engine.

## Impact Assessment

- **Frontend / UI:** Affected — the editor and preview wrapper change state
  ownership; the download buttons lose their parameter assembly.
- **Internationalization:** Not affected — layout state carries no user-facing
  copy; locale continues to reach templates and generators as it does today.
- **Resume model / templates:** Affected — the generators consume shared layout
  rather than their own constants. React template rendering must not change.
- **Exports:** Affected — this is the subject of US-001 and US-003 to US-007.
- **Database / persistence:** Not affected — Part 1 owns the schema change.
  This part only reads what Part 1 persists.
- **Security / authorization:** Affected — US-001 removes a client-supplied
  input surface from the export route. The photo remains client-supplied and
  must continue to be treated as untrusted.
- **Testing / validation:** Affected — export artifacts and cross-surface
  parity are the primary evidence here.

## User Stories

### US-001: Exports read the persisted model

**Description:**
As a user, I want my DOCX to match what I see, without the browser having to
describe my layout to the server.

**Acceptance Criteria:**

- [ ] `download-docx/route.ts` derives layout from the resume record.
- [ ] The 14 layout query parameters and their client-side assembly in
      `download-button.tsx` and `download-resume-buttons.tsx` are removed.
- [ ] A generated DOCX reflects layout settings saved on a different device,
      evidenced end to end rather than by unit test.
- [ ] Export output is validated as a generated artifact and its content, not
      by a successful HTTP response.
- [ ] The photo **remains in localStorage** (decided 2026-09-07) and travels in
      the DOCX request body as before. This is documented in code as a named
      exception, not left to be inferred.
- [ ] The exception is scoped to the photo alone. No other layout property may
      use the request body as a transport.
- [ ] The photo remains treated as untrusted input: size and type are bounded
      before it reaches document generation.

### US-002: Editor and Preview share one state owner

**Description:**
As a developer, I want one component to own layout state, so that the editor
and the preview cannot disagree about it.

**Acceptance Criteria:**

- [ ] Layout state is owned in one place and consumed by both surfaces.
- [ ] The duplicated `useState` declarations in `resume-editor.tsx` and
      `resume-preview-wrapper.tsx` no longer both hold authoritative copies.
- [ ] Editing a layout control updates the Live Preview with no additional
      synchronisation code.
- [ ] The editor's existing save, draft and unsaved-changes behaviour is
      unchanged, evidenced by browser interaction rather than by inspection.
- [ ] `pnpm test:visual` passes unchanged — screen and print.

### US-003 to US-007: DOCX stops reimplementing template layout

These five stories are one piece of work, split one story per template.

The split is not stylistic. An earlier draft made this a single story whose
acceptance criteria required "each template converted in its own commit" —
which contradicted CLAUDE.md §7 and §16, where one user story is exactly one
commit, and `run-ralph-story` creates exactly one and stops. The story was
unexecutable as written. Splitting preserves what that criterion was *for*:
a regression stays attributable to one template's conversion rather than to a
five-template change.

**Order is deliberate.** `professional` first: it is the template whose layout
state Part 1 touched most, so the shared model is best understood there.
`creative` last: it is the largest at 1,141 lines and the only template where
`print:hidden` coverage actually reaches the rendered document, so a mistake
there is both likelier and more visible.

Each of the five carries the same acceptance criteria, scoped to its own
template and its own generator file.

| Story | Template | Generator |
|---|---|---|
| US-003 | professional | `docx-professional.ts` |
| US-004 | modern | `docx-modern.ts` |
| US-005 | classic | `docx-classic.ts` |
| US-006 | minimal | `docx-minimal.ts` |
| US-007 | creative | `docx-creative.ts` |

### US-003: The professional DOCX derives its layout from the shared model

**Description:**
As a developer, I want `docx-professional.ts` to consume the shared layout
description, so that a change to the professional template does not require a
parallel edit in a second implementation.

**Acceptance Criteria:**

- [ ] Section order, visibility and typography scaling for **professional**
      derive from the shared model rather than from per-generator logic.
- [ ] Duplicated layout constants are removed from `docx-professional.ts` in
      favour of the shared defaults established in Part 1.
- [ ] Format-specific rendering remains permitted; semantic content, section
      order, visibility, typography intent and colour are preserved to the
      degree DOCX supports them, per `.claude/rules/exports.md`.
- [ ] The professional DOCX is validated as a generated artifact and its
      content, never an HTTP 200.
- [ ] A fidelity limitation discovered during conversion is recorded as an
      explicit finding, never accepted silently as a PASS.
- [ ] **The other four templates' DOCX output is unchanged**, evidenced rather
      than assumed.

### US-004: The modern DOCX derives its layout from the shared model

**Description:**
As a developer, I want `docx-modern.ts` to consume the shared layout
description, so that a change to the modern template does not require a
parallel edit in a second implementation.

**Acceptance Criteria:**

- [ ] Section order, visibility and typography scaling for **modern** derive
      from the shared model rather than from per-generator logic.
- [ ] Duplicated layout constants are removed from `docx-modern.ts` in favour
      of the shared defaults established in Part 1.
- [ ] Format-specific rendering remains permitted; semantic content, section
      order, visibility, typography intent and colour are preserved to the
      degree DOCX supports them, per `.claude/rules/exports.md`.
- [ ] The modern DOCX is validated as a generated artifact and its content,
      never an HTTP 200.
- [ ] A fidelity limitation discovered during conversion is recorded as an
      explicit finding, never accepted silently as a PASS.
- [ ] **The other four templates' DOCX output is unchanged**, evidenced rather
      than assumed.

### US-005: The classic DOCX derives its layout from the shared model

**Description:**
As a developer, I want `docx-classic.ts` to consume the shared layout
description, so that a change to the classic template does not require a
parallel edit in a second implementation.

**Acceptance Criteria:**

- [ ] Section order, visibility and typography scaling for **classic** derive
      from the shared model rather than from per-generator logic.
- [ ] Duplicated layout constants are removed from `docx-classic.ts` in favour
      of the shared defaults established in Part 1.
- [ ] Format-specific rendering remains permitted; semantic content, section
      order, visibility, typography intent and colour are preserved to the
      degree DOCX supports them, per `.claude/rules/exports.md`.
- [ ] The classic DOCX is validated as a generated artifact and its content,
      never an HTTP 200.
- [ ] A fidelity limitation discovered during conversion is recorded as an
      explicit finding, never accepted silently as a PASS.
- [ ] **The other four templates' DOCX output is unchanged**, evidenced rather
      than assumed.

### US-006: The minimal DOCX derives its layout from the shared model

**Description:**
As a developer, I want `docx-minimal.ts` to consume the shared layout
description, so that a change to the minimal template does not require a
parallel edit in a second implementation.

**Acceptance Criteria:**

- [ ] Section order, visibility and typography scaling for **minimal** derive
      from the shared model rather than from per-generator logic.
- [ ] Duplicated layout constants are removed from `docx-minimal.ts` in favour
      of the shared defaults established in Part 1.
- [ ] Format-specific rendering remains permitted; semantic content, section
      order, visibility, typography intent and colour are preserved to the
      degree DOCX supports them, per `.claude/rules/exports.md`.
- [ ] The minimal DOCX is validated as a generated artifact and its content,
      never an HTTP 200.
- [ ] A fidelity limitation discovered during conversion is recorded as an
      explicit finding, never accepted silently as a PASS.
- [ ] **The other four templates' DOCX output is unchanged**, evidenced rather
      than assumed.

### US-007: The creative DOCX derives its layout from the shared model

**Description:**
As a developer, I want `docx-creative.ts` to consume the shared layout
description, so that a change to the creative template does not require a
parallel edit in a second implementation.

**Acceptance Criteria:**

- [ ] Section order, visibility and typography scaling for **creative** derive
      from the shared model rather than from per-generator logic.
- [ ] Duplicated layout constants are removed from `docx-creative.ts` in favour
      of the shared defaults established in Part 1.
- [ ] Format-specific rendering remains permitted; semantic content, section
      order, visibility, typography intent and colour are preserved to the
      degree DOCX supports them, per `.claude/rules/exports.md`.
- [ ] The creative DOCX is validated as a generated artifact and its content,
      never an HTTP 200.
- [ ] A fidelity limitation discovered during conversion is recorded as an
      explicit finding, never accepted silently as a PASS.
- [ ] **The other four templates' DOCX output is unchanged**, evidenced rather
      than assumed.

### US-008: Parity across the three surfaces is demonstrated

**Description:**
As a maintainer, I want one fixture proven to render consistently to Preview,
PDF and DOCX, so that "unified" is evidenced rather than asserted.

**Acceptance Criteria:**

- [ ] One fixture resume, carrying **non-default** layout settings, renders to
      all three surfaces under test. Default settings would not prove the
      layout model is being read.
- [ ] Section order and visibility match across all three surfaces.
- [ ] Typography intent and colour match to the degree each format supports,
      with any format limitation recorded as an explicit finding rather than
      accepted silently.
- [ ] The comparison runs as a repeatable command and its output is legible
      enough to identify which surface diverged.
- [ ] The check covers all five templates.

## Functional Requirements

- **FR-1:** No surface may hold an independent authoritative copy of resume
  layout state; all read the model Part 1 persists.
- **FR-2:** URL parameters must not carry canonical layout state.
- **FR-3:** The photo is the single named exception to FR-1 and FR-2, travelling
  in the DOCX request body because it remains browser-local by decision.
- **FR-4:** Export code must not invent content, ordering, visibility or styling
  defaults where canonical state exists.
- **FR-5:** Rendered output must not change except where a story explicitly
  requires it; visual baselines and export artifacts are the contract.
- **FR-6:** Template isolation holds — a change for one template must not alter
  another through shared defaults or fallbacks.
- **FR-7:** Client-supplied input reaching document generation remains
  untrusted and bounded.

## Regression Constraints

- The five template identifiers remain `modern`, `classic`, `minimal`,
  `creative`, `professional`.
- A resume whose layout settings are untouched exports identically to before,
  in both DOCX and PDF.
- PDF continues to work via `window.print()`.
- The editor's save, draft-recovery and unsaved-changes behaviours are
  unchanged.
- The Preview's editing controls continue to function and remain excluded from
  visual captures.
- Existing saved resumes remain loadable and exportable; no resume becomes
  unopenable.
- Locale routing and translated template labels are unchanged.
- `pnpm lint` does not exceed its 311-problem baseline.

## Required Verification

- `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`,
  `pnpm build` on every story.
- `pnpm test:visual` — screen **and** print — on every story that touches
  rendering, layout state, or template code.
- Baseline changes require an explicit approval decision per
  `docs/engineering/visual-regression.md`. A baseline updated to make a run
  green without an understood cause is a FAIL.
- `export-validation` for US-001, US-003 to US-007, and US-008: a generated
  DOCX inspected for content and fidelity, never an HTTP 200.
- `security-review` for US-001: removal of the query-parameter input surface,
  and the bounds on the remaining photo input.
- `ui-expert` for US-002 with rendered evidence per its contract.
- `code-reviewer` on every story.

## FAIL Conditions

- Rendered or exported output changes without a story requiring it.
- A visual baseline is updated to absorb an unexplained diff.
- A visual threshold is widened rather than the nondeterminism being found.
- Layout state is read from URL parameters after US-001.
- Any surface retains an independent authoritative copy of layout state at the
  end of the story that claimed to remove it.
- DOCX silently omits, reorders or rewrites supported content while claiming
  Preview parity.
- A template's output changes as a side effect of converting another template.
- A fidelity limitation is accepted as a PASS rather than recorded as a finding.
- More than one DOCX template is converted in a single story or commit, making
  a defect unattributable. The five stories exist for this; collapsing them
  defeats the split.

## BLOCKER Conditions

- Part 1 is not complete, or the persisted layout model is not yet
  authoritative.
- Export artifact validation cannot be performed, leaving US-001 and the DOCX
  stories unevidenced.
- A template's layout proves not expressible through the shared model without
  changing its rendered output — that is a design question for a revised PRD,
  not something to resolve by widening a tolerance.

## Risks

- **The DOCX conversion is the largest piece of work in the milestone.** ~6,500
  lines across five generators, now US-003 to US-007 at roughly 1,000–1,600
  lines each. One story per template exists so that a regression is
  attributable to one conversion; the risk it does not remove is that five
  sequential stories touching one shared model can each pass while the model
  drifts underneath them. US-008's parity check is the backstop for that, which
  is why it runs last rather than first.
- **DOCX cannot express everything CSS can.** Some fidelity gaps are inherent
  rather than defects. The risk is that an inherent gap gets recorded as
  "matches" to keep a story green; the FAIL condition above exists for that.
- **The photo stays browser-local by decision**, so it does not follow the user
  to another device and is destroyed by clearing browser data. Accepted and
  documented, but it should be surfaced to users somewhere — this PRD does not
  cover doing so.
- **US-002 touches a 1,796-line component.** State-ownership changes there risk
  disturbing draft recovery and unsaved-change handling, which are not layout
  concerns but share the same file.

## Evidence / References

- `src/components/dashboard/download-button.tsx` — 14 `queryParams.set` calls;
  `window.print()` at line 104; the photo read from localStorage.
- `src/components/dashboard/download-resume-buttons.tsx` — the same assembly,
  duplicated.
- `src/app/api/resumes/[id]/download-docx/route.ts` — the `searchParams` read
  and the POST body photo path.
- `src/app/api/resumes/[id]/download-docx/docx-*.ts` — ~6,500 lines of
  generators.
- `src/components/dashboard/resume-editor.tsx` — 1,796 lines; parallel layout
  state.
- `src/components/dashboard/resume-preview-wrapper.tsx` — the other copy.
- `e2e/visual/resume-templates.spec.ts`, `playwright.visual.config.ts` — the
  baselines guarding this work.
- `docs/engineering/visual-regression.md` — baseline approval rules.
- `.claude/rules/exports.md`, `.claude/rules/resumes.md`, `CLAUDE.md` §10.

## Resolved Decisions

- **The photo stays in localStorage** (owner, 2026-09-07), as a named exception
  to FR-1 and FR-3. Its consequence is stated in US-001 rather than left to be
  discovered: the DOCX route continues to receive it as base64 in the request
  body, and that is the one respect in which the server still cannot render a
  resume unaided.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
