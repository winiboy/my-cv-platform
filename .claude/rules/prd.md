# PRD Rules

- A new PRD is created only at `tasks/prds/<slug>.md`, lowercase kebab-case, with no `prd-`/`PRD-` prefix and no `.json` sibling; `tasks/prd-*.md` is a closed location and nothing new is written there.
- One initiative owns one slug, reused unchanged by the PRD file, the Ralph branch `ralph/<slug>`, and the archive directory; a second pass gets a new slug naming the pass, never a `-v2`, `-fix` or `_V2` suffix on the old one.
- Approval is an owner act recorded in the PRD as `Status: APPROVED <YYYY-MM-DD>`; no agent writes, infers or implies that line, and a PRD without it is a draft that may not be converted to `prd.json` or implemented.
- Archiving happens when the initiative's PR merges: the final `tasks/ralph/prd.json` and `progress.txt` are copied to `tasks/ralph/archive/<merge-date>-<slug>/`, and the approved PRD stays in `tasks/prds/`.
- Marking a PRD superseded or abandoned, and moving, renaming or deleting any existing PRD, is the owner's decision; an agent may propose it and must not act on it.
- Full rule, including the current inventory and the cleanup decisions still open: `docs/engineering/prd-lifecycle.md`.
