# PRD: Modern Word export draws the photo the right way up

**Status:** DRAFT

## Objective

In the Modern template's Word export, a JPEG profile photo that carries an EXIF
orientation tag is drawn with the orientation and cover crop the Preview shows.

## Context / Current Behavior

- The photo is uploaded in the Modern editor as the raw file
  (`FileReader.readAsDataURL`, `modern-template.tsx` `handleFileSelect`), so a
  phone JPEG keeps its EXIF block, including the orientation tag (values 1–8).
  It is stored in `localStorage` (`resume_photo_<id>`) and sent to the DOCX
  route in the request body (`download-resume-buttons.tsx`, `route.ts`
  `boundedPhoto`).
- **Preview:** Chromium applies the EXIF orientation
  (`image-orientation: from-image`, the default) before `object-fit: cover`,
  so a phone photo stored sideways shows upright.
- **Word export:** `docx-modern.ts` embeds the stored bytes unchanged and
  computes the `a:srcRect` cover crop from the stored pixel size
  (`parseImageDimensions`, which reads the JPEG SOF segment). Measured on
  2026-10-05 in Microsoft Word's own render (Word → PDF via COM): Word
  **ignores** the orientation tag. A 1600×1200 JPEG tagged orientation 6
  (displayed 1200×1600) showed sideways in Word, and its crop trimmed the
  stored width instead of the displayed height.
- This is recorded as a fidelity limitation in
  `docs/engineering/docx-word-parity.md` ("Photo orientation"). It is not a
  regression: 83a1630 and every later version behave the same way.
- Only the Modern template embeds a photo. The PDF export prints the Preview,
  so it already shows the photo upright.

## Scope

- JPEG photos with an EXIF orientation tag of 2–8 in the Modern DOCX export.
  The photo is drawn the way the Preview draws it: rotated and/or mirrored,
  then cover-cropped on the displayed (oriented) size.
- JPEG photos with no tag, or tag 1, are unchanged.
- Updating the "Photo orientation" limitation in
  `docs/engineering/docx-word-parity.md` to match the result.

## Out of Scope

- PNG `eXIf` chunks, GIF, BMP and any other format: unchanged.
- Changing how the photo is uploaded, stored or sent (editor, localStorage
  key, request body, `boundedPhoto` bounds).
- Re-encoding or resizing photos that need no orientation change.
- The photo's size and position (fixed in #89), the PDF export, the Preview,
  and every template other than Modern.
- Other applications (LibreOffice, Google Docs, Pages). Parity is measured in
  Microsoft Word on Windows, as for the rest of the Modern DOCX.

## Impact Assessment

- **Frontend / UI:** Not affected — the Preview is the reference and does not change.
- **Internationalization:** Not affected — no user-facing strings.
- **Resume model / templates:** Not affected — no resume or layout state changes; Modern only.
- **Exports:** Affected — the Modern DOCX photo drawing (bytes and/or drawing properties, and the crop).
- **Database / persistence:** Not affected — the photo is not stored server-side.
- **Security / authorization:** Affected — the route parses more of an untrusted upload (EXIF/APP1). Parsing must be bounded and must fail safe.
- **Testing / validation:** Affected — new orientation fixtures, unit and e2e coverage, Word render evidence.

## User Stories

### US-001: A phone photo shows upright in Word, as in the Preview

**Description:**
As a user who uploaded a phone photo, I want the Word export to show it the
way the Preview does, so that my CV does not have a sideways or mirrored face
in Word.

**Acceptance Criteria:**

- [ ] For each EXIF orientation 1–8 on one JPEG fixture, Word's own render of
  the route-built DOCX shows the photo zone with the same content as a
  screenshot of the Preview's zone. Measured as the mean |Δ| per channel inside
  the zone, it is at or below the residue measured for an untagged photo in
  #89 (≤ 4 on 0–255), and it is far below the value for the unfixed generator.
- [ ] The photo's placement in Word is unchanged from #89 for every
  orientation: x 0, top 0 (±0.5px), the sidebar cell's width (±0.5px) × 220px
  (±0.5px).
- [ ] The cover crop is computed on the displayed size. For a tag of 5–8,
  where width and height swap, the trimmed axis is the one the Preview trims.
- [ ] A JPEG with no orientation tag, or tag 1, produces a `word/document.xml`
  and an embedded image byte-identical to the current generator's.
- [ ] A JPEG whose EXIF block is malformed, truncated or oversized still
  produces the document, with the photo drawn as today (no orientation
  applied). The route still answers 200.

## Functional Requirements

- **FR-1:** The orientation is read from the JPEG's EXIF (APP1) segment on the
  server. Reading is bounded by the segment's own length and by the existing
  photo size bound, and any parse failure falls back to "no orientation".
- **FR-2:** All eight EXIF orientation values are honoured: identity, the
  three rotations, and the four mirrored forms.
- **FR-3:** The cover crop (`calculateCoverCropPercents`) receives the
  displayed width and height, so it matches `object-fit: cover` on the
  oriented image.
- **FR-4:** The change is confined to the Modern DOCX generator and its
  helpers. No new client-side processing, request field or stored state.
- **FR-5:** No new production dependency is added without the owner's
  decision (see Open Questions). The default approach is expressed within
  OOXML: rotation and flips on the picture's transform, which the docx library
  or the existing ZIP post-processing can write. The extent and anchor must be
  re-measured in Word for the rotated cases.

## Regression Constraints

- The geometry pinned by `docx-modern-geometry.test.ts` and
  `e2e/docx-modern-photo.spec.ts` stays as it is for untagged photos: extent =
  sidebar cell × 220px, anchor at offset 0, `a:srcRect` cover crop.
- The `photo bounds` cases in `e2e/docx-export-layout.spec.ts` keep their
  outcomes: supported types embedded, oversize, SVG and non-string photos
  dropped, the document still produced.
- The other four templates' DOCX output stays identical part for part
  (`docProps/core.xml` timestamps masked).
- The Modern DOCX's text layout (line baselines measured in
  `docx-word-parity.md`) does not move.

## Required Verification

- Unit tests (`pnpm test`): orientation parsing for tags 1–8, missing EXIF,
  truncated or oversized APP1, and a non-JPEG input. Plus the generated
  drawing for each tag: transform, extent, crop.
- E2E (`pnpm test:e2e`): the Preview's photo box and crop against the
  route-built DOCX for at least one rotated (6) and one mirrored (2 or 5)
  fixture, in the manner of `e2e/docx-modern-photo.spec.ts`.
- Word render evidence (method in `docs/engineering/docx-word-parity.md`): for
  each orientation 1–8, placement read from Word's PDF, plus a pixel
  comparison of the photo zone against the Preview's screenshot. Also the
  same for the unfixed generator, as the contrast.
- Untagged photo: `word/document.xml` and media byte-identical to the current
  generator's.
- Other templates' DOCX unchanged; the full CLAUDE.md §14 baseline on the
  final diff, with lint compared to the tracked baseline.
- Security review of the EXIF parser's bounds (`security-review` skill or
  `code-reviewer` with that focus).

## FAIL Conditions

- Any orientation 2–8 shows rotated or mirrored differently from the Preview
  in Word's render, or its zone's pixel difference exceeds the AC threshold.
- The photo's box in Word moves or changes size for any orientation.
- An untagged JPEG's output changes.
- A malformed EXIF block makes the route fail, hang, or drop a photo it would
  have embedded before.
- Any other template's DOCX changes.
- Parity is claimed from XML inspection alone, without Word's render.

## BLOCKER Conditions

- Word cannot be made to draw a rotated or mirrored anchored picture at the
  sidebar's exact box through OOXML alone. Implementing would then need pixel
  rotation and a new dependency, which is the owner's decision (Open
  Questions).
- Microsoft Word on Windows is unavailable for the render evidence.

## Risks

- Word rotates a shape about its centre, and a rotated picture's extent is its
  unrotated size. For tags 5–8 the extent and offsets need a compensation that
  must be measured, not assumed.
- Applications other than Word may honour the EXIF tag and the transform
  together, and show the photo double-rotated. This is out of scope, but it is
  a plausible user report.
- Parsing more of an untrusted upload increases the attack surface. FR-1
  bounds it.

## Evidence / References

- `src/app/api/resumes/[id]/download-docx/docx-modern.ts` — photo embedding, `parseImageDimensions`, `calculateCoverCropPercents`, the `a:srcRect` post-process.
- `src/app/api/resumes/[id]/download-docx/route.ts` — `boundedPhoto`, the size bound.
- `src/components/dashboard/resume-templates/modern-template.tsx` — upload (`readAsDataURL`) and the photo zone (`object-fit: cover`).
- `docs/engineering/docx-word-parity.md` — Word render method; "Photo orientation" limitation.
- `e2e/docx-modern-photo.spec.ts`, `docx-modern-geometry.test.ts` — photo geometry pinned by #89.
- Word measurement 2026-10-05 (#89 investigation): an orientation-6 JPEG drawn sideways by Word, upright by the Preview.

## Open Questions

- **Non-blocking (default stated):** if the OOXML-only approach (FR-5) proves
  impossible in Word, may a production image dependency be added for pixel
  rotation (for example `sharp`, already present transitively through Next)?
  Default: no. Report a BLOCKER and ask.

## Approval Gate

This PRD is a draft. Explicit human approval is required before conversion to `prd.json` or implementation.
