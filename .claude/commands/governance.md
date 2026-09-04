---
description: Show the active story and exactly which actions still stop for the owner.
---

Report the current interruption policy. Do not change it from here — the
policy lives in `.claude/hooks/pre-tool-guard.ps1` and `.claude/settings.json`,
and changing it means editing the hook and its tests together.

## Report

Read `.claude/governance-state.json`. If it is missing or malformed, say so
and report no active story — that is a normal state and grants nothing either
way.

Print the active story id, title, branch, and whether that branch still
matches the current branch. A mismatch means the record belongs to other work.

Then print the policy, which is not conditional on any of the above:

```
PROMPTS THE OWNER — shipping actions only
  git push · git merge
  gh pr create|merge|edit|close|reopen · gh release
  pnpm publish · vercel
  supabase db push|link · psql against a non-local host

BLOCKED OUTRIGHT — refusals, not questions
  .env access
  git push --force · reset --hard · git clean · commit -a
  git add . · git add -A · git add --all
  any repository mutation while on main

EVERYTHING ELSE RUNS UNINTERRUPTED
  source, tests, migrations, CI config, dependencies, any check, commits
```

Add the two facts that are easy to get wrong:

- The hook returns `ask` for the shipping list, and that overrides any `allow`
  rule — so an "always allow" click cannot ungate a shipping action.
- 162 cases in `run-phase-05-3.ps1` and 61 in `run-governance-modes.ps1` assert
  this policy. If you change the hook without changing them, they will assert a
  policy that no longer exists.

## On changing the policy

If the owner wants something added to or removed from the shipping list, edit
`$script:ProtectedCommandRules` in the hook, mirror it in
`.claude/settings.json`, update both test suites, and run them. Do not edit one
without the others.
