# Visual regression

`pnpm test:visual` renders each of the five resume templates through the real
preview route and compares the result against a committed PNG.

```bash
pnpm supabase start
pnpm test:visual
```

## What it is for

Milestone C unifies resume rendering across the Editor, Live Preview, Preview,
PDF and DOCX. That work edits layout code shared by five templates at once, and
its characteristic failure is not a crash — it is a template that still renders,
still typechecks, still passes every functional test, and is subtly wrong.

No other layer in this repository can see that. Unit tests do not render.
Integration tests stop at the server. The E2E suite asserts on URLs, text and
cookies, none of which move when a column shifts by 40 pixels.

## What it covers

| Covered | Not covered |
|---|---|
| The five templates via `/[locale]/dashboard/resumes/[id]/preview` | The PDF export |
| Section order, spacing, typography, colour as rendered | The DOCX export |
| The full document height, top to bottom | The editor surface |
| Layout settings resolved the way a real request resolves them | Cover letter templates |

The exports draw from separate generators (`download-docx/`, the PDF route) and
need their own evidence. A green visual run says nothing about them.

## How determinism is achieved

A baseline that varies gets a loose threshold, and a threshold loose enough to
absorb a changing date is loose enough to hide a shifted column. So five things
are pinned:

1. **Content** — `e2e/fixtures/resume.ts` is fixed. No dates relative to now,
   no generated ids. Every section a template can render is populated, because
   a screenshot only guards what it draws; an empty `certifications` array
   would leave that branch of all five templates unprotected behind a green
   baseline.
2. **Fonts** — the spec waits on `document.fonts.ready`. A capture taken
   mid-swap produces a baseline no later run reproduces.
3. **Controls** — the preview renders editing controls *inside* the template
   (sliders, colour pickers). They are toggled off: they are chrome rather than
   document, and a slider thumb is a moving target.
4. **Animations** — disabled by the config.
5. **Viewport, scale, locale, timezone, colour scheme** — all fixed in
   `playwright.visual.config.ts`.

Playwright additionally re-captures until two consecutive screenshots agree,
which absorbs the preview wrapper's post-mount settle.

## The truncation guard

This is the part worth reading before changing anything.

An element taller than the viewport is captured by scrolling and stitching. On
this suite's first run that silently produced **five cropped baselines**: each
document was cut mid-sentence and the remainder filled with page background.
They would have passed forever while guarding only the top of each template.

Two things prevent a recurrence:

- The viewport is 2600px tall — well clear of the tallest template (minimal, at
  1711px).
- The spec measures the document and **fails loudly** if it exceeds the
  viewport, with a message saying to raise the viewport rather than accept a
  cropped capture.

The viewport is set inside the project's `use` block, not the config-level one.
Project-level `use` overrides config-level `use`, so a viewport declared at the
top level is silently replaced by Desktop Chrome's 1280×720 — which is what
caused the original truncation, and was only found because the guard reported
the effective height as 720 while the config said 2600.

## Thresholds

`maxDiffPixels: 120`, `threshold: 0.2`.

120 pixels of an ~816×1700 document is roughly 0.009% — enough to absorb
antialiasing jitter on glyph edges, far too little to absorb a moved element.

**If this ever needs raising, find what became nondeterministic.** Widening the
tolerance to make a run green converts the suite into decoration.

## Updating a baseline

```bash
pnpm test:visual:update
```

A baseline change is an **approval decision**, not a test fix. The rules:

- Never run it to make a red run green without first understanding the diff.
- Inspect the new PNG. Confirm the change is the one you intended and nothing
  else moved.
- Commit the updated baselines in the same commit as the change that caused
  them, so review sees cause and effect together.
- `ui-expert` may run `pnpm test:visual`. It may **not** run
  `test:visual:update` — blessing a baseline is not a validation act.

## Platform

Snapshots are stored per platform: `e2e/visual/__screenshots__/{platform}/`.

Windows and Linux rasterise text differently, so a Windows baseline will never
match a Linux run. This is not a defect to work around — a shared baseline
would need a tolerance so wide it would stop detecting regressions.

**Currently committed: `win32` only.** The suite therefore runs locally, where
Milestone C's rendering work actually happens, and is not yet a CI check.
Promoting it to CI requires Linux baselines generated in the CI environment
itself; until those exist, a CI job would fail on every run for a reason
unrelated to correctness.

## Why a separate config

`playwright.visual.config.ts` is separate from `playwright.config.ts` because:

- The screenshot settings here are wrong for the functional suite and would
  quietly change how those tests behave.
- `--update-snapshots` must not be able to touch the functional suite.
- The two need separate ports (3100 / 3110) and build directories
  (`.next-e2e` / `.next-visual`) so one can be re-run without disturbing the
  other.

`playwright.config.ts` excludes `**/visual/**` for the same reason: run on that
config, these specs would compare against no baseline and silently pass.
