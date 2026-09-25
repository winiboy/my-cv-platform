# `progress.txt` — the required shape of a story entry

`tasks/ralph/progress.txt` is rank 5 in the source-of-truth hierarchy
(`CLAUDE.md` §3): the execution and validation evidence. This document fixes
what an entry must contain. The template in
`.claude/skills/run-ralph-story/SKILL.md` §11 gives the skeleton; this gives
the standard the content has to meet.

**Worked example: `tasks/ralph/progress.txt`, the Milestone C Part 3 entries
(US-001 onward).** Read one before writing one. Past entries are not rewritten
to this standard — it is what they already established.

## The rule in one line

Every claim is a thing someone else could check: a command that was run, a
count it produced, a hash that pins an artifact, or a limit stated by name.

## Required sections

Written in the SKILL.md §11 order. A section that does not apply is present
and marked `NOT_APPLICABLE` with a reason — never omitted.

| Section | Requirement |
|---|---|
| Header | `## US-NNN: <title>` exactly as the story is titled in `prd.json`. |
| `Status` | `PASS`. An entry is written only for a story that passed; a FAIL round is recorded inside the entry, under Agents. |
| `Priority`, `Branch` | From `prd.json`. Branch must equal `prd.json.branchName`. |
| `Baseline HEAD` | A real SHA. Note its relation to `origin/main` when it is not obvious. |
| `Worktree` | Present when work happened outside the main checkout, with the reason. |
| `Scope` | Scope-check verdict, then every changed path, then the explicit negatives — what was *not* touched (`src/` untouched, no baseline moved, no version change, no push or merge). |
| `Checks` | One line per check: name, verdict, and the number it produced. |
| `Specialized validation` | Browser / Visual / Export / Database / Security, each PASS or NOT_APPLICABLE **with a reason**. |
| `Agents` | `ui-expert` and `code-reviewer` verdicts, including every FAIL round and what the finding was. |
| `Acceptance criteria` | One line per AC id, each with the evidence that satisfies it. |
| `Commit` | `THIS_COMMIT` placeholder and the commit message. |
| `FINAL` | `PASS`. |

## What "evidence" has to look like

A verdict with no number is not evidence.

- **Counts, not adjectives.** `pnpm test (unit): PASS — 333/333`, not "tests
  pass". `pnpm lint: PASS — 306 problems, at baseline, under the PRD's 311
  ceiling` — the measured number, the comparison, and the limit it is compared
  against, named.
- **Hashes pin artifacts.** A determinism claim needs the runs and the digest:
  `two runs, reports byte-identical, sha256 e8a314cd…`. "Deterministic" alone
  is a belief.
- **Exports are inspected, not requested.** `generated DOCX inspected as
  unzipped word/document.xml, not an HTTP 200` — and where templates must not
  move, the byte-identity evidence for each (`6 hashes`).
- **Negatives are commands too.** `git diff -- src empty` is checkable;
  "no source changes" is not.
- **Limits are named where they live.** A ceiling cited as "the PRD's 311" can
  be looked up. A bare number cannot.

## Beyond the skeleton — sections Part 3 added and that are now required

These are not in SKILL.md §11. They are required because the Part 3 entries
proved they carry the information that is otherwise lost.

- **`Decision (AC-NN)`** — when the story chose between defensible
  implementations, the choice, the reason, and the alternative that was
  rejected and why. If the decision is also recorded in a source comment, the
  entry says which file holds it.
- **`Open owner decisions recorded by this story`** — questions the story
  surfaced but is not blocked by, each naming the story it must be answered
  before. A story is not the place to invent an answer (`CLAUDE.md` §8); it is
  the place to record the question where the next story will find it.
- **`Environment notes`** — anything that makes a result non-portable or a run
  non-repeatable: stalls and whether they were re-run or absorbed, machine
  dependence, timing. A green run with an unexplained stall is not clean.

## Named limits — say what could not be shown

An entry states the boundary of its own evidence. A criterion that cannot be
exercised as written is recorded as such, with the reason, and raised as an
owner decision — not quietly marked PASS. The Part 3 US-001 entry does this
for US-013's print band: under print rules the assertion would match whether
or not the behaviour was correct, so the criterion itself needs revising.

Unavailable test infrastructure is reported as a limitation, never replaced
with a substitute result (`.claude/rules/testing.md`).

## Prohibited

- `TBD` as evidence, and any verdict for a check that did not run.
- Adjectives in place of counts.
- Rewriting or tidying a past entry. The log is append-only: a later
  correction is a later entry that names what it corrects.
- Hand-written totals that restate a number already recorded elsewhere. They
  drift, and a stale count is worse than no count — cite the source instead.
