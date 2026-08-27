---
name: security-review
description: Performs an evidence-based security review of one approved my-cv-platform change and returns PASS, FAIL, or BLOCKED with scoped findings. Use when a change affects authentication, authorization/RLS, APIs, untrusted input, uploads, external URLs, AI input/output, rich content, secrets, storage, logging/errors, redirects/CORS/CSRF, or other trust boundaries. Validation-only: never fixes production code, weakens controls, exposes secrets, or performs unsafe production exploitation.
---

# Security Review

## Purpose

Review one approved change for security regressions and violations of the project's security requirements.

This Skill owns security-focused analysis and evidence.

It does not implement fixes, perform broad unscripted penetration testing, replace database migration validation, or approve a release.

## Authority and boundaries

Apply, in order:

1. root `CLAUDE.md`,
2. `.claude/rules/security.md`,
3. other applicable `.claude/rules/*.md`,
4. approved PRD / active Ralph story,
5. this Skill.

Load `.claude/rules/database.md` for database/RLS/ownership changes, `.claude/rules/testing.md` for evidence rules, `.claude/rules/resumes.md` for resume/AI/rich-content changes, and `.claude/rules/exports.md` when export processing is affected.

This Skill must not:

- modify production code, SQL, config, secrets, or data,
- weaken authentication, authorization, RLS, validation, CORS, CSP, or other controls to make a test pass,
- expose tokens, credentials, cookies, private documents, or full user content in evidence,
- use privileged/service-role access as proof of ordinary-user authorization,
- install scanners or security dependencies,
- invent a security tool or command the repository has not adopted,
- perform destructive, high-volume, persistence, credential-theft, or denial-of-service testing,
- exploit production systems,
- push, merge, deploy, or commit.

## Inputs

Required:

- `requirements`: exact approved security-relevant acceptance criteria, including inherited security constraints.
- `change_set`: exact diff/commit/changed paths to review.
- `baseline`: repository baseline against which the change is evaluated.

Optional:

- `story_id`
- `runtime_environment`: approved non-production environment for safe dynamic checks.
- `auth_contexts`: synthetic/approved test identities.
- `fixtures`: deterministic non-sensitive test data.
- `database_migration_evidence`
- `browser_validation_evidence`
- `export_validation_evidence`
- `evidence_path`

Do not expand a story-scoped review into an unrelated whole-repository audit.

If a material vulnerability is encountered directly adjacent to the changed trust boundary, record it even if pre-existing; clearly mark it `PRE_EXISTING_ADJACENT`.

## Preconditions

Before verdict work:

1. Load applicable governance and Rules.
2. Preserve supplied requirements verbatim.
3. Establish exact baseline and change set.
4. Inspect the complete diff.
5. Inspect directly necessary callers, callees, policies, schema, middleware, and configuration read-only.
6. Identify changed entry points and trust boundaries.
7. Identify affected assets and user-data classes.
8. Identify authentication and authorization context.
9. Discover actual security/testing capabilities available.
10. Confirm any runtime environment is non-production unless the check is strictly passive and explicitly approved.
11. Confirm synthetic/non-sensitive fixtures are available for dynamic checks.
12. Confirm required specialized evidence from another Skill is available when the security conclusion depends on it.

Missing evidence needed for a mandatory conclusion → `BLOCKED`.

## Scope map

Build:

```text
changed_path
changed_entry_point
untrusted_input
trusted_component
protected_asset
auth_context
ownership_boundary
external_system
security_rule
required_review_domains
```

Trace only enough surrounding code to understand the security effect of the change.

A small diff may require wider read-only context when security depends on middleware, RLS, helpers, redirects, storage policy, or shared rendering.

## Threat model

For each changed trust boundary record:

```text
threat_id
attacker_capability
entry_point
attacker_controlled_data
trust_boundary
protected_asset
security_property
plausible_attack_path
expected_control
```

Use realistic attacker capabilities only.

Examples:

- unauthenticated remote caller,
- authenticated `OWNER_A`,
- authenticated different user `OWNER_B`,
- malicious uploaded document,
- malicious external webpage/redirect,
- malicious AI/user-provided text,
- attacker-controlled URL/header/query/body.

Do not assume attacker access to secrets, server filesystem, service-role credentials, or another user's authenticated session unless the reviewed defect itself could provide that capability.

## Review domains

Review only domains relevant to the change.

### Authentication and session

Check applicable:

- protected action verifies authenticated identity server-side,
- API route does not rely only on page/middleware protection,
- session/user identity comes from the approved auth mechanism,
- authentication failures do not fall through to privileged work,
- redirects/session handling do not disclose credentials.

Browser route protection is not proof that an `/api` handler is protected.

### Authorization, ownership, and RLS

Check applicable:

- every user-owned read/write is constrained by authenticated identity and/or valid RLS,
- object identifiers supplied by a user cannot access another user's object,
- relationship creation cannot cross ownership boundaries unintentionally,
- privileged credentials do not substitute for policies,
- allowed and denied paths have evidence when the change affects ownership.

When database-specific RLS behavior changed, consume `database-migration` evidence rather than duplicating its migration procedure.

### Untrusted request/input handling

For body, query, path, headers, external content, AI output, and user text check applicable:

- type/shape validation,
- length/range/count bounds,
- enum/identifier validation,
- safe failure behavior,
- no unsafe parser/interpreter boundary,
- resource use is bounded where attacker-controlled input can amplify work.

Validation must occur before the sensitive sink it protects.

### Server-side URL fetching / SSRF

When the server fetches attacker-influenced URLs check:

- allowed schemes,
- no credentialed URLs,
- hostname/domain policy,
- loopback/private/link-local/metadata destinations rejected,
- DNS/address resolution risk considered,
- redirect destinations revalidated,
- redirect-chain behavior cannot bypass the original policy,
- response size/time/resource bounds when required,
- fetched content remains untrusted.

An allowlist check before a fetch does not by itself prove redirects are safe.

### Uploads and file processing

Check applicable:

- size limits,
- accepted format policy,
- declared MIME/filename is not the sole trust signal,
- parser receives only intended formats,
- archive/decompression/resource amplification risk,
- filenames are not trusted as paths,
- extracted content remains untrusted,
- malformed-file errors do not leak sensitive internals,
- public endpoints have appropriate abuse/resource controls when required.

Do not upload malicious samples to production.

### Rich text, HTML, and rendering

When user/external/AI content reaches HTML-like rendering or document generation check:

- content remains data rather than executable markup unless explicitly supported,
- sanitization/escaping occurs at the correct boundary,
- URLs/links use safe schemes where required,
- script/event-handler/style injection is not introduced,
- preview and export paths do not create inconsistent trust assumptions.

Source inspection alone cannot prove rendered XSS behavior when runtime evidence is required.

### AI boundaries

When AI is involved check applicable:

- AI input is treated as untrusted,
- private resume/user data sent to an external model is limited to intended scope,
- secrets/system credentials are not included in prompts,
- model output is treated as untrusted before persistence/rendering/network/file sinks,
- prompt content cannot grant application authorization,
- AI output cannot invent authority, ownership, URLs, or privileged actions,
- logged prompts/responses do not expose full private documents contrary to policy.

Do not treat model compliance as a security control.

### Secrets and client exposure

Check:

- secrets/privileged credentials remain server-only,
- `NEXT_PUBLIC_*` values are genuinely public,
- server errors/responses do not reveal secrets,
- no secret is added to source, generated client bundle, logs, or evidence,
- third-party keys are scoped to their intended side of the trust boundary.

Never print a secret to prove it exists.

### Logs and error responses

Check applicable:

- no token/cookie/credential leakage,
- no full private resume/document content,
- user-controlled data is not unnecessarily logged,
- production-facing errors do not expose sensitive stack/internal details,
- security failures return safe status/response semantics.

### Redirects, CORS, CSRF, and origin trust

When relevant check:

- redirect targets are bounded/validated,
- user-controlled redirect parameters cannot become open redirects,
- CORS is no broader than required,
- state-changing cookie-authenticated actions have appropriate request-origin/CSRF protections for the actual architecture,
- trusted host/origin construction does not accept unsafe attacker-controlled values.

Do not require controls irrelevant to the endpoint's authentication/request model.

### Storage

For Supabase/object storage changes check applicable:

- bucket/object access matches ownership expectations,
- object paths are not authorization by convention alone,
- upload/download/delete operations are policy-protected,
- public/private status is intentional,
- signed URLs and object identifiers do not leak broader access.

### Abuse and resource consumption

When the change creates a public or expensive endpoint check whether the approved risk model requires:

- request/input bounds,
- pagination caps,
- file-size/resource caps,
- rate/usage controls,
- external API/AI cost controls,
- timeout/response-size controls.

Absence of a generic rate limiter is not automatically a finding; establish a concrete abuse path and requirement/risk first.

### Dependency/config changes

When dependencies or security-sensitive config change:

- inspect exact new dependency/config purpose,
- verify no secret is embedded,
- identify newly introduced runtime/network/native capability,
- use an existing adopted audit/scanner only if actually available and required.

Do not install a scanner during this Skill.

## Evidence methods

Use the strongest available safe evidence appropriate to the claim:

```text
STATIC
RUNTIME_SAFE
DATABASE_EVIDENCE
BROWSER_EVIDENCE
ARTIFACT_EVIDENCE
CONFIG_EVIDENCE
```

Static code review can prove some control presence/absence.

Dynamic authorization, XSS, redirects, uploads, or ownership behavior may require safe runtime evidence.

If runtime proof is mandatory but no safe environment/capability exists, return `BLOCKED` for that requirement.

Never infer PASS from a test that could not exercise the vulnerable sink.

## Safe dynamic checks

When dynamic validation is required:

- prefer local/preview/staging,
- use synthetic identities such as `OWNER_A` and `OWNER_B`,
- use disposable non-sensitive data,
- use minimal non-destructive probes,
- stop after proving the condition,
- clean up only test-created data when safe.

Do not:

- exfiltrate real data,
- brute-force,
- flood endpoints,
- execute persistence payloads,
- attempt cloud metadata/credential theft,
- target third parties,
- bypass production controls.

A safe proof may demonstrate that a request is rejected without attempting harmful exploitation.

## Findings

Use IDs `SEC-001`, `SEC-002`, ...

Every finding must contain:

```text
finding_id
status: NEW | PRE_EXISTING_ADJACENT
category
affected_path_or_boundary
requirement_or_rule
attacker_capability
preconditions
attack_or_failure_path
protected_asset
expected_control
observed_control
impact
severity
confidence
evidence
remediation_direction
```

Do not report speculative vulnerabilities as confirmed.

If evidence establishes only a concern, mark confidence accordingly and use `BLOCKED` when a mandatory verdict depends on missing proof.

## Severity

Assign severity from realistic impact and exploitability:

- `CRITICAL`: direct, practical compromise with catastrophic/widespread impact such as privileged takeover or broad secret/private-data exposure.
- `HIGH`: practical auth/authorization bypass, cross-user sensitive-data access/modification, dangerous SSRF/internal access, or similarly major impact.
- `MEDIUM`: exploitable security weakness with meaningful but bounded impact or material defense bypass.
- `LOW`: limited-impact weakness or defense-in-depth gap with a plausible but constrained security consequence.
- `INFO`: observation/hardening note without a demonstrated vulnerability.

Do not inflate severity because a code pattern merely resembles a known vulnerability class.

## Verdict policy

Return `FAIL` when any of these is confirmed in reviewed scope:

- violation of an applicable Security Rule,
- violation of an approved security acceptance criterion,
- security regression introduced by the change,
- `CRITICAL`, `HIGH`, or `MEDIUM` vulnerability.

`LOW`/`INFO` findings may coexist with PASS only when they do not violate an applicable Rule/acceptance criterion and do not represent a material regression.

Return `BLOCKED` when a required security property cannot be evaluated with available safe evidence.

Do not convert BLOCKED into PASS.

## Remediation loop boundary

This Skill does not fix findings.

Return actionable evidence to `run-ralph-story`.

The orchestration loop is:

```text
security-review FAIL
  ↓
senior-coder scoped fix
  ↓
rerun invalidated functional/database/browser/export checks
  ↓
security-review on fresh final diff
```

A previous PASS is invalidated when later code changes touch its reviewed trust boundary.

## Final audit

Before PASS verify:

- exact change set reviewed,
- all changed trust boundaries mapped,
- all applicable Security Rule clauses evaluated,
- required adjacent context inspected,
- all mandatory runtime/specialized evidence obtained,
- no unresolved Critical/High/Medium finding,
- no applicable Rule/acceptance-criterion violation,
- low/info findings documented,
- evidence contains no secrets/private documents,
- no production exploitation or production data mutation occurred,
- no code/config/data was modified by this Skill.

Missing mandatory evidence prevents PASS.

## Result contract

Return exactly:

```text
SECURITY-REVIEW
result: PASS | FAIL | BLOCKED
story: <US-NNN or NONE>
baseline: <ref>
change_set: <ref/paths>
trust_boundaries: <integer>
requirements: <passed>/<total>
critical: <integer>
high: <integer>
medium: <integer>
low: <integer>
info: <integer>
blocked_checks: <integer>
runtime_environment: <non-production target or NOT_USED>
production_exploitation: NOT_PERFORMED
code_modified: NO
evidence: <summary/path/runtime evidence>
next_step: CONTINUE_VALIDATION | SENIOR_CODER_FIX | RESOLVE_BLOCKER
```

`next_step`:

- PASS → `CONTINUE_VALIDATION`
- FAIL → `SENIOR_CODER_FIX`
- BLOCKED → `RESOLVE_BLOCKER`

## PASS definition

PASS means the reviewed change has no confirmed applicable Security Rule/acceptance-criterion violation, no confirmed Critical/High/Medium vulnerability, all mandatory security checks have evidence, and only permitted Low/Info observations remain.

PASS is scoped to the reviewed change and evidence. It is not certification that the entire SaaS is vulnerability-free.

## FAIL definition

FAIL means reliable evidence confirms a security requirement violation, security regression, or Critical/High/Medium vulnerability in reviewed scope.

Do not implement the fix.

## BLOCKED definition

BLOCKED means a mandatory security conclusion cannot be reached safely or deterministically, for example because required runtime, identity, RLS, artifact, browser, or configuration evidence is unavailable.

## Boundary with other Skills

- `run-ralph-story` decides when security review is required and owns the remediation/commit lifecycle.
- `database-migration` owns migration execution and direct RLS/ownership migration evidence.
- `browser-validation` owns browser interaction evidence used by security checks when applicable.
- `export-validation` owns exported-artifact validation.
- `visual-regression` owns visual comparison, not security conclusions.
- `release-validation` may aggregate completed security evidence.

`code-reviewer` remains the independent general code-review gate after required specialized validation. This Skill is the specialized security gate.
