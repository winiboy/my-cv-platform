# PRD: Resume Rendering Unification — Part 3, Parity Defects (Milestone C)

**Status:** DRAFT

**Two of the five resume templates silently drop supported content from their
DOCX export today.** A classic or minimal user with a skills or projects section
downloads a CV that omits it, with no error and no warning. That is the first
thing in this document because it is the most serious thing in it, and because
`.claude/rules/exports.md` prohibits it in as many words: *export code must not
silently omit, rewrite, or reorder supported resume content and then claim
Preview parity.*

**Depends on:** `tasks/prds/milestone-c-part-2-exports-and-parity.md`. Every
defect here was found *by* Part 2's stories and deferred *out of* them, because
each requires changing rendered output and Part 2's Out of Scope makes rendered
output the invariant. Part 2's US-009 parity check should run before this PRD
starts: if it finds only these six divergences, this scope is evidenced rather
than guessed, and if it finds a seventh, this PRD is incomplete.

**Story numbering:** restarted at `US-001` so this document is a self-contained
Ralph contract, matching the convention Part 1 and Part 2 use.

## Objective

Make the Preview and the DOCX export agree, by closing the six divergences Part
2 found and could not fix without violating its own invariant.

## Context / Current Behavior

Part 2 relocated every template's layout decisions onto one shared model without
changing a byte of output — deliberately, so that a regression would be
attributable. Doing that required generating and unzipping real documents for
each template, and that evidence surfaced defects that reading the code had not.

They fall into three groups.

**Content is missing.** `docx-classic.ts` and `docx-minimal.ts` both carry
`case 'skills'` and `case 'projects'` branches that cannot execute. The section
list they dispatch over is `mainContentOrder`, typed `readonly EditorMainId[]`
and filtered by `parseLayoutModel` against
`VALID_MAIN_IDS = ['summary','experience','education']`, so those two ids are
not representable — unreachable by construction, not merely filtered at runtime.
Both Previews render both sections. Confirmed on generated artifacts by two
independent agents in each case.

**The Preview ignores the model.** `classic-template.tsx` and
`minimal-template.tsx` contain zero references to `mainContentOrder`,
`hiddenMainSections`, `sidebarOrder` or `hiddenSidebarSections`. They render
sections in hardcoded JSX order and filter only per-item `visible` flags. So for
these two templates the **DOCX honours order and visibility and the Preview does
not** — the mirror image of creative, where Part 2's US-007 found the opposite.

**Typography does not reach three templates.** `resume-preview.tsx` passes
`fontScale` to `ModernTemplate` and `ProfessionalTemplate` only. Classic,
minimal and creative receive none, while their generators multiply every base
size by it. Moving the font-scale slider on those templates changes the
downloaded document and leaves the Preview where it was — a divergence that
widens with a control the user actively operates, rather than a fixed offset.

## Scope

- Closing the six divergences listed under Functional Requirements, each with
  artifact-level and rendered evidence.
- Deliberate, approved visual-baseline movement where a fix changes Preview
  rendering.
- A decision, recorded, wherever Preview and DOCX disagree and neither is
  self-evidently correct.

## Out of Scope

- Any change to which layout model surfaces read from. Part 2 settled that;
  this part changes what they *do* with what they read.
- New layout capabilities, new templates, or removing existing ones.
- Migrating PDF off `window.print()`.
- Moving the photo out of localStorage.
- Cover letter rendering and its separate template and export path.
- Rewriting the DOCX generators wholesale.
- Consolidating shared vocabulary, helpers or mappings — that is Part 2's
  US-008, and this PRD assumes it has landed.

## Impact Assessment

- **Frontend / UI:** Affected — three templates begin honouring section order,
  visibility and font scale.
- **Internationalization:** Not affected — no user-facing string changes and no
  locale-specific behaviour.
- **Resume model / templates:** Affected — classic and minimal templates change
  how they render; no template identifier changes.
- **Exports:** Affected — classic and minimal DOCX begin emitting sections they
  currently drop.
- **Database / persistence:** Not affected — no schema, policy or stored-shape
  change; the model these fixes read was persisted by Part 1.
- **Security / authorization:** Not affected — no trust boundary moves.
- **Testing / validation:** Affected — visual baselines move deliberately, and
  each fix needs artifact evidence.

## User Stories

### US-001: The classic and minimal DOCX stop dropping sections

**Description:**
As a user of the classic or minimal template, I want my skills and projects to
appear in the CV I download, because they appear in the CV I see.

**Acceptance Criteria:**

- [ ] A resume carrying skills and projects exports a classic DOCX containing
      both, asserted on the unzipped `word/document.xml` rather than on an HTTP
      200.
- [ ] The same holds for minimal.
- [ ] The fix addresses why those ids were unreachable rather than special-casing
      two `case` branches — `mainContentOrder` is filtered against
      `VALID_MAIN_IDS`, so either the vocabulary or the filtering has to change,
      and which one is a decision to record.
- [ ] The three templates that already export correctly — professional, modern,
      creative — are unchanged, evidenced by artifact comparison.
- [ ] Preview rendering is unchanged for all five templates; visual baselines do
      not move in this story.
- [ ] Sections the user has genuinely hidden stay hidden. Fixing an omission
      must not defeat visibility.

### US-002: The classic and minimal Previews honour section order and visibility

**Description:**
As a user of the classic or minimal template, I want reordering or hiding a
section to change what I see, not only what I download.

**Acceptance Criteria:**

- [ ] `classic-template.tsx` renders sections in `mainContentOrder` and omits
      those in `hiddenMainSections`, evidenced by rendered browser output.
- [ ] The same holds for `minimal-template.tsx`.
- [ ] **The `projects` placement conflict is resolved deliberately and the
      decision recorded.** Classic renders summary, experience, education,
      skills, projects; minimal renders summary, experience, **projects**,
      education, skills. A shared vocabulary has to produce one order, so this
      story picks one and says why.
- [ ] Preview and DOCX agree on section order and visibility for both templates,
      compared directly rather than inspected separately.
- [ ] Visual baselines move, and each movement is approved per
      `docs/engineering/visual-regression.md` with its cause understood. A
      baseline updated to make a run green without an understood cause is a
      FAIL.
- [ ] The other three templates' Preview rendering is unchanged.

### US-003: Preview and DOCX agree on the empty-main fallback

**Description:**
As a maintainer, I want one rule for what happens when a stored section order
maps to nothing, so that two surfaces cannot disagree about an empty column.

**Acceptance Criteria:**

- [ ] The disagreement is closed: `modern-template.tsx:198` falls back with
      `mainContentOrder || DEFAULT_MAIN_ORDER`, which an empty array does not
      trigger, while `docx-modern.ts` uses `.length > 0`, which does.
- [ ] The reachable input that exposes it is covered by a test: a stored
      `mainContentOrder: ['education']` passes `parseIdList`, then loses its only
      member to the Modern main id set, and today yields an **empty main column
      in the Preview** and summary plus experience in the DOCX.
- [ ] Which behaviour is correct is decided and recorded, not settled by
      whichever surface was easier to change.
- [ ] Any resulting baseline movement is approved with its cause understood.

### US-004: Font scale reaches every template that claims to support it

**Description:**
As a user of the classic, minimal or creative template, I want the font-scale
control to change what I see, because it already changes what I download.

**Acceptance Criteria:**

- [ ] `resume-preview.tsx` passes `fontScale` to the classic, minimal and
      creative templates, and each applies it.
- [ ] Moving the control changes the **computed** font size of rendered text,
      evidenced by browser measurement rather than by the control agreeing with
      itself.
- [ ] Preview and DOCX font sizes correspond for the same resume at the same
      scale, to the degree DOCX supports, with any residual difference recorded
      as an explicit finding.
- [ ] The per-property sizes — `titleFontSize`, `contactFontSize`,
      `sectionTitleFontSize`, `sectionDescFontSize` — are addressed or explicitly
      deferred with a reason. They reach the Preview and not the DOCX, which is
      the same class of defect pointing the other way.
- [ ] Repointing DOCX constants at `DEFAULT_RESUME_LAYOUT` is **not** accepted as
      a fix. Part 2's US-003 T-1 established why: `DocxGeneratorSettings` carries
      no font-size keys, so the reference resolves to the default while the
      Preview keeps using the user's value — it looks like reading the model
      while still ignoring the user.
- [ ] Visual baselines move for the affected templates, each approved with its
      cause understood.

## Functional Requirements

- **FR-1:** Preview and DOCX must render the same sections, in the same order,
  for the same resume — to the degree DOCX supports.
- **FR-2:** No fix may reintroduce an independent authoritative copy of layout
  state. Part 1 and Part 2 established one model; these stories change what
  surfaces do with it, never where it lives.
- **FR-3:** Every fix that changes rendered output must say which surface was
  wrong and why, rather than making two surfaces agree on an unexamined
  behaviour.
- **FR-4:** A visual baseline may move only with an understood cause and an
  explicit approval decision.
- **FR-5:** Template isolation holds — a fix for one template must not alter
  another through shared defaults or fallbacks, except where a story explicitly
  adopts a shared rule and evidences the effect on every template it touches.
- **FR-6:** Client-supplied and stored layout state reaching document generation
  remains untrusted and bounded.

## Regression Constraints

- The five template identifiers remain `modern`, `classic`, `minimal`,
  `creative`, `professional`.
- Professional and modern exports are unchanged unless a story explicitly
  requires otherwise.
- PDF continues to work via `window.print()`.
- The editor's save, draft-recovery and unsaved-changes behaviours are unchanged.
- The Preview's editing controls continue to function and remain excluded from
  visual captures.
- Existing saved resumes remain loadable and exportable; no resume becomes
  unopenable, and no stored layout value becomes unparseable.
- Locale routing and translated template labels are unchanged.
- `pnpm lint` does not exceed its 311-problem baseline.

## Required Verification

- `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`,
  `pnpm build` on every story.
- `pnpm test:visual` — screen **and** print — on every story.
- `export-validation` on every story: a generated DOCX inspected for content and
  fidelity, never an HTTP 200.
- `ui-expert` on US-002 and US-004, with rendered browser evidence, because both
  change what the user sees.
- Artifact comparison across all five templates for any story claiming a
  template is unchanged. Part 2 established that the provenance argument expires
  as soon as a story touches shared code, and every story here does.
- Baseline movement follows `docs/engineering/visual-regression.md`, with the
  before/after and the cause recorded per moved baseline.
- `code-reviewer` on every story.

## FAIL Conditions

- A section the user has hidden appears in an export or a Preview.
- A section the user has ordered appears in a different position on one surface
  than the other.
- A visual baseline is updated to absorb a diff whose cause is not understood.
- A visual threshold is widened rather than the nondeterminism being found.
- A template's rendered output changes as a side effect of fixing another.
- Two surfaces are made to agree by changing the one that was easier rather than
  the one that was wrong, without recording the decision.
- A fidelity limitation is accepted as a PASS rather than recorded as a finding.
- A DOCX-side omission is fixed by hardcoding a section list in the generator,
  reintroducing the per-generator layout logic Part 2 removed.

## BLOCKER Conditions

- Part 2 is not complete, or its US-008 consolidation has not landed — these
  stories assume one shared vocabulary and one order mapping.
- Part 2's US-009 parity check finds a divergence not listed here, meaning this
  PRD's scope is incomplete and needs revising before implementation.
- A divergence proves unresolvable without a product decision about which
  behaviour is correct, and that decision has not been made.

## Risks

- **Every story here moves visual baselines, which Part 2 never did.** Part 2
  could answer "did I break anything?" with a hash; these stories cannot. The
  discipline that replaces it is per-baseline cause analysis, and the risk is
  that a genuine regression hides inside an expected movement. `ui-expert` on
  the two rendering stories exists for that.
- **The `projects` placement decision affects two templates at once** and is the
  first point in this milestone where a shared rule must override a per-template
  arrangement. Getting it wrong changes what existing users see.
- **Fixing the content omission could defeat visibility** if the vocabulary is
  widened without care — a section becoming representable also makes it
  hideable, and the two must be got right together.
- **The per-property font sizes reach the Preview and not the DOCX**, the mirror
  of US-004's own defect. US-004 may uncover that the honest fix is a transport
  change on `DocxGeneratorSettings`, which is larger than this PRD assumes.

## Evidence / References

- `tasks/ralph/progress.txt`, the US-003 to US-006 sections — where each
  divergence was recorded, with the artifact evidence for it.
- `tasks/prds/milestone-c-part-2-exports-and-parity.md` — the table after US-009
  listing all six and why they moved.
- `src/app/api/resumes/[id]/download-docx/docx-classic.ts`,
  `docx-minimal.ts` — the unreachable `case 'skills'` and `case 'projects'`.
- `src/lib/layout-settings.ts` — `VALID_MAIN_IDS`, `parseLayoutModel`,
  `mapEditorOrderToClassic`, `mapEditorOrderToMinimal`.
- `src/components/dashboard/resume-templates/classic-template.tsx`,
  `minimal-template.tsx` — hardcoded section order, no order or visibility props.
- `src/components/dashboard/resume-preview.tsx` — the `fontScale` call sites, and
  the three templates that receive none.
- `src/components/dashboard/resume-templates/modern-template.tsx:198` — the
  `||` fallback that an empty array does not trigger.
- `e2e/docx-professional-layout.spec.ts`, `docx-modern-layout.spec.ts`,
  `docx-classic-layout.spec.ts`, `docx-minimal-layout.spec.ts` — the
  artifact-level spec shape these stories extend.
- `docs/engineering/visual-regression.md` — baseline approval rules, which
  matter more here than anywhere in Part 2.
- `.claude/rules/exports.md`, `.claude/rules/resumes.md`, `CLAUDE.md` §10.

## Open Questions

- None blocking. Two decisions are deliberately left to their stories rather
  than pre-empted here, because both need the code in front of them: which
  surface is correct for the empty-main fallback (US-003), and where `projects`
  sits in a shared order (US-002). Each story requires the decision to be
  recorded, which is the requirement — not that this document guesses it now.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation. It should not be approved before Part 2's US-009
has run, because that check is what confirms this scope is complete.
