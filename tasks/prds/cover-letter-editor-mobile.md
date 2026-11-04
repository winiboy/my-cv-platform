# PRD: The cover letter editor works on phones and tablets

**Status:** APPROVED 2026-11-04

## Objective

Below 1280px, a user can write, check and save a cover letter, and read it, with one task on screen at a time:
- an Édition / Aperçu toggle switches between the form and the letter, each at full width;
- section tabs scroll sideways above the form;
- a compact header holds the secondary actions in a "•••" menu;
- Save stays reachable in a bar at the bottom.

At 1280px and above the editor is unchanged.

## Context / Current Behavior

**Owner request (2026-11-04):** editing a cover letter, and above all seeing it, is poor on a phone. The owner asked for an improvement based on what the best products do.

**Owner decisions (chat, 2026-11-04):**
- an Édition / Aperçu toggle, not a stacked page;
- Save fixed at the bottom, with the other actions in a "•••" menu;
- the mobile layout applies below 1280px.

**Current layout** (`src/components/dashboard/cover-letter-editor.tsx`, 925 lines, after PR #120). The editor root is `h-full flex flex-col` (L602). It holds:
- **Header** (L611, `data-testid="cover-letter-editor-header"`):
  - Back, the title input and the save status;
  - six buttons that wrap below 1280: Generate, Check, Preview (full-screen window), PDF, Word and Save.
- **Translate row** (L743): the label and four 44px flag buttons.
- **Save-error, translation and download notices** (L736, L792, L811).
- **Main row** (L834, `flex-1 flex overflow-hidden`), three columns at every width:
  - the section nav (L836, `w-48`, 192px, vertical);
  - the form (L860, `flex-1 overflow-y-auto p-6`);
  - the preview pane (L866, `w-1/2`, `data-testid="cover-letter-preview-pane"`, `CoverLetterPreview variant="pane"` with zoom controls).

**What a phone shows today** (production-build capture, 375×812, de, from PR #120's evidence):
- the header and translate row take about 230px;
- the nav, the form and the preview share the remaining 328px;
- form fields are cut to about 30px wide and the letter preview is a sliver;
- the pane's zoom-out and "show all" are off-screen.

At 1024px, earlier ui-expert findings put the form column at about 137px wide.

**What the best products do** (research, 2026-11-04):
- **Reactive Resume v5.2:** on phones and small tablets the builder switches to a full-screen layout with an Edit / Preview / Design tab bar, instead of the cramped multi-panel desktop layout.
- **Mobile document editors** (Obsidian, ONLYOFFICE, Anki discussions): split panes are not offered on phones; a toggle between editing and preview is the expected pattern.
- **Mobile editors** (Discourse discussion): put the frequent action within thumb reach at the bottom, and move secondary actions out of the top bar.
- **Builder docs:** preview controls (zoom, fit) act on the preview only and leave the export untouched. That is already true here.

**Reference in this repo.** The resume editor (`resume-editor.tsx`, #88) stacks below `xl` (1280). Its section nav becomes a horizontally scrolling tab strip with `aria-current` and scroll-into-view (L974, L1229–1240), written inline; no shared component exists.

**Earlier draft.** `tasks/prds/cover-letter-editor-responsive.md` (DRAFT, never approved, untracked) proposed a stacked layout and listed "a Form/Preview toggle" as out of scope. The owner's decision above reverses that. This PRD covers the same surface under a new slug. Marking the old draft superseded is the owner's decision.

**Tests today:**
- `e2e/cover-letter-preview-window.spec.ts` asserts the header wraps at 1024 and 768 (de), with the six buttons inside it. This PRD replaces that behaviour below 1280, so those two assertions must be rewritten to the new layout; the 1280 assertions stay.
- `e2e/cover-letter-preview-zoom.spec.ts` drives the pane at 1280 and 1440.
- `e2e/cover-letter-editor-i18n.spec.ts` finds the form and the nav by markup.

## Scope

- Below 1280px, an Édition / Aperçu toggle shows the form view or the letter view, one at a time, at full width.
- Below 1280px, the section nav becomes a horizontally scrolling tab strip in the Édition view.
- The tab-strip behaviour is shared with the resume editor, whose rendering stays unchanged.
- Below 1280px:
  - a compact one-row header shows Back, the title, the save status and a "•••" menu;
  - the menu holds Generate, Check, Download PDF, Download Word and the four translation targets;
  - a bottom bar holds Save.
- Below 1280px, the full-screen Preview button is not shown; the Aperçu view takes its place.
- The existing notices (save error, translation, download) keep working in the new layout.
- Tests for all of the above, and updates to the existing specs that assert the old layout below 1280.

## Out of Scope

- Any change at 1280px and above.
- The section forms' fields and behaviour, the formatting ribbon's own layout and touch sizes (shared with the resume editor), and the paragraph card's hover-only delete button.
- The letter template, the PDF and Word exports, the preview window's own behaviour, and the zoom logic.
- The dashboard shell, the sidebar and the "Dashboard-Menü" bar.
- Other pages: the cards, `/cover-letters/new`, and the tools pages.
- Swipe gestures between the two views.
- Remembering the chosen view between visits.
- A "Design" tab (there is one letter template).

## Impact Assessment

- **Frontend / UI:** Affected.
  - `cover-letter-editor.tsx`: layout below 1280, header, menu, bottom bar.
  - A tab strip shared with `resume-editor.tsx`.
- **Internationalization:** Affected.
  - New labels: Édition, Aperçu, the "•••" menu name, the translate group title in the menu, the view-toggle group name.
  - Existing labels are reused for the actions.
  - The longest locale (de) must fit at 320 and 375.
- **Resume model / templates:** Not affected. The resume editor's tab strip moves into a shared component, and its rendering stays identical.
- **Exports:** Not affected.
- **Database / persistence:** Not affected.
- **Security / authorization:** Not affected. No route or data change.
- **Testing / validation:** Affected. A new responsive e2e spec, and two existing specs updated where they assert the old layout below 1280.

## User Stories

### US-001: Below 1280px, an Édition / Aperçu toggle shows the form or the letter at full width

**Description:**
As a user on a phone or tablet, I want to switch between writing my letter and reading it, each using the whole screen, so that neither the form nor the letter is squeezed.

**Acceptance Criteria:**

- [ ] **Toggle.** Below 1280px the editor shows a two-option toggle, "Édition" and "Aperçu" (localized in fr/en/de/it), under the header.
  - It is a single-choice control with an accessible group name, keyboard operable, with visible focus and the selected option exposed.
  - Each option is at least 44px tall.
  - The editor opens on Édition.
- [ ] **Édition view.** Only the section navigation and the form are shown, at full width.
  - Every field of every section is fully inside the viewport at 320, 375, 768 and 1024, in en and de. This includes the Body section's add-paragraph button and hint, the rich-text toolbar and the sign-off select.
  - No letter preview is rendered beside or below the form.
- [ ] **Aperçu view.** Only the letter is shown, at full width, through the existing `CoverLetterPreview` (pane variant).
  - It starts fitted to the width.
  - Its zoom controls are fully inside the viewport at 320, 375, 768 and 1024.
  - The whole letter can be scrolled into view.
- [ ] **State kept.**
  - Switching views keeps every unsaved edit, the unsaved-changes indicator and the selected section.
  - The Aperçu view shows the unsaved edits.
  - Switching back to Édition returns to the same section.
- [ ] **One scroller.** In each view, there is no horizontal page scroll (the document's scroll width ≤ the viewport) at 320, 375, 768 and 1024.
- [ ] **1280 and above unchanged.** No toggle is shown, and the three-column layout renders as before. Captures at 1280 and 1440 match the before captures.

### US-002: Below 1280px, the section nav is a horizontally scrolling tab strip

**Description:**
As a user on a small screen, I want the letter's sections as a row of tabs above the form, so that the form keeps the full width.

**Acceptance Criteria:**

- [ ] **Tab strip.** Below 1280px, in the Édition view, the seven sections are a horizontally scrolling tab strip above the form.
  - The tabs have the same behaviour and appearance as the resume editor's below 1280.
  - Each tab is at least 44px tall.
  - The active tab is marked with `aria-current` and scrolled into view when selected.
  - Labels stay on one line, the de labels included.
- [ ] **One component.** The resume editor and the cover letter editor render their tab strip from one shared component. The resume editor's tab strip DOM, classes and captures at 320, 768, 1024 and 1280 are unchanged.
- [ ] **1280 and above.** The cover letter editor keeps its vertical 192px section nav, as before.

### US-003: Below 1280px, a compact header, a "•••" menu, and Save in a bottom bar

**Description:**
As a user on a phone, I want a one-line header and Save always within thumb reach, so that the form starts near the top of the screen and I never have to hunt for Save.

**Acceptance Criteria:**

- [ ] **Header.** Below 1280px the header is one row:
  - Back is a 44×44 icon button with the accessible name from `common.back`;
  - the title input is flexible and never overflows;
  - then the save status, and a "•••" button with a localized accessible name.
  - The header's height is at most 64px at 320 and 375, in en and de.
- [ ] **Menu.**
  - The "•••" button opens a menu with Generate, Check, Download PDF and Download Word, using their existing labels, icons and behaviour.
  - It also holds a "Translate" group listing the four target languages, each with the same flag as today's translation buttons and today's accessible name.
  - Each item is at least 44px tall.
  - The menu has `aria-haspopup` and `aria-expanded`, and its items are keyboard reachable (Tab or arrow keys).
  - Escape and a click outside close it, and focus returns to the "•••" button.
  - Choosing an item closes the menu and does exactly what the desktop control does: same request, same busy state, same notice.
- [ ] **Translate row and Preview button.**
  - Below 1280px the separate translate row is not shown.
  - The full-screen Preview button is not shown; the Aperçu view takes its place.
- [ ] **Bottom bar.**
  - Below 1280px a bar at the bottom of the editor area holds Save, full width or right-aligned, at least 44px tall.
  - It has the same states as today's Save (disabled when nothing changed, busy while saving).
  - It stays visible while the form or the letter scrolls.
  - It never covers the last field or the end of the letter: they can be scrolled above it.
  - It respects the device's bottom safe area.
- [ ] **Notices.**
  - The save-error, translation and download notices still appear, are announced as today, and are fully visible at 320 and 375.
  - A translation started from the menu still opens the new letter.
- [ ] **1280 and above unchanged.** The six header buttons and the translate row render as before. US-001's header assertions at 1280 still pass, and captures match.

## Functional Requirements

- **FR-1:** The mobile layout applies below Tailwind's `xl` (1280px), the resume editor's breakpoint. At 1280px and above, the editor renders exactly as it does after PR #120.
- **FR-2:** One letter preview at a time, from the same in-memory editor state.
  - The Aperçu view, the pane at 1280 and above, and the preview window all render through `CoverLetterPreview`.
  - No second copy of the letter state is introduced.
- **FR-3:** The menu's actions and the bottom bar's Save call the same handlers as the existing header buttons. No action logic is duplicated.
- **FR-4:** The tab-strip behaviour exists once and is used by both editors (`CLAUDE.md` §10).
- **FR-5:** Every interactive control:
  - has a localized accessible name;
  - works with the keyboard and shows visible focus;
  - is at least 44×44 CSS px below 768px.
- **FR-6:** No new user-facing string is hardcoded. Each new key exists, non-empty, in all four locales.
- **FR-7:** No new dependency. Use existing Tailwind tokens, `src/lib/hooks/use-media-query.ts` if a hook is needed, and existing icons (lucide).

## Regression Constraints

- At 1280px and above:
  - the editor's header, translate row, three columns, Preview window and zoom are unchanged;
  - `e2e/cover-letter-preview-window.spec.ts` (1280 tests) and `e2e/cover-letter-preview-zoom.spec.ts` stay green without edits to their 1280/1440 assertions.
- The resume editor is unchanged at every width. `e2e/resume-editor-responsive.spec.ts` stays green without edits to its assertions.
- Save, the unsaved indicator, Generate and Check (their modals), PDF and Word downloads, translation, and section switching behave as before at every width.
- `pnpm test:parity` and the exports are unchanged.
- Other specs that use the editor (`cover-letter-editor-i18n`, `cover-letter-pdf-export`, `cover-letter-docx-export`, `cover-letter-translate`, `sanitized-html-direct-load`, `cover-letter-template-language`) pass.
  - Only locators that depend on changed markup may change, never their assertions.
  - The preview-window spec's 1024/768 header assertions are rewritten for the new layout, as stated in Context.

## Required Verification

- The `CLAUDE.md` §14 baseline, plus `pnpm test:parity` unchanged.
- A new Playwright spec for this editor at 320, 375, 768, 1024, 1280 and 1440, in en and de. It asserts:
  - the toggle: its role and state, keyboard use, kept state and unsaved edits;
  - field and toolbar bounding boxes in the Édition view;
  - the letter at full width, zoom controls in view and the end of the letter reachable in the Aperçu view;
  - the tab strip: `aria-current`, scroll-into-view and one-line labels;
  - the header height;
  - the menu: items, keyboard use, Escape and focus return, and each action's request;
  - the bottom bar: visible while scrolling, never covering the last field, Save states;
  - the notices in view;
  - no horizontal page scroll;
  - target sizes below 768;
  - at 1280 and 1440, nothing new shown.
- `ui-expert` rendered validation on the production build at 320, 375, 768, 1024, 1280 and 1440, in en and de. It includes:
  - touch emulation;
  - the menu open;
  - both views, and a notice shown;
  - before/after captures of both editors at 1280 and 1440, and of the resume editor at 320, 768 and 1024.
- `code-reviewer` on each story's diff.

## FAIL Conditions

- At any width from 320 to 1279:
  - any field, toolbar control, menu item, Save, a notice or part of the letter is off-screen, clipped, or reachable only by scrolling sideways;
  - or the form and the letter preview are both rendered at once.
- Switching views loses an unsaved edit, resets the selected section, or saves.
- A menu action behaves differently from its desktop control: a different request, or a missing busy state or notice.
- The bottom bar covers the last field or the end of the letter.
- A capture at 1280 or 1440 of either editor differs from its before capture, or a resume editor capture differs at any width.
- The tab-strip logic or an action handler is duplicated.
- A measured target below 768 is under 44×44 CSS px.
- A control lacks a localized accessible name in one of fr/en/de/it.

## BLOCKER Conditions

- Extracting the shared tab strip cannot keep the resume editor's rendering identical. Report it with the differing capture; the owner decides.
- A Generate or Check modal, or the translation flow, cannot be started from the menu without changing its behaviour. Report it.
- The responsive spec cannot run because the local Supabase stack or the auth fixture is unavailable. Report it as a limitation; do not substitute another check.

## Risks

- On phones the on-screen keyboard shrinks the viewport, so a bottom bar can sit over the focused field. The bar must not hide the field being typed in. Check it with touch emulation.
- Moving the nav markup into a shared component can shift the resume editor by a pixel. The before/after captures guard against it.
- Hiding the translate row and the Preview button below 1280 changes where existing e2e specs find them at narrow widths. Most of those specs run at 1280 or 1440. Any that run narrower must be updated deliberately.
- Tablets in landscape at 1280 or more keep the desktop layout, as owner-decided.

## Evidence / References

- `src/components/dashboard/cover-letter-editor.tsx` L602–L880: root, header, translate row, notices, three-column main row, preview pane.
- `src/components/dashboard/cover-letter-preview.tsx` and `src/components/dashboard/cover-letter-zoom-controls.tsx`: the preview and zoom from PR #120.
- `src/components/dashboard/resume-editor.tsx` L974, L1229–L1240, L1491: the reference tab strip and the stacked layout below `xl`.
- `src/components/ui/language-flags.tsx`: the flags used by the translate items.
- `src/lib/hooks/use-media-query.ts`.
- `e2e/cover-letter-preview-window.spec.ts`, `e2e/cover-letter-preview-zoom.spec.ts`, `e2e/resume-editor-responsive.spec.ts`, `e2e/cover-letter-editor-i18n.spec.ts`.
- `tasks/prds/cover-letter-editor-responsive.md` (earlier DRAFT, stacked layout, superseded by the owner's decision if the owner agrees).
- Capture: PR #120 evidence `ux2c/editor-touch-de-375.png` (the editor at 375 today).
- Web research (2026-11-04):
  - Reactive Resume v5.2.0 release notes: an Edit / Preview / Design tab bar on phones;
  - the RxResume builder-dock guide: preview controls do not affect exports;
  - Discourse "Mobile editor preview button and toolbar": the bottom-right preview access;
  - the Obsidian, ONLYOFFICE and Anki notes on split panes and preview toggles on phones.

## Open Questions

- None.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
