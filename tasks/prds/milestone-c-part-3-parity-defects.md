# PRD: Resume Rendering Unification — Part 3, Parity Defects (Milestone C)

**Status:** APPROVED — owner, 2026-09-15, on the revision of the same date
(`279f8bf`, merged in #56). **Amended 2026-09-22** under this document's own
BLOCKER condition — see *Amendment History*; the amendment takes effect when the
owner merges the pull request that carries it.

**Two of the five resume templates silently drop supported content from their
DOCX export today.** A classic or minimal user with a skills or projects section
downloads a CV that omits it, with no error and no warning. That is still the
first thing in this document because it is still the most serious thing in it,
and because `.claude/rules/exports.md` prohibits it in as many words: *export
code must not silently omit, rewrite, or reorder supported resume content and
then claim Preview parity.*

**Why this revision exists.** The first draft named seven defects and required
that it not be approved until Part 2's parity check had run, because that check
would confirm whether the list was complete. It ran. `pnpm test:parity`
confirmed all seven and found **58 further divergences** this draft did not name,
which triggered this document's own BLOCKER condition. This revision adds them,
records four product decisions the owner made on 2026-09-15, and reorders the
stories so that fixes confined to the DOCX export land before fixes that move
the Preview.

**Depends on:** `tasks/prds/milestone-c-part-2-exports-and-parity.md`, which is
**complete** (closed 2026-09-15, `e242aa8`). Its US-007 consolidation — one
shared vocabulary, one exhaustiveness guard, one single-column order mapping —
is in `main`, and its US-008 parity check is the instrument every story here is
measured by.

**Story numbering:** restarted at `US-001` so this document is a self-contained
Ralph contract. The first draft's five stories are preserved and renumbered; see
*Story Map*.

## Objective

Make every resume render the same content, in the same order, with the same
typography, colour and page geometry on its Preview, its PDF and its DOCX
export — to the degree each format supports — and make every editor control
either take effect on the selected template or not be offered.

## Context / Current Behavior

Part 2 moved every surface onto one persisted layout model without changing a
byte of output. Proving that required generating and unzipping real documents,
and Part 2's final story turned that into a repeatable check: `pnpm test:parity`
renders a fixture resume with non-default settings through Preview, PDF and DOCX
for all five templates and compares each surface against the requested model
and against the others. Its final report (sha256 `10fe632c…`, byte-identical
across runs) is the evidence for this document.

The report confirms the first draft's seven defects and finds 58 more. Together
they fall into eight groups.

**Content is missing.** `docx-classic.ts` and `docx-minimal.ts` carry
`case 'skills'` and `case 'projects'` branches that cannot execute: the section
list they dispatch over is `mainContentOrder`, filtered by `parseLayoutModel`
against `VALID_MAIN_IDS = ['summary','experience','education']`, so those ids are
unreachable by construction. Both Previews render both sections.

**The DOCX draws a different palette.** `src/app/globals.css` (`@theme inline`,
lines 8–35) has redefined `--color-slate-400/700/800/900` as neutral greys and
`--color-purple-600` as `oklch(0.5 0.22 290)` since v0.1.0. The Preview renders
those values. The generators hardcode stock Tailwind v3 hex — blue-tinted slate
(`docx-classic.ts:50-54`, `docx-minimal.ts:51-55`) and `#9333EA` purple
(`docx-creative.ts:46`) — so text colour differs in all five templates. The
Preview is the fidelity contract, so the DOCX is the side that is wrong.

**The DOCX draws different spacing.** The generators write CSS line-height
ratios as Word `lineRule="auto"` multiples. A Word auto multiple scales the
font's own single-line height; a CSS ratio scales the font size, so encoded
values can match while drawn leading differs. Letter spacing differs too: the
generators' `characterSpacing` values do not equal the Preview's `em × px` (for
example the Modern title draws 81 twips against 15 written). Modern's
translucent sidebar text composites to a tint in the Preview and is written as
opaque white in the DOCX. Modern's skill bars and creative's language bars and
technology pills are not drawn in the DOCX at all.

**Page geometry disagrees.** The Preview and print are US Letter — templates pin
`width: '8.5in'` or `'816px'`, and `globals.css:386` sets
`@page { size: letter portrait }` — while the classic, minimal and creative DOCX
are A4. The owner has decided every resume is A4.

**The Preview ignores the model.** `classic-template.tsx` and
`minimal-template.tsx` render sections in hardcoded order and ignore
`mainContentOrder`, `hiddenMainSections` and the sidebar equivalents, while their
DOCX honours them. Modern's empty-main fallback disagrees between surfaces.

**Typography does not reach three templates.** `resume-preview.tsx` passes
`fontScale` and `fontFamily` to modern and professional only. Classic, minimal
and creative receive neither, while their generators apply both — except
classic, which ignores the model's font on every surface. Per-property sizes
reach the Preview but not the DOCX.

**Colour does not always reach the surface.** Modern's `deriveAccentColor`
matches integer HSL only, so a stored non-integer hue paints the template's gold
fallback in the Preview while the DOCX uses the real colour. Under print,
`globals.css:398-399` paints a fixed band behind the professional template that
ignores the user's sidebar colour.

**Controls do nothing.** No editor layout control is gated by template: the
sidebar colour picker, font carousel, font-size slider and the section reorder
panels render for whichever template is selected (`resume-editor.tsx`, the
control column around `:1357`–`:1520`, and `:1198`, `:1268`). The sidebar colour
is rendered on no surface for classic, minimal or creative. Professional and
modern store per-property sizes that no surface applies and that no control
offers. Creative ignores section order and visibility on both surfaces, and
three of its sections have no editor id.

## Divergence Inventory

Rows are from the parity report `10fe632c…`. Every row this document names must
end as `MATCH` or as a recorded, evidenced format limitation.

| Group | Divergence | Report rows | Story |
|---|---|---|---|
| Content | classic and minimal DOCX omit skills and projects | confirmed | US-002 |
| Palette | DOCX text colour differs from the Preview's palette, all templates | 13 NEW | US-003 |
| Spacing | DOCX line spacing written as Word auto multiples | 15 NEW + finding | US-004 |
| Spacing | DOCX letter spacing differs from CSS `em × px` | 8 NEW | US-005 |
| Palette | DOCX borders and fills kept in stock Tailwind v3 colours: classic header border and heading rules, minimal rules, creative header and badge fills, professional heading underline | found in US-003 | US-003 |
| Colour | Modern translucent sidebar text written opaque | 2 NEW | US-006 |
| Colour | Professional `opacity-80` sidebar text (key-achievement descriptions, skill items, language levels) written opaque white | found in US-003 | US-006 |
| Colour | Creative translucent header text (`text-white/90` summary, `text-white/80` second contact row) written opaque white over a solid fill | found in US-003 | US-006 |
| Graphics | Modern skill bars, creative language bars and pills absent from DOCX | 3 findings | US-007 |
| Graphics | Modern technology chip fill; creative timeline line and dots, project card rule and fill, decorative header circles absent from DOCX | found in US-003 | US-007 |
| Geometry | classic, minimal, creative DOCX A4 against Letter elsewhere | 3 NEW | US-008 |
| Structure | classic and minimal Previews ignore order and visibility | confirmed | US-009 |
| Structure | Modern empty-main fallback disagrees | confirmed | US-010 |
| Typography | font scale and per-property sizes do not reach every surface | confirmed | US-011 |
| Typography | font family ignored on classic, minimal, creative Previews and classic DOCX | 9 NEW | US-012 |
| Colour | Modern accent fallback on non-integer hue (F-A); professional print band | 1 NEW + not exercised | US-013 |
| Controls | sidebar colour on classic, minimal, creative; stored sizes on professional, modern | 3 NEW + 4 NEW | US-014 |
| Controls | creative section controls a no-op on both surfaces | confirmed | US-015 |

## Resolved Decisions

Made by the owner on 2026-09-15, before this revision was drafted.

- **Page size: A4 for every resume on every surface.** Preview, print/PDF and
  all five DOCX exports. The markets this product serves use A4.
- **Font family is honoured on all five templates.** A chosen font applies on
  Preview, PDF and DOCX for every template, including classic.
- **A template keeps its own designed font until the user chooses one.** Classic
  stays serif and minimal and creative stay Inter for any resume whose font was
  never chosen. A stored font equal to today's default counts as not chosen, so
  no existing resume changes font unless its owner chose one.
- **Controls a template does not apply are hidden while it is selected.** Stored
  values are kept, not deleted, and are documented as not applying.
- **One PRD, with DOCX-only fixes first** and Preview-changing fixes after them.

Two rules resolve the rest without a product decision: the rendered Preview is
the fidelity contract for exports (`.claude/rules/exports.md`), so wherever the
Preview and the DOCX disagree on palette, spacing or graphics, the DOCX changes;
and a format limitation is recorded as a finding, never accepted as a match.

## Scope

- Closing every divergence in the inventory above, each with artifact-level and,
  where rendering changes, rendered evidence.
- Keeping `pnpm test:parity` in step with the work: its known-divergence list
  names this document's stories, and every fix flips its rows to `MATCH` in the
  same commit.
- A4 page geometry on every resume surface.
- A per-resume record of whether a font was chosen, sufficient for a template to
  keep its own font until one is.
- Template-gated editor controls.
- Defining a creative section vocabulary, because one does not exist.
- Deliberate, approved visual-baseline movement where a fix changes Preview or
  print rendering.
- A recorded decision wherever a story must choose between two defensible
  behaviours.

## Out of Scope

- Changing which layout model surfaces read from. Part 2 settled that.
- New user-facing layout capabilities, new templates, or removing templates.
  The font-choice record is internal state, not a new setting.
- Cover letters, including their own 816×1056 page geometry
  (`cover-letter-card.tsx`, `cover-letter-preview.tsx`) — a separate template
  and export path the page-size decision does not cover.
- Migrating PDF off `window.print()`.
- Moving the photo out of localStorage.
- Tightening the photo size bound (Part 2 US-001's informational SEC-001).
- Adding `pnpm test:parity` to CI.
- The intermittent DOCX request stall on the development machine, which is an
  environment cause (most likely antivirus HTTP inspection), not a product
  defect.
- Rewriting the DOCX generators wholesale.
- Consolidating shared vocabulary, helpers or mappings — Part 2's US-007 did
  that. US-015 adds a creative vocabulary, which is new definition.

## Impact Assessment

- **Frontend / UI:** Affected — every template's page width becomes A4; classic
  and minimal honour section order and visibility; classic, minimal and creative
  honour font scale and font family; editor controls become template-gated.
- **Internationalization:** Affected only if a story adds user-facing text.
  Hiding controls adds none; any new string requires `fr`, `en`, `de` and `it`.
  No locale-specific behaviour — A4 applies in every locale.
- **Resume model / templates:** Affected — all five templates change rendering;
  the model gains a record of whether a font was chosen; the shared vocabulary
  gains creative ids.
- **Exports:** Affected — DOCX palette, line spacing, letter spacing,
  translucency, graphics, page size, sections and font change.
- **Database / persistence:** Affected — the stored layout shape gains a
  font-choice record. Whether that needs a schema migration is decided in
  US-012; the existing `layout_settings` constraint (JSON object, at most 4096
  bytes) still applies.
- **Security / authorization:** Not affected — no trust boundary moves. Stored
  layout state remains untrusted and bounded (FR-6).
- **Testing / validation:** Affected — the parity check's expectations change on
  every story, and visual baselines move deliberately.

## User Stories

The first seven stories change no Preview or print rendering: US-001 changes only
the test harness, and US-002 to US-007 change only the DOCX export. US-008 onward
move the Preview, with A4 first so that no baseline has to move twice.

### US-001: The parity check names every Part 3 defect

**Description:**
As a maintainer, I want `pnpm test:parity` to recognise every divergence this
document names, so that each fix changes a row from expected-to-fail to `MATCH`
instead of the check staying red.

**Acceptance Criteria:**

- [ ] The known-divergence identifiers in `e2e/parity/verdicts.ts` name this
      document's stories. The first draft's identifiers (`P3-US001-classic`
      through `P3-US005`) are renumbered to match the *Story Map*, since the
      story numbers they carried have changed.
- [ ] Every row the report `10fe632c…` classified `NEW` is registered as a known
      divergence of the story in the *Divergence Inventory*, and US-013's F-A row
      becomes a known divergence rather than a related finding.
- [ ] A profile with content long enough to span more than one page is added, so
      the professional print band (US-013) is exercised rather than reported as
      not exercised.
- [ ] A profile whose font was never chosen and one whose font was chosen are
      both present, so US-012's two behaviours are each measured.
- [ ] After this story `pnpm test:parity` reports **zero** `NEW` rows and **zero**
      unreconciled rows; every divergence appears as an expected failure named
      by its story.
- [ ] No product source, rendered output or exported byte changes: `src/` is
      untouched and visual baselines do not move.

### US-002: The classic and minimal DOCX stop dropping sections

**Description:**
As a user of the classic or minimal template, I want my skills and projects to
appear in the CV I download, because they appear in the CV I see.

**Acceptance Criteria:**

- [ ] A resume carrying skills and projects exports a classic DOCX containing
      both, asserted on the unzipped `word/document.xml` rather than on an HTTP
      200.
- [ ] The same holds for minimal.
- [ ] The fix addresses why those ids were unreachable rather than special-casing
      two `case` branches — `mainContentOrder` is filtered against
      `VALID_MAIN_IDS`, so either the vocabulary or the filtering has to change,
      and which one is a decision to record.
- [ ] Professional, modern and creative exports are unchanged, evidenced by
      artifact comparison.
- [ ] Preview rendering is unchanged for all five templates; visual baselines do
      not move.
- [ ] Sections the user has genuinely hidden stay hidden. Fixing an omission
      must not defeat visibility.
- [ ] The story's parity rows change to `MATCH`.

### US-003: DOCX text colour matches the palette the Preview renders

**Description:**
As a user, I want the text in my downloaded CV to be the colour I see, because
the Preview is what I approved.

**Acceptance Criteria:**

- [ ] Every DOCX text colour for the title, section headings and body text
      equals the colour the Preview renders for that element, compared as sRGB
      with the parity check's declared per-channel tolerance, for all five
      templates. Text the Preview draws translucent is US-006's.
- [ ] The DOCX values derive from the palette the Preview actually renders —
      `globals.css`'s redefined tokens and inline colours — rather than from a
      second hand-copied hex table that can drift from it again. How the
      generators obtain those values is a decision to record.
- [ ] Borders and fills the Preview draws in a theme token or inline colour —
      classic's header border and heading rules, minimal's rules, creative's
      header and badge fills, professional's heading underline — derive from the
      same palette. A fill the Preview draws as a gradient takes the gradient's
      first stop, and the gradient is recorded as a format limitation.
- [ ] A test fails when a template draws a text colour the palette does not
      hold, so a new or changed colour in a template cannot drift silently.
- [ ] Colours the user sets (sidebar, accent) are unchanged by this story.
- [ ] Preview rendering is unchanged; visual baselines do not move.
- [ ] The story's parity rows change to `MATCH`.

### US-004: DOCX line spacing matches the leading the Preview draws

**Description:**
As a user, I want the lines in my downloaded CV spaced as they are on screen,
because a CV that runs longer in Word than in the Preview breaks differently.

**Acceptance Criteria:**

- [ ] The generators express CSS line-height as spacing that scales the font
      size — for example `lineRule="exact"` or `atLeast` computed from the run
      size — rather than as a Word `auto` multiple, which scales the font's own
      single-line height.
- [ ] Line height is compared on drawn leading, not on the encoded value, for
      the title, headings and body text of all five templates.
- [ ] Spacing chosen to avoid clipping glyphs (Word's exact spacing can cut
      ascenders and descenders) is evidenced on a generated document, and any
      residual difference is recorded as a finding with the reason.
- [ ] Preview rendering is unchanged; visual baselines do not move.
- [ ] The story's parity rows change to `MATCH`, and the "Word auto line
      spacing" finding is closed.

### US-005: DOCX letter spacing matches the Preview

**Description:**
As a user, I want headings in my downloaded CV spaced as they are on screen.

**Acceptance Criteria:**

- [ ] Each generator's `characterSpacing` equals the Preview's letter spacing
      converted from `em × px` to twips, for every element the parity check
      samples, on all five templates.
- [ ] Letter spacing that scales with font size in the Preview scales with it in
      the DOCX, evidenced at a non-default font scale.
- [ ] Preview rendering is unchanged; visual baselines do not move.
- [ ] The story's parity rows change to `MATCH`.

### US-006: Translucent text keeps its tint in the DOCX

**Description:**
As a user of the modern, professional or creative template, I want secondary text
in my download to look as muted as it does on screen.

**Acceptance Criteria:**

- [ ] Text drawn in the Preview as translucent white — modern's secondary
      sidebar text, professional's `opacity-80` sidebar text, and creative's
      `text-white/90` and `text-white/80` header text — is written to the DOCX as
      the composited opaque colour, computed against the colour the DOCX
      actually draws behind it: the user's sidebar colour for modern and
      professional, the header fill for creative.
- [ ] Changing the sidebar colour changes the composited DOCX colour
      accordingly on modern and professional, evidenced at two different colours.
- [ ] The parity check samples professional's and creative's translucent text,
      so each is a named row rather than an unmeasured difference.
- [ ] Creative's header gradient, which the DOCX cannot draw, is recorded as a
      format limitation with evidence, including the colour its translucent text
      is composited against.
- [ ] Preview rendering is unchanged; visual baselines do not move.
- [ ] The story's parity rows change to `MATCH`.

### US-007: The DOCX draws the graphics the Preview draws

**Description:**
As a user of the modern or creative template, I want the bars, pills and other
graphics I see to appear in my download.

**Acceptance Criteria:**

- [ ] Modern's skill bars, creative's language bars and creative's technology
      pills appear in the DOCX, approximated with what the format supports — for
      example shaded table cells or shaded runs — and each approximation is
      recorded with its form.
- [ ] Modern's technology chip fill and creative's timeline line and dots,
      project card rule and fill, and decorative header circles are each drawn in
      the DOCX with what the format supports, or recorded as a format limitation
      with evidence.
- [ ] Each drawn element carries the same value the Preview shows (a proficiency
      level, a pill's text), asserted on the unzipped document.
- [ ] Anything that proves genuinely inexpressible in DOCX is recorded as a
      format limitation with evidence, not silently omitted.
- [ ] Preview rendering is unchanged; visual baselines do not move.
- [ ] The three graphics findings are closed, each as drawn or as an evidenced
      limitation, and no graphic is left on US-003's completeness check as
      unplaced.

### US-008: Every resume is A4 on every surface

**Description:**
As a user, I want my CV on A4, the paper my employers print on, whether I look at
it, print it or download it.

**Acceptance Criteria:**

- [ ] All five templates render at A4 width in the Preview, replacing the
      `width: '8.5in'` and `width: '816px'` pins.
- [ ] Print produces A4 pages: `@page` is A4, and any template height pinned to
      Letter (`minHeight: 1056px` in modern and professional) is revised.
- [ ] All five DOCX exports use an A4 page size, including professional and
      modern, which are Letter today.
- [ ] Every other Letter assumption in the resume path follows — the editor's
      preview scaling (`resume-editor.tsx:850`, `:1357`) and professional's
      drag maths (`professional-template.tsx:217`) — so no control is measured
      against the old width.
- [ ] Page width agrees on all three surfaces, and the parity check's page-width
      rows change to `MATCH`.
- [ ] Every visual baseline moves once, each approved per
      `docs/engineering/visual-regression.md` with its cause recorded as the
      page-size change.
- [ ] A multi-page resume breaks pages at the same content on print and in the
      DOCX to the degree the formats allow, with any difference recorded.
- [ ] Cover letters are unchanged.

### US-009: The classic and minimal Previews honour section order and visibility

**Description:**
As a user of the classic or minimal template, I want reordering or hiding a
section to change what I see, not only what I download.

**Acceptance Criteria:**

- [ ] `classic-template.tsx` renders sections in `mainContentOrder` and omits
      those in `hiddenMainSections`, evidenced by rendered browser output.
- [ ] The same holds for `minimal-template.tsx`.
- [ ] **The `projects` placement conflict is resolved deliberately and the
      decision recorded.** Classic renders summary, experience, education,
      skills, projects; minimal renders summary, experience, **projects**,
      education, skills. A shared vocabulary has to produce one order, so this
      story picks one and says why.
- [ ] Preview and DOCX agree on section order and visibility for both templates,
      compared directly rather than inspected separately.
- [ ] Visual baselines move, each approved with its cause understood.
- [ ] The other three templates' Preview rendering is unchanged.
- [ ] The story's parity rows change to `MATCH`.

### US-010: Preview and DOCX agree on the empty-main fallback

**Description:**
As a maintainer, I want one rule for what happens when a stored section order
maps to nothing, so that two surfaces cannot disagree about an empty column.

**Acceptance Criteria:**

- [ ] The disagreement is closed: `modern-template.tsx` falls back with
      `mainContentOrder || DEFAULT_MODERN_MAIN_ORDER`, which an empty array does
      not trigger, while `docx-modern.ts` uses `.length > 0`, which does.
- [ ] The reachable input that exposes it is covered by a test: a stored
      `mainContentOrder: ['education']` passes `parseIdList`, then loses its only
      member to the Modern main id set, and today yields an **empty main column
      in the Preview** and summary plus experience in the DOCX.
- [ ] Which behaviour is correct is decided and recorded, not settled by
      whichever surface was easier to change.
- [ ] Any resulting baseline movement is approved with its cause understood.
- [ ] The story's parity rows change to `MATCH`.

### US-011: Font scale and size settings reach every template that offers them

**Description:**
As a user of the classic, minimal or creative template, I want the font-scale
and size controls to change what I see and what I download alike.

**Acceptance Criteria:**

- [ ] `resume-preview.tsx` passes `fontScale` to the classic, minimal and
      creative templates, and each applies it.
- [ ] Moving the control changes the **computed** font size of rendered text,
      evidenced by browser measurement rather than by the control agreeing with
      itself.
- [ ] The per-property sizes — `titleFontSize`, `contactFontSize`,
      `sectionTitleFontSize`, `sectionDescFontSize` — reach the DOCX for every
      template that offers a control for them, so Preview and DOCX sizes
      correspond at the same scale.
- [ ] Repointing DOCX constants at `DEFAULT_RESUME_LAYOUT` is **not** accepted as
      a fix. Part 2's US-003 T-1 established why: the reference resolves to the
      default while the Preview keeps using the user's value.
- [ ] Per-property sizes stored for professional and modern, which offer no
      control for them, are out of this story; US-014 resolves them.
- [ ] Visual baselines move for the affected templates, each approved with its
      cause understood.
- [ ] The story's parity rows change to `MATCH`.

### US-012: The chosen font reaches every template, and an unchosen font does not

**Description:**
As a user, I want the font I pick to apply to my CV whichever template I use,
and I want a template I never customised to keep its own look.

**Acceptance Criteria:**

- [ ] The saved layout records whether a font was chosen. A stored font equal to
      today's default (`'Arial, Helvetica, sans-serif'`) reads as **not chosen**,
      so no existing resume changes font unless its owner chose one.
- [ ] How that record is represented, and whether it needs a schema migration,
      is decided and recorded. Any migration follows the database rules and is
      validated before use; the stored layout stays within its existing
      constraint.
- [ ] With no font chosen, classic renders its serif, and minimal and creative
      render Inter, on Preview, print and DOCX alike — classic's DOCX matching
      its Preview rather than using a separate Times New Roman choice by
      accident.
- [ ] With a font chosen, all five templates render it on Preview, print and
      DOCX, including classic.
- [ ] Choosing a font, then choosing the template default again, is handled
      deliberately and the behaviour recorded.
- [ ] Existing saved resumes open and export without error, and none changes
      font merely by being loaded and saved.
- [ ] Visual baselines move only where a fixture's font is chosen, each approved
      with its cause understood; the not-chosen fixtures do not move.
- [ ] The story's parity rows change to `MATCH`.

### US-013: The user's colour is drawn faithfully on every surface

**Description:**
As a user, I want the sidebar and accent colour I chose to appear as chosen, on
screen and on paper.

**Acceptance Criteria:**

- [ ] Modern's `deriveAccentColor` handles any stored hue, saturation and
      brightness the model accepts, including non-integer values, so the Preview
      accent derives from the user's colour rather than the gold fallback — the
      same colour the DOCX derives.
- [ ] Under print, the professional template's sidebar band follows the user's
      sidebar colour rather than the fixed `oklch(0.25 0.05 240)` in
      `globals.css`, evidenced on a multi-page print capture.
- [ ] The fallback colours still apply when no usable colour is present, and
      that case is covered by a test.
- [ ] Visual baselines move only where the cause is this story, each approved.
- [ ] The story's parity rows change to `MATCH`.

### US-014: The editor offers only the controls the selected template applies

**Description:**
As a user, I want every layout control I can see to change my CV, so that I am
never adjusting something that does nothing.

**Acceptance Criteria:**

- [ ] For each of the five templates, every layout control the editor offers
      changes that template's Preview, print and DOCX. This is evidenced as a
      template × control matrix, not inferred.
- [ ] Controls a template does not apply are hidden while it is selected. At
      minimum: the sidebar colour controls on classic, minimal and creative, and
      any per-property size control for professional and modern.
- [ ] Stored values for hidden controls are kept, never deleted or rewritten, and
      apply again if the user switches to a template that uses them.
- [ ] Per-property sizes stored for professional and modern are documented as not
      applying to those templates, and the parity check stops reporting them as
      divergences for the reason recorded.
- [ ] Switching templates shows and hides controls accordingly without losing
      unsaved edits, and the editor's save, draft-recovery and unsaved-changes
      behaviour is unchanged.
- [ ] Rendered evidence covers desktop, tablet (768px) and mobile (375px)
      widths — the breakpoints Part 2's US-002 left unevaluated.
- [ ] The story's parity rows change to `MATCH`.

### US-015: The creative section controls stop being a silent no-op

> **Added 2026-09-13**, when Part 2's creative story was dropped. That story
> assumed the creative Preview honoured section order and visibility while its
> export did not. Verification before implementation found **neither does**, and
> that the two hardcoded sequences are identical — so there was no divergence to
> close, and implementing the export side alone would have created one.

**Description:**
As a user of the creative template, I want reordering or hiding a section to do
something, because the editor lets me do it and then nothing happens.

**Context — this is not a divergence, it is a dead control.**
The editor's reorder and hide UI is **not template-gated**: it renders whatever
template is selected (`resume-editor.tsx:1198`, `:1268`), the setters come from
the template-agnostic `useResumeLayout`, and the change persists into
`layout_settings`. Neither `creative-template.tsx` nor `docx-creative.ts` reads
any of it.

So the user acts, the state is stored, and **nothing renders differently
anywhere**. Both surfaces agree; they agree on ignoring the user.

**The vocabulary does not exist yet, and that is the substance of this story.**
`VALID_SIDEBAR_IDS` is `['keyAchievements','skills','languages','training']` and
`VALID_MAIN_IDS` is `['summary','experience','education']`. Against creative's
seven sections:

| Creative section | Editor id |
|---|---|
| summary (renders inside the gradient header, not a column) | `summary`, but not column-positioned |
| skills, languages | `skills`, `languages` |
| certifications, projects | **none — unaddressable** |
| experience, education | `experience`, `education` |
| — | `keyAchievements`, `training` exist and mean nothing here |

`parseIdList` filters strictly to those sets, so unknown ids cannot be smuggled
in. "Creative honours `mainContentOrder`" is therefore not unimplemented but
**undefined**. Modern already sets the precedent for a per-template vocabulary.

**Acceptance Criteria:**

- [ ] A creative section vocabulary exists, covering all seven of creative's
      sections including `certifications` and `projects`, and it lives in the
      shared model beside the modern and single-column mappings rather than
      inside a template or a generator.
- [ ] The two-column structure is respected: whatever the vocabulary allows must
      be expressible in creative's actual layout, and `summary`'s position in the
      header is either made orderable or explicitly declared fixed, with the
      choice recorded.
- [ ] Reordering a creative section in the editor changes the Preview, evidenced
      by rendered browser output.
- [ ] The same reordering changes the DOCX, evidenced on the unzipped
      `word/document.xml`.
- [ ] Preview and DOCX produce the **same order** for the same resume, compared
      directly rather than inspected separately.
- [ ] Hiding a creative section removes it from both surfaces.
- [ ] Ids that mean nothing in creative — `keyAchievements`, `training` — are not
      offered while creative is selected, consistent with US-014.
- [ ] A creative resume whose layout settings are at their defaults renders and
      exports **unchanged**.
- [ ] The other four templates are unchanged in Preview and in export, evidenced
      by artifact comparison and visual baselines.
- [ ] Any visual baseline that moves is approved with its cause understood.
- [ ] The story's parity rows change to `MATCH`.

## Story Map

| This revision | First draft |
|---|---|
| US-001 | — (new) |
| US-002 | US-001 |
| US-003 to US-008 | — (new) |
| US-009 | US-002 |
| US-010 | US-003 |
| US-011 | US-004 |
| US-012 to US-014 | — (new) |
| US-015 | US-005 |

## Functional Requirements

- **FR-1:** Preview, print/PDF and DOCX render the same sections, in the same
  order, with the same typography, colour and page geometry for the same resume,
  to the degree each format supports.
- **FR-2:** No fix may reintroduce an independent authoritative copy of layout
  state. These stories change what surfaces do with the model, never where it
  lives.
- **FR-3:** Where surfaces disagree, the rendered Preview is the reference for
  exports. Any story that instead changes the Preview must say which surface was
  wrong and why.
- **FR-4:** A visual baseline may move only with an understood cause and an
  explicit approval decision.
- **FR-5:** Template isolation holds — a fix for one template must not alter
  another through shared defaults or fallbacks, except where a story adopts a
  shared rule and evidences its effect on every template it touches.
- **FR-6:** Client-supplied and stored layout state reaching document generation
  remains untrusted and bounded.
- **FR-7:** Every resume is A4 on every surface.
- **FR-8:** A template's designed font applies until the user chooses a font; a
  chosen font applies on every surface of every template. A stored font equal to
  today's default counts as not chosen.
- **FR-9:** Every layout control the editor offers for a template takes effect on
  that template's Preview, print and DOCX, or is not offered while it is
  selected. Stored values for hidden controls are preserved.
- **FR-10:** `pnpm test:parity` stays in step with the work: a story that closes a
  divergence changes its rows to `MATCH` and updates the known-divergence list in
  the same commit.

## Regression Constraints

- The five template identifiers remain `modern`, `classic`, `minimal`,
  `creative`, `professional`.
- PDF continues to work via `window.print()`.
- The editor's save, draft-recovery and unsaved-changes behaviours are unchanged.
- The Preview's editing controls continue to function and remain excluded from
  visual captures.
- Existing saved resumes remain loadable and exportable; no resume becomes
  unopenable, and no stored layout value becomes unparseable or is deleted.
- No existing resume changes font unless its owner chose one.
- Cover letter rendering and export are unchanged.
- Locale routing and translated template labels are unchanged.
- `pnpm lint` does not exceed its 311-problem baseline.

## Required Verification

- `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`,
  `pnpm build` on every story.
- `pnpm test:parity` on every story: the story's rows change to `MATCH`, no row
  becomes `NEW`, and nothing is unreconciled. A run that stalls on a DOCX request
  is re-run, never absorbed with a longer timeout or a retry —
  `playwright.parity.config.ts` records why.
- `pnpm test:visual` — screen **and** print — on every story.
- `export-validation` on every story that changes the DOCX: a generated document
  inspected for content and fidelity, never an HTTP 200.
- `ui-expert` on US-008 through US-015, with rendered browser evidence. US-014
  additionally at 768px and 375px widths.
- `database-migration` on US-012 if it introduces a migration.
- Artifact comparison across all five templates for any story claiming a
  template is unchanged.
- Baseline movement follows `docs/engineering/visual-regression.md`, with the
  before/after and cause recorded per moved baseline.
- `code-reviewer` on every story.

## FAIL Conditions

- A section the user has hidden appears on any surface.
- A section appears in a different position on one surface than on another.
- A story introduces a `NEW` row in `pnpm test:parity`, or closes a divergence
  without updating the known-divergence list in the same commit.
- A resume whose font was never chosen changes font.
- A control offered for a template has no effect on that template.
- A stored layout value is deleted or rewritten because its control is hidden.
- Any resume surface is not A4 after US-008.
- Two surfaces are made to agree by changing the Preview where the Preview was
  right, without a recorded reason.
- A visual baseline is updated to absorb a diff whose cause is not understood.
- A visual threshold, parity tolerance or request timeout is widened rather than
  the cause being found.
- A template's rendered output changes as a side effect of fixing another.
- A fidelity limitation is accepted as a match rather than recorded as a finding.
- A DOCX omission is fixed by hardcoding a section list in a generator,
  reintroducing per-generator layout logic Part 2 removed.

## BLOCKER Conditions

- `pnpm test:parity` cannot run, or cannot exercise the divergence a story
  closes.
- A story finds a divergence this document does not name. The document is revised
  before that story continues.
- A divergence needs a product decision about which behaviour is correct, and the
  decision has not been made.
- US-012 needs a schema migration and database-migration validation cannot run.

## Risks

- **A4 moves every baseline at once, and moves page breaks.** Modern and
  professional pin a Letter height; a CV that fits one Letter page may not fit
  one A4 page the same way. US-008 comes first among the rendering stories so
  this happens once, and its multi-page criterion exists for this.
- **Existing resumes store a font.** Persistence writes the resolved model, so
  most saved resumes carry today's default font explicitly. Treating that value
  as not chosen protects everyone who never picked a font, but a user who
  deliberately picked Arial will read as not chosen too. US-012 must record how
  it handles that.
- **Word's exact line spacing can clip glyphs.** Matching drawn leading may need
  `atLeast` rather than `exact` in places, with a residual difference recorded.
- **The palette fix touches every DOCX at once.** Every export changes colour in
  one story; the Preview does not move, so the evidence is artifact comparison
  against the Preview's rendered values.
- **Graphic approximations may disappoint.** A shaded-cell bar is not the
  Preview's bar; recording each approximation's form lets the owner judge it.
- **US-015 is the only story here that must define something new** and the one
  most likely to grow. If it proves larger than one story, splitting it is better
  than letting it absorb the others.
- **Findings must be verified on both surfaces.** Part 2's creative story was
  re-scoped once on a finding checked on one surface and dropped when the other
  was checked. Verify the Preview side and the export side separately before
  writing a fix that assumes they disagree.

## Evidence / References

- `tasks/ralph/archive/2026-09-15-milestone-c-part-2/progress.txt` — the US-003 to
  US-008 sections, including the parity report's full divergence list and the
  export-stall investigation.
- `tasks/prds/milestone-c-part-2-exports-and-parity.md` — its Closure section and
  Amendment History.
- `e2e/parity/` and `playwright.parity.config.ts` — the parity check; known
  divergences in `e2e/parity/verdicts.ts` (`KnownId`, `KNOWN_EXPECTATIONS`).
- `src/app/globals.css` — the palette override (lines 8–35), `@page` Letter
  (line 386), the professional print band (lines 398–399).
- `src/app/api/resumes/[id]/download-docx/docx-*.ts` — hardcoded palettes, `auto`
  line spacing, `characterSpacing`, A4 page sizes in classic, minimal and
  creative; the unreachable `case 'skills'` and `case 'projects'`.
- `src/lib/layout-settings.ts` — `DEFAULT_RESUME_LAYOUT.fontFamily` (line 132),
  `VALID_MAIN_IDS`, `parseLayoutModel`, the single-column and modern mappings.
- `src/components/dashboard/resume-preview.tsx` — the templates that do and do
  not receive `fontScale`, `fontFamily` and `sidebarColor`.
- `src/components/dashboard/resume-templates/*-template.tsx` — width pins,
  classic's `font-serif`, modern's `deriveAccentColor`, hardcoded section order in
  classic and minimal.
- `src/components/dashboard/resume-editor.tsx` — ungated controls (`:1198`,
  `:1268`, `:1357`–`:1520`) and the preview scaling width (`:850`).
- `docs/engineering/visual-regression.md` — baseline approval rules.
- `.claude/rules/exports.md`, `.claude/rules/resumes.md`,
  `.claude/rules/database.md`, `CLAUDE.md` §10.

## Open Questions

- None blocking. The owner's product decisions are recorded under *Resolved
  Decisions*. Five decisions are deliberately left to their stories because each
  needs the code in front of it, and each story requires the decision to be
  recorded: how the DOCX obtains the Preview's palette (US-003), each graphic's
  approximation (US-007), where `projects` sits in a shared order (US-009), which
  surface is correct for the empty-main fallback (US-010), and how the font-choice
  record is represented (US-012).

## Amendment History

- **2026-09-22 — US-003 BLOCKER.** Implementing US-003 and its independent
  review found three divergences this document did not name: professional's
  `opacity-80` sidebar text and creative's translucent header text, both written
  opaque white in the DOCX; and borders and fills the generators keep in stock
  Tailwind v3 colours. Under the BLOCKER condition, this amendment names all
  three in the *Divergence Inventory* and assigns them: the translucent text to
  US-006, now "Translucent text keeps its tint in the DOCX"; the borders and
  fills to US-003, with a completeness check so a template colour missing from
  the palette fails a test. No story is added, removed or reordered, and no
  cross-story requirement changes.
- **2026-09-22 — graphics found by US-003's completeness check.** The check that
  every colour a template draws is accounted for found Preview graphics the DOCX
  does not draw and this document did not name: modern's technology chip fill,
  and creative's timeline line and dots, project card rule and fill, and
  decorative header circles. They are added to the *Divergence Inventory* and
  assigned to US-007, whose graphics scope they share; its final criterion now
  also requires that no graphic is left unplaced. No story is added, removed or
  reordered.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation. Part 2's parity check has run and this revision
covers everything it found, so the gate the first draft set is satisfied.
