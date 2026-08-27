---
name: create-prd
description: Creates a repository-grounded draft PRD for meaningful my-cv-platform product changes. Use when a feature, fix, refactor, parity request, or behavior change needs to be defined and scoped before implementation. Produces one deterministic PRD ready for explicit human approval; it does not implement code or create prd.json.
---

# Create PRD

## Purpose

Create one clear, repository-grounded Product Requirements Document for a meaningful product change.

This Skill is planning/documentation only. It ends with a PRD that is ready for explicit human approval.

## Inputs

Required:

- The requested product change, problem, or outcome.

Optional:

- Desired PRD output path.
- Reference implementation, screenshots, files, routes, existing behavior, or external specification supplied by the user.
- Explicit scope or out-of-scope constraints.
- Required acceptance evidence or validation expectations.

If a material requirement cannot be determined from the request, repository, or supplied evidence, preserve it as a blocker. Do not invent the missing behavior.

## Preconditions

1. Load and follow the repository root `CLAUDE.md`.
2. Load the applicable files under `.claude/rules/` for the domains affected by the request.
3. Inspect the relevant repository implementation and existing behavior read-only before drafting requirements.
4. Treat user-supplied reference material as authoritative only for the requirement it actually supports.
5. Before writing the PRD file, confirm that the current repository state permits that write under the active Git governance.

If any precondition cannot be satisfied, return `BLOCKED`.

## Output Path

Use the path supplied by the caller when one is explicitly provided.

Otherwise use:

`tasks/prds/<prd-slug>.md`

where `<prd-slug>` is a short lowercase kebab-case name derived from the PRD title.

Do not overwrite an existing PRD unless the caller explicitly requested an update to that PRD. If the target path already exists and replacement/update was not requested, return `BLOCKED`.

## Procedure

### 1. Establish the requirement

Extract:

- the user-visible or system outcome,
- the problem being solved,
- the reference behavior, if any,
- explicit constraints,
- explicit exclusions.

Separate required behavior from preferences, examples, and implementation ideas.

### 2. Ground the PRD in the repository

Inspect only the repository areas needed to understand the current behavior and impact.

Identify:

- current implementation or closest reference implementation,
- affected routes/components/services/data,
- existing translations or locale behavior when relevant,
- existing persistence or API contracts when relevant,
- existing verification capabilities relevant to the change.

Do not prescribe a new architecture merely because an alternative seems preferable.

### 3. Determine the impact domains

For each domain below, record `Affected` or `Not affected` and a short reason:

- Frontend / UI
- Internationalization
- Resume model / templates
- Exports
- Database / persistence
- Security / authorization
- Testing / validation

Use the applicable Rules to constrain the PRD. Do not copy permanent Rule text into the PRD.

### 4. Define objective and scope

Write one primary objective.

Define:

- in-scope behavior,
- explicitly out-of-scope behavior,
- boundaries that prevent unrelated refactors or redesigns.

If the request contains multiple unrelated objectives that cannot be expressed as one coherent initiative, return `BLOCKED` and recommend splitting it into separate PRDs.

### 5. Create atomic user stories

Create the minimum number of user stories needed to cover the approved scope.

Use sequential IDs:

`US-001`, `US-002`, `US-003`, ...

Each story must have:

- one observable outcome,
- a short user-centered description,
- binary, testable acceptance criteria,
- no unrelated implementation work.

Do not use acceptance criteria such as "works correctly", "looks good", "is optimized", or "no regressions" without defining observable evidence.

### 6. Define functional requirements

Convert cross-story requirements into numbered functional requirements:

`FR-1`, `FR-2`, `FR-3`, ...

Requirements must define product behavior or necessary system constraints, not speculative implementation details.

Technical constraints may be included only when they are required by the request, current repository architecture, `CLAUDE.md`, or applicable Rules.

### 7. Define regression constraints

Identify existing behavior that must remain unchanged.

Regression constraints must be specific to the affected surface. Do not use unrelated areas as generic boilerplate.

### 8. Define required verification

Specify the evidence needed to prove each material requirement.

Select validation evidence and exact commands from the active repository capabilities, `CLAUDE.md`, and `.claude/rules/testing.md`. Record the resulting requirement without redefining testing policy.

For UI behavior, describe the rendered states and interactions that require browser evidence.

For visual parity requirements, identify the reference state and comparison condition.

For export, database, or security changes, identify the corresponding domain validation requirement without performing that validation in this Skill.

### 9. Define FAIL and BLOCKER conditions

Add explicit conditions that prevent a false PASS.

Use `FAIL` for evidence that the implementation violates an approved requirement.

Use `BLOCKER` for a missing prerequisite, unresolved material requirement, unavailable authoritative reference, or other condition that prevents safe implementation.

### 10. Record evidence and open questions

List the repository files, routes, existing behaviors, screenshots, or specifications used to ground the PRD.

Open questions must be limited to genuinely unresolved material decisions.

Questions that affect acceptance criteria or scope are blocking until resolved.

### 11. Write the PRD

Use the canonical structure below.

Do not create `prd.json`.

Do not implement application code.

Do not execute Ralph.

Do not perform downstream browser, visual, export, database, security, or release validation.

### 12. Self-audit the PRD

Before reporting completion, verify:

- the objective is singular and unambiguous,
- scope and out-of-scope are explicit,
- every user story is atomic,
- every acceptance criterion is observable,
- functional requirements do not contradict acceptance criteria,
- regression constraints are specific,
- required verification maps to the affected domains,
- permanent governance was referenced rather than duplicated,
- no unsupported behavior was invented,
- open material questions are marked as blockers,
- the document is still `DRAFT` and has not been self-approved.

If any check fails, correct the PRD before returning the result.

## Canonical PRD Structure

```markdown
# PRD: <Title>

**Status:** DRAFT

## Objective

<One primary outcome.>

## Context / Current Behavior

<Repository-grounded description of the relevant current state and reference behavior.>

## Scope

- <In-scope item>

## Out of Scope

- <Explicit exclusion>

## Impact Assessment

- **Frontend / UI:** Affected | Not affected — <reason>
- **Internationalization:** Affected | Not affected — <reason>
- **Resume model / templates:** Affected | Not affected — <reason>
- **Exports:** Affected | Not affected — <reason>
- **Database / persistence:** Affected | Not affected — <reason>
- **Security / authorization:** Affected | Not affected — <reason>
- **Testing / validation:** Affected | Not affected — <reason>

## User Stories

### US-001: <Observable outcome>

**Description:**  
As a <user/context>, I want <behavior>, so that <outcome>.

**Acceptance Criteria:**

- [ ] <Binary observable criterion>
- [ ] <Binary observable criterion>

## Functional Requirements

- **FR-1:** <Requirement>

## Regression Constraints

- <Existing behavior that must remain unchanged>

## Required Verification

- <Evidence required to prove the requirement>

## FAIL Conditions

- <Condition that proves the implementation is not acceptable>

## BLOCKER Conditions

- <Condition that prevents safe implementation or validation>

## Risks

- <Relevant risk>

## Evidence / References

- `<repository/path>` — <why it is relevant>

## Open Questions

- None.
  <!-- Or list only unresolved material questions. -->

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
```

## Result Contract

After writing or evaluating the PRD, return exactly this result shape:

```text
CREATE-PRD
result: READY_FOR_APPROVAL | BLOCKED
prd: <repository-relative path or NONE>
objective: <one-line objective>
user_stories: <integer>
open_questions: <integer>
blocking_questions: <integer>
next_step: HUMAN_APPROVAL | RESOLVE_BLOCKERS
```

`READY_FOR_APPROVAL` means the draft is internally complete and ready for a human decision. It does not mean the PRD is approved.

## Boundary With Other Skills

- `create-prd` defines and writes the human-readable PRD.
- `prd-to-json` may consume the PRD only after explicit approval.
- `run-ralph-story` performs story execution, not PRD authoring.
- Validation Skills collect execution evidence; this Skill only specifies what evidence will be required.
