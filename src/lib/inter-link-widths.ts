/**
 * The advance widths of Inter Regular for the printable ASCII characters
 * (U+0020–U+007E), the characters a link or an email address is written in,
 * so the `swissIt` Word export can tell whether a project's link fits its
 * card's line: a link that fits is written as stored, and only one wider than
 * the line gets break opportunities at its boundaries.
 *
 * Provenance: read on 2026-11-23 from the hmtx table of `@fontsource/inter`'s
 * latin regular WOFF (unitsPerEm 2048), through `src/test/inter-advance-widths.ts`;
 * `inter-link-widths.test.ts` holds every value equal to that reading, so the
 * table cannot drift from the font. Advance widths only — metrics, not glyph
 * outlines or any other part of the font software.
 *
 * Kerning is not applied: a width summed here is never narrower than the one
 * Word draws. A character outside the table is measured as the widest glyph
 * in it, so an unknown character can only widen a measure.
 */

const UNITS_PER_EM = 2048

const FIRST = 0x20

/** Inter Regular advances for U+0020 to U+007E, in font units. */
export const INTER_REGULAR_ASCII_ADVANCES: readonly number[] = [
  576, 589, 954, 1297, 1314, 2011, 1319, 614, 747, 747, 1026, 1355, 590, 942, 590, 738,
  1292, 833, 1249, 1265, 1323, 1215, 1270, 1159, 1267, 1270, 590, 618, 1355, 1355, 1355, 1047,
  1978, 1413, 1340, 1496, 1478, 1231, 1209, 1528, 1522, 550, 1169, 1376, 1158, 1850, 1543, 1566,
  1308, 1566, 1318, 1314, 1322, 1524, 1413, 2018, 1397, 1390, 1288, 747, 738, 747, 965, 934,
  661, 1150, 1254, 1170, 1254, 1194, 758, 1256, 1211, 496, 496, 1124, 496, 1794, 1210, 1228,
  1254, 1254, 771, 1081, 670, 1211, 1151, 1676, 1118, 1151, 1131, 873, 681, 873, 1355,
]

const WIDEST = Math.max(...INTER_REGULAR_ASCII_ADVANCES)

/** The width of `text` in Inter Regular at `px`, in CSS px, unkerned; a character outside printable ASCII counts as the widest glyph. */
export function interLinkWidthPx(text: string, px: number): number {
  let units = 0
  for (const char of text) {
    const advance = INTER_REGULAR_ASCII_ADVANCES[(char.codePointAt(0) ?? 0) - FIRST]
    units += advance ?? WIDEST
  }
  return (units / UNITS_PER_EM) * px
}
