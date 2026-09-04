---
description: Begin a user story — verify the branch, record the story, and state what will and will not prompt.
argument-hint: <story-id or title>
---

Begin user story: **$ARGUMENTS**

## Do not ask about approval mode

That question was withdrawn on 2026-09-04 at the owner's explicit instruction.
Work proceeds uninterrupted through the story. See CLAUDE.md §19.

Editing source, tests, migrations, CI config and dependencies, running any
check, and creating commits are ordinary story work. Do them.

## 1. Verify the branch

Run `git rev-parse --abbrev-ref HEAD`. If it is `main`, stop and report a
BLOCKER: CLAUDE.md §5 forbids implementation there, and the hook denies
repository mutation on `main` regardless.

If a Ralph contract is active, the branch must equal its `branchName`.

## 2. Record the story

Write `.claude/governance-state.json` (gitignored):

```json
{
  "storyId": "<id from $ARGUMENTS, or a slug of the title>",
  "storyTitle": "<title>",
  "branch": "<current branch>",
  "activatedAt": "<ISO-8601 UTC>"
}
```

Take the timestamp from the shell — `date -u +%Y-%m-%dT%H:%M:%SZ` — rather
than from memory. This is a record for the post-commit hook and for anyone
reading back, not a gate: nothing asks for it and its absence grants nothing.

## 3. State the boundary once, then work

Print the story, the branch, and one line naming what will still stop for the
owner: push, merge, PR actions, releases, `vercel`, and hosted-database
commands. Then begin, and do not ask again until you reach one of those.

Under Ralph, continue with the `run-ralph-story` skill.
