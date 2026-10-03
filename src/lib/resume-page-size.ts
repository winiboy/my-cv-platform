/**
 * The page a resume is drawn on, as one declaration every surface reads.
 *
 * DECISION (Part 3 US-008): every resume is A4 — 210 × 297 mm, the paper
 * European employers print on. Before this story the Preview and the print
 * were US Letter (816 × 1056 CSS px, `@page size: letter`), professional's and
 * modern's DOCX were Letter (8.5 × 11 in), and classic's, minimal's and
 * creative's DOCX were already A4, so no two surfaces agreed. The Preview is
 * normally the reference for exports (`.claude/rules/exports.md`); here the
 * Preview is the surface that was wrong, because the paper is a product
 * decision and not a rendering of the model.
 *
 * Millimetres are the definition; the other units are that definition written
 * the way each surface declares a page:
 * - The templates and the editor's preview scaling pin CSS px.
 * - The DOCX section size is inches, converted to twips by `docx`.
 * - `globals.css`'s `@page` names the size `A4`, and the professional print
 *   sidebar gradient is drawn in px from the page edge. A stylesheet cannot
 *   import this module, so `resume-page-size.test.ts` reads the CSS and fails
 *   if either drifts from these numbers — the arrangement US-004 used for the
 *   line heights that live only in CSS.
 *
 * The inch values are the two decimals the DOCX sections already declared, and
 * the px values are whole CSS px at 96 dpi. Both are rounded: the test bounds
 * each against the millimetre definition, within half a px and 0.005 in.
 * The twips height is the exact A4 page Word itself declares, rounded to the
 * whole twip and bounded within half a twip.
 */

/** A4 in millimetres — the definition the other units are written from. */
export const PAGE_WIDTH_MM = 210
export const PAGE_HEIGHT_MM = 297

/** A4 in CSS px at 96 dpi: the unit the templates and the editor pin. */
export const PAGE_WIDTH_PX = 794
export const PAGE_HEIGHT_PX = 1123

/** A4 in inches: the unit a DOCX section size is declared in. */
export const PAGE_WIDTH_INCHES = 8.27
export const PAGE_HEIGHT_INCHES = 11.69

/**
 * A4's height in twips, unrounded to inches: 297 mm is 16838 twips, Word's own
 * A4. The two-decimal inches give 16833, 0.3px shorter than the page the PDF
 * is printed on — enough to move a line that ends within that 0.3px of the
 * PDF's page bottom to the next page. A DOCX that paginates against the PDF
 * declares this height rather than `PAGE_HEIGHT_INCHES`.
 */
export const PAGE_HEIGHT_TWIPS = 16838

/** The page width as a CSS length, for the `width` a template pins. */
export const PAGE_WIDTH_CSS = `${PAGE_WIDTH_PX}px`

/** The page height as a CSS length, for the `min-height` a template pins. */
export const PAGE_HEIGHT_CSS = `${PAGE_HEIGHT_PX}px`
