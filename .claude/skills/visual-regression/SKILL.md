---
name: visual-regression
description: Compares a my-cv-platform rendered candidate against an explicit approved visual reference under controlled conditions and returns PASS, FAIL, or BLOCKED. Use for screenshot parity, layout/style regression, template parity, and exact/1:1/visually-indistinguishable requirements. Validation-only: never modifies production code, never updates baselines automatically, and never claims pixel-level parity without a real pixel comparator.
---
# Visual Regression

## Purpose
Determine whether a rendered candidate satisfies an approved visual-comparison requirement against an authoritative reference.

This Skill validates visual output only. It does not implement fixes, choose UX preferences, validate interactions, validate PDF/DOCX output, or update baselines.

## Authority and boundaries
Apply, in order:
1. root `CLAUDE.md`,
2. applicable `.claude/rules/*.md`,
3. approved PRD / active Ralph story,
4. this Skill.

Load `.claude/rules/frontend.md` and `.claude/rules/testing.md`. Load `.claude/rules/resumes.md` when Resume/template rendering is affected.

This Skill must not:
- write production code,
- alter acceptance criteria,
- redesign UI,
- install screenshot/diff tooling,
- invent Playwright, pixelmatch, `toHaveScreenshot`, or another unavailable capability,
- replace `browser-validation` or `export-validation`,
- update/bless a baseline automatically,
- push or merge.

## Inputs
Required:
- `requirements`: exact visual acceptance criterion or criteria.
- `reference`: explicit authoritative visual reference.
- `candidate`: rendered candidate state or deterministic capture instructions.

Valid references: approved screenshot/image, approved baseline artifact, approved reference route/environment, or approved existing implementation explicitly named as source of truth.

Optional:
- `reference_url`, `candidate_url`, `route`, `state`
- `viewport`, `device_pixel_ratio`, `browser`
- `locale`, `theme`, `fixture`
- `comparison_mode`: `PIXEL_DIFF` or `STRUCTURED_REVIEW`
- `threshold`, `allowed_differences`, `evidence_path`, `story_id`

A reference is mandatory. Pure interaction/navigation checks belong to `browser-validation`.

## Reference authority
Establish why the reference is authoritative before comparing. Valid authority:
- PRD names it,
- user explicitly approves it,
- project baseline is explicitly designated authoritative,
- approved requirement names an existing implementation as source of truth.

Do not choose a similar-looking page by inference, memory, or unapproved mock. If authority is unclear, return `BLOCKED`.

## Reference immutability
The reference is immutable during the validation run. Never replace it with the candidate, recapture it under friendlier conditions, crop away a real difference, change threshold after seeing results, or update the approved screenshot to make validation pass.

Baseline creation/replacement requires a separate explicit workflow.

## Comparison modes
### PIXEL_DIFF
Use only when a real image/pixel comparator is actually available. Use when the requirement demands pixel-perfect parity, `1:1`, `exact`, `visually indistinguishable`, a numeric threshold, or existing project visual-regression tooling.

Never claim a pixel-diff result from human/agent visual inspection.

### STRUCTURED_REVIEW
Use only when pixel-level equality is not required. Evaluate explicit approved categories such as layout/geometry, spacing/alignment, typography, colors, borders/radius/shadows, iconography, image/photo placement, overflow/clipping, responsive arrangement, and state rendering.

Structured review is not pixel-perfect evidence.

## Mode selection
If `comparison_mode` is supplied and compatible with the requirement, use it. Otherwise:
- exact pixel-level requirement → `PIXEL_DIFF`,
- non-exact visual-characteristic requirement → `STRUCTURED_REVIEW`,
- ambiguous evidence strength → `BLOCKED`.

If `PIXEL_DIFF` is required but no real pixel comparator exists, return `BLOCKED`. Never downgrade exact parity to structured review to obtain a verdict.

## Preconditions
Before comparison:
1. load applicable governance and Rules,
2. preserve each requirement verbatim,
3. establish reference authority,
4. determine required mode,
5. confirm candidate can render,
6. confirm required comparator/review capability exists,
7. establish deterministic fixture/content and route/state,
8. establish viewport/DPR, locale/theme when relevant,
9. confirm fonts/assets are loaded,
10. wait for transient rendering to settle,
11. confirm reference/candidate are comparable,
12. record approved allowed differences before evaluating the candidate.

Missing required conditions return `BLOCKED`.

## Controlled comparison contract
For each comparison record:
```text
comparison_id
requirement
reference_source
candidate_source
route/state
fixture
browser
viewport
device_pixel_ratio
zoom
locale
theme
comparison_mode
threshold
allowed_differences
```
Use `VR-001`, `VR-002`, ...

When relevant, reference and candidate must match on content, state, browser engine, viewport, DPR, zoom, locale, theme, fonts/assets, scroll position, expanded UI state, and breakpoint.

A material mismatch prevents exact comparison.

## Dynamic content
Prefer deterministic data. Use the same fixture when possible; freeze only test-controlled data through an existing approved mechanism; document unavoidable nondeterminism.

Do not modify production code to stabilize screenshots. Do not mask user-visible content that is part of the requirement.

## Allowed differences
Allowed differences must be defined before comparison by the approved requirement, approved baseline policy, or explicit caller instruction.

Do not invent exclusions after seeing a failure. If masks are supported, use only pre-approved nondeterministic regions and record them. A masked region cannot prove a requirement concerning that region.

## Procedure
### 1. Build requirement matrix
Create:
```text
requirement_id
exact_requirement
comparison_ids
evidence_level
status: NOT_RUN
```
Every visual requirement maps to at least one comparison.

### 2. Acquire reference
Load approved screenshot/baseline or capture the approved reference environment/state. Record provenance. Do not silently regenerate a stored baseline. Unavailable reference → `BLOCKED`.

### 3. Acquire candidate
Render/capture candidate under matched conditions. Prefer compatible screenshot/state evidence already produced by `browser-validation`; otherwise use an actually available capture capability.

Do not claim a capture occurred if it did not.

### 4. Verify comparability
Check dimensions, viewport, DPR, fixture/content, state, locale, theme, fonts/assets. Exact-mode mismatch → `BLOCKED`. Structured review may evaluate only dimensions that remain legitimately comparable.

### 5. Run PIXEL_DIFF when required
Use the actual comparator and record comparator name, image dimensions, differing pixel count/equivalent objective metric, percentage when available, threshold, threshold result, and diff artifact when available.

Threshold source must be the approved requirement, existing project config, or explicit exact/no-difference requirement. For explicit exact/no-difference in a controlled identical environment, threshold is zero differing pixels.

Do not invent tolerance after seeing failure. Missing required objective metric → `BLOCKED`.

### 6. Run STRUCTURED_REVIEW when permitted
Evaluate only relevant categories:
```text
layout_geometry
spacing_alignment
typography
colors
borders_radius_shadows
iconography
images
overflow_clipping
responsive_arrangement
state_rendering
```
Each category is `PASS`, `FAIL`, or `NOT_APPLICABLE`.

Describe differences precisely; never convert structured review into a claim of exact pixel equality.

### 7. Localize failures
For each FAIL record comparison ID, requirement, affected region/component, reference observation, candidate observation, objective metric when available, and whether the difference is allowed.

Recapture once when safe if needed to confirm stability. Do not retry until a transient result passes.

### 8. Check regression scope
For “no visual change” constraints, include enough surrounding reference area to detect layout shift/regression. Do not crop so tightly that surrounding regressions are hidden.

For template-specific work, compare the affected template and any explicitly required unaffected surfaces.

### 9. Final evidence audit
PASS requires:
- authoritative reference,
- appropriate mode,
- sufficiently controlled comparison,
- all required comparisons executed,
- every visual requirement evidenced,
- threshold defined before verdict,
- no disallowed difference,
- allowed differences pre-approved,
- no baseline changed,
- no visual requirement downgraded.

Missing mandatory evidence prohibits PASS.

## Evidence record
Exact:
```text
VR-001
requirement: <exact requirement>
mode: PIXEL_DIFF
reference: <source>
candidate: <source>
viewport: 1440x900
dpr: 1
locale: en
state: <state>
comparator: <actual comparator>
threshold: 0 differing pixels
difference: 0 pixels
status: PASS
```

Structured:
```text
VR-002
requirement: <exact requirement>
mode: STRUCTURED_REVIEW
reference: <source>
candidate: <source>
layout_geometry: PASS
spacing_alignment: PASS
typography: FAIL — <specific difference>
colors: PASS
status: FAIL
```

## Result contract
Return exactly:
```text
VISUAL-REGRESSION
result: PASS | FAIL | BLOCKED
story: <US-NNN or NONE>
mode: PIXEL_DIFF | STRUCTURED_REVIEW | NONE
reference: <reference identifier or NONE>
comparisons: <passed>/<total>
requirements: <passed>/<total>
threshold: <value/source or NOT_APPLICABLE>
difference: <metric or NOT_APPLICABLE>
allowed_differences: <count>
failures: <integer>
blocked: <integer>
evidence: <summary/path/runtime evidence>
baseline_update: NOT_PERFORMED
next_step: CONTINUE_VALIDATION | SENIOR_CODER_FIX | RESOLVE_BLOCKER
```

`next_step`: PASS → `CONTINUE_VALIDATION`; FAIL → `SENIOR_CODER_FIX`; BLOCKED → `RESOLVE_BLOCKER`.

## PASS definition
PASS requires a real authoritative reference, correct evidence mode, controlled comparison, all required comparisons run, every requirement evidenced, no disallowed difference, threshold satisfied when applicable, no baseline change, and no production-code modification by this Skill.

PASS covers visual comparison only; it does not prove interaction behavior, UX quality, exports, database behavior, security, or release readiness.

## FAIL definition
Return FAIL when reliable comparison was possible and a disallowed visual difference violates an approved requirement. Do not fix it. Return evidence suitable for `senior-coder` and later `ui-expert`.

## BLOCKED definition
Return BLOCKED when reliable comparison cannot be completed, including missing authoritative reference, unrenderable candidate, exact parity without a pixel comparator, materially mismatched capture conditions, missing deterministic fixture, unloaded fonts/assets, undefined required threshold, or unavailable evidence.

## Boundary with other Skills
- `browser-validation` proves rendered behavior and may provide screenshots/states.
- `visual-regression` compares approved visual reference to candidate.
- `run-ralph-story` consumes this verdict and routes FAIL to `senior-coder`.
- `ui-expert` interprets UI/UX quality after required browser/visual evidence exists.
- `export-validation` validates PDF/DOCX separately.
- `release-validation` may reuse completed visual evidence.

This Skill never updates a golden baseline automatically.
