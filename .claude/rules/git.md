# Git Rules

- Repository writes are allowed only on a dedicated non-`main` branch based on the current `origin/main`; an active `main` branch is a BLOCKER for writes.
- Keep branch changes limited to approved scope; do not mix unrelated cleanup, refactors, or formatting churn into feature work.
- Never commit directly to `main`, force-push shared history, or delete branches or tags unless the user explicitly requires that operation.
- Push and merge are user-controlled actions; do not perform either without explicit user instruction.
- For Ralph execution, each user story owns exactly one atomic commit; do not combine multiple stories or create routine partial commits for one story.
- Commit only files required by the active story plus its directly required validation or evidence artifacts.
- Do not treat local `main`, another local branch, a tag, or uncommitted state as canonical when it disagrees with `origin/main`.
