---
description: Show the active approval mode, story and protected-action list; switch mode with `standard` or `fast-track`.
argument-hint: "[standard|fast-track]"
---

Argument: **$ARGUMENTS** (empty = report only)

## No argument — report

Read `.claude/governance-state.json`. If it is missing, empty, malformed, has
no `storyId`, or `expiresOn` is in the past, report **STANDARD** and say which
of those it was — the hook applies the same fallback, and a state file that
looks active but is being ignored is worth surfacing.

Report: active mode, story id and title, branch, activated-at, expires-on, and
whether the branch in the file still matches the current branch. A mismatch
means the state belongs to different work and should be treated as stale.

Then print the non-negotiable gates, which apply in **both** modes:

```
git commit · git push · gh pr create/merge/edit · git merge · git rebase
branch or tag deletion · rm -rf · pnpm/npm/yarn add|install <pkg>
supabase db push / link / migration up · psql against a non-local host
vercel · gh api writes · gh release
edits to: .github/**, package.json, pnpm-lock.yaml, vercel.json,
          supabase/migrations/**, .claude/settings*, .claude/hooks/**
```

Add the two facts that are easy to get wrong:

- These are enforced by `.claude/hooks/pre-tool-guard.ps1`, not by
  instructions. The hook returns `ask`, which overrides any `allow` rule — so
  an "always allow" click cannot ungate them.
- `.env` access and destructive git (`push --force`, `reset --hard`,
  `git clean`, `commit -a`) are **denied outright**, not prompted, and on
  `main` every mutating command is denied regardless of mode.

## `standard` — switch down

Rewrite the state file with `"mode": "STANDARD"`, keeping the story fields.
No confirmation needed: this only removes permissions.

## `fast-track` — switch up

This widens permissions, so confirm first with `AskUserQuestion` before
writing anything. Show the story it will apply to and the expiry.

Refuse and report a BLOCKER if:

- the current branch is `main` — mutation is denied there regardless, so Fast
  Track would be inert and misleading; or
- the state file has no `storyId` — Fast Track is scoped to exactly one story,
  and a mode that cannot expire with a story is not scoped at all.

On confirmation, set `"mode": "FAST_TRACK"` and set `expiresOn` to 24h from
now, read from the shell rather than assumed.
