# DOCX ↔ Preview parity in Microsoft Word

The Professional and Modern DOCX generators
(`src/app/api/resumes/[id]/download-docx/docx-professional.ts`, `docx-modern.ts`)
are built to lay out, in Microsoft Word, the lines the Preview draws: the same
words on every line, every baseline within ±1.5 CSS px. Most of the numbers that
achieve this are not in the Preview's CSS. They describe how Word lays text out,
and they were measured. This page records how, so that a change to one of them
can be re-measured rather than guessed.

The measured constants live in:

- `docx-preview-metrics.ts` — the font table, `baselineRaise`, `formattedBlocks`
  and the formatted-list constants, shared by both generators;
- `docx-professional.ts` and `docx-modern.ts` — each template's boxes, gaps and
  the Word behaviours below as they apply to its structure;
- `src/lib/resume-page-size.ts` — `PAGE_HEIGHT_TWIPS`, the exact A4 height.

`docx-professional-geometry.test.ts` and `docx-modern-geometry.test.ts` pin each
value on the generated document, with the arithmetic that derives it. They prove
the generator still writes what was measured; they cannot prove Word still draws
it that way. Only a Word render can.

## The three references

**The Preview.** Chromium's layout of the preview route on Windows, which is the
export contract (`.claude/rules/exports.md`). Baselines are measured per token,
not per block: for every character of every text node, `Range.getClientRects()`;
a token is a run of non-space characters on one line (a word broken across lines
is two tokens). Each block's first-line baseline is read from a zero-size
`inline-block` inserted before its first text node, and a token's baseline is
that plus its rect's offset from the block's first character. Text is recorded
as drawn, after `text-transform`. The probe also records the sidebar's right
edge, which splits tokens into the two columns.

**The product PDF.** The Preview is one unpaginated surface, so it cannot say
where a page breaks. Lines past the first page are compared with Chromium's
print of the same Preview (Playwright `page.pdf()` under print media), which is
what a user downloads as PDF. Its text baselines land on whole px, so a page-2
Δ carries up to ±0.6px of that rounding.

**Word.** The DOCX is built by the generator with the settings `route.ts`
derives from the resolved layout, then rendered by Microsoft Word itself through
COM — never by a converter that reimplements Word's layout:

```python
import pythoncom, win32com.client
pythoncom.CoInitialize()
word = win32com.client.DispatchEx("Word.Application")
word.Visible = False
word.DisplayAlerts = 0
doc = word.Documents.Open(docx_path, False, True)  # read-only
doc.SaveAs2(pdf_path, 17)                          # wdFormatPDF
doc.Close(False)
word.Quit()
```

## The comparison

Word's PDF is read with pdf.js; positions are converted to CSS px at 96dpi
(pt × 96 / 72). Every page is read, each page's baselines offset by the heights
of the pages before it. Text items become tokens by splitting on whitespace and
merging items that touch on one baseline. pdf.js inserts a space into a
letter-spaced run ("A L E X"), so one Preview word may pair with several
consecutive Word tokens on one line whose letters concatenate to it.

Each Preview token is paired with a same-column Word token of the same text
(letters and digits only) by lowest |Δy| + 0.5·|Δx| over all candidate pairs.
A Preview line passes when all of its tokens are paired, they sit on one Word
line, that Word line holds no other token of the same block, and every token's
|Δbaseline| ≤ 1.5px. Unpaired Word tokens are reported too. For page 2 onward
the reference is the product PDF: the same last line on page 1 in each column,
the same words on every later line, and each baseline within ±1.5px of the
PDF's.

Horizontal Δx is informational only: the x of a token inside a multi-word PDF
item is interpolated per character and is approximate.

The fixtures that matter are the ones that differ: the shared e2e resume
(`e2e/fixtures/resume.ts`, English, Arial, scale 1); a second in French, in
Georgia at font scale 1.1, with a name-only contact block and wrapping sidebar
text; and the first again with rich text (HTML paragraphs, lists, bold and
italic) in every field that accepts it. A change is judged on all of them, and
the other templates' DOCX must stay identical part for part (`docProps/core.xml`
compared with its timestamps masked).

Modern's photo is compared on its own fixture, the shared resume with a photo
(`e2e/fixtures/photo-portrait.jpg`, 3:4, so the cover crop trims top and
bottom), and with real photographs of other shapes. Word's PDF is read for the
image's placement, and the photo zone is compared pixel for pixel with a
screenshot of the Preview's. `e2e/docx-modern-photo.spec.ts` compares the
Preview's photo box and crop with the route's DOCX on every run; only the Word
render shows that Word draws the anchor there.

## What Word does, as measured

### The baseline: 0.8 of an exact line

Measured with stacked paragraphs in each picker font, at a range of sizes and
line heights, rendered by both engines:

- **Word**, in an exact line, puts the baseline 0.8 of the line height below the
  line's top, whatever the font and size.
- **Chromium** centres the font's ascent and descent, each rounded to a whole
  px, in the line box, and the baseline lands on a whole px:
  `floor(round(A·px) + (L − round(A·px) − round(D·px)) / 2)`.

So each Word line drew its text lower than the Preview, by an amount that
depends on size and line height. `baselineRaise` raises every run by the
difference (`w:position`). Word honours a raise in whole half-points only — a
smaller raise has no effect — so the raise is rounded to them, leaving at most
⅓px. A run that shares a Word line with a taller Preview box (an entry row, a
centred flex item) passes that line and its offset in it.

### Font metrics

`A` and `D` above are the OS/2 `winAscent` and `winDescent` of the Windows font
files (`C:\Windows\Fonts`), over `unitsPerEm`; the table also holds the advances
of the space and of "•" (U+2022), for padding spaces and bullet hangs. With
these, the Chromium model above predicts the measured baselines. Bold and
regular faces share the vertical metrics in every family. Helvetica is not a
Windows font: both engines draw Arial. "System Default" resolves to Segoe UI,
the first family of its stack Windows has, and that family is also what the
DOCX writes, so Word does not substitute a face the raise was not computed for.
A family outside the table gets no raise in Professional; Modern lays it out
with Arial's metrics throughout, so raises, padding spaces and bullet hangs
describe one face.

### Width: whole half-points, scaled back

A Word run size is whole half-points; the Preview's px × 1.5 often is not
(11px is 16.5 half-points, written 17, 3% wide). Glyph advances then differ
from Chromium's and Word breaks lines at different words. Each run carries a
horizontal scale `w:w = round(100 × exact half-points / written half-points)`,
in whole percent. Line heights are computed from the exact px, not the written
size: from the written size every 11px line was 0.5px too tall in Word's render,
which accumulated down a column. Letter spacing is pinned per template by
`docx-letter-spacing.test.ts`: Professional takes the em of the Preview's px,
because Word adds character spacing after the width scale.

### Compatibility mode 14

In Word 2013+ layout (compatibility mode 15, what `docx` writes by default) a
justified line shrinks its spaces to fit one more word; the browser only ever
stretches them. Justified paragraphs then broke one word later than the Preview.
Word 2010 layout (`compatibility: { version: 14 }`) stretches only, and breaks
where the browser breaks. Exact line spacing, cell margins and `w:position` were
re-measured under mode 14 and did not move.

### Pagination inside a table

Both generators draw the two columns as one table row, which changes how Word
paginates:

- Word **keeps a paragraph's space before at the top of a page inside a table
  row**, whether the row spans the break or starts after it; in body text it
  drops it. Measured in modes 14 and 15. `w:suppressSpBfAfterPgBrk`,
  `w:suppressTopSpacing`, giving the gap paragraph a run, carrying the gap as
  the empty paragraph's space after, or as the text paragraph's own space before
  — none changes it.
- Word counts a paragraph's **space after** when fitting it at the foot of a
  page in a table cell; Chromium's print truncates a margin at a page break. So
  a gap after a block moved a block that fits to the next page. Modern carries
  each sidebar gap as the next block's space before, as a paragraph of its own.
- Word **collapses** a space after and the following paragraph's space before
  into the larger of the two, so a gap carried before must follow a table or a
  paragraph with no space after.
- A cell's **bottom margin is reserved at the foot of every page** the row
  spans, ending page 1 early; Modern's main cell has none.
- A cell's **fill ends at the last line** Word set on that page, and stops after
  the row. Modern also draws the sidebar colour as a page-anchored image behind
  the text in the header, which repeats on every page. Word does not draw a 1×1
  PNG, so the image is larger.

### The page

The DOCX page must be the page the product PDF is printed on. 297mm is 16838
twips (Word's own A4); the two-decimal `PAGE_HEIGHT_INCHES` gives 16833, 0.3px
shorter, which moved a Modern sidebar line ending within that 0.3px of the page
foot to the next page. Modern declares `PAGE_HEIGHT_TWIPS`; the other templates
still declare the inch value, and adopting the exact height there is a separate
decision.

### Inline boxes

Word's run shading fills the whole exact line, so an inline box with padding
(Modern's job-title bar, its technology chips) is written as shaded runs, the
horizontal padding a no-break space widened by character spacing to the exact
px (the font table's space advance). A formatted list's marker hangs 13/11 em
of the font size, measured from Chromium's drawn disc, not derived from its
rules.

## Fidelity limitations

These are explicit findings, not passes:

- **Word on Windows only.** The baseline model, `w:position` in half-points,
  `w:w`, mode-14 justification and the pagination behaviour above are
  calibrated to Microsoft Word on Windows, against Chromium on Windows with the
  Windows font files. They are unverified in LibreOffice, Google Docs and Apple
  Pages, which may place baselines, honour or round `w:position` and `w:w`, and
  justify differently. The ±1.5px holds for Word only.
- **Modern page 2+.** When the gap after the last sidebar block on a page
  straddles the page edge, Chromium drops it and Word keeps it as the next
  block's space before, so every following sidebar line on that page is one gap
  lower than the product PDF's: 3px on the parity fixture whose break falls in a
  skill-name margin, 8px on the one whose break falls in the language gap. When
  the gap fits and only the next block does not, Word matches the PDF. Removing
  it needs the sidebar to flow outside the two-column table — a different
  document structure for both columns.
- **Compatibility mode.** Word shows "[Compatibility Mode]". A user who converts
  the document to the current format gets Word 2013+ justification back, and
  justified lines may again break one word later.
- **Rounding.** A raise keeps up to ⅓px of half-point rounding; a whole-percent
  width scale leaves up to about 0.5% of advance, which can move a break for a
  line that only just fits.
- **Unmeasured fonts.** Picker fonts other than Arial and Georgia, and "System
  Default", have metrics read from their font files but were not compared with a
  Preview render.
- **Modern's page width** is 11908 twips (the two-decimal inches); Word's A4 is
  11906.
- **Photo orientation.** Word ignores a JPEG's EXIF orientation; the browser
  applies it. A phone photo stored sideways with an orientation tag shows
  upright in the Preview and sideways in Word, and its cover crop, computed on
  the stored size, trims the other axis.

## Re-measuring

Re-measure when one of the constants above changes, when a template's CSS
changes a box the generator mirrors, or before claiming parity for a font,
template or fixture not measured here:

1. Probe the Preview for each fixture, and print each one to PDF, from the same
   build.
2. Generate each fixture's DOCX with the route's settings and render it through
   Word as above.
3. Compare every line, page 1 against the Preview and later pages against the
   product PDF, and check the other templates' DOCX are unchanged.
4. Record the result as evidence (`docs/engineering/progress-log-format.md`);
   do not copy measured figures into code comments, where they drift.
