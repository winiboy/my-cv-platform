# PRD Lifecycle

A PRD is the human-readable feature contract (`CLAUDE.md` §3, rank 2). This
document says where one lives at each stage, what it is called, when it is
archived, and who decides. It describes the rule going forward. It does not
move, rename or delete anything that exists today; the inventory at the end
records the backlog so the owner can act on it deliberately.

## The four stages

| Stage | Location | Name | Who moves it here |
|---|---|---|---|
| Draft | `tasks/prds/<slug>.md` | `<slug>.md`, lowercase kebab-case | `create-prd`, or the owner |
| Approved | same file, same path | unchanged | **the owner only**, by writing the approval line |
| Executing | same file; the execution contract is `tasks/ralph/prd.json` | unchanged | `prd-to-json`, after approval |
| Closed | `tasks/ralph/archive/<YYYY-MM-DD>-<slug>/` | `prd.json` + `progress.txt` | the owner, when the initiative's PR merges |

One initiative, one slug. The slug is chosen at draft time and does not change
again: it names the PRD file, the Ralph branch (`ralph/<slug>`), and the
archive directory. A PRD that turns out to need a second pass gets a new slug
naming the pass (`milestone-c-part-2-exports-and-parity`), never a `-v2`,
`-fix` or `_V2` suffix on the old one.

### Naming

- Lowercase, kebab-case, no `prd-` prefix (the directory already says it),
  no `PRD-` prefix, no Title-Case, no spaces, no `.json` sibling beside the
  `.md`. The Ralph execution contract is `tasks/ralph/prd.json` and its
  archived copy — nowhere else.
- `tasks/prds/template.md` is the starting shape and is exempt.
- Nothing new is created at `tasks/prd-*.md`. That location is closed.

### Approval

Approval is an owner act and the only thing that distinguishes draft from
approved. It is recorded in the PRD itself, on one line near the top:

```
Status: APPROVED <YYYY-MM-DD>
```

No agent writes that line, and no agent infers approval from a PRD's contents,
its completeness, or a conversation. An unapproved PRD may not be converted to
`prd.json` and may not be implemented (`CLAUDE.md` §8). A PRD carrying no
status line is a draft.

The active `tasks/ralph/progress.txt` header cites the PRD path and its
approval date; `tasks/ralph/progress.txt` shows the form.

### Archiving

An initiative closes when its PR merges into `main`. At that point the owner
copies the final `tasks/ralph/prd.json` and `tasks/ralph/progress.txt` into
`tasks/ralph/archive/<merge-date>-<slug>/` and clears `tasks/ralph/` for the
next initiative. The approved PRD stays in `tasks/prds/` — it is the contract
that was agreed, and it remains readable there.

Archiving is bookkeeping, not judgement: it happens because a merge happened.
Superseding, abandoning or deleting a PRD is judgement, and belongs to the
owner alone. An agent may propose that a PRD is superseded; it may not act
on that.

### Superseded and abandoned drafts

A draft that will not be built is marked, not deleted:

```
Status: SUPERSEDED <YYYY-MM-DD> by <slug>
Status: ABANDONED <YYYY-MM-DD> — <one line why>
```

This keeps the reason discoverable next to the document that needs it. Only
the owner writes these lines.

## Inventory — state on 2026-09-25

Counted on branch `ralph/milestone-c-part-3-parity-defects`. Counts, not a
file list; re-count rather than trusting these numbers later.

| Location | Files | Tracked | Untracked |
|---|---|---|---|
| `tasks/prds/` | 46 (42 `.md`, 4 `.json`) | 21 | 25 |
| `tasks/prd-*.md` (top level) | 25 | 6 | 19 |
| `tasks/ralph/` (active contract + progress) | 2 | 2 | 0 |
| `tasks/ralph/archive/` (20 initiatives × 2 files) | 40 | 36 | 4 |
| Other files under `tasks/` | 3 | 0 | 3 |
| **Total** | **116** | **65** | **51** |

What the counts mean for cleanup:

- **Two locations hold the same PRDs.** 14 slugs appear both in `tasks/prds/`
  and as `tasks/prd-<slug>.md`. Those 28 files are at most 14 documents, and
  the pairs are not guaranteed identical — each pair needs a diff before
  either side is removed.
- **Three naming conventions in `tasks/prds/` alone**: Title-Case-Hyphen,
  lowercase-kebab, and a `prd-`/`PRD-` prefix. Plus 4 `.json` files that are
  execution contracts sitting in the draft directory.
- **`-fix`, `-v2` and `_V2` suffixes** mark at least five multi-pass
  initiatives whose relationship is encoded only in the filename.
- **Only 20 initiatives archived** against ~40 candidate PRDs, so the
  majority of these documents have no recorded outcome — neither merged,
  superseded, nor abandoned.
- **44 % of the files are untracked.** Git is authoritative for project state
  (`CLAUDE.md` §3); these documents are outside it. Deciding which to commit
  and which to drop is prerequisite to any move.

### Owner decisions this document does not make

1. Whether `tasks/prd-*.md` is deleted after diffing against `tasks/prds/`, or
   kept read-only as history.
2. Whether the 51 untracked files are committed, or intentionally local.
3. Which existing PRDs are superseded — that requires product knowledge, not
   file inspection.

Until those are decided, the rule above applies to new PRDs only, and no
existing file moves.
