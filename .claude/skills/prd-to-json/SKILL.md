---
name: prd-to-json
description: Converts one explicitly approved my-cv-platform PRD into the repository's Ralph prd.json execution contract. Use only after human approval of a PRD and before Ralph story execution. Preserves approved scope and story meaning, validates one-to-one parity, and does not implement code, execute Ralph, create commits, push, merge, or archive prior Ralph work.
---

# PRD to JSON

## Purpose

Convert one explicitly approved human-readable PRD into one deterministic Ralph execution contract at `tasks/ralph/prd.json`.

This Skill is a transformation and validation procedure only.

It must preserve the approved PRD's meaning. It must not add product requirements, redesign scope, reinterpret ambiguous requirements, implement application code, or execute Ralph.

## Inputs

Required:

- `source_prd`: repository-relative path to the approved PRD `.md`.
- `branch_name`: exact feature/Ralph branch name to store as `branchName`.
- `approval`: explicit human approval for this exact PRD.

Optional:

- `output_path`: repository-relative JSON path. Default: `tasks/ralph/prd.json`.
- Explicit authorization to replace an existing active Ralph contract, but only when the caller also confirms the previous Ralph work is closed or already archived.

Do not infer approval from a prior assistant statement, repository age, PRD completeness, or the absence of open questions.

If the exact PRD approval or exact branch name is missing, return `BLOCKED`.

## Preconditions

1. Load and follow the repository root `CLAUDE.md`.
2. Load `.claude/rules/git.md` and `.claude/rules/testing.md`.
3. Load any additional Rule files explicitly referenced by the approved PRD or required to interpret its validation constraints.
4. Read `source_prd` in full.
5. Confirm the approval applies to that exact PRD path and revision/content.
6. Confirm `branch_name` satisfies active Git governance.
7. Confirm the PRD has at least one user story.
8. Confirm every user story has:
   - a unique `US-NNN` ID,
   - a non-empty title,
   - a non-empty description,
   - at least one acceptance criterion.
9. Confirm no unresolved material open question or blocker remains.
10. Inspect the current repository Ralph JSON shape before writing so the generated file stays schema-compatible.
11. Inspect the destination path before writing.

If any precondition fails, return `BLOCKED` and do not write or replace `prd.json`.

## Destination Safety

Default destination:

`tasks/ralph/prd.json`

If the destination does not exist, it may be created.

If the destination already exists:

1. Generate the candidate JSON in memory.
2. If the existing file is semantically identical to the candidate, do not rewrite it; return success with `write: NOT_NEEDED`.
3. If it differs, do not overwrite it unless the caller explicitly authorized replacement **and** confirmed the previous Ralph work is closed or already archived.
4. This Skill does not archive the previous Ralph contract or `progress.txt`.

Never delete or silently replace an unrelated active Ralph contract.

## Canonical Ralph JSON Shape

Generate exactly this object shape:

```json
{
  "project": "my-cv-platform",
  "branchName": "<branch_name>",
  "description": "<approved PRD objective>",
  "userStories": [
    {
      "id": "US-001",
      "title": "<story title>",
      "description": "<story description>",
      "acceptanceCriteria": [
        "<criterion>"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

Do not introduce new top-level or story-level fields unless the repository's active Ralph schema has deliberately changed before invocation.

## Transformation Rules

### 1. `project`

Set:

`"project": "my-cv-platform"`

Do not derive or vary this value.

### 2. `branchName`

Set `branchName` to the exact approved `branch_name` input.

Do not create the branch.

Do not rename the branch.

Do not derive a fallback branch name.

### 3. `description`

Use the PRD `Objective` as the source.

Normalize Markdown formatting and whitespace only as needed to produce one valid JSON string.

Do not add implementation strategy, inferred scope, or new requirements.

If the Objective cannot be reduced to one faithful execution description without changing its meaning, return `BLOCKED`.

### 4. User story order

Preserve PRD user-story order exactly.

Do not merge, split, reorder, delete, or synthesize user stories.

The number of JSON user stories must equal the number of approved PRD user stories.

### 5. Story `id`

Copy the PRD user-story ID exactly.

IDs must remain unique and sequential in the approved order.

Do not renumber silently.

If IDs are malformed, duplicated, or non-sequential, return `BLOCKED`.

### 6. Story `title`

Copy the story title semantically unchanged.

Remove Markdown heading syntax only.

Do not rewrite the outcome.

### 7. Story `description`

Copy the story description semantically unchanged.

Normalize Markdown whitespace only.

Do not convert the story into an implementation instruction.

### 8. Story-local acceptance criteria

Copy every acceptance criterion from the story in the same order.

Normalize only Markdown list/checkbox syntax such as:

- `- [ ]`
- `- [x]`
- `-`
- surrounding emphasis markers

Do not weaken, combine, reinterpret, or omit criteria.

A checked checkbox in the approved PRD does **not** cause `passes: true`; all generated Ralph stories start with `passes: false`.

### 9. PRD-wide execution constraints

The Ralph JSON schema has no separate fields for cross-story requirements. Preserve execution-relevant PRD-wide constraints by appending them to every story's `acceptanceCriteria` after the story-local criteria.

Append in this exact section order when the section exists and is non-empty:

1. `Functional Requirements`
2. `Regression Constraints`
3. `Required Verification`
4. `FAIL Conditions`
5. `BLOCKER Conditions`
6. `Out of Scope`

Prefix normalized entries as follows:

- `FR-<n>: <text>` for Functional Requirements, preserving the PRD identifier.
- `Regression constraint: <text>`
- `Verification: <text>`
- `FAIL condition: <text>`
- `BLOCKER condition: <text>`
- `Out of scope: <text>`

Do not duplicate an item if the same normalized requirement already exists verbatim in that story's acceptance criteria.

Do not copy explanatory prose, Risks, Context, Evidence/References, or Approval Gate into acceptance criteria.

If a PRD-wide item conflicts with a story-local criterion, return `BLOCKED`.

### 10. Open questions

`Open Questions` are not copied into JSON.

If the approved PRD contains any unresolved material open question, return `BLOCKED`.

Only a clearly resolved/empty state such as `None.` permits conversion.

### 11. `priority`

Assign numeric priority from approved PRD order:

- first story = `1`
- second story = `2`
- continuing sequentially

Do not infer business priority from wording.

If the approved PRD explicitly defines a different complete, unique numeric execution order, preserve that order only when the human approval explicitly includes it.

### 12. `passes`

Set every story to:

`"passes": false`

Never carry a PASS state from an earlier JSON, archived execution, PRD checkbox, or previous conversation.

### 13. `notes`

Set every story to:

`"notes": ""`

Execution evidence belongs to Ralph execution/progress, not this conversion step.

## Procedure

### 1. Verify approval

Confirm the caller explicitly approved `source_prd`.

Accept either:

- explicit approval in the current invocation/context for the exact source PRD, or
- an authoritative approval marker supplied with the invocation.

Do not self-approve.

Do not treat `READY_FOR_APPROVAL` from `create-prd` as approval.

### 2. Parse the approved PRD

Extract:

- title,
- objective,
- user stories,
- each story's description,
- each story's acceptance criteria,
- Functional Requirements,
- Regression Constraints,
- Required Verification,
- FAIL Conditions,
- BLOCKER Conditions,
- Out of Scope,
- Open Questions.

If required sections are structurally ambiguous, return `BLOCKED` rather than guessing.

### 3. Validate source integrity

Verify:

- one primary objective,
- at least one user story,
- unique/sequential story IDs,
- non-empty acceptance criteria,
- no unresolved open questions,
- no internal contradiction between story criteria and PRD-wide constraints.

Do not "fix" an approved PRD during conversion.

If the PRD itself needs correction, return `BLOCKED` and route the correction back to PRD authoring/approval.

### 4. Validate execution references

For exact repository commands named by the approved PRD, confirm they correspond to adopted repository capabilities before carrying them into the execution contract.

Do not invent replacement test frameworks or commands.

If an approved exact command is no longer available and this materially affects execution, return `BLOCKED`.

### 5. Build the JSON in memory

Create the canonical object with deterministic key ordering:

Top-level:

1. `project`
2. `branchName`
3. `description`
4. `userStories`

Story-level:

1. `id`
2. `title`
3. `description`
4. `acceptanceCriteria`
5. `priority`
6. `passes`
7. `notes`

### 6. Perform PRD ↔ JSON parity audit

Before writing, verify:

- PRD story count equals JSON story count.
- Every PRD story ID appears exactly once.
- Story order is unchanged.
- Story title meaning is unchanged.
- Story description meaning is unchanged.
- Every story-local acceptance criterion appears exactly once.
- Every applicable PRD-wide execution constraint is present according to the transformation rules.
- No requirement exists in JSON without a source in the approved PRD or repository-mandated transformation contract.
- All `passes` values are `false`.
- All `notes` values are empty.
- Priorities are deterministic and unique.
- `branchName` equals the approved input exactly.

Any mismatch is `FAIL`; do not write the JSON until corrected.

### 7. Validate JSON syntax and schema

Serialize as UTF-8 JSON with:

- 2-space indentation,
- double-quoted JSON strings,
- no comments,
- a final newline.

Parse the generated file/object back as JSON.

Verify the canonical fields and types:

```text
project: string
branchName: string
description: string
userStories: array

userStories[].id: string
userStories[].title: string
userStories[].description: string
userStories[].acceptanceCriteria: array of non-empty strings
userStories[].priority: positive integer
userStories[].passes: boolean and false
userStories[].notes: string and empty
```

Reject unexpected fields unless the repository's active Ralph schema has deliberately changed and the Skill itself has been updated accordingly.

### 8. Handle existing destination

Apply the Destination Safety rules.

Never archive, delete, or overwrite unrelated Ralph execution state implicitly.

### 9. Write the JSON

Write only the approved destination file.

Do not create or modify:

- `progress.txt`
- application code
- tests
- migrations
- agents
- Rules
- hooks
- settings
- CI
- package version
- Git tags

### 10. Re-read and verify

After writing:

1. Re-read the destination.
2. Parse it successfully.
3. Repeat the parity audit against the approved PRD.
4. Confirm the stored `branchName`.
5. Confirm every story still starts with `passes: false` and `notes: ""`.

Only then may the Skill return `READY_FOR_RALPH`.

## Result Contract

Return exactly this result shape:

```text
PRD-TO-JSON
result: READY_FOR_RALPH | BLOCKED
source_prd: <repository-relative path>
prd_json: <repository-relative path or NONE>
branch: <exact branch name or NONE>
user_stories: <integer>
acceptance_criteria: <integer>
approval_check: PASS | FAIL
parity_check: PASS | FAIL | NOT_RUN
schema_check: PASS | FAIL | NOT_RUN
write: CREATED | REPLACED | NOT_NEEDED | NOT_WRITTEN
next_step: RUN_RALPH_STORY | RESOLVE_BLOCKERS
```

`READY_FOR_RALPH` means the approved PRD has been converted into a valid Ralph execution contract.

It does **not** mean:

- a branch was created,
- Ralph ran,
- implementation started,
- validation passed,
- a commit was created,
- anything was pushed or merged.

## Failure and Blocker Conditions

Return `BLOCKED` without writing when any of the following applies:

- exact human approval is missing,
- `source_prd` is missing or unreadable,
- `branch_name` is missing or violates active Git governance,
- the PRD has no user stories,
- story IDs are duplicated, malformed, or non-sequential,
- a story has no acceptance criteria,
- an unresolved material open question remains,
- approved requirements contradict each other,
- required PRD structure cannot be parsed deterministically,
- an exact required execution command is no longer supported by the repository,
- an existing active Ralph contract would be overwritten without the required replacement authorization/closure evidence,
- PRD ↔ JSON parity fails,
- JSON syntax/schema validation fails.

Do not resolve these conditions by inventing missing requirements.

## Boundary With Other Skills

- `create-prd` creates the human-readable draft PRD and stops before approval.
- `prd-to-json` converts the explicitly approved PRD into Ralph's execution contract.
- `run-ralph-story` consumes the active `prd.json` one story at a time.
- Browser, visual, export, database, security, and release validation Skills execute or collect downstream evidence; `prd-to-json` only preserves their approved requirements inside the execution contract when the PRD requires them.

## Non-Responsibilities

This Skill must not:

- author a new product requirement,
- materially rewrite an approved PRD,
- approve a PRD,
- create or switch Git branches,
- implement production code,
- execute Ralph,
- mark stories as passed,
- write execution evidence,
- commit,
- push,
- open or merge a PR,
- archive previous Ralph work,
- modify CI, agents, Rules, hooks, permissions, settings, or application code.
