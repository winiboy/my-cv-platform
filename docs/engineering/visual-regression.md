# Visual regression

`pnpm test:visual` renders each of the five resume templates through the real
preview route and compares the result against a committed PNG — twice per
template, once under screen media and once under emulated print media.

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
| The five templates via `/[locale]/dashboard/resumes/[id]/preview` | The DOCX export |
| Both media: screen, and print via `emulateMedia` | Page breaking, `@page` margins, headers/footers |
| Section order, spacing, typography, colour as rendered | The editor surface |
| The full document height, top to bottom, in each medium | Cover letter templates |
| Layout settings resolved the way a real request resolves them | 24 of the 26 template `print:hidden` sites — see below |
| 2 of the 26 template `print:hidden` sites, with an assertion that reports it if that number moves — on a local run, like everything else here | — |

The DOCX export draws from a separate generator (`download-docx/`) and needs its
own evidence. A green visual run says nothing about it.

## This suite is not a CI gate

`pnpm test:visual` runs **locally only**. `grep -rn "visual" .github/workflows/`
returns nothing: no workflow invokes it, and nothing blocks a merge on it.

That is deliberate, not an oversight — only `win32` baselines are committed, and
a Linux CI runner would fail every run on font rasterisation alone (see
*Platform*). But it has a consequence worth stating plainly, because a milestone
can otherwise assume enforcement it does not have:

> The print path is now **coverable**. It is not yet **guarded**.

Nothing stops a `print:` regression from merging. What this suite gives you is
the ability to *find* one, on a developer machine, if someone runs it. Promoting
it to a gate requires Linux baselines generated in CI itself.

## Why print is captured

PDF in this product is `window.print()` over the same five React templates —
there is no PDF rendering library anywhere in the resume path. So the print
stylesheet *is* the PDF: `print:p-8`, `print:p-5`, `print:shadow-none`,
`print:bg-white` and the rest decide what the user's downloaded document looks
like, and none of them apply under screen media. Before print capture existed,
every PDF this product shipped had no automated coverage at all: a regression
confined to a `print:` utility would pass the whole suite green.

Print baselines are named `{template}-print.png`, beside the screen
`{template}.png`.

### The print capture keeps the editing controls ON

This is the one place where the two captures deliberately differ in setup, and
it is not a detail.

`showControls` defaults to `true` (`resume-preview-page-client.tsx`), so a user
who hits Download PDF prints with the controls on, and `print:hidden` is the
sole mechanism keeping sliders and drag chevrons out of their document. It is
also the largest class of print utility in `src` — 33 sites, 28 of them across
the five templates, the preview wrapper and the preview page.

Turning the controls off does not merely neutralise `print:hidden`, it removes
the elements from the DOM: the templates render them as
`{setSectionDescFontSize && (…)}` and the wrapper passes
`showControls ? setSectionDescFontSize : undefined`. A print baseline captured
with the controls off is therefore blind to the utility — delete `print:hidden`
anywhere and both baselines stay byte-identical while every subsequent PDF
ships with UI chrome baked into it.

Coverage and determinism point the same way here. Under print media,
`print:hidden` is exactly what removes the nondeterministic slider thumbs, so a
controls-on print capture is stable *because* the utility works, and goes red
the moment it stops.

**With the controls on, the print capture is byte-identical to the controls-off
capture.** That equality is the evidence that every control which reaches the
document carries `print:hidden`; it is not evidence that nothing rendered. See
the mutation below.

### How much of `print:hidden` is actually observed: 2 of 26

Measured, not assumed — see *Proving it can fail*. Of the 26 `print:hidden`
sites inside the five templates, an element screenshot of the document can
reach two: the two `creative` font-size sliders. The other 24 cannot be reached
at all, for structural reasons:

| Sites | Why they cannot appear in the capture |
|---|---|
| 12 — classic ×5, minimal ×5, creative ×2 | `position: absolute; left: 100%; margin-left: 48px` off a **full-width** ancestor, which lands them on or past the document's 816px edge (`minimal`'s overlap it by 3px and are excluded by strict containment — see below). An element screenshot clips there. The two observed `creative` sliders use the identical rule off the **one-third-width** left column of a `grid-cols-3` body, which is why they land inside |
| 8 — professional | Gated on `setSidebarWidth` / `setSidebarTopMargin` / `setMainContentTopMargin`, none of which `resume-preview-wrapper.tsx` passes at any value of `showControls`. They never render on this route |
| 4 — modern | Three are `opacity-0` until hover; one renders only during background removal |

The remaining 7 of the 33 — that is, everything left once the 26 template sites
are accounted for — are page chrome outside `[data-testid=resume-document]`: the
dashboard layout, the preview page header, the unsaved-changes banner, the
formatting ribbon, the achievements toolbar, the branch indicator. No element
screenshot of the document can see them.

So the claim this suite supports is: *`print:hidden` is under observation where
it is observable*, and the boundary is written down rather than rounded up.

### The two observable sites are asserted, not assumed

A coverage of 2 of 26 is only worth stating if it cannot quietly become 0 of 26,
and on its own it can. Both observed sliders carry `print:hidden`, so by
construction neither appears in `creative-print.png`. Remove them, stop passing
`setSectionTitleFontSize` / `setSectionDescFontSize`, or relocate them off a
wider ancestor so they fall outside the 816px box, and the committed PNG stays
**byte-identical**, every test stays green, and the suite guards nothing on this
front. Nothing in a golden-image comparison can report the disappearance of
something it was never allowed to draw.

Every print test therefore counts first:

```ts
const OBSERVABLE_CONTROLS: Record<ResumeTemplate, number> = {
  professional: 0, modern: 0, classic: 0, minimal: 0, creative: 2,
}
```

`expectPrintHiddenStaysObserved` runs under **screen** media, before
`emulateMedia`, and asserts that exactly that many `input[type="range"]`
controls are drawn inside the document's own box.

**How far that selector reaches, since the zeros are not all alike.** Range
inputs exist in three templates only — classic 5, minimal 5, creative 4, one per
`print:hidden` site in each, so **14 of the 26 sites are inside the selector at
all**. `professional` contains no `<input>` element (its 8 sites are drag-arrow
`<span>`s) and `modern`'s 4 are three `<div>`s and a `<button>`. The zeros therefore
mean two different things:

- `classic: 0` and `minimal: 0` are **measured**. Their sliders render — fewer
  than five each, because the description slider appears in both mutually
  exclusive branches of an `achievements?.length ? … : description ? …` ternary
  and this fixture takes the first — and every one that does render is excluded
  by geometry alone. One relocating inside the box would redden the suite, which
  is the drift worth catching: it would make the "2 of 26" above wrong.
- `professional: 0` and `modern: 0` are **structural**. The selector matches
  nothing in either template, so these two numbers cannot move whatever their
  twelve sites (professional 8, modern 4) do — passing `professional`'s setters
  would put its resize handles inside the document and this count would still
  read zero. They keep
  the `Record` exhaustive; they are not coverage.

Three choices in the check are deliberate:

- **Drawn, not merely present.** Whether a control reaches the image is decided
  by whether it lands inside the element being screenshotted — which is why
  twelve of the 26 (classic 5, minimal 5, creative 2) are unreachable on
  geometry alone — so containment in the document's
  rect is the first test. But `getBoundingClientRect` reports a full-size box
  for something `visibility: hidden` or `opacity: 0`; only `display: none`
  collapses it, and either state is one where deleting `print:hidden` produces
  no pixel diff while a geometry-only count still says two. Hence
  `checkVisibility`. `toBeAttached()` alone would pass for all of it. The shape
  is not invented — `modern` uses `print:hidden opacity-0
  group-hover:opacity-100` at three sites — though those particular sites are
  outside this selector and were never at risk of being miscounted; they are the
  in-house pattern `creative`'s sliders could plausibly be unified onto. What is
  *not* covered is clipping by an intermediate `overflow: hidden` ancestor —
  which a hit-test would not catch either, since the clipped control's centre
  still lands on the document's own painted area — nor a control straddling the
  document's edge, since containment is strict and a partly-drawn control counts
  as zero rather than as a half. **Both limits have live instances**, which is
  the honest version of this paragraph and the useful one:

  | Limit | Instance today | Why it is harmless so far |
  |---|---|---|
  | `overflow: hidden` ancestor | `creative`'s header (`creative-template.tsx:53`) clips the two header sliders at `:62` and `:96` | They also land 21px outside the 816px box, so geometry rejects them first |
  | Straddling the edge | `minimal`'s `p-16` puts each rendered slider's input **3px inside** the right edge under screen media (measured: input left 1173, edge 1176); all four are partly drawn and count as nothing. `classic`'s `p-12` lands its inputs 13px clear, so it does not straddle | Those sliders are `print:hidden`, and the screen capture runs with controls off |

  Three pixels is a coincidence, not a design. Move either case inward and the
  count starts reporting a control that is never painted, or discarding one that
  is — which is the thing to check first if this number ever surprises you.
- **Screen media, not print.** Under print these controls are `display: none`
  and have no box. That is the utility working; measuring there would return
  zero every run.
- **`input[type="range"]`, not the `print:hidden` class.** Selecting on the
  class would make *deleting* `print:hidden` fail at the assertion, before
  `toHaveScreenshot` runs — and for that case the pixel diff is the better
  failure, because it shows the chrome baked into the document. The assertion
  answers the other question: is there still anything for `print:hidden` to hide
  where the capture can see it. Mutation 3 below demonstrates both halves.

And the count is asserted for exact equality rather than as a floor, because a
number that drifts upward unnoticed makes this page wrong just as surely as one
that drifts down: if `classic`'s or `minimal`'s sliders ever land inside the
box, the "2 of 26" above is stale and the suite should say so. One caveat on
that, stated because the spec states it too: `expect.poll` stops at the first
matching sample, so it waits for `creative`'s count to *reach* two but satisfies
the zeros immediately. Upward drift is caught if it is present at first paint,
not if it only appears after the wrapper's post-mount settle. Neither template
moves its sliders after first paint today, so nothing turns on it — but note
that `minimal`'s are only 3px from being counted, so this is the pair to
re-measure if layout work ever shifts them.

This matters now rather than in the abstract: Milestone C Part 2
(`tasks/prds/milestone-c-part-2-exports-and-parity.md`) changes layout state
ownership across these components, including the setter props that gate both
sliders.

If a change legitimately alters the count, correct `OBSERVABLE_CONTROLS`, update
this document, and re-run the mutations below. Deleting the assertion to obtain
a green run has the same status as widening a threshold to obtain one.

### What else differentiates the two captures

The padding and background rules: `print:p-8`, `print:p-6`, `print:p-5`,
`print:p-10`, `print:py-0`, `print:bg-white`, `print:bg-transparent`. Classic,
minimal and creative come out measurably shorter in print; professional and
modern keep their height because both pin `minHeight: 1056px`, and their
padding moves inside that fixed box.

`print:shadow-none` is real but invisible here, because an element screenshot
clips to the element's own box and a `box-shadow` falls outside it.

**Screen and print are separate tests**, not two captures in one test.
Playwright stops a test at its first failed assertion, so a combined test would
hide the print result whenever screen failed — and the asymmetry between the two
is the diagnostic: both red means layout moved, print-only red means the print
stylesheet moved. The extra cost is a whole extra fixture per template — another
created user, another **real form login** (`e2e/fixtures/auth.ts` signs in
through the page rather than injecting a cookie), another seeded resume, another
navigation — so a full run does ten of each rather than five. What it is not is
an extra build, and the production build is what dominates this suite's runtime.

That asymmetry has been demonstrated, not assumed — see *Proving it can fail*
below.

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
   (sliders, drag chevrons). On **screen** they are toggled off: they are chrome
   rather than document, and a slider thumb is a moving target. In **print**
   they are left on, because `print:hidden` removes them there and that is the
   whole point of the print baseline — see *The print capture keeps the editing
   controls ON*. The print test asserts the toggle is checked rather than
   assuming it, so a change to the `showControls` default fails loudly instead
   of quietly deleting the coverage.
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

**The guard runs once per capture, after the medium is set.** The print
stylesheet changes padding, so the print document is not the height of the
screen document. Measuring under screen media and then capturing under print
would be checking a number that no longer describes the thing being captured,
and a print-only overflow would be stitched and cropped exactly as the original
bug was. `expectFitsWithoutStitching` therefore takes the medium as an argument
and is called after `emulateMedia`, and its failure message names the medium.

**It checks both axes.** Height is the one that bit, but stitching is not
height-specific — an element wider than the viewport is cropped the same way.
Every template pins `width: 816px` inline against a 1280px viewport, so the
width assertion has nothing to catch today; it exists so that relaxing the
pinning cannot produce a second class of cropped baseline before anyone notices.

## Thresholds

`maxDiffPixels: 120`, `threshold: 0.2`.

120 pixels of an ~816×1700 document is roughly 0.009% — enough to absorb
antialiasing jitter on glyph edges, far too little to absorb a moved element.

**If this ever needs raising, find what became nondeterministic.** Widening the
tolerance to make a run green converts the suite into decoration.

## Proving it can fail

A golden image that never goes red is decoration too, so the print coverage was
mutation-tested rather than assumed to work. Every figure below comes from a run
against the committed controls-on print baselines, not from an earlier state of
the suite: Mutations 1 and 2 were re-run when the print captures were added,
Mutation 3 when the observability guard was.

### Mutation 1 — `print:p-8`, proving print media is in effect

`print:p-8` on the classic template's content wrapper was changed to
`print:p-6` — a print-only utility, already emitted by Tailwind for another
template, so JIT class generation could not confound the result — and the two
classic tests were run:

| Test | Result |
|---|---|
| `the classic template renders as approved` (screen) | **passed**, no diff |
| `the classic template prints as approved` | **failed**: expected 816×1340, received 816×1324; 69,737 pixels different |

16px of height is exactly the two 8px padding edges the mutation removed, and
69,737 differing pixels is 580× the 120-pixel tolerance. The mutation was then
reverted and both tests returned to green.

That asymmetry — screen green, print red, from one changed utility — is what
the print baselines exist to produce. Reproduce it if you ever suspect the
print captures have stopped discriminating.

### Mutation 2 — `print:hidden`, and what it revealed

The padding mutation proves print media is in effect. It says nothing about
whether the controls are in the DOM, which is the other half of the print
baseline's job. So `print:hidden` was stripped from **all five templates at
once** — 26 sites — and the whole suite run:

| Test | Result |
|---|---|
| all five `renders as approved` (screen) | **passed** |
| `professional`, `modern`, `classic`, `minimal` prints as approved | **passed** — nothing changed |
| `the creative template prints as approved` | **failed**: 1,112 pixels different |

The creative failure is the real thing: two font-size sliders — a `16PX`
section-title control and a `14px` description control, complete with track and
thumb — rendered into the middle of the printed document, over the EXPERIENCE
column. Exactly the chrome-baked-into-the-PDF defect the baseline exists to
catch.

The four green print tests are the finding. They are why this document claims 2
of 26 rather than 26 of 26, and the table under *How much of `print:hidden` is
actually observed* is the account of each one. The mutation was reverted;
`git diff -- src/` is empty.

If you make those 24 sites observable — by capturing the page rather than the
element, or by driving the editor route where `professional`'s setters are
passed — re-run this mutation and expect four more reds.

### Mutation 3 — the observability guard itself

Mutation 2 leaves a gap it cannot close on its own. It proves the print baseline
reddens when `print:hidden` is deleted *while the two creative sliders are still
being drawn*. It says nothing about the case where they stop being drawn — which
is the one that leaves the PNG byte-identical and every test green. So the guard
was mutation-tested too. Only the two `creative` tests were run each time.

| Mutation | `renders as approved` (screen) | `prints as approved` |
|---|---|---|
| `resume-preview-wrapper.tsx` stops passing `setSectionTitleFontSize` and `setSectionDescFontSize` | **passed** | **failed at the assertion**: `Expected: 2 / Received: 0` |
| `print:hidden` deleted from both observed `creative` sliders | **passed** | assertion **passed**, then **failed on pixels**: 1,112 different |
| `opacity-0` added to both observed `creative` sliders, `print:hidden` left intact | **passed** | **failed at the assertion**: `Expected: 2 / Received: 0` |

Row 2 is the point of the design. Deleting the utility is caught by the image,
where the diff shows the chrome baked into the document; the assertion stays out
of the way and answers only the question the image cannot — whether there is
still anything there to hide. Its 1,112 pixels are the same figure Mutation 2
produced, as expected: the same two sliders reaching the same print capture.

Row 3 is why the count is not pure geometry. `opacity-0` leaves
`getBoundingClientRect` reporting a full-size box inside the document, so a
containment-only check counts two while nothing is drawn and deleting
`print:hidden` would produce no diff at all — a green suite claiming coverage it
does not have. It is not a hypothetical shape: `modern` already uses
`print:hidden opacity-0 group-hover:opacity-100` at three of its four sites —
outside this selector, so never miscounted, but it is the in-house pattern
Milestone C Part 2 could plausibly unify `creative`'s sliders onto, and this row
is what that would look like. The `checkVisibility` term exists for it; without
that term the assertion reports two and stays green.

All three mutations were reverted, `git diff -- src/` is empty, and the full
suite returned to 10 green.

### Screen versus print, per template

Each committed print baseline already differs from its screen counterpart by
tens of thousands of pixels. Measured with **exact RGBA equality** — any
channel differing counts the pixel — over the **overlapping region only**, on
the committed baselines:

| Template | Screen | Print | Differing pixels (exact) | Rows touched | Differing pixels at `threshold: 0.2` |
|---|---|---|---|---|---|
| professional | 816×1056 | 816×1056 | 88,602 | 608 | 48,656 |
| modern | 816×1056 | 816×1056 | 105,405 | 761 | 40,572 |
| classic | 816×1395 | 816×1340 | 146,738 (+44,880 outside the overlap) | 897 | 67,441 |
| minimal | 816×1711 | 816×1663 | 136,210 (+39,168 outside the overlap) | 967 | 49,003 |
| creative | 816×1154 | 816×1080 | 388,932 (+60,384 outside the overlap) | 1,044 | 92,697 |

Both columns count *differing* pixels; they differ only in how strictly
"differing" is defined. Exact equality is the honest measure of "these are two
different images", while `threshold: 0.2` is the suite's own tolerance and is
what a real comparison is judged against — which is why the second column is
always the smaller of the two.

`threshold` is pixelmatch's matching threshold, and pixelmatch measures the
distance between two pixels in **YIQ** colour space, not per channel. `0.2` is
therefore a single normalised perceptual distance below which a pixel counts as
unchanged — not a ±20% allowance on R, G and B independently, and not a claim
that the pixels are identical. Either way the smallest number in either column
is 338× `maxDiffPixels: 120`.

**`professional` and `modern` are 816×1056 in both media** because both pin
`minHeight: '1056px'`; their print padding moves inside that fixed box.
Identical dimensions do not mean identical content, and for those two templates
these deltas are the evidence that print media is genuinely in effect at all.

## Running it from an agent worktree

`testIgnore` includes `**/.claude/**`, and Playwright matches `testIgnore`
against the **absolute** path. A checkout under `.claude/worktrees/…` therefore
matches, and both Playwright suites report `Error: No tests found` there — a
message easily misread as a broken spec.

This is deliberate for runs from the repository root, where those worktrees hold
duplicate copies of `e2e/`. It does mean the suite cannot be run from inside one:
run it from the main checkout, or from a copy outside `.claude/`.

## Updating a baseline

```bash
pnpm test:visual:update
```

A baseline change is an **approval decision**, not a test fix. The rules:

- Never run it to make a red run green without first understanding the diff.
- Inspect the new PNG. Confirm the change is the one you intended and nothing
  else moved.
- A screen change and a print change are separate approvals. If a layout edit
  reddens `{template}.png` but not `{template}-print.png`, that asymmetry is
  information — understand it before blessing either.
- Commit the updated baselines in the same commit as the change that caused
  them, so review sees cause and effect together.
- **A baseline that disagrees with unchanged code is a bug in the baseline.**
  The rule above assumes every baseline change has a causing code change. One
  case has no such change: the committed PNG never matched the committed code
  in the first place. Re-blessing is then correct — but only if the
  disagreement is written down here, with what moved and why the old image is
  unreproducible. A re-bless whose justification lives only in a conversation
  is not project state (CLAUDE.md §3). See below.
- `ui-expert` may run `pnpm test:visual`. It may **not** run
  `test:visual:update` — blessing a baseline is not a validation act.

### Moved: all ten baselines, 2026-09-25 — the page became A4

**Cause.** Part 3 US-008, "Every resume is A4 on every surface". The page is
now 210 x 297 mm everywhere, from one declaration (`src/lib/resume-page-size.ts`).
Before it, the Preview and the print were US Letter (816 x 1056 CSS px,
`@page size: letter`). Every template draws inside that page, so every
baseline moves — this is the intended change, not a tolerance problem.

**What moved.** Each capture narrowed from 816 px to 794 px, and the heights
followed:

| Baseline | Before | After |
|---|---|---|
| `professional.png` / `-print.png` | 816 x 1056 | 794 x 1123 |
| `modern.png` / `-print.png` | 816 x 1056 | 794 x 1123 |
| `classic.png` | 816 x 1395 | 794 x 1395 |
| `classic-print.png` | 816 x 1340 | 794 x 1363 |
| `minimal.png` / `-print.png` | 816 x 1711 / 1663 | 794 x 1711 / 1663 |
| `creative.png` | 816 x 1154 | 794 x 1219 |
| `creative-print.png` | 816 x 1080 | 794 x 1122 |

Professional and modern take the A4 height directly: they pin a page-height
`min-height`, which was 1056 px and is now 1123 px. The others have no height
pin, so their height is their content's: where it grew, a 22 px narrower
column wrapped text onto one more line. Minimal's did not grow because its
text already broke where it breaks at 794 px.

**Confirmed page-size only, by eye.** `professional.png` (screen): text shifted
left by the width change, the sidebar's right edge moved from x 245 to x 238 —
its 30% share of the narrower page — and a band appeared at the foot, the extra
67 px of page height. `classic-print.png`: the summary wrapped one extra line
and everything below it shifted down by that line. In both, the sections, their
order, the type and the colours are the ones the old baseline shows. No other
category of difference appears in either diff.

### Re-blessed: `professional.png`, 2026-09-07

**What moved.** 879 pixels, across 10 rows (y 620–629), x 81–220 — one text
line in the sidebar's Training / Courses section. The first line of the
`Certified Kubernetes Administrator` heading. Nothing else in the image
changed: the wrap point is identical, `Administrator` still falls to line two,
and nothing below it moved. Measured by exact RGBA comparison; both images are
816×1056.

**What it looks like.** Old baseline: `Certified          Kubernetes` — the line
stretched to the column edge, i.e. justified. New baseline:
`Certified Kubernetes` at natural word spacing.

**Why the old image is unreproducible.** `professional-template.tsx` renders
`cert.issuer` and `cert.date` as `<p>` elements carrying
`textAlign: 'justify'`, while the `<h3>` rendering `cert.name` does not. The
old baseline shows that `<h3>` justified, so it disagrees with the code — and
no code change caused the disagreement to appear, which is why the rule above
could not describe it.

Traced in Git rather than guessed:

- `288da05` *"Apply justified text alignment to all sidebar content
  (Professional template)"* added `textAlign: 'justify'` to that `<h3>` along
  with the two `<p>`s.
- `efe0d39` rewrote the same three style objects for font-size scaling and
  **kept** justify on all three.
- `6e0dd91` — the commit that introduced `professional.png` — **removed**
  `textAlign: 'justify'` from that `<h3>` and from the contact-name `<p>`,
  while leaving it on the two certification `<p>`s.

So the code change and the baseline landed in the same commit and contradict
each other. `6e0dd91`'s own message says *"Production code changes are six
`data-testid` attributes and nothing else. No template rendering was altered"*
— that is not what the diff does. Two justify declarations were removed with
it, and the PNG was evidently captured from a tree that still had them. The
contact name did not move because it fits on one line, and `text-align:
justify` does not affect a block's last line.

The re-blessed PNG is what the committed code renders. This is a correction of
the baseline, not an approval of a visual change; no production code was
touched to produce it, and none should be to preserve it.

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

### Moved: classic, minimal and creative, screen and print, 2026-09-25 — rich text

**Cause.** Part 3 US-016, "The Preview shows the content the user saved". Those
three templates printed a stored project or education description as a plain
string and read a skill category's `items` only, so a category saved as
`skillsHtml` showed a stale list or nothing while every DOCX drew what was
typed. All five templates now route stored HTML through the same inert
sanitiser, and plain text through the same formatter the summary and the
achievements already used.

**What moved.** Only the description lines, and only their flow: roughly 200 to
2,600 pixels per capture, about 1% of each image. The text is the same text. It
re-flows because a description now renders through `renderFormattedText` inside
a `<div>` rather than as a bare string inside a `<p>` — the arrangement the
other body fields have always had. Section order, type, colour and the page box
are unchanged, and the six captures for professional and modern did not move at
all, which is the control: neither template's rich-text path changed.

**Checked before updating.** The diff images were read, not just counted: each
highlighted region sits on a description line. `pnpm test:parity` was run on the
same tree and reports 0 NEW rows, so no surface disagrees with another because
of this.

### Not moved, expected: classic and minimal, 2026-09-26 — section order

**Cause.** Part 3 US-009, "The classic and minimal Previews honour section
order and visibility". Both templates drew their sections in the order they
were written in the JSX; each now renders `mapEditorOrderToClassic` /
`mapEditorOrderToMinimal` over the stored `mainContentOrder`, minus
`hiddenMainSections` — the rule `docx-classic.ts` and `docx-minimal.ts`
already applied.

**Why no baseline should move.** `e2e/fixtures/resume.ts` seeds no
`layout_settings`, so every capture resolves to `DEFAULT_RESUME_LAYOUT`:
`mainContentOrder` is the default three ids and `hiddenMainSections` is empty.
For that model the mapping returns exactly each template's own sequence —
`CLASSIC_SEQUENCE` and `MINIMAL_SEQUENCE`, which were read off these two
templates — and the sections are now emitted through keyed `<Fragment>`s, which
add no DOM, so `space-y-5` / `space-y-10` still sees the same children in the
same order. The four captures for professional, modern and creative are
untouched code.

**If a capture does move.** That is a defect in this change, not a baseline to
bless: read the diff before updating anything. A moved classic or minimal
capture means the mapping and the JSX disagreed about the default order; a
moved capture for any other template means the change leaked past the two
single-column templates (US-009 criterion 6).

**Evidence that the new path works, since the baselines cannot show it.** The
default model is the one model under which nothing moves, so the ordering is
evidenced elsewhere:
`src/components/dashboard/resume-templates/single-column-section-order.test.ts`
renders both Previews and both DOCX artifacts over a reordered and a partly
hidden layout and compares the two sequences, and the preview route was
captured in a browser under both layouts for the story record.

### Not moved, expected: classic, minimal, creative and modern, 2026-09-26 — font scale and per-property sizes

**Cause.** Part 3 US-011, "Font scale and size settings reach every template
that offers them". `resume-preview.tsx` now passes `fontScale` to the classic,
minimal and creative templates, each of which multiplies the four per-property
sizes by it before drawing; and `docx-classic.ts`, `docx-minimal.ts`,
`docx-creative.ts` and `docx-modern.ts` now write the stored per-property size
for the elements their template applies, where each had copied the control
default into its own `FONT_SIZES` and scaled that.

**Why no baseline should move.** `e2e/fixtures/resume.ts` seeds no
`layout_settings`, so every capture resolves to `DEFAULT_RESUME_LAYOUT`, whose
`fontScale` is 1. Multiplying by 1 leaves every drawn size the number the
template already wrote, and the per-property sizes the Previews read are the
same stored values they read before. Nothing on the Preview or print side of
this change can show at the default model: the whole of the DOCX half is
invisible to these captures by construction, and the professional captures are
untouched code.

**If a capture does move.** That is a defect in this change, not a baseline to
bless. A moved classic, minimal or creative capture means a size was scaled
twice, or that an element which never took its size from the model now does. A
moved modern or professional capture means the change leaked past the three
templates the story is about (US-011 criterion 6, FR-5).

**Evidence that the new path works, since the baselines cannot show it.** The
default scale is the one scale under which nothing moves, so the scaling is
evidenced elsewhere:
`src/components/dashboard/resume-templates/per-property-font-size.test.ts`
renders each Preview and generates each DOCX over two scales and over a
changed value for each of the four sizes, and holds both surfaces to
`TEMPLATE_APPLIED_SIZE_KEYS`; and `e2e/font-scale-rendered.spec.ts` reads
`getComputedStyle().fontSize` off the rendered preview route at two stored
scales and asserts the drawn size followed, with the captures in the story
record.
