# Claude Prompt: Fix Drag-and-Drop Section Reordering for Modern CV Template  
## Agent-Enforced Execution + Ralph Orchestration (MANDATORY)

You are Claude operating under a **strict agent-only execution model** **AND** under **Ralph orchestration**, fully respecting **claude.md** rules.  
Any deviation from the rules below is an **immediate BLOCKER**.

---

## 🔒 Agent Enforcement (Non-Negotiable)

The following agents **MUST** be used exactly as defined:

- **senior-coder (agent)**  
  - ✅ **ONLY agent allowed** to write, modify, or propose **any code**
  - Implements the changes required by this prompt
  - Executes technical changes

- **ui-expert (agent)**  
  - ❌ No code
  - Performs **UI / UX validation only**
  - Verifies drag-and-drop behavior and that reorder results propagate correctly to Preview/Exports

- **code-reviewer (agent)**  
  - ❌ No code
  - Performs **final technical + functional review**
  - Issues **PASS or FAIL** verdict

⚠️ **Hard Rule**  
If **any code** appears outside the **senior-coder** agent context → **FAIL immediately**.

---

## 🤖 Ralph Orchestration (MANDATORY)

All execution **MUST run under Ralph**, strictly respecting **claude.md**.

### Ralph Rules (Binding)
- Ralph **NEVER works on `main`**
- Ralph operates on a **dedicated feature branch**
- **1 user story = 1 commit**
- **No version bump**
- **No push** (manual push only)
- After each user story:
  - `pnpm lint`
  - `pnpm build`
- Artefacts must be updated accordingly:
  - `tasks/prds/*.md`
  - `tasks/prds/*.prd.json`
  - `tasks/ralph-output/`
  - `progress.txt`

Any violation of Ralph or `claude.md` rules → **BLOCKER**.

---

## Objective (Non-Negotiable)

Fix a **blocking defect** in the **Modern CV template**:

- The user can drag sections in **Edit Sidebar** and **Edit Main Content**
- Dragging visually occurs (drag interaction works)
- BUT it has **zero effect** on:
  - **Live Preview**
  - **Preview (Aperçu)**
  - **PDF export**
  - **Word (.docx) export**

✅ Goal: Drag-and-drop reordering must **actually change the section order** everywhere listed above.

⚠️ Scope restriction:  
- **ONLY modify the Modern CV template**
- **No other template may be modified**
- Any change affecting other templates is a **FAIL**

---

## Scope (Strict)

### In Scope
- Modern template section ordering model (sidebar + main content)
- Drag-and-drop state updates and persistence for Modern
- Propagation of ordering changes to:
  - Live Preview
  - Preview (Aperçu)
  - PDF export
  - DOCX export

### Out of Scope
- Any non-Modern template changes
- New features beyond fixing reorder propagation
- UI redesign unrelated to drag-and-drop
- Changes to export engines except what’s necessary to consume Modern’s updated ordering

---

## Definitions (Contractual)

### “Edit Sidebar”
The UI/editor area where the user reorders sections belonging to the sidebar region of the Modern template.

### “Edit Main Content”
The UI/editor area where the user reorders sections belonging to the main content region of the Modern template.

### “Works as expected”
After drag-and-drop:
- The new order is reflected **immediately** in Live Preview
- The Preview (Aperçu) matches the same order
- Exported PDF matches the same order
- Exported DOCX matches the same order

---

## Hard Requirements (PASS/FAIL)

A **PASS** is only possible if:

1. **Drag-and-drop changes ordering deterministically**
   - Sidebar reorder changes sidebar order everywhere
   - Main content reorder changes main content order everywhere

2. **Propagation is complete**
   - Live Preview reflects the new order
   - Preview reflects the new order
   - PDF export reflects the new order
   - DOCX export reflects the new order

3. **Persistence behavior is consistent**
   - The new order remains after any normal interaction that previously triggered the bug (e.g., switching tabs, toggling preview, exporting)
   - If the app has an existing save mechanism, it must still work; no regression allowed

4. **Modern-only**
   - No changes in behavior or ordering for other templates
   - No shared-component changes that alter other templates

Any failure in any item = **FAIL**.

---

## Required Execution Pipeline (STRICT)

You MUST follow this pipeline exactly, under **Ralph**:

### 1️⃣ Plan (agent: Plan — no code)
- Identify where the drag-and-drop UI writes ordering state for Modern (sidebar + main)
- Identify why ordering changes are not consumed by Live Preview/Preview/Exports
- Define the **single source of truth** for section order in Modern
- Define how that source is read by:
  - Live Preview
  - Preview
  - PDF export
  - DOCX export
- Ensure “Modern-only” isolation is preserved
- Output: plan only

---

### 2️⃣ senior-coder (agent) — Ralph execution
- Implement **ONE user story only**
- Write/modify code **only in this agent**
- Ensure reorder state updates the Modern template rendering pipeline
- Ensure Live Preview / Preview / PDF / DOCX all consume the updated order
- Commit exactly **1 commit** for this user story
- Run:
  - `pnpm lint`
  - `pnpm build`
- Update Ralph artefacts:
  - `tasks/prds/*.md` + `tasks/prds/*.prd.json` (if relevant)
  - `progress.txt` with PASS/FAIL notes
- Stop immediately after commit

---

### 3️⃣ ui-expert (agent)
Validate with manual checks:

- Sidebar drag reorder changes section order in:
  - Live Preview
  - Preview
  - PDF export
  - DOCX export
- Main content drag reorder changes section order in:
  - Live Preview
  - Preview
  - PDF export
  - DOCX export
- Confirm no visual regression introduced by the fix
- Output: PASS/FAIL with details

---

### 4️⃣ Self-Check (MANDATORY)

Before requesting final review, you MUST explicitly confirm:

- Sidebar reorder → Live Preview updated → PASS  
- Sidebar reorder → Preview updated → PASS  
- Sidebar reorder → PDF updated → PASS  
- Sidebar reorder → DOCX updated → PASS  
- Main reorder → Live Preview updated → PASS  
- Main reorder → Preview updated → PASS  
- Main reorder → PDF updated → PASS  
- Main reorder → DOCX updated → PASS  
- Modern-only isolation → PASS  

You MUST explicitly state:

> **Self-check: PASS**

If any item fails → STOP and report **BLOCKER**.

---

### 5️⃣ code-reviewer (agent)
- Verify:
  - Agent discipline respected
  - Ralph compliance
  - Scope strictly Modern-only
  - Ordering changes correctly propagate across all targets
  - No regressions introduced
- Output **PASS** or **FAIL**
- No code changes allowed here

---

## Start Execution

Proceed **now** under **Ralph**, strictly following:

1. **Plan**
2. **senior-coder (Ralph)**
3. **ui-expert**
4. **Self-check**
5. **code-reviewer**

Any deviation at any step = **FAIL**.