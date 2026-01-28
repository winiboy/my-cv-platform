# PRD: Resume Creation from Job – AI Quality Analysis & Relevance Improvement

## Introduction

From the **Jobs** page (`/en/dashboard/jobs`), users can click **"Create CV"** to automatically generate a Resume based on the selected job description and AI content generation.

This feature already exists and is functional. However, a critical problem has been identified: **the AI-generated CV content is often irrelevant or poorly matched to the selected job description**.

This PRD defines:
1. A systematic analysis of AI output quality
2. Improvements to ensure CVs are **highly relevant** to the job description

**Scope:** Only the "Create CV from Job" flow. No other pages are in scope.

---

## Goals

- Evaluate AI-generated CV quality and relevance objectively
- Identify gaps between job requirements and generated CV content
- Make quality observable, measurable, and traceable
- Implement hybrid improvement: better prompts + iterative fallback
- Display quality score and gaps inline in Resume Editor
- Support configurable quality thresholds
- Warn (not block) on vague job descriptions
- Maintain multilingual support (fr, de, en, it)

---

## User Stories

### US-001: Extract structured requirements from job description
**Description:** As a system, I need to extract key requirements (skills, responsibilities, qualifications) from a job description so they can be used for CV generation and quality evaluation.

**Acceptance Criteria:**
- [ ] Create utility function to extract structured data from job description text
- [ ] Extract: required skills, responsibilities, qualifications, nice-to-haves
- [ ] Handle multiple languages (en, fr, de, it)
- [ ] Return structured JSON format
- [ ] Handle empty or very short descriptions gracefully (return partial data)
- [ ] Typecheck passes (`pnpm tsc --noEmit`)
- [ ] Lint passes (`pnpm lint`)

---

### US-002: Detect vague or insufficient job descriptions
**Description:** As a user, I want to be warned when a job description is too short or vague, so I understand the CV quality may be limited.

**Acceptance Criteria:**
- [ ] Define threshold for "insufficient" job description (e.g., < 100 characters or < 3 extractable requirements)
- [ ] Display inline warning in Resume Editor when job description is insufficient
- [ ] Warning does NOT block generation (user can proceed)
- [ ] Warning text explains why quality may be limited
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: warning appears for short job descriptions

---

### US-003: Improve AI prompts for job-CV alignment
**Description:** As a system, I need enhanced prompts that explicitly instruct the AI to align CV content with the job description requirements.

**Acceptance Criteria:**
- [ ] Update `prompts.ts` to include job requirements in CV generation prompts
- [ ] Prompts explicitly require: skills alignment, responsibility mapping, keyword inclusion
- [ ] Prompts instruct AI to avoid generic content unrelated to job
- [ ] Prompts maintain multilingual support
- [ ] No changes to existing API endpoint signatures
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-004: Implement CV-to-job relevance scoring
**Description:** As a system, I need to calculate a relevance score comparing the generated CV against the job requirements.

**Acceptance Criteria:**
- [ ] Create scoring function that compares CV content to extracted job requirements
- [ ] Score based on: skills coverage, responsibilities coverage, keyword presence
- [ ] Return score as percentage (0-100)
- [ ] Return detailed breakdown: matched items, missing items, extra items
- [ ] Score calculation is deterministic (same inputs = same score)
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-005: Store configurable quality threshold
**Description:** As an admin/user, I want a configurable quality threshold so the system knows when a CV is "acceptable".

**Acceptance Criteria:**
- [ ] Add `qualityThreshold` field to user profile or app settings (default: 70)
- [ ] Threshold is a percentage (0-100)
- [ ] Create database migration if needed
- [ ] Threshold can be read by CV generation flow
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-006: Display quality score inline in Resume Editor
**Description:** As a user, I want to see the CV quality score immediately after generation, so I know if the CV matches the job.

**Acceptance Criteria:**
- [ ] Quality score displayed prominently in Resume Editor after "Create CV from Job"
- [ ] Score shows percentage and visual indicator (color: red < 50, yellow 50-70, green > 70)
- [ ] Score appears inline (not in modal or separate page)
- [ ] Score only visible when CV was created from a job
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: score appears after creating CV from job

---

### US-007: Display gap analysis inline in Resume Editor
**Description:** As a user, I want to see what's missing or misaligned in my CV compared to the job, so I can understand the quality score.

**Acceptance Criteria:**
- [ ] Display list of missing skills/requirements from job
- [ ] Display list of matched skills/requirements
- [ ] Display any flagged "generic content" not related to job
- [ ] Gap analysis appears below or beside the quality score
- [ ] Collapsible/expandable for cleaner UI
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: gap analysis visible and expandable

---

### US-008: Implement iterative regeneration for low-quality CVs
**Description:** As a system, I need to automatically retry CV generation when quality is below threshold, using feedback from the gap analysis.

**Acceptance Criteria:**
- [ ] If initial score < threshold, trigger regeneration with enhanced prompt
- [ ] Enhanced prompt includes specific gaps identified (missing skills, etc.)
- [ ] Maximum 2 iterations (initial + 2 retries = 3 total attempts)
- [ ] Each iteration's score is logged
- [ ] Stop iterating if score meets threshold OR max iterations reached
- [ ] Final result is best-scoring attempt
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-009: Show iteration status during generation
**Description:** As a user, I want to see when the system is improving my CV, so I understand why generation takes longer.

**Acceptance Criteria:**
- [ ] Display progress indicator during generation
- [ ] Show current iteration number if retrying (e.g., "Improving CV... attempt 2/3")
- [ ] Progress indicator appears inline in Resume Editor
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: iteration status visible during regeneration

---

### US-010: Prevent false "success" for low-quality results
**Description:** As a user, I want the system to clearly indicate when the CV quality is below threshold, even after iterations, so I'm not misled.

**Acceptance Criteria:**
- [ ] If final score < threshold after all iterations, show warning (not success)
- [ ] Warning explains: "CV quality is below target. Review the gaps below."
- [ ] No "success" toast or message for below-threshold results
- [ ] User can still use the CV (not blocked)
- [ ] Offer "Regenerate" button to try again manually
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Verify in browser: warning appears for low-quality final results

---

### US-011: Log analysis and iterations for audit
**Description:** As a product team, I want analysis results and iterations logged so we can audit AI quality over time.

**Acceptance Criteria:**
- [ ] Log each generation attempt: job ID, CV ID, score, gaps, iteration number
- [ ] Logs stored in database (new table or existing logging mechanism)
- [ ] Include timestamp and user ID
- [ ] Logs queryable for reporting (no specific UI required)
- [ ] Typecheck passes
- [ ] Lint passes

---

### US-012: Integration test for full Create CV from Job flow
**Description:** As a developer, I need an integration test ensuring the full flow works: generation, scoring, iteration, display.

**Acceptance Criteria:**
- [ ] Test covers: create CV from job with good job description
- [ ] Test covers: create CV from job with vague job description (warning shown)
- [ ] Test verifies score is calculated and returned
- [ ] Test verifies iteration occurs when score is low (mock threshold)
- [ ] All tests pass
- [ ] Typecheck passes
- [ ] Lint passes

---

## Functional Requirements

- FR-1: System MUST extract structured requirements from job descriptions
- FR-2: System MUST warn (not block) on vague/short job descriptions
- FR-3: AI prompts MUST explicitly align CV content to job requirements
- FR-4: System MUST calculate relevance score (0-100%) based on verifiable criteria
- FR-5: Quality threshold MUST be configurable (default 70%)
- FR-6: Score and gap analysis MUST display inline in Resume Editor
- FR-7: System MUST iterate (max 2 retries) when score < threshold
- FR-8: System MUST NOT present below-threshold results as "success"
- FR-9: All analysis and iterations MUST be logged for audit
- FR-10: System MUST maintain multilingual support

---

## Non-Goals (Out of Scope)

- Complete Resume Editor redesign
- Global data model changes to Resume/Job
- PDF or DOCX export changes
- Other dashboard pages
- External benchmarking
- Advanced multi-persona customization
- UX optimizations beyond quality feedback

---

## Design Considerations

- Quality score: colored badge (red/yellow/green) with percentage
- Gap analysis: collapsible section below score
- Warning for vague jobs: yellow alert banner
- Iteration status: inline spinner with attempt counter
- Below-threshold warning: orange/red banner with "Regenerate" button
- Keep existing "Create CV" UX flow, add quality layer on top

---

## Technical Considerations

- Scoring function should be deterministic (no AI for scoring itself)
- Use keyword matching, skill extraction, semantic similarity if needed
- Iteration limit prevents infinite loops and cost overrun
- Logs stored in `resume_analyses` table or new `cv_generation_logs` table
- Respect API rate limits during iteration
- Maintain performance: total generation time < 30s including iterations

---

## Success Metrics

- Reduction in "irrelevant CV" user complaints
- Average quality score > 70% for generated CVs
- < 20% of generations require iteration
- 100% of generations have traceable logs
- `code-reviewer` returns **PASS**

---

## Open Questions

- Should quality threshold be per-user or global setting initially? → **Start with global, add per-user later**
- What semantic similarity approach for scoring? → **Start with keyword matching, enhance later if needed**

---

## Clarifications (Confirmed)

| Question | Answer |
|----------|--------|
| Improvement mechanism | Hybrid: better prompts + iterative fallback (max 2 retries) |
| Score display location | Inline in Resume Editor after generation |
| Quality threshold | Configurable (default 70%) |
| Vague job descriptions | Warn user, proceed with best effort |
