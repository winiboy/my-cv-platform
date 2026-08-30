# CLAUDE.md — my-cv-platform

## 1. Project Identity
`my-cv-platform` is a production-grade SaaS for resumes/CVs, cover letters, job applications, career tools, and AI-assisted content/analysis.
Supported locales: `fr`, `en`, `de`, `it`.
Quality, reproducibility, traceability, isolation, and deterministic behavior take priority over speed.

## 2. Technology
Core stack:

* Next.js App Router
* React + TypeScript
* Tailwind CSS + shadcn/ui
* Supabase / PostgreSQL + RLS
* NextAuth
* pnpm
* Git / GitHub
* Vercel
* Sentry
  Environment: Windows 11, PowerShell primary, Git Bash when appropriate.
  `pnpm` is the only package manager.

## 3. Source of Truth
Git is authoritative for project state.
Hierarchy:

1. `origin/main` = canonical repository baseline
2. Approved PRD `.md` = human-readable feature contract
3. `prd.json` = Ralph execution contract
4. Git commits = implementation history
5. `progress.txt` = execution and validation evidence
   Rules:

* Local `main` is not authoritative
* Never assume local `main` is current
* If documentation and repository state disagree, inspect Git and the active PRD
* Do not use old conversation history as project truth

## 4. Version
The application version is read exclusively from `package.json`.

* No parallel version source
* No version inference from tags, PRDs, comments, or branches
* Ralph must NOT bump version automatically
* One user story does NOT imply one version bump
* Version changes require an explicit release/versioning requirement

## 5. Branch Policy
`main` is immutable for development work.
Never develop, modify production code, commit feature work, or force-push on `main`.
All implementation must occur on a dedicated feature branch.
Typical flow:
`origin/main → feature branch → validation → review → commit → manual push → PR → merge`
If implementation is requested while the active branch is `main`, treat it as a BLOCKER.

## 6. Agent Authority
Claude operates under an agent-only implementation model.

### senior-coder
* ONLY agent allowed to write or modify production code
* ONLY agent allowed to propose concrete production code changes
* Performs implementation and fixes

### ui-expert
* UI/UX validation only
* Must NOT write or modify production code
* Returns PASS or FAIL

### code-reviewer
* Independent review only
* Must NOT write or modify production code
* Must NOT fix its own findings
* Returns PASS, FAIL, or BLOCKER
  Explore/Plan agents are read-only and must not modify production code.

## 7. Ralph Principles
Ralph is the orchestrator for PRD-driven implementation.

* Ralph NEVER works on `main`
* Ralph uses the branch defined for the active work
* Ralph executes only the active `prd.json`
* One user story = one commit
* Only one user story is implemented at a time
* Ralph respects PRD scope exactly
* Ralph does not invent requirements or perform unrelated refactors
* Ralph does not bump version automatically
* Ralph does not push automatically
* Push remains manual/user-controlled

## 8. PRD-First Development
Meaningful product changes require an approved PRD before implementation.
The PRD defines objective, scope, out of scope, user stories, acceptance criteria, regression constraints, required verification, and fail conditions where relevant.
`prd.json` must remain aligned with the approved PRD.
If a material requirement is missing or ambiguous, treat it as a BLOCKER rather than inventing behavior.

## 9. Scope Discipline
Make the smallest correct change that satisfies the approved requirement.
Do not:

* Refactor unrelated code
* Redesign unrelated UI
* Modify unrelated templates
* Rename unrelated files
* Change unrelated APIs or database behavior
* Add speculative improvements
  User feedback indicating incorrect behavior reopens the affected work as FAIL.

## 10. Core Architectural Invariants
Prefer one canonical source of truth for shared product state.
For Resume functionality, avoid competing state between Editor, Live Preview, Preview, PDF export, and DOCX export.
Shared visual/content properties must derive from the same canonical state or representation.
Template-specific work must not alter unrelated templates.
Avoid duplicate business logic, hidden side effects, parallel sources of truth, and template-specific hacks.

## 11. Internationalization
The application supports `fr`, `en`, `de`, and `it`.

* Preserve locale routing
* Reuse the existing i18n architecture
* Do not hardcode user-facing strings when translations are required
* Do not add locale-specific business logic unless explicitly required

## 12. Database and Supabase
Database changes must be controlled and reproducible.

* Schema changes require version-controlled migrations
* User-owned data requires appropriate RLS
* Authorization must not rely solely on the client
* Never expose privileged Supabase credentials to the browser
* Avoid destructive migrations unless explicitly required
* Preserve rollback/recovery considerations

## 13. Security Fundamentals
Never expose or commit API secrets, service-role keys, OAuth client secrets, database passwords, private tokens, signing secrets, or production credentials.
Treat uploads, URLs, AI output, rich HTML, and external content as untrusted input.
Validate untrusted input and enforce authorization server-side where applicable.
Never weaken security controls to make a feature pass locally.

## 14. Mandatory Verification
A change is not complete because it compiles or appears correct.
Current mandatory baseline:

* `pnpm lint`
* `pnpm build`
  When repository scripts exist, also run checks required by the active PRD:
* Typecheck
* Unit tests
* Integration tests
* E2E/browser tests
* Visual regression tests
  Never claim a check passed unless it actually ran successfully.

## 15. Validation and Review
When UI is affected, `ui-expert` validation is mandatory and must inspect the rendered result.
For completed implementation, `code-reviewer` validation is mandatory.
Review scope, correctness, regressions, architecture, security, and evidence.
FAIL returns the work to `senior-coder`.
PASS requires all mandatory acceptance criteria and required checks to be verified.
PASS must be evidence-based, never confidence-based.

## 16. Git and Commit Rules
For Ralph work:

* One user story = one commit
* Keep commits atomic
* Commit only files related to that story
* Use meaningful commit messages
* Do not include unrelated cleanup
  No automatic push.
  A successful commit does not grant permission to push or merge.

## 17. Windows / PowerShell
Primary shell: PowerShell.

* Use Windows-compatible commands
* Use `New-Item` instead of `touch`
* Do not assume Unix-only shell behavior
* Avoid `&&` when PowerShell compatibility is required
* Prefer repository-relative paths where practical

## 18. Engineering Principle
Prefer deterministic behavior, explicit state ownership, small scoped changes, reusable architecture, reproducible verification, evidence-based PASS decisions, and security by design.
When quality and speed conflict, quality wins.

## 19. Governance Approval Modes
Every user story starts by asking which approval mode applies, via
`AskUserQuestion`. Never assume it; never inherit it from a previous story.

* **STANDARD** — existing behaviour; unlisted actions prompt.
* **FAST TRACK** — routine local implementation auto-approved for **one story
  only**: lint, typecheck, test, build, dev server, local Supabase,
  `git add --` with explicit paths, and source-file edits.

Fast Track ends when the story's commit lands (enforced by a `PostToolUse`
hook, not by instruction), when the story is abandoned, when the user says
"exit fast track", or after 24 hours — whichever is first.

### Non-negotiable gates — both modes
These always prompt and are never auto-approved: `git commit` · `git push` ·
`gh pr create|merge|edit` · `git merge` · `git rebase` · branch or tag
deletion · `rm -rf` · adding dependencies · non-local database commands
(`supabase db push|link`, remote `psql`) · `vercel` · `gh api` writes · edits
to `.github/**`, `package.json`, `pnpm-lock.yaml`, `vercel.json`,
`supabase/migrations/**`, `.claude/settings*` and `.claude/hooks/**`.

Fast Track speeds up writing code. It never speeds up shipping code.

Stricter rules still win: `.env` access and destructive git
(`push --force`, `reset --hard`, `git clean`, `commit -a`) are **denied**,
not prompted, and on `main` every mutating command is denied whatever the
mode (§5).

### Where this is enforced
`.claude/hooks/pre-tool-guard.ps1`, not instructions. It returns `ask`, which
overrides any `allow` rule, so an "always allow" click cannot ungate a
protected action; `.claude/settings.json` is a second layer, not the primary
one. Mode lives in `.claude/governance-state.json` (gitignored) — missing,
malformed, story-less or expired state reads as STANDARD, since absent state
must never grant. Read it at session start and after compaction.

### Commands
`/story-start <id>` — ask the mode, write state, print what is active.
`/governance [standard|fast-track]` — report or switch; switching up confirms.
