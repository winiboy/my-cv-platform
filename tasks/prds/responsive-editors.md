# PRD: Responsive Resume and Cover Letter Editors

**Status:** DRAFT

## Objective

Make the resume editor and the cover letter editor usable at every width below
desktop, down to 320px. Every control must be reachable and legible, and no
content may be clipped. Nothing may change at 1280px and above.

## Context / Current Behavior

ui-expert found this on 2026-09-15 at 375x812 and 768x1024. It is pre-existing
on `origin/main` (`3e32910`) and happens with any content.

**Shell.** `src/app/[locale]/(dashboard)/layout.tsx` renders the marketing
`Header` (`src/components/marketing/header.tsx`) above a fixed-height row
(`h-[calc(100vh-64px)] overflow-hidden`). That row holds `DashboardSidebar`
(`src/components/dashboard/sidebar.tsx`, always `w-64`) and a `main` with `p-6`.
The only hamburger in the app is the marketing header's `lg:hidden` button. Its
mobile menu lists Dashboard, Tools, Pricing and the account items. It does not
list the seven dashboard destinations. Below 1024px those destinations are
therefore reachable only through the sidebar, and the sidebar still takes 256px.

**Resume editor** (`src/components/dashboard/resume-editor.tsx`, render at
L1000–1694). The layout, left to right:

- a header row: Back, then the title with `QualityScoreBadge`, then three
  labelled buttons (Preview, Adapt to Job, Save). Preview navigates to
  `/dashboard/resumes/[id]/preview`.
- a `w-64` section nav.
- a split area whose two columns take `splitPosition`% widths (default 50),
  separated by a mouse-only draggable divider.
- a live preview that scales an 816px page through `calculatePreviewScale`
  (ResizeObserver), with slider controls above it.

The root is `h-[calc(100vh-4rem)]`, and inner columns clip or scroll on their
own.

Measured at 768 (ui-expert):

- The editor column is about 38px wide, so text wraps one letter per line.
- Save is clipped.
- The live preview is a 51px thumbnail.

At 375 the editor and the preview are off-screen and cannot be reached.

At 1024, the classes work out to about 168px of editor width. This figure was
derived from the classes, not captured, and US-002 must confirm it before
implementation starts (see BLOCKER Conditions).

**Cover letter editor** (`src/components/dashboard/cover-letter-editor.tsx`,
L425–537). The layout:

- a header row: Back, a title input, then Generate, Check and Save.
- a `w-48` section nav.
- a `flex-1` form.
- a `w-1/2 flex-shrink-0` preview.

At 768 the form fields are about 20px wide. At 375 the preview cannot be
reached. This editor has **no Preview button and no preview route**.

**Formatting ribbon** (`src/components/dashboard/formatting-ribbon.tsx`, used by
`rich-text-editor.tsx` in resume and cover letter sections). Its buttons are
`p-2` around 16px icons, which gives 26x26 at every width. Its two selects are
`text-xs`.

**Direction.** ui-expert validated the owner's suggested direction on
2026-09-19 and accepted it with amendments. The PRD adopts the amended version:

- Editors stack below `xl` (1280), not below `lg` (1024), because 1024 is
  broken too.
- Dashboard navigation below `lg` goes into the existing header menu. There is
  no new drawer.
- Below `md` (768), the resume preview sits behind the existing Preview button.
- The cover letter preview stacks below the form, because that editor has no
  Preview button.
- Ribbon controls get a 44x44 target below `lg`, not only on phones, because
  tablets are touch devices.

## Scope

- The dashboard shell below 1024px: the sidebar is hidden, and the seven
  dashboard destinations are listed in the existing header menu on
  `/dashboard/*` routes.
- The layout of the resume editor at 320–1279px.
- The layout of the cover letter editor at 320–1279px.
- Touch-target and font sizing for the formatting ribbon below 1024px.
- Automated regression coverage of the measurable criteria below.

## Out of Scope

- Any change at viewport widths of 1280px and above.
- The dashboard sidebar and non-editor dashboard pages at 1024px and above.
- The contents of the resume Preview page (`/dashboard/resumes/[id]/preview`),
  and any resume template, PDF or DOCX output.
- A new cover letter preview route, and a Form/Preview toggle.
- A new drawer, a second hamburger, or dark-mode work.
- The header menu on marketing (non-dashboard) routes.
- Responsive work on other dashboard pages beyond what US-001 changes in the
  shell.
- The editor's section form contents, apart from the ribbon inside the
  rich-text editor.
- The draggable divider's behaviour at 1280px and above. This includes its
  hardcoded `256` offset, which is the resume section nav width and remains
  correct there.

## Impact Assessment

- **Frontend / UI:** Affected. Dashboard layout, marketing header (dashboard
  routes only), dashboard sidebar navigation source, resume editor, cover letter
  editor, formatting ribbon.
- **Internationalization:** Affected. No new keys are expected: dashboard nav
  labels, section labels, `common.back` and `aria.openMainMenu` already exist.
  The longest locale (`de`) must fit at 320/375. Any key that turns out to be
  needed must be added in `fr`, `en`, `de` and `it`.
- **Resume model / templates:** Not affected. Rendering inputs are unchanged.
  Only the container that the live preview is scaled into changes.
- **Exports:** Not affected. The PDF and DOCX paths are not touched.
- **Database / persistence:** Not affected. The existing localStorage draft,
  which the Preview page reads (`resume-preview-wrapper.tsx` L52), keeps its
  format.
- **Security / authorization:** Not affected. The auth redirect in the layout is
  unchanged.
- **Testing / validation:** Affected. A new Playwright responsive spec is added,
  and rendered validation is required at six widths.

## User Stories

### US-001: Dashboard navigation is reachable below 1024px without the sidebar

**Description:**
As a signed-in user on a phone or tablet, I want the dashboard destinations in
the header menu, so that the sidebar no longer takes a third of my screen.

**Acceptance Criteria:**

- [ ] Below 1024px, `DashboardSidebar` is not rendered visibly. At 1024px and
  above it is rendered exactly as on `origin/main`.
- [ ] On `/dashboard/*` routes below 1024px, opening the header hamburger lists
  all seven dashboard destinations, in sidebar order, with the current one
  visually marked, followed by the existing account items.
- [ ] The sidebar and the header menu both read the seven destinations from one
  shared definition. No second hand-written list exists.
- [ ] On dashboard routes the open menu overlays the content rather than
  pushing it down, and its own content scrolls when it is taller than the
  viewport.
- [ ] The menu closes on route change and on Escape. On Escape, focus returns
  to the hamburger. The hamburger exposes `aria-expanded` and `aria-controls`.
- [ ] On marketing routes the header menu's items and behaviour are unchanged
  from `origin/main`.
- [ ] The hamburger and each menu item measure at least 44x44 CSS px at 375
  and 768.
- [ ] At 1024, 1280 and 1440, captures of the dashboard home match
  `origin/main`.

### US-002: The resume editor is usable from 320px to 1279px

**Description:**
As a user editing a resume on a phone or tablet, I want the section tabs, the
form and the preview stacked at full width, so that I can read and edit my
Summary and reach Save.

**Acceptance Criteria:**

- [ ] Below 1280px the section nav is a horizontally scrolling tab strip above
  the form. It is sticky at the top of the scroll area, its tabs are at least
  44px tall, and the active tab is scrolled into view.
- [ ] In the tab strip, a modified section is marked with the amber dot only.
- [ ] Between 768px and 1279px, the live preview with its slider controls sits
  below the form at full width. It fits the width with no clipping and updates
  while the user types.
- [ ] Below 768px the live preview and its sliders are not shown. The existing
  Preview button opens the Preview page, which shows the unsaved edits. Going
  Back returns to the editor with those edits still present.
- [ ] Below 1280px the draggable divider is not shown and `splitPosition` does
  not affect column width. At 1280px and above both behave as on
  `origin/main`.
- [ ] Below 1280px the layout's `main` is the only vertical scroller on the
  page, and the document scroll width does not exceed the viewport.
- [ ] Below 768px the header has two rows:
  - Row 1: Back as a 44x44 icon button, labelled from `common.back`, then the
    truncated title and the save status.
  - Row 2: Preview, Adapt to Job and Save, keeping their labels, wrapping,
    each at least 44px tall.
- [ ] Between 768px and 1279px the header is one row with a truncated title.
- [ ] At 320 and 375, in `en` and `de`, the bounding box of every header action
  lies fully inside the viewport.
- [ ] The Summary editor is at least `viewport − 64px` wide below 768px, and at
  least 600px wide at 768px.
- [ ] At 1280 and 1440, captures of the resume editor match `origin/main`.

### US-003: The cover letter editor is usable from 320px to 1279px

**Description:**
As a user writing a cover letter on a phone or tablet, I want the section tabs,
the form and the preview stacked at full width, so that I can edit every field
and see the result.

**Acceptance Criteria:**

- [ ] Below 1280px the section nav is a horizontally scrolling tab strip with
  the same behaviour and appearance as the resume editor's (US-002).
- [ ] Below 1280px the preview sits below the form at full width, at every
  width down to 320px, with no clipping. No toggle or new route is introduced.
- [ ] Below 1280px the layout's `main` is the only vertical scroller on the
  page, and the document scroll width does not exceed the viewport.
- [ ] Below 768px the header has two rows:
  - Row 1: Back as a 44x44 icon button, the title input (flexible, never
    overflowing) and the save status.
  - Row 2: Generate, Check and Save, keeping their labels, wrapping, each at
    least 44px tall.
- [ ] At 320 and 375, in `en` and `de`, the bounding box of every header action
  lies fully inside the viewport.
- [ ] Form fields are at least `viewport − 64px` wide below 768px, and at least
  600px wide at 768px.
- [ ] At 1280 and 1440, captures of the cover letter editor match
  `origin/main`.

### US-004: Formatting ribbon controls are touch-sized below 1024px

**Description:**
As a user on a touch device, I want ribbon buttons and selects large enough to
tap, so that I can format text without mis-taps or page zoom.

**Acceptance Criteria:**

- [ ] Below 1024px every ribbon button and both selects measure at least 44x44
  CSS px (selects: at least 44px tall). Icons stay 16px.
- [ ] Below 768px both ribbon selects have a computed font size of at least
  16px.
- [ ] At 375, selecting text in the Summary editor and tapping Bold makes that
  text bold.
- [ ] The ribbon wraps without horizontal overflow at 320.
- [ ] At 1024px and above, the ribbon's rendered size matches `origin/main`.
- [ ] The change applies to every consumer of `rich-text-editor.tsx`, in both
  resume and cover letter sections.

## Functional Requirements

- **FR-1:** Breakpoints use the project's Tailwind defaults:
  - `md` = 768
  - `lg` = 1024: switches the dashboard shell and the ribbon.
  - `xl` = 1280: switches the editor layout.
- **FR-2:** At widths of 1280px and above, every surface this PRD touches
  renders as on `origin/main`. At 1024–1279px, only the two editor layouts
  differ from it.
- **FR-3:** The dashboard destination list has one source of truth, consumed by
  both the sidebar and the header menu.
- **FR-4:** The two editors share one tab-strip behaviour. Duplicating the
  logic per editor is not acceptable (CLAUDE.md §10).
- **FR-5:** The live preview keeps deriving from the same editor state it uses
  today. No second copy of resume or layout state is introduced.
- **FR-6:** Every added interactive control has an accessible name, can be
  operated by keyboard, and shows focus visibly. The tab strip's text and
  active state meet WCAG AA contrast.
- **FR-7:** No new user-facing string is hardcoded. Any new key exists in all
  four locales.

## Regression Constraints

- At 1024px and above:
  - the dashboard sidebar markup and appearance are unchanged;
  - the print output is unchanged (the sidebar and header stay
    `print:hidden`).
- At 1280px and above:
  - the resume editor's split, divider drag range (30–70%), preview scaling
    and sliders are unchanged;
  - the cover letter editor's three-column layout is unchanged.
- The resume Preview page and its print output are unchanged. The existing
  visual baselines are not updated.
- Saving, unsaved-change indicators, the `beforeunload` warning, the localStorage
  draft, and the Adapt to Job, Generate and Check modals behave as on
  `origin/main` at every width.
- The header menu on marketing routes is unchanged.

## Required Verification

- `pnpm lint`: the problem count must not rise above the `origin/main`
  baseline.
- `pnpm build` exits 0.
- `pnpm test` passes.
- `pnpm test:visual` passes with **no baseline update**. Run it from a
  checkout outside `.claude/worktrees`, because it finds 0 tests inside one.
  Confirm the test count with `--list` first.
- A new Playwright spec asserts the measurable criteria in US-001 to US-004 at
  320, 375, 768, 1024 and 1280:
  - scroll width;
  - element bounding boxes and target sizes;
  - the single scroller;
  - select font size;
  - the menu items.

  It runs green through `pnpm test:e2e` from a checkout outside
  `.claude/worktrees`. Each story adds its own assertions in its own commit.
- ui-expert rendered validation of both editors and the dashboard home at 320,
  375, 768, 1024, 1280 and 1440:
  - including `de` at 320 and 375;
  - a keyboard trace of the header menu;
  - the Bold tap at 375;
  - the Preview round-trip at 375;
  - before/after comparison captures against `origin/main` at 1280 and 1440
    (and at 1024 for non-editor pages).
- code-reviewer review of each story's diff.

## FAIL Conditions

- At any width from 320 to 1279, any editor or header control is off-screen,
  clipped, or reachable only by scrolling sideways.
- The document scroll width is greater than the viewport at any tested width
  below 1280.
- Any capture at 1280 or 1440 differs from `origin/main`.
- Any visual baseline has to be updated.
- The dashboard destinations are defined twice, or the tab-strip logic is
  duplicated between the editors.
- A measured target below 1024 is under 44x44 CSS px, or a select below 768
  has a computed font size under 16px.
- Below 768, unsaved resume edits are missing from the Preview page, or are
  lost on returning to the editor.
- The marketing-route header menu changes.
- A required check was not run, or is reported as passing without output.

## BLOCKER Conditions

- An `origin/main` capture at 1024 does not show the editors broken. The 1280
  stacking threshold would then be unsupported and must return to the owner.
- The responsive Playwright spec cannot run because the local Supabase stack or
  the auth fixture is unavailable. Report this as a limitation. Do not
  substitute another check.
- The work turns out to need a new cover letter preview route, a toggle, or
  changes to the resume Preview page.

## Risks

- The header serves both marketing and dashboard routes. Branching on
  `/dashboard` could leak into marketing routes. The FAIL condition and the
  marketing-route capture guard against this.
- The inline `splitPosition` width cannot be limited to one breakpoint. If the
  implementation gets this wrong, the columns stay squeezed below 1280.
- Making the root height apply only at `xl` changes which element scrolls.
  Sticky tabs and the preview's ResizeObserver both depend on it.
- Longer `de` labels may force the header buttons to wrap onto a third row at
  320.

## Evidence / References

- `src/app/[locale]/(dashboard)/layout.tsx`: the shell, with fixed-height
  row, sidebar and `main p-6`.
- `src/components/marketing/header.tsx`: the only hamburger (`lg:hidden`)
  and its mobile menu.
- `src/components/dashboard/sidebar.tsx`: the seven dashboard destinations,
  in a `w-64` aside.
- `src/components/dashboard/resume-editor.tsx`: L820–888 hold the divider
  drag and preview scaling; L1000–1694 hold the header, section nav, split
  area and preview.
- `src/components/dashboard/cover-letter-editor.tsx`: L425–537 hold the
  header, `w-48` nav, form, and `w-1/2` preview.
- `src/components/dashboard/formatting-ribbon.tsx` and
  `rich-text-editor.tsx`: the ribbon and its consumers.
- `src/components/dashboard/resume-preview-wrapper.tsx`: the Preview page
  reads the localStorage draft.
- `e2e/visual/resume-templates.spec.ts`, `playwright.visual.config.ts`: the
  visual baselines cover only the Preview page document, at desktop size.
- ui-expert findings, 2026-09-15 (375x812, 768x1024), and ui-expert direction
  review, 2026-09-19 (ACCEPT WITH AMENDMENTS).

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to
`prd.json` or implementation.
