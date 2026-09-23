import {
  compositeOverOpaque,
  PREVIEW_TEXT_ALPHA,
  type PreviewAlpha,
  type TranslucentTemplate,
} from '@/lib/resume-text-opacity'
import { DOCX_PALETTE } from './docx-palette'

/**
 * The colour a DOCX run takes where the Preview draws that text translucent
 * (US-006).
 *
 * A DOCX run carries no alpha, so the run is written in the opaque colour the
 * Preview's tint composites to over the colour the DOCX draws behind it. The
 * backdrop is supplied by the caller because it is not a constant: on
 * professional and modern it is the user's sidebar colour, resolved from the
 * layout model for that request; on creative it is the header fill, which the
 * generator takes from the palette.
 *
 * The foreground is the template's own white from the Preview palette, not a
 * literal, so a template whose white changed would change its tint with it.
 */
export function docxTranslucentText<Template extends TranslucentTemplate>(
  template: Template,
  element: keyof (typeof PREVIEW_TEXT_ALPHA)[Template],
  backdropHex: string,
): string {
  // Indexing a generic template widens to the union of the five records, so the
  // entry is read through its own type rather than being narrowed to one field.
  const elements: Readonly<Record<string, PreviewAlpha>> = PREVIEW_TEXT_ALPHA[template]
  const declared = elements[element as string]
  return compositeOverOpaque(DOCX_PALETTE[template].white, declared.alpha, backdropHex)
}
