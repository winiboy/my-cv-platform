---
name: browser-validation
description: Validates my-cv-platform browser-visible behavior against explicit acceptance criteria using an actually available interactive browser capability. Use for rendered routes, navigation, forms, interactions, responsive behavior, locale behavior, loading/error states, and other browser-observable requirements. Validation-only: never modifies production code, never invents Playwright/dev-browser availability, and never substitutes visual-regression or export validation.
---

# Browser Validation

## Purpose

Collect deterministic browser evidence for browser-observable requirements.

This Skill answers one question:

> Does the rendered application behave as the approved requirement says in a real browser context?

It validates behavior only. It does not implement or fix application code.

## Authority and Boundaries

Apply, in order:

1. root `CLAUDE.md`,
2. applicable `.claude/rules/*.md`,
3. approved PRD / active Ralph story,
4. this Skill.

Load at minimum:

- `.claude/rules/frontend.md` when frontend/UI behavior is involved,
- `.claude/rules/testing.md`.

Load other scoped Rules when the scenario touches their domain.

This Skill must not:

- write or modify production code,
- alter acceptance criteria,
- approve a failed implementation,
- invent an unavailable browser tool,
- install Playwright/Puppeteer/Cypress or another dependency,
- create a new test framework,
- perform pixel-diff or visual-regression decisions,
- validate PDF/DOCX output,
- perform database migration validation,
- perform a security review,
- push or merge.

## Inputs

Required:

- `requirements`: one or more exact browser-observable acceptance criteria.
- `base_url`: exact application origin to validate, such as a local/dev or approved preview environment.
- `scenarios`: routes, actions, states, or a deterministic way to derive them from the requirements.

Optional:

- `reference_url`: reference implementation used for behavioral parity.
- `locales`: explicit locales to validate.
- `viewports`: explicit viewport sizes/breakpoints.
- `auth_context`: approved non-secret description of the session/account state required.
- `fixtures`: deterministic test records/state.
- `expected_routes`: expected navigation destinations.
- `evidence_path`: optional location for approved non-sensitive browser evidence.
- `story_id`: Ralph story identifier for evidence correlation.

Never infer credentials or secrets.

## Preconditions

Before browser interaction:

1. Load applicable governance and Rules.
2. Preserve each supplied requirement verbatim in the validation matrix.
3. Confirm `base_url` is explicit and reachable.
4. Determine whether the target is local/dev, preview/staging, or production.
5. Confirm an interactive browser capability is actually available in the current execution environment.
6. Confirm required authentication/session state is available without exposing secrets.
7. Confirm required test data/fixtures exist or can be created safely within the approved environment.
8. Confirm destructive actions, if any, are explicitly in scope and use disposable/non-production data.
9. Determine required routes, viewports, locales, and states from the approved requirements only.
10. Confirm the scenario can be observed in the browser rather than requiring another specialized Skill.

If a required precondition is missing, return `BLOCKED`.

## Browser Capability Discovery

Do not assume a tool by name.

At invocation time:

1. Inspect the browser interaction capabilities actually available to Claude/runtime.
2. Prefer an existing project-approved browser mechanism when one exists.
3. Otherwise use another available interactive browser capability that can:
   - navigate to URLs,
   - inspect rendered content,
   - interact with controls,
   - observe navigation/state changes,
   - capture evidence needed by the requirement.
4. If no such capability exists, return `BLOCKED`.

Repository text such as “verify in browser using dev-browser” does not prove that `dev-browser` exists.

Do not claim Playwright, Cypress, Puppeteer, `dev-browser`, or any named runner executed unless it actually did.

## Environment Safety

Prefer validation targets in this order when they satisfy the requirement:

1. local/dev environment,
2. feature-branch preview/staging,
3. production only when explicitly required/authorized and safe.

Never perform destructive production actions for convenience.

For scenarios that create, modify, duplicate, link, unlink, or delete data:

- use a designated test account/session,
- use deterministic disposable fixtures,
- avoid real user data,
- clean up only data created by the validation when cleanup is safe and authorized,
- do not weaken auth/RLS/security controls to make the scenario work.

If safe data setup is unavailable, return `BLOCKED`.

## Scenario Model

Normalize each required browser check into:

```text
scenario_id
source_requirement
preconditions
start_route
viewport
locale
actions[]
expected_observations[]
cleanup
```

Use sequential IDs:

`BV-001`, `BV-002`, ...

One scenario may support multiple requirements only when the exact same browser path proves them.

Do not combine unrelated behaviors merely to reduce scenario count.

## Validation Dimensions

Use only dimensions required by the approved criteria.

### Rendered state

Examples:

- component/section is present,
- required text or state is visible,
- empty/loading/error/linked state renders,
- control is enabled/disabled as required.

### Interaction

Examples:

- click/tap opens expected menu/dialog,
- form submission produces expected state,
- drag/drop or reorder operation has the expected result,
- CTA triggers the expected action.

### Navigation

Verify:

- starting route,
- triggering action,
- resulting route/path/query when specified,
- absence of unexpected navigation.

### Persistence visible in browser

When the requirement is browser-visible persistence:

1. perform the change,
2. navigate/reload as required,
3. observe persisted state in the UI.

This proves only browser-observable persistence.

It does not replace database-level validation.

### Locale behavior

When locale behavior is in scope:

- validate only required locales,
- navigate using the project's actual locale routing,
- verify expected user-facing terminology/state,
- verify locale is preserved through interactions/navigation where required.

Do not rewrite translations during validation.

### Responsive behavior

When responsiveness is in scope:

- use exact viewport sizes supplied by the requirement when present,
- otherwise use repository/project breakpoints needed to prove the criterion,
- validate interaction and layout usability at each required viewport.

This Skill may record obvious layout breakage such as clipped/unreachable controls or unintended horizontal scrolling.

Pixel-level visual comparison belongs to `visual-regression`.

### Loading/error/disabled states

When explicitly required:

- reproduce the approved state deterministically when possible,
- verify the visible state and allowed interactions,
- do not manufacture unrealistic failures by modifying production code.

If the required state cannot be produced safely/deterministically, return `BLOCKED` for that scenario.

## Procedure

### 1. Build requirement matrix

Create:

```text
requirement_id
exact_requirement
scenario_ids
status: NOT_RUN
```

Every browser-observable requirement must map to at least one scenario.

If a requirement cannot be mapped deterministically, return `BLOCKED`.

### 2. Establish browser baseline

Record:

- target URL,
- environment type,
- browser capability actually used,
- authenticated state description without secrets,
- initial route,
- required viewport,
- required locale,
- fixture identifiers that are safe to disclose.

Do not record passwords, tokens, cookies, session values, or private user data.

### 3. Execute scenarios independently

For each scenario:

1. establish its declared preconditions,
2. navigate to the exact start route,
3. set required viewport/locale when supported,
4. perform only declared actions,
5. observe each expected result,
6. capture sufficient evidence,
7. perform authorized cleanup if needed,
8. record PASS/FAIL/BLOCKED.

Do not continue a scenario after an earlier failed step makes later observations invalid.

### 4. Capture evidence

For every material observation capture the strongest available non-sensitive evidence, such as:

- final/current route,
- rendered text/state,
- control state,
- element existence,
- before/after state description,
- screenshot when useful and available,
- browser-visible error,
- console/network evidence only when the browser capability exposes it and the requirement makes it relevant.

Evidence must be attributable to one scenario and requirement.

A screenshot alone does not prove interaction behavior unless the required before/action/after sequence is also recorded.

### 5. Treat unexpected errors correctly

If the application visibly violates the expected behavior, return `FAIL`.

Examples:

- required control missing,
- action does nothing,
- wrong route,
- wrong state after reload,
- locale lost,
- required mobile action unusable.

If validation cannot be completed because of the environment/tooling, return `BLOCKED`.

Examples:

- application will not start/reach `base_url`,
- browser capability unavailable,
- authentication unavailable,
- fixture unavailable,
- external dependency required for scenario is down,
- required state cannot safely be produced.

Do not convert `BLOCKED` into `FAIL`, and do not convert `FAIL` into `BLOCKED`.

### 6. Reproduce failures once

For each observed FAIL, repeat the minimum failing scenario once when safe.

Record:

- reproducible: YES | NO,
- exact failing step,
- expected observation,
- actual observation.

A non-reproducible result remains non-PASS and should be reported as `BLOCKED` unless sufficient deterministic evidence establishes a real failure.

Do not repeatedly retry until a flaky behavior happens to pass.

### 7. Perform scope observation

While validating, note material browser-visible regressions directly adjacent to the changed flow when they are encountered.

Do not turn browser validation into an unscripted whole-application QA sweep.

Only approved regression constraints and directly encountered critical breakage affect this Skill's verdict.

### 8. Final evidence audit

Before PASS verify:

- every required browser criterion has at least one completed scenario,
- all mapped scenarios PASS,
- required routes were actually visited,
- required actions were actually performed,
- required locales/viewports were actually exercised,
- evidence is non-sensitive and attributable,
- no required step was skipped,
- no result relies only on assumption or source inspection.

If any mandatory item is missing, PASS is prohibited.

## Evidence Output

Return a compact per-scenario record:

```text
BV-001
requirement: <exact criterion or identifier>
environment: <local | preview | staging | production>
start_route: <route>
viewport: <value or NOT_APPLICABLE>
locale: <locale or NOT_APPLICABLE>
actions:
- <action>
observations:
- PASS — <expected vs observed evidence>
reproducible: YES | NOT_APPLICABLE
status: PASS
```

For FAIL:

```text
observations:
- FAIL — expected: <expected>
         actual: <actual>
reproducible: YES | NO
status: FAIL
```

For BLOCKED:

```text
blocked_by: <missing capability/prerequisite>
status: BLOCKED
```

## Result Contract

Return exactly:

```text
BROWSER-VALIDATION
result: PASS | FAIL | BLOCKED
story: <US-NNN or NONE>
base_url: <validated origin>
browser_capability: <actual capability name/description or NONE>
scenarios: <passed>/<total>
requirements: <passed>/<total>
locales: <validated list or NOT_APPLICABLE>
viewports: <validated list or NOT_APPLICABLE>
failures: <integer>
blocked: <integer>
evidence: <summary or evidence path>
next_step: CONTINUE_VALIDATION | SENIOR_CODER_FIX | RESOLVE_BLOCKER
```

`next_step`:

- PASS → `CONTINUE_VALIDATION`
- FAIL → `SENIOR_CODER_FIX`
- BLOCKED → `RESOLVE_BLOCKER`

## PASS Definition

Return PASS only when:

- a real browser capability was used,
- target application was reachable,
- all required scenarios actually ran,
- every browser-observable requirement has evidence,
- all required locales/viewports/states passed,
- no mandatory browser step was skipped,
- no failure was hidden by retries,
- no production code was modified by this Skill.

PASS means browser behavior passed the specified scenarios.

It does not mean:

- pixel-perfect visual parity passed,
- exports passed,
- database/RLS passed,
- security review passed,
- release validation passed.

## FAIL Definition

Return FAIL when the application was testable and browser-observable behavior reproducibly violates an approved requirement.

Provide the smallest reproducible scenario and evidence.

Do not fix the defect in this Skill.

## BLOCKED Definition

Return BLOCKED when reliable browser validation cannot be completed because a required prerequisite is unavailable or unsafe.

Examples:

- no interactive browser capability,
- unreachable application,
- missing auth session/test account,
- unavailable deterministic fixture,
- required external service unavailable,
- unsafe production-only destructive scenario.

## Boundary With Other Skills

- `run-ralph-story` decides when browser evidence is required and consumes this Skill's verdict.
- `visual-regression` owns deterministic screenshot/reference comparison and visual-diff decisions.
- `export-validation` owns PDF/DOCX output.
- `database-migration` owns migration-specific validation.
- `security-review` owns security-focused validation.
- `release-validation` may reuse browser evidence after all stories complete.

Browser screenshots may be inputs to `visual-regression`, but this Skill does not decide visual parity.
