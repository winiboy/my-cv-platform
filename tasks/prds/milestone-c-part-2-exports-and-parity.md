# PRD: Resume Rendering Unification — Part 2, Exports and Parity (Milestone C)

**Status:** APPROVED — owner, 2026-09-10. Amended and re-approved 2026-09-11,
2026-09-12, and three times on 2026-09-13; see Amendment History.

**Eight stories, six complete.** US-007 (consolidation) and US-008 (parity
demonstration) remain, and neither changes rendered output.

**Depends on:** `tasks/prds/milestone-c-part-1-layout-state.md`. Every story
here assumes a persisted, typed layout model exists and is authoritative. None
of them can start before Part 1 is complete.

**Story numbering:** restarted at `US-001` so this document is a self-contained
Ralph contract. The mapping to the original eight-story draft is:

| Here | Originally |
|---|---|
| US-001 | US-005 — exports read the persisted model |
| US-002 | US-006 — Editor and Preview share one state owner |
| US-003 to US-006 | US-007 — DOCX stops reimplementing template layout, split one story per template; creative later dropped |
| US-007, US-008 | US-008 — parity across the three surfaces, later split into consolidation and demonstration |

The DOCX work was one story until 2026-09-10. It required "each template
converted in its own commit", which contradicts CLAUDE.md §7 and §16 — one
user story is exactly one commit — so it could not be executed as written.
Splitting it per template preserves the attributability that criterion existed
for, without breaking the one-story-one-commit rule.

The parity story was split on 2026-09-13 for a related reason. It had
accumulated seventeen acceptance criteria as US-003 to US-006 deferred findings
into it, mixing consolidation that changes no rendered output with defect fixes
that must change it. Running both as one story would have produced a single
commit containing every fix. The consolidation became US-007, the
demonstration US-008, and the defects moved to
`tasks/prds/milestone-c-part-3-parity-defects.md`.

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
  layout from, not what they render. **Rendered output is the invariant, without
  exception** *(restored 2026-09-13, when US-007 was dropped — see Amendment
  History; the exception added on 2026-09-11 existed only for that story)*. No
  visual baseline moves anywhere in this PRD, and no export byte changes.
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
- **Exports:** Affected — this is the subject of US-001 and US-003 to US-006.
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

### US-003 to US-006: DOCX stops reimplementing template layout

These four stories are one piece of work, split one story per template.

The split is not stylistic. An earlier draft made this a single story whose
acceptance criteria required "each template converted in its own commit" —
which contradicted CLAUDE.md §7 and §16, where one user story is exactly one
commit, and `run-ralph-story` creates exactly one and stops. The story was
unexecutable as written. Splitting preserves what that criterion was *for*:
a regression stays attributable to one template's conversion rather than to a
four-template change.

**Order is deliberate.** `professional` first: it is the template whose layout
state Part 1 touched most, so the shared model is best understood there.

All four carry the same acceptance criteria, scoped to their own template and
generator file, and all four must leave output byte-identical.

| Story | Template | Generator | Output must |
|---|---|---|---|
| US-003 | professional | `docx-professional.ts` | stay byte-identical |
| US-004 | modern | `docx-modern.ts` | stay byte-identical |
| US-005 | classic | `docx-classic.ts` | stay byte-identical |
| US-006 | minimal | `docx-minimal.ts` | stay byte-identical |

**Creative was a fifth story and is not one any more** *(dropped 2026-09-13; see
Amendment History)*. It was re-scoped on 2026-09-11 into "the creative DOCX
implements section order and visibility", on the belief that its Preview
honoured them and its export did not. Verification before implementation found
the Preview does not honour them either — `CreativeTemplateProps` accepts no
order or visibility props at all — and that the two hardcoded sequences are
identical. There was no divergence to close, and implementing the export side
alone would have created one. The real defect it uncovered moved to Part 3.

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

### US-007: Shared vocabulary, helpers and mappings are consolidated

> **Split out of the original US-008 on 2026-09-13.** That story had grown from
> five criteria to seventeen as US-003 to US-006 deferred findings into it, and
> those findings were of two incompatible kinds: consolidation that changes no
> rendered output, and defect fixes that must change it. This story is the
> first kind. The second moved to Part 3 — see the note after US-009.

**Description:**
As a developer, I want the vocabulary, exhaustiveness helper and order mappings
to exist once rather than once per template, so that a change to the shared
layout model cannot leave one surface behind while the build stays green.

**Every criterion here is provable by byte-identical output.** That is the point
of separating them: this story can be verified by a hash, and the stories that
change rendered output cannot.

**Acceptance Criteria:**

- [ ] **The Modern section vocabulary has one definition, not three.**
      *(US-004 F-1.)* `modern-template.tsx:17-18` re-declares the section-id
      unions and `:23-24` the default orders, duplicating `ModernSidebarId` /
      `ModernMainId` in `src/lib/layout-settings.ts`. The template consumes the
      shared unions after this story.
- [ ] **The one-way type hole is closed, and the closure is proven by
      mutation.** *(US-004 F-1.)* US-004 established the asymmetry by running
      the mutation in both directions: widening the shared union fires six
      `TS2322` at the template props, while widening the template's own copy
      fires **nothing** — a section added to the Preview's vocabulary renders in
      the Preview, is invisible to the DOCX, and the build stays green. After
      this story, widening either definition must be a compile error,
      demonstrated the same way rather than argued.
- [ ] **The duplicated Modern default colours are resolved.** *(US-004 F-3.)*
      `docx-modern.ts:105-106` and `modern-template.tsx:23-24` hold the same two
      values differing only by the `#`. `route.ts:240` sets
      `hasCustomColors: true` unconditionally, so the generator branch consuming
      them is dead; retiring that branch deletes both constants and the
      duplication with them. Establish whether the flag should remain a constant
      before deleting anything behind it.
- [ ] **`assertExhaustiveSection` has one definition.** *(US-004 F-4.)* It is
      currently verbatim in four generators — `docx-professional.ts:142`,
      `docx-modern.ts:175`, `docx-classic.ts:130`, `docx-minimal.ts:147` — and
      will be a fifth if creative is ever converted. `docx-helpers.ts` is the home; it
      already exports the shared symbols these generators draw on.
- [ ] **The duplicated per-template order mappings are resolved.**
      *(US-006 F-3.)* `mapEditorOrderToClassic` and `mapEditorOrderToMinimal` in
      `src/lib/layout-settings.ts` are character-for-character the same rule.
      They were kept separate in US-006 only because merging would have edited a
      second generator's import inside a per-template story, which the
      one-template-per-commit FAIL condition forbids — a constraint that does
      not apply here. Also close US-005's F-6, still open:
      `mapEditorOrderToClassic` retains a `mapped.push(id as ClassicMainId)`
      cast that `mapEditorOrderToMinimal` proved unnecessary and that swallows a
      diagnostic the uncast version emits.
- [ ] **All five templates' DOCX output is byte-identical, evidenced.** This
      story touches every generator, so the per-story provenance argument used
      by US-003 and US-004, and the append-only argument that happened to rescue
      US-006, are both unavailable. Artifact comparison across five templates
      and two settings profiles, every zip entry, is the only acceptable
      evidence.
- [ ] **Visual baselines are unchanged.** The Modern template's props change
      type but not value; if a baseline moves, something in this story changed
      rendering and that is a FAIL, not a baseline to update.

### US-008: Parity across the three surfaces is demonstrated

> **Renumbered from US-008 on 2026-09-13**, keeping the original story's intent.
> Its acceptance criteria are unchanged apart from the last one, which now says
> what the check does with a divergence it finds: report it, not fix it.

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
- [ ] **A divergence the check finds is reported, not fixed.** Six are already
      known and belong to Part 3 (below); the check is expected to fail against
      them, and that expected failure is recorded rather than suppressed. If the
      check finds a **seventh**, it is a new finding and Part 3's scope is
      incomplete — say so rather than quietly widening a tolerance. This story
      changes no rendered output.

### The seven defects that moved to Part 3

Recorded here so this PRD stays a complete account of what its own stories
found, and so nothing is lost between documents. All are specified in
`tasks/prds/milestone-c-part-3-parity-defects.md`.

| # | Defect | Found by |
|---|---|---|
| 1 | The classic DOCX drops the skills and projects sections its Preview renders | US-005 F-1 |
| 2 | The minimal DOCX drops the same two sections | US-006 F-1 |
| 3 | `classic-template.tsx` honours neither section order nor visibility | US-005 F-2 |
| 4 | `minimal-template.tsx` honours neither, and places `projects` differently from classic | US-006 F-2 |
| 5 | Preview and DOCX disagree on the empty-main fallback (`\|\|` vs `.length > 0`) | US-004 F-2 |
| 6 | `fontScale` reaches only modern and professional; classic, minimal and creative receive none | US-005 F-4 |
| 7 | Creative's section controls are a silent no-op — the editor persists the change, neither surface renders it, and three of creative's sections have no id | US-007 preflight |

**Why they moved.** Every one requires changing rendered output, and this PRD
makes rendered output the invariant. Absorbing them would have left that rule
meaning nothing, and would have put two confirmed content-loss defects and
several Preview-rendering changes into single commits — precisely the
unattributability the one-template-per-story split exists to prevent.

The seventh is different in kind from the other six and is the reason US-007 was
dropped rather than re-scoped a second time. It is not a disagreement between
two surfaces: both agree, and both ignore the user. Fixing it needs a creative
section vocabulary that does not exist yet, which is a design task rather than a
conversion.

Nothing about the deferral downgrades them. **Two of the five templates are
silently dropping supported content today**, which `.claude/rules/exports.md`
prohibits outright, and that is stated at the top of the Part 3 PRD rather than
buried in its story list.

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
- `export-validation` for US-001, US-003 to US-006, and US-007: a generated
  DOCX inspected for content and fidelity, never an HTTP 200.
- **"The other four templates are unchanged" must be evidenced by artifact
  comparison from US-005 onward, not by provenance.** *(Added 2026-09-11.)*
  US-003 and US-004 could argue that criterion structurally: nothing imports the
  generator each of them modified, so the other four provably execute identical
  code. That argument is unavailable to US-005 and US-006, because each of them
  modifies a generator whose output the *next* story must then prove unchanged,
  and it is unavailable to US-007, which touches every generator at once. Each
  of the three must capture a before/after hash of all five
  templates' generated documents across a full and a hidden-sections settings
  profile, comparing every zip entry, with `docProps/core.xml` the only
  permitted exclusion — `Packer.toBuffer()` stamps wall-clock timestamps — and
  `word/document.xml` structurally protected against exclusion. The baseline
  must be captured from `git show HEAD:` rather than from a working tree that
  already carries the edit; US-003 nearly shipped a vacuous comparison that way.
- **An artifact-level DOCX spec must exist for the template a story converts.**
  *(Added 2026-09-11.)* `e2e/` currently has `docx-professional-layout.spec.ts`
  and `docx-modern-layout.spec.ts`; classic, minimal and creative have none, so
  each of US-005 and US-006 adds one for its own template as part of the story.
  For US-005 and US-006, whose output must not change, the spec cannot go red
  against unmodified code — its assertions must instead be shown to discriminate
  by mutating the generator one property at a time, as US-004 did.
- `security-review` for US-001: removal of the query-parameter input surface,
  and the bounds on the remaining photo input.
- `ui-expert` for US-002 with rendered evidence per its contract.
- `code-reviewer` on every story.

## FAIL Conditions

- Rendered or exported output changes at all. **No story in this PRD is exempt**
  *(the US-007 exemption was removed on 2026-09-13 when that story was dropped)*.
  Every remaining story is verifiable by byte-identical export and unchanged
  visual baselines, which is the strongest form this condition can take.
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
  lines across five generators, now US-003 to US-006 at roughly 1,000–1,600
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
- `e2e/docx-professional-layout.spec.ts`, `docx-modern-layout.spec.ts`,
  `docx-classic-layout.spec.ts`, `docx-minimal-layout.spec.ts` — one
  artifact-level DOCX spec per converted template, added by US-003 to US-006.
  Creative has none, because its story was dropped.
- `tasks/ralph/progress.txt`, the US-003 to US-006 sections — where the deferred
  findings were recorded, with the evidence for each.

## Resolved Decisions

- **The photo stays in localStorage** (owner, 2026-09-07), as a named exception
  to FR-1 and FR-3. Its consequence is stated in US-001 rather than left to be
  discovered: the DOCX route continues to receive it as base64 in the request
  body, and that is the one respect in which the server still cannot render a
  resume unaided.

## Amendment History

### 2026-09-13 (third) — US-007 dropped; the invariant restored

Approved by the owner after verification, before any code was written.

**The story's premise was false, and this document is where it became false.**
US-003's finding F-4 established that `docx-creative.ts` reads none of the four
order and visibility keys — true, and independently reconfirmed. F-4 then called
that *"a live Preview↔DOCX divergence"*, and the 2026-09-11 amendment carried
that phrase into US-007's re-scope **without the Preview half ever being
checked**.

It does not hold. `CreativeTemplateProps` accepts eleven props — `resume`,
`locale`, `dict`, and four font-size pairs — with no order or visibility among
them, no spread and no context read, and both call sites pass only those. The
Preview and the DOCX render the *same hardcoded sequence*: summary in the
header, then skills, languages, certifications on the left, then experience,
projects, education on the right. Creative is internally consistent. **There was
no divergence to close, and implementing the export side alone would have
created one** — which `.claude/rules/exports.md` forbids, since the rendered
Preview is the fidelity contract for exports.

Verification also found the story was not implementable as specified even in
principle. The editor's id vocabulary is
`['keyAchievements','skills','languages','training']` and
`['summary','experience','education']`. Creative's `certifications` and
`projects` have **no id at all**; `keyAchievements` and `training` mean nothing
in creative; and `summary` renders inside the gradient header rather than in
either column. "Creative honours `mainContentOrder`" is not unimplemented — it
is undefined, and defining it means a creative-specific vocabulary of the kind
modern has.

**What changed here.** US-007 is removed. The consolidation story becomes
US-007 and the parity demonstration US-008, so Part 2 is eight stories with two
remaining. Because creative was the only story that changed rendered output, its
removal lets two things be restored rather than merely narrowed: **Out of Scope
returns to an unqualified invariant**, and the first FAIL condition drops its
exemption. Every remaining story is verifiable by byte-identical export and
unchanged baselines, which is the strongest form that condition can take.

Earlier Amendment History entries name stories by the numbers they had when
written — the split entry below refers to US-008 and US-009, now US-007 and
US-008. They are left as written rather than retrofitted.

**What was real, and where it went.** A creative user *can* reorder and hide
sections: the editor's controls are not template-gated, and the change persists
to `layout_settings` through `toStoredLayout`. Nothing then renders differently
on either surface. That is a silent no-op affecting a control the user
deliberately operates — a genuine defect, just not the one US-007 described. It
became Part 3's US-005, where Preview changes and baseline movement are in
scope.

### 2026-09-13 (second) — US-008 split, and six defects moved to Part 3

Approved by the owner, who chose this shape over two alternatives after being
shown the trade-off.

**The problem.** US-008 had grown from five acceptance criteria to seventeen as
US-003 to US-006 each deferred findings into it. Those findings were of two
incompatible kinds. Consolidation — one vocabulary, one exhaustiveness helper,
one order mapping — changes no rendered output and is provable by a hash. Defect
fixes — two templates dropping content, two Previews ignoring order and
visibility, a font-scale gap on three templates, an empty-main fallback
disagreement — must change rendered output to be fixed at all.

Running them as one story would have produced a single commit containing every
fix, which is exactly the unattributability the one-template-per-story split
exists to prevent. It would also have required widening this PRD's Out of Scope
six more times, after it had already been carved out once for US-007, until
"rendered output is the invariant" meant nothing.

**The split.** US-008 becomes two stories, neither of which changes rendered
output:

- **US-008** — the consolidation, verifiable by byte-identical output across all
  five templates.
- **US-009** — the parity demonstration, unchanged in intent, with one criterion
  added: a divergence the check finds is **reported, not fixed**. The six known
  ones are expected failures, recorded rather than suppressed; a seventh would
  mean Part 3's scope is incomplete.

The six defects move to `tasks/prds/milestone-c-part-3-parity-defects.md`,
drafted alongside this amendment and awaiting approval. They are also tabulated
above, after US-009, so this PRD remains a complete account of what its own
stories found.

**What this does not mean.** The deferral is about where the work is specified,
not how urgent it is. Two of five templates silently drop supported content
today, which `.claude/rules/exports.md` prohibits outright. That is stated at
the top of the Part 3 PRD rather than buried in a story list.

**What it buys.** Part 2 becomes finishable in three stories — US-007, US-008,
US-009 — and finishes with its invariant intact rather than eroded. And US-009's
parity check becomes the thing that **proves Part 3's list is complete** instead
of asserting it: if the check finds only the six known divergences, the Part 3
scope is evidenced rather than guessed.

### 2026-09-13 — after US-006

**US-008 gained three acceptance criteria.** No other story is touched; US-006
is already committed and this does not revisit it. Required by its code review,
which passed the story conditional on the promotion — on the precedent set one
story earlier, that a confirmed content-loss defect gets a named criterion
rather than being absorbed into the generic parity line.

The first matters most: US-006's F-1 is the **same defect as US-005's F-1, in a
second template**. Minimal's DOCX also drops the skills and projects sections
that its Preview renders, by the same unreachable-`case` mechanism, confirmed on
a generated artifact by two agents independently. One template dropping content
is a defect; **two of five doing it** is a pattern, and the criterion says so.

The second carries F-2, minimal's Preview ignoring order and visibility — and
records a detail that will force a decision: classic and minimal place
`projects` **differently** in their hardcoded render order, so making both
honour the shared model requires choosing which placement the shared vocabulary
produces.

The third carries F-3, the two character-identical order mappings. US-006 kept
them separate because merging would have edited a second generator inside a
per-template story, which the one-template-per-commit FAIL condition forbids —
a constraint that does not apply to US-008. It also folds in US-005's F-6, still
open: classic's mapping retains a cast that minimal's proved unnecessary and
that swallows a diagnostic.

### 2026-09-12 — after US-005

One change: **US-008 gained three acceptance criteria**, from findings US-005
produced and its review widened. Approved by the owner in the instruction that
ran the story. No other story is touched; US-005 itself is already committed and
this amendment does not revisit it.

The first is the reason for the amendment. US-005's F-1 is **confirmed silent
content loss** — the classic DOCX renders neither the skills nor the projects
section while the Preview renders both, and the reviewer established the ids are
unreachable *by construction* rather than merely filtered at runtime, then
reproduced it on a generated artifact. US-008's existing criteria would have
covered it only under the generic "section order and visibility match across all
three surfaces" line. A confirmed content-loss defect should not depend on
someone noticing it inside a general parity sweep, so it now has a named
criterion, exactly as US-004's F-1 to F-4 did.

The second carries US-005's F-2 and F-3: classic is the mirror image of
creative, with the DOCX honouring order and visibility and the Preview ignoring
them, plus languages and certifications being unhideable because the generator
never reads `hiddenSidebarSections`.

The third records a divergence found during review that reaches past classic:
`fontScale` is passed to modern and professional only, so on classic, minimal
and creative the font-scale slider changes the DOCX and not the Preview. It is
listed now rather than after US-006 and US-007 rediscover it separately.

### 2026-09-11 — after US-004, four stories in

Amended on evidence produced by US-003 and US-004 rather than on a change of
intent. Approved by the owner in the instruction that requested it. US-001 to
US-004 were already merged (`#46`, `#47`, `#48`, `#49`) and are untouched by
this amendment; nothing in it revisits work already accepted.

Three changes:

1. **US-007 re-scoped** from *"the creative DOCX derives its layout from the
   shared model"* to *"the creative DOCX implements section order and
   visibility"*. The original wording assumed an implementation to redirect;
   `docx-creative.ts` has none. Discovered during US-003 and confirmed two ways.
   Consequences carried through: US-007 is now the single story exempt from the
   "output must not change" FAIL condition, with that exemption bounded — an
   unexplained diff, a diff in another template, or any diff at default layout
   settings all remain FAIL.

2. **US-008 gained five acceptance criteria** from the four findings US-003 and
   US-004 deferred into it (F-1 to F-4 of US-004). Each was deferred correctly:
   fixing it inside a per-template story would have changed rendered output or
   touched a second generator. The story was a demonstration; it would have
   *reported* these divergences rather than closed them, which is the wrong
   ending for a milestone whose objective is that the surfaces agree.

3. **Required Verification gained two evidence rules** for US-005 onward. The
   first closes an argument that quietly expires: US-003 and US-004 proved "the
   other four templates are unchanged" *by provenance* — nothing imports the
   generator they modified — and that reasoning is unavailable to the remaining
   three, each of which modifies a generator the next story must prove
   unchanged. The second requires an artifact-level DOCX spec for the template a
   story converts; only professional and modern have one today.

What was deliberately **not** changed: the eight-story split stands, including
US-005 and US-006, which inspection suggests may be close to no-ops — classic
and minimal already consume the shared model and carry no dead fallbacks. The
owner was offered a collapse to six stories on 2026-09-11 and chose to run the
PRD as written. The FAIL condition forbidding multi-template stories is
unchanged.

## Open Questions

- None.

## Approval Gate

Approved by the owner on 2026-09-10, and the 2026-09-11 amendment above approved
in the instruction that requested it. Conversion to `prd.json` is authorised for
this revision; a further material change requires a further approval.
