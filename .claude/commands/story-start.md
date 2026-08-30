---
description: Begin a user story — asks which approval mode to use, writes the governance state file, and prints the active mode.
argument-hint: <story-id or title>
---

Begin user story: **$ARGUMENTS**

You are starting a new user story. Follow these steps exactly, in order.

## 1. Never assume the mode

Mode is **never** inherited from a previous story, from the state file, or
from what the user chose last time. Ask every time, even if Fast Track was
active five minutes ago for a different story.

Ask with `AskUserQuestion`, header `Approval mode`, exactly two options:

- **STANDARD** — current behaviour. Routine actions follow the existing
  permission rules; anything unlisted prompts.
- **FAST TRACK** — routine local implementation actions are auto-approved for
  the duration of *this story only*: lint, typecheck, test, build, dev server,
  local Supabase, explicit `git add --`, and source-file edits.

State plainly in the question that the non-negotiable gates in §3 of
CLAUDE.md apply in **both** modes, so the choice only affects how fast code
gets written, never how it ships.

## 2. Verify the branch before writing any state

Run `git rev-parse --abbrev-ref HEAD`. If it is `main`, stop and report a
BLOCKER — CLAUDE.md §5 forbids implementation on main, and the hook denies
repository mutation there regardless of mode, so Fast Track would be inert
and misleading.

## 3. Write the state file

Write `.claude/governance-state.json` (gitignored — per-developer session
state, not repo config):

```json
{
  "storyId": "<id from $ARGUMENTS, or a slug of the title>",
  "storyTitle": "<title>",
  "mode": "STANDARD" | "FAST_TRACK",
  "branch": "<current branch>",
  "activatedAt": "<ISO-8601 UTC>",
  "expiresOn": "<ISO-8601 UTC, activatedAt + 24h>"
}
```

Get timestamps from the shell, not from memory — you do not know the wall
clock. `date -u +%Y-%m-%dT%H:%M:%SZ` works in this repo's Git Bash.

The expiry is a backstop, not the primary lifetime. Fast Track ends when the
story is committed, abandoned, or the user says "exit fast track" — whichever
comes first. The 24h stop exists so a forgotten state file cannot grant
anything indefinitely.

## 4. Confirm what you activated

Print: the story, the branch, the mode, the expiry, and — if Fast Track — the
one-line reminder that commit, push, PR, merge, dependency installs, migrations
and CI/secret edits still prompt.

## 5. Then begin the story

Under Ralph, continue with the `run-ralph-story` skill. Otherwise proceed with
the story normally.

## On ending

When the story's commit lands, `.claude/hooks/post-commit-governance.ps1`
resets the state to STANDARD automatically and says so. You do not need to do
it, and you should not assume it failed — check the state file if unsure.
It deliberately does not fire on `git commit --amend`, since an amend means
the commit has not finished landing.

For the other endings — the user abandons the story, or says "exit fast
track" — rewrite the state file with `"mode": "STANDARD"` yourself and report
it. A stale Fast Track is the one failure mode that silently widens
permissions for unrelated later work.
