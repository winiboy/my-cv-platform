---
name: export-validation
description: Validates my-cv-platform resume exports against the approved requirements and canonical resume preview using actual PDF/print and DOCX artifacts. Use for export generation, file integrity, content parity, section order, template/layout settings, rich-text meaning, photo presence, and Preview ↔ PDF ↔ DOCX parity. Validation-only: never modifies production code or persisted resume data, never treats source inspection as artifact evidence, and never claims visual parity without rendering the exported artifact.
---

# Export Validation

## Purpose

Validate that requested resume exports faithfully represent the approved resume state and satisfy the export requirements.

This Skill evaluates actual generated artifacts. It does not implement or fix export code.

It can validate:

- Preview ↔ PDF/print parity,
- Preview ↔ DOCX parity,
- PDF ↔ DOCX cross-format consistency,
- file generation and integrity,
- content completeness,
- section order and visibility,
- selected template,
- layout/style settings,
- locale and user-entered characters,
- rich-text meaning,
- photo/image presence,
- format-specific rendering constraints.

## Authority and boundaries

Apply, in order:

1. root `CLAUDE.md`,
2. `.claude/rules/exports.md`,
3. `.claude/rules/resumes.md`,
4. `.claude/rules/testing.md`,
5. other applicable Rules,
6. approved PRD / active Ralph story,
7. this Skill.

Load `.claude/rules/security.md` when export inputs, files, authentication, uploads, or rich/untrusted content are relevant.

This Skill must not:

- write or modify production code,
- mutate persisted resume data to make an export pass,
- silently save an unsaved draft,
- change the selected template/settings,
- install export/rendering/test dependencies,
- invent an unavailable PDF/DOCX renderer,
- claim file validity from HTTP 200 alone,
- claim visual parity from extracted text/XML alone,
- approve omitted user content as a format limitation,
- push or merge.

## Inputs

Required:

- `requirements`: exact export acceptance criteria.
- `resume_fixture`: deterministic resume identifier/data source.
- `formats`: one or more of `PDF`, `DOCX`.
- `templates`: exact template(s) required by the approved scope.
- `source_state`: `SAVED` or `UNSAVED`.
- `base_url`: application environment used to generate exports.

Optional:

- `locales`
- `layout_settings`
- `reference_preview`
- `auth_context`
- `expected_filename`
- `evidence_path`
- `story_id`
- `format_specific_expectations`

Supported resume templates are discovered from current project governance/repository state. Do not invent templates.

## Source-state contract

The source state used for Preview and exports must be explicit.

### SAVED

Use when the approved scenario validates persisted resume data.

Generate Preview and requested exports from the same saved fixture/version.

### UNSAVED

Use only when the approved requirement explicitly expects export of the currently visible unsaved state.

Do not silently save the draft before exporting.

If Preview contains unsaved changes but the generated export contains older saved data, report the observable mismatch as `FAIL` when the requirement expects current-preview parity.

Do not switch to a saved fixture merely to make parity pass.

## Preconditions

Before generating artifacts:

1. Load applicable governance and Rules.
2. Preserve every supplied acceptance criterion verbatim.
3. Confirm requested formats/templates/locales are explicit or deterministically derivable from the approved requirement.
4. Confirm `source_state`.
5. Establish one deterministic resume content inventory.
6. Establish exact selected template and layout settings.
7. Confirm the application is reachable.
8. Confirm required authenticated session/test account is available without exposing secrets.
9. Confirm export generation can actually be triggered.
10. Confirm each required generated artifact can be acquired.
11. Confirm suitable inspection capabilities exist for every required evidence dimension.
12. Ensure fixtures/evidence contain no credentials, tokens, or unrelated private documents.
13. Record expected format-specific adaptations before inspection when the requirement permits them.

Missing mandatory prerequisites return `BLOCKED`.

## Canonical validation inventory

Before export, build an expected inventory from the approved source state.

Record, when present:

```text
resume_id
source_state
template
locale
name/contact fields
summary
experience entries
education entries
skills
languages
training
key achievements
custom/rich-text sections
section order
hidden sections
photo expected
font family
font scale
colors
sidebar width
top margins
other approved layout settings
```

The inventory describes expected facts and structure.

Do not derive expected content from an export artifact itself.

## Validation matrix

Create one row per requirement:

```text
requirement_id
exact_requirement
formats
templates
evidence_method
status: NOT_RUN
```

Every material requirement must map to actual artifact evidence.

## Procedure

### 1. Establish Preview reference

When parity with Preview is required, capture the actual canonical Preview for the same fixture, state, template, locale, and settings.

Use `browser-validation` when browser interaction/state setup is needed.

Record:

- route,
- source state,
- template,
- locale,
- settings,
- visible section order,
- hidden sections,
- photo state.

Do not use an editor screenshot that does not represent the canonical Preview state.

### 2. Generate each export through the product path

Generate artifacts using the same user-facing/API path the approved scenario exercises.

For PDF, validate the actual print/PDF output when the product export uses browser printing.

A normal screen screenshot is not proof of PDF/print output.

For DOCX, acquire the actual downloaded `.docx`.

Record for each:

```text
format
generation_method
request/action
result
filename
declared_mime
artifact_path/reference
size
```

Generation failure is `FAIL` when the environment is working and the product fails.

Inability to acquire the artifact because required tooling/environment is unavailable is `BLOCKED`.

### 3. Validate file identity and structural integrity

#### PDF

When PDF is required, verify with an actual PDF-capable inspection method:

- artifact is a PDF,
- non-empty,
- parseable/openable by the available PDF inspector,
- page count can be established when relevant,
- content can be extracted or pages rendered when required,
- extension/MIME agree with the requested format.

If a requirement needs visual/page evidence, render or inspect actual PDF pages.

#### DOCX

Verify the actual `.docx`:

- non-empty,
- valid OOXML/ZIP package,
- required document package parts are present,
- document content can be parsed by an available DOCX-capable method,
- extension/MIME agree with DOCX,
- images/media relationships are valid when images are expected.

Package/XML parsing proves structural/content evidence only.

If the requirement says the file must open/render correctly in a word processor, use an actually available compatible renderer/application. Otherwise that requirement is `BLOCKED`.

### 4. Validate content parity

Compare each requested artifact with the expected inventory and, when required, the Preview.

Verify applicable items:

- no user section silently omitted,
- no unexpected duplicated section,
- text/facts preserved,
- section headings preserved semantically,
- entries remain associated with correct section,
- section order preserved,
- hidden sections remain hidden,
- locale-specific labels/content are correct,
- user-entered Unicode/special characters survive,
- rich-text meaning survives,
- hyperlinks/list meaning survives when required,
- photo appears when required,
- no raw executable/user-injected markup is emitted as active content.

Content parity is format-semantic parity. It does not require identical internal PDF/DOCX representation.

Any missing user content prohibited by the export contract is `FAIL`, not an accepted “format limitation”.

### 5. Validate template and layout settings

For every affected template, verify applicable approved settings such as:

- selected template identity,
- sidebar/main structure,
- section order,
- sidebar width,
- margins,
- font family/scale,
- color treatment,
- typography hierarchy,
- spacing hierarchy,
- photo placement,
- hidden sections.

Do not assume a setting reached the export merely because application source code attempts to forward it.

Validate the artifact result.

### 6. Validate PDF/print presentation

When PDF layout is in scope, inspect actual printed pages for:

- correct resume content,
- correct template,
- print-only chrome excluded as required,
- no clipped/overflowing content,
- usable page boundaries,
- no unintended blank pages,
- intentional page breaks,
- readable text/images,
- expected A4/page sizing when required,
- layout settings reflected in print output.

If exact visual comparison is required, route rendered PDF page evidence to `visual-regression`.

### 7. Validate DOCX presentation

Content/XML inspection alone is insufficient for visual DOCX requirements.

When DOCX visual/layout parity is required:

1. render the actual DOCX using an available deterministic compatible renderer,
2. record renderer/application and version when available,
3. capture rendered page evidence,
4. compare against the approved Preview/reference using `visual-regression` at the evidence strength required by the PRD.

If no suitable renderer exists, content checks may still run, but visual DOCX requirements return `BLOCKED`.

Do not claim Word rendering parity from OOXML inspection alone.

### 8. Cross-format parity audit

When multiple formats are required, compare all formats against the same expected inventory/source state.

Audit:

```text
Preview → PDF
Preview → DOCX
PDF ↔ DOCX
```

Require exact parity for resume facts, required sections, section order, hidden/visible state, selected template semantics, and required user content.

Do not require identical pagination, line wrapping, or format-native internals unless the approved requirement explicitly requires them.

When exact cross-format visual parity is explicitly required, use rendered artifacts and `visual-regression`; if the required comparison capability is unavailable, return `BLOCKED`.

### 9. Template coverage

Validate only templates required by the active story/PRD, except when the approved requirement concerns export support generically across all supported templates.

For export-system-wide requirements, validate every supported template required by `.claude/rules/exports.md`.

Do not infer that one passing template proves another.

### 10. Locale coverage

Validate only required locales unless the approved requirement is explicitly platform-wide across all supported locales.

Use the same deterministic fixture semantics across locales where possible.

Record every locale actually exercised.

### 11. Failure reproduction

For each artifact failure, repeat the minimum export scenario once when safe and deterministic.

Record:

- reproducible: YES | NO,
- expected,
- actual,
- affected format/template/locale.

Do not retry until a flaky export passes.

A non-reproducible result is not PASS; classify as `BLOCKED` unless sufficient deterministic evidence proves a real defect.

### 12. Final evidence audit

Before PASS verify:

- every requested export was actually generated,
- every artifact was actually inspected,
- source state remained unchanged,
- expected inventory was independent from generated artifacts,
- content parity requirements have evidence,
- layout requirements have artifact-render evidence when required,
- all requested templates/locales were exercised,
- no mandatory check was skipped,
- format/MIME/extension agree,
- no baseline/reference was altered,
- no production/persisted data was changed by this Skill.

Missing mandatory evidence prevents PASS.

## Evidence record

Per artifact:

```text
EV-001
format: DOCX
template: professional
locale: en
source_state: SAVED
generation: PASS
integrity: PASS
content: PASS
layout: PASS | BLOCKED | NOT_APPLICABLE
photo: PASS | NOT_APPLICABLE
section_order: PASS
hidden_sections: PASS
rich_text: PASS
artifact: <path/reference>
status: PASS
```

For a mismatch:

```text
content: FAIL
expected: <expected source content/state>
actual: <artifact observation>
reproducible: YES
status: FAIL
```

## Result contract

Return exactly:

```text
EXPORT-VALIDATION
result: PASS | FAIL | BLOCKED
story: <US-NNN or NONE>
resume: <fixture identifier>
source_state: SAVED | UNSAVED
templates: <validated list>
locales: <validated list>
formats: <validated list>
generation: PASS | FAIL | BLOCKED
file_integrity: PASS | FAIL | BLOCKED
content_parity: PASS | FAIL | BLOCKED | NOT_APPLICABLE
layout_parity: PASS | FAIL | BLOCKED | NOT_APPLICABLE
pdf: PASS | FAIL | BLOCKED | NOT_APPLICABLE
docx: PASS | FAIL | BLOCKED | NOT_APPLICABLE
visual_regression: PASS | FAIL | BLOCKED | NOT_APPLICABLE
requirements: <passed>/<total>
failures: <integer>
blocked: <integer>
evidence: <summary/path/runtime evidence>
persisted_data_modified: NO
next_step: CONTINUE_VALIDATION | SENIOR_CODER_FIX | RESOLVE_BLOCKER
```

`next_step`:

- PASS → `CONTINUE_VALIDATION`
- FAIL → `SENIOR_CODER_FIX`
- BLOCKED → `RESOLVE_BLOCKER`

## PASS definition

PASS requires that every requested artifact was generated and inspected, file identity/integrity passed, required content and structure match the approved source state, required layout evidence passed, requested templates/locales passed, no prohibited content omission occurred, and this Skill did not modify production code or persisted resume data.

PASS is export evidence only. It does not prove general browser behavior, database migration safety, security review, or release readiness.

## FAIL definition

Return FAIL when the product/export is testable and an actual generated artifact reproducibly violates an approved export requirement.

Do not fix the defect in this Skill.

Return evidence suitable for `senior-coder`.

## BLOCKED definition

Return BLOCKED when reliable required export evidence cannot be obtained, including:

- application/export path unavailable,
- required authentication/test fixture unavailable,
- artifact cannot be acquired,
- required PDF/DOCX inspector unavailable,
- visual DOCX requirement but no compatible renderer,
- exact visual requirement but required comparison capability unavailable,
- source state is ambiguous,
- required deterministic fixture unavailable.

## Boundary with other Skills

- `browser-validation` owns browser interaction/navigation and may establish/capture Preview state.
- `visual-regression` owns exact/structured visual comparison of rendered Preview/PDF/DOCX evidence.
- `export-validation` owns generated export artifacts, their content/structure, and cross-format parity.
- `security-review` owns security-focused analysis beyond export-output evidence.
- `run-ralph-story` consumes this verdict and routes FAIL to `senior-coder`.
- `release-validation` may aggregate completed export evidence.

This Skill never repairs exports or changes persisted resume data.
