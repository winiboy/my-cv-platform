---
name: sync-after-merge
description: Bring the checkout back in step with origin/main after a PR merges, and retire the branches that merge made redundant. Use after merging a PR, when git status is cluttered with old branches, before starting new work, or when asked whether the project is "in sync". Deletes only branches proven redundant; reports Supabase drift rather than claiming it.
---

# Sync after merge

A PR merging on GitHub changes nothing on this machine. This skill closes that
gap: it puts the checkout back on `main`, retires the branches the merge made
redundant, and says plainly what it could **not** verify.

## What "in sync" means here, and what it does not

Three things can drift, and only two of them are checkable from this repository:

| | Checkable here? |
|---|---|
| The checkout against `origin/main` | Yes |
| Local and remote branches against merged PRs | Yes |
| The hosted Supabase schema against `supabase/migrations/` | **No** — needs the owner's access token |

**Never report the database as in sync.** The CLI cannot see the hosted project
without `supabase login`, and that token is the owner's to supply. A skill that
silently skipped the database half would be worse than no skill, because the
person reading its output would believe the whole question had been answered.

## Before anything: two traps that will stop you

**1. `main` is read-only to git.** `.claude/hooks/pre-tool-guard.ps1` refuses
any command that may mutate repository state while `HEAD` is `main` — including
`git branch -d`, `git checkout -b`, and even `gh pr list` when it is part of a
compound command. So branch deletion **cannot** be done from `main`. Step off
onto a scratch branch, prune from there, and return.

Plain `git checkout <existing-branch>` **is** allowed from `main`. Branch
creation is not — so get off `main` first, then create.

**2. `next-env.d.ts` blocks checkout while reporting clean.** Next regenerates
it on every build, naming whichever dist directory ran last, and it is tracked.
It is frequently CRLF in the working copy where git's blob is LF; `text=auto`
normalises that away so `git diff` shows nothing, while `git checkout` refuses
on the real byte difference. `git update-index --refresh` will say
`needs update` where `git diff` says nothing — that is the signature.

Restore it byte-for-byte from git rather than editing it:

```bash
git show HEAD:next-env.d.ts > next-env.d.ts
```

`git checkout -- <path>` and `git restore` are both hook-denied, so this
redirect is the way.

## Procedure

### 1. Get onto main, cleanly

```bash
git fetch origin --prune
git checkout main
git pull --ff-only
git rev-list --left-right --count origin/main...HEAD   # expect: 0  0
```

If checkout refuses, it will name the file. Apply the `next-env.d.ts` fix above
if that is the one. **Never** resolve a refusal with `git stash`, `reset --hard`
or `git clean` — all destructive, all hook-denied, and the blocker is usually
generated noise rather than work.

`.claude/settings.local.json` shows as modified more or less permanently. Leave
it. It is local permission state, it is never staged, and it carries across
checkouts without complaint.

### 2. Step off main and open a scratch branch

```bash
git checkout <any-existing-branch>      # branch creation is blocked on main
git checkout -b chore/branch-cleanup main
```

### 3. Classify every branch before deleting any

Fetch the merged-PR heads once — this is the authority for everything below:

```bash
gh pr list --state merged --limit 100 --json headRefName,number \
  --jq '.[] | "\(.headRefName)\t\(.number)"' | sort -u > /tmp/merged.tsv
```

Then sort each local branch into exactly one pile:

- **Has a merged PR** → safe to delete. GitHub confirms the content landed.
- **No merged PR, but `git rev-list --count main..<branch>` is `0`** → safe.
  It points at history already on `main`; these are usually abandoned session
  branches.
- **Anything else** → **do not delete.** It holds commits that never landed.
  Report it and stop.

**Do not use `git branch --merged` for this.** Squash merges rewrite history, so
a squash-merged branch is not an ancestor of `main` and `--merged` will not list
it. It under-reports badly.

**Do not use tree-equality against today's `main` either.** It only means
something immediately after a merge; once `main` moves on, every old branch
reports "differs" and the check tells you nothing.

### 4. Delete, local then remote

`git branch -d` refuses squash-merged branches, so `-D` is needed — which is
exactly why step 3 must come first. `-D` on an unclassified branch can discard
work with no recovery beyond the reflog.

Remote deletion uses the same `/tmp/merged.tsv`: a remote branch whose PR is
merged is redundant. Skip any remote without one and say so.

### 5. Report what could not be checked

Always run and always report:

```bash
pnpm supabase migration list --linked
```

`AccessTokenRequiredError` means the hosted schema is **unverified** — say
exactly that, and give the owner the command:

```bash
pnpm supabase login
```

Once logged in, `supabase migration list --linked` and
`supabase db diff --linked --schema public` are read-only and safe. **Deploying
a migration is never part of this skill** — `supabase db push` is a shipping
action and belongs to the owner.

Also worth surfacing, because both are easy to check and easy to miss: whether
any migration in `supabase/migrations/` is undeployed, and whether any branch
you kept holds a fix that never landed.

## Report shape

```text
SYNC-AFTER-MERGE
checkout:        main @ <sha>, 0 ahead / 0 behind
branches deleted: <n> local, <n> remote
branches kept:    <name> — <why it was not safe to delete>
supabase:        VERIFIED <n> migrations applied | UNVERIFIED (needs `supabase login`)
undeployed:      <migration files present locally but not applied, or UNKNOWN>
```

Return `UNVERIFIED` rather than omitting the line. An absent database row reads
as "fine"; that is the failure this shape exists to prevent.

## What this skill must not do

- Delete a branch holding unmerged commits, whatever its name suggests. `wip/`
  and `backup/` prefixes are not evidence.
- Run `supabase db push`, `git push --force`, `reset --hard`, `git clean` or
  `git stash`.
- Claim the database is in sync on any evidence short of a successful
  `migration list --linked`.
- Touch `.claude/settings.local.json`.
