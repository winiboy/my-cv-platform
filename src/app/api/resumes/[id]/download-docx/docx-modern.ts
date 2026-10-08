import { getTranslations, type Locale } from '@/lib/i18n'
import { contactLabel, presentLabel } from '@/lib/resume-template-strings'
import {
  Document,
  Header,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  VerticalAlign,
  convertInchesToTwip,
  TabStopType,
  HeightRule,
  LineRuleType,
  TableLayoutType,
  PageOrientation,
  ShadingType,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
  DocumentGridType,
  NoBreakHyphen,
  type IMediaTransformation,
  type UniversalMeasure,
} from 'docx'
import JSZip from 'jszip'
import {
  pxToHalfPoints,
  pxToTwips,
  hslToHex,
  extractAlignment,
  isPlainTextList,
  parsePlainTextListToParagraphs,
  parseHtmlToDocxRuns,
  exactLineSpacing,
  trackingSpacing,
  NO_TEXT_LINE,
  type DocxGeneratorSettings,
} from './docx-helpers'
import {
  FORMATTED_LIST_INDENT_PX,
  FORMATTED_LIST_MARKER_EM,
  PREVIEW_FONT_METRICS,
  bareInlineFormatTags,
  baselineRaise,
  formattedBlocks,
  resolvePreviewFont,
} from './docx-preview-metrics'
import { DOCX_PALETTE } from './docx-palette'
import { docxTranslucentText } from './docx-text-opacity'
import { graphicHeightTwips, proportionalBar, shadedCellBar } from './docx-graphics'
import { solidColourPng } from './docx-disc'
import { PAGE_HEIGHT_TWIPS, PAGE_WIDTH_INCHES } from '@/lib/resume-page-size'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import { MODERN_SKILL_BAR, modernSkillBarTrack } from '@/lib/resume-graphics'
import {
  FORMATTED_CONTENT_LINE_HEIGHT,
  MODERN_LINE_HEIGHT,
  MODERN_TITLE_BAR_PADDING_Y_PX,
  PREFLIGHT_LINE_HEIGHT,
  TAILWIND_LEADING,
  TAILWIND_TEXT_LINE_HEIGHT,
  rendersAsFormattedContent,
} from '@/lib/resume-line-height'
import {
  assertExhaustiveSection,
  mapEditorOrderToModern,
  resolveModernMainOrder,
  type EditorMainId,
  type EditorSidebarId,
  type ModernMainId,
  type ModernSidebarId,
} from '@/lib/layout-settings'

/**
 * Every text run the Preview draws in a colour of its own (US-003). The sidebar
 * text it draws in translucent white has no colour of its own: it is composited
 * over the user's colour per request (US-006, below).
 */
const PALETTE = DOCX_PALETTE.modern

/** The letter spacing the Preview draws, in em, applied at each run's own size (US-005). */
const TRACKING = PREVIEW_TRACKING.modern

// ============================================================
// FONT SIZE CONSTANTS (matching modern-template.tsx)
// ============================================================
/**
 * The sizes no stored per-property value reaches. The name and the body and
 * summary sizes used to be stated here too, as the defaults of the controls
 * the Preview applies; they now come from the model, because a default is not
 * the size the Preview draws once a stored value differs (Part 3 US-011).
 */
export const FONT_SIZES = {
  JOB_TITLE_BAR: 16,           // Job title on accent bar
  LOCATION: 11,                 // Address line below title
  MAIN_SECTION_TITLE: 16,      // MainSectionHeader h2
  SIDEBAR_SECTION_TITLE: 13,   // SidebarSectionHeader h2
  EXPERIENCE_POSITION: 13,     // exp.position bold uppercase
  EXPERIENCE_DATE: 12,         // exp date text
  EXPERIENCE_COMPANY: 12,      // exp.company bold
  EXPERIENCE_LOCATION: 11,     // exp.location
  CONTACT_LABEL: 10,           // Contact label uppercase
  CONTACT_VALUE: 11,           // Contact value
  EDUCATION_DEGREE: 12,        // edu.degree bold uppercase
  EDUCATION_SCHOOL: 11,        // edu.school
  SKILL_CATEGORY: 12,          // skillCategory.category bold uppercase
  SKILL_ITEM: 11,              // skill item text
  LANGUAGE_NAME: 12,           // lang.language bold
  LANGUAGE_LEVEL: 11,          // lang.level
  CERT_NAME: 12,               // cert.name bold
  CERT_ISSUER: 11,             // cert.issuer
  CERT_DATE: 10,               // cert.date
}

/**
 * The project name (`text-lg`) and technology chips (`text-xs`) are Tailwind
 * size classes with no inline size, so the Preview draws them at these px
 * whatever the font scale (measured: 28px lines for the name at scale 1.1).
 */
export const UNSCALED_FONT_SIZES = {
  PROJECT_NAME: 18,            // text-lg
  TECHNOLOGY: 12,              // text-xs
}

/**
 * The Preview's line heights (US-004), from the module `modern-template.tsx`
 * imports them from: `title` for the name; `compact` for headings, labels and
 * entry lines; `text` for running text and secondary lines. Elements that set
 * none inherit Tailwind's preflight 1.5; the project name and technologies
 * draw at their `text-lg` and `text-xs` line heights, and the project
 * description at `leading-relaxed`. Formatted (HTML) text draws at
 * `.formatted-content`'s height, through `formattedTextLineHeight`.
 */
const LINE_HEIGHT = MODERN_LINE_HEIGHT

// Spacing constants in px (matching modern-template.tsx)
const SPACING = {
  SECTION_MARGIN_BOTTOM_SIDEBAR: 32,  // mb-8 on sidebar sections
  LANGUAGES_MARGIN_BOTTOM: 24,        // the languages section's own marginBottom
  SIDEBAR_PADDING: 32,                // p-8 on the sidebar content
  MAIN_PADDING: 32,                   // p-8 on the main column
  PHOTO_ZONE_HEIGHT: 220,             // the photo zone above the sidebar content
  SIDEBAR_HEADER_PADDING_Y: 6,        // SidebarSectionHeader padding: 6px 12px
  SIDEBAR_HEADER_PADDING_X: 12,
  MAIN_HEADER_PADDING_BOTTOM: 6,      // MainSectionHeader h2 paddingBottom
  MAIN_HEADER_RULE: 2,                // MainSectionHeader rule height
  CONTACT_ICON: 32,                   // ContactItem icon badge, width and height
  CONTACT_ICON_GAP: 10,               // ContactItem gap between text and badge
  LOCATION_NO_TITLE_MT: 4,            // the address line's marginTop with no job title
  EXPERIENCE_LEFT_SHARE: 0.4,         // the entry's left column: width 40%
  EXPERIENCE_COLUMN_GAP: 16,          // the entry row's gap
  EXPERIENCE_DATE_MT: 2,
  EXPERIENCE_COMPANY_MT: 8,
  EXPERIENCE_LOCATION_MT: 2,
  ACHIEVEMENTS_MT: 6,                 // the achievement list's marginTop after a description
  ACHIEVEMENT_BULLET_GAP: 6,          // the achievement li's gap after its bullet
  PROJECT_INDENT: 16,                 // pl-4 on a project
  PROJECT_GAP: 16,                    // space-y-4 between projects
  PROJECT_DESCRIPTION_MT: 4,          // mt-1
  PROJECT_TECHNOLOGIES_MT: 8,         // mt-2
  TECHNOLOGY_PADDING_Y: 4,            // py-1 on a chip
  SECTION_MARGIN_BOTTOM_MAIN: 24,     // mb-6 on main sections
  SIDEBAR_SECTION_HEADER_MB: 12,      // marginBottom on SidebarSectionHeader
  MAIN_SECTION_HEADER_MB: 12,         // marginBottom on MainSectionHeader
  CONTACT_ITEM_GAP: 10,              // gap between contact items
  EDUCATION_ITEM_GAP: 12,            // gap between education entries
  SKILL_CATEGORY_GAP: 16,            // gap between skill categories
  SKILL_ITEM_GAP: 8,                 // gap between skill items
  SKILL_NAME_MB: 3,                  // margin below a skill name, above its bar
  LANGUAGE_ITEM_GAP: 8,              // gap between language items
  CERT_ITEM_GAP: 12,                 // gap between certifications
  EXPERIENCE_ITEM_GAP: 16,           // gap between experience entries
  NAME_MB: 8,                        // marginBottom on name
  TITLE_BAR_MB: 8,                   // marginBottom on title bar
  TITLE_BAR_PADDING_X: 12,           // the title bar's horizontal padding
  TECHNOLOGY_PADDING_X: 8,           // px-2 on a chip
  TECHNOLOGY_GAP: 8,                 // gap-2 between chips
  ACHIEVEMENT_GAP: 2,                // gap between achievement items
}

/**
 * Derive accent color hex from sidebar HSL values.
 * Mirrors the deriveAccentColor function in modern-template.tsx:
 *   h stays the same, s += 20 (max 100), l += 25 (max 65)
 */
function deriveAccentColorHex(sidebarHue: number, sidebarSaturation: number, sidebarBrightness: number): string {
  const s = Math.min(sidebarSaturation + 20, 100)
  const l = Math.min(sidebarBrightness + 25, 65)
  return hslToHex(sidebarHue, s, l)
}

/**
 * Detect the image type from a base64 data URL or raw base64 string.
 * Returns a docx-compatible type or null if unrecognized.
 */
function detectImageType(base64: string): 'jpg' | 'png' | 'gif' | 'bmp' | null {
  if (base64.startsWith('data:image/jpeg') || base64.startsWith('data:image/jpg')) return 'jpg'
  if (base64.startsWith('data:image/png')) return 'png'
  if (base64.startsWith('data:image/gif')) return 'gif'
  if (base64.startsWith('data:image/bmp')) return 'bmp'

  // Check raw base64 magic bytes (no data URL prefix)
  // JPEG starts with /9j/, PNG starts with iVBOR
  if (base64.startsWith('/9j/')) return 'jpg'
  if (base64.startsWith('iVBOR')) return 'png'
  if (base64.startsWith('R0lGOD')) return 'gif'

  return null
}

/**
 * Extract raw base64 data from a data URL. If already raw, returns as-is.
 */
function extractBase64Data(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex !== -1 && dataUrl.startsWith('data:')) {
    return dataUrl.substring(commaIndex + 1)
  }
  return dataUrl
}

/**
 * Parse original image dimensions from PNG or JPEG binary data.
 * PNG: width at bytes 16-19, height at bytes 20-23 (big-endian uint32).
 * JPEG: iterate marker segments to find SOF0/SOF1/SOF2 for dimensions.
 */
function parseImageDimensions(
  buffer: Buffer,
  imageType: 'jpg' | 'png' | 'gif' | 'bmp'
): { width: number; height: number } | null {
  try {
    if (imageType === 'png') {
      // PNG IHDR chunk: width at offset 16, height at offset 20 (big-endian)
      if (buffer.length < 24) return null
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)
      if (width > 0 && height > 0) return { width, height }
      return null
    }

    if (imageType === 'jpg') {
      // JPEG: verify SOI marker (0xFF 0xD8)
      if (buffer.length < 2 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null

      let offset = 2
      while (offset < buffer.length - 1) {
        // Scan for 0xFF marker prefix, skipping fill bytes (0xFF 0xFF)
        if (buffer[offset] !== 0xff) {
          offset++
          continue
        }
        // Skip consecutive 0xFF fill bytes
        while (offset < buffer.length - 1 && buffer[offset + 1] === 0xff) {
          offset++
        }
        if (offset >= buffer.length - 1) break

        const marker = buffer[offset + 1]
        offset += 2

        // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2) — Start of Frame markers
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          // Skip 2-byte segment length + 1-byte precision
          if (offset + 7 > buffer.length) return null
          const height = buffer.readUInt16BE(offset + 3)
          const width = buffer.readUInt16BE(offset + 5)
          if (width > 0 && height > 0) return { width, height }
          return null
        }

        // SOS (0xDA) — Start of Scan: no more parseable markers
        if (marker === 0xda) break
        // EOI (0xD9) — End of Image
        if (marker === 0xd9) break

        // Other marker: read 2-byte length and skip
        if (offset + 2 > buffer.length) break
        const segmentLength = buffer.readUInt16BE(offset)
        if (segmentLength < 2) break
        offset += segmentLength
      }
      return null
    }

    // GIF and BMP not supported for cropping
    return null
  } catch {
    return null
  }
}

/**
 * Calculate OOXML srcRect crop percentages to achieve CSS object-fit: cover.
 * Values are in 100,000ths of the source image dimensions (e.g., 25000 = 25%).
 */
function calculateCoverCropPercents(
  origWidth: number,
  origHeight: number,
  zoneWidth: number,
  zoneHeight: number
): { l: number; t: number; r: number; b: number } {
  const origRatio = origWidth / origHeight
  const zoneRatio = zoneWidth / zoneHeight

  if (origRatio > zoneRatio) {
    // Image is wider than zone — crop left and right
    const scale = zoneHeight / origHeight
    const visibleWidth = zoneWidth / scale
    const cropEach = (origWidth - visibleWidth) / 2
    const cropPercent = Math.round((cropEach / origWidth) * 100000)
    return { l: cropPercent, r: cropPercent, t: 0, b: 0 }
  } else if (origRatio < zoneRatio) {
    // Image is taller than zone — crop top and bottom
    const scale = zoneWidth / origWidth
    const visibleHeight = zoneHeight / scale
    const cropEach = (origHeight - visibleHeight) / 2
    const cropPercent = Math.round((cropEach / origHeight) * 100000)
    return { t: cropPercent, b: cropPercent, l: 0, r: 0 }
  }

  return { l: 0, t: 0, r: 0, b: 0 }
}

/** EXIF orientation 1: the stored pixels are already upright. */
const EXIF_ORIENTATION_NONE = 1
const EXIF_ORIENTATION_TAG = 0x0112
const TIFF_TYPE_SHORT = 3
const TIFF_IFD_ENTRY_BYTES = 12
/** Real JPEGs carry a handful of segments before SOS; past this the file is not one we trust. */
const MAX_JPEG_HEADER_SEGMENTS = 64

/**
 * The orientation in the EXIF block of an APP1 segment spanning
 * `[start, end)`, or 1. Every read is checked against `end`, the segment's
 * own end, so a lying offset or count can never reach past it.
 */
function exifSegmentOrientation(buffer: Buffer, start: number, end: number): number {
  const tiff = start + 6 // after "Exif\0\0"
  if (tiff + 8 > end) return EXIF_ORIENTATION_NONE

  const byteOrder = buffer.readUInt16BE(tiff)
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return EXIF_ORIENTATION_NONE
  const littleEndian = byteOrder === 0x4949
  const u16 = (at: number) => (littleEndian ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at))
  const u32 = (at: number) => (littleEndian ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at))
  if (u16(tiff + 2) !== 0x002a) return EXIF_ORIENTATION_NONE

  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > end) return EXIF_ORIENTATION_NONE
  const entryCount = u16(ifd)
  // A count claiming more entries than the segment holds is malformed.
  if (ifd + 2 + entryCount * TIFF_IFD_ENTRY_BYTES > end) return EXIF_ORIENTATION_NONE

  for (let i = 0; i < entryCount; i++) {
    const entry = ifd + 2 + i * TIFF_IFD_ENTRY_BYTES
    if (u16(entry) !== EXIF_ORIENTATION_TAG) continue
    if (u16(entry + 2) !== TIFF_TYPE_SHORT || u32(entry + 4) !== 1) return EXIF_ORIENTATION_NONE
    // A single SHORT sits in the first two bytes of the entry's value field.
    const value = u16(entry + 8)
    return value >= 1 && value <= 8 ? value : EXIF_ORIENTATION_NONE
  }
  return EXIF_ORIENTATION_NONE
}

/**
 * The EXIF orientation (1–8) of a JPEG, read from its first Exif APP1
 * segment; 1 when there is none or anything about the file is unexpected.
 *
 * The photo is untrusted input, so the marker walk is bounded by the buffer
 * and by a segment cap, the EXIF read by the APP1 segment's own length, and no
 * exception escapes.
 */
export function readJpegOrientation(buffer: Buffer): number {
  try {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return EXIF_ORIENTATION_NONE

    let offset = 2
    for (let segments = 0; segments < MAX_JPEG_HEADER_SEGMENTS; segments++) {
      // Fill bytes: any number of 0xFF may precede a marker.
      while (offset + 1 < buffer.length && buffer[offset] === 0xff && buffer[offset + 1] === 0xff) offset++
      if (offset + 4 > buffer.length || buffer[offset] !== 0xff) return EXIF_ORIENTATION_NONE

      const marker = buffer[offset + 1]
      // SOS or EOI: the header, where EXIF lives, is over.
      if (marker === 0xda || marker === 0xd9) return EXIF_ORIENTATION_NONE

      const length = buffer.readUInt16BE(offset + 2)
      const segmentStart = offset + 4
      const segmentEnd = offset + 2 + length
      if (length < 2 || segmentEnd > buffer.length) return EXIF_ORIENTATION_NONE

      if (
        marker === 0xe1 &&
        segmentEnd - segmentStart >= 6 &&
        buffer.toString('latin1', segmentStart, segmentStart + 6) === 'Exif\0\0'
      ) {
        return exifSegmentOrientation(buffer, segmentStart, segmentEnd)
      }
      offset = segmentEnd
    }
    return EXIF_ORIENTATION_NONE
  } catch {
    return EXIF_ORIENTATION_NONE
  }
}

interface PhotoOrientationTransform {
  /** Written on the picture's `a:xfrm`; Word applies the flip before the rotation. */
  readonly picture: Pick<IMediaTransformation, 'rotation' | 'flip'>
  /** Orientations 5–8 display the stored image with width and height swapped. */
  readonly swapsAxes: boolean
}

/**
 * The picture transform that makes Word draw an EXIF-oriented JPEG the way
 * the Preview does: Chromium applies EXIF orientation before
 * `object-fit: cover`. Measured in Word's own render for every orientation.
 */
const EXIF_PHOTO_TRANSFORMS: Readonly<Record<number, PhotoOrientationTransform>> = {
  2: { picture: { flip: { horizontal: true } }, swapsAxes: false },
  3: { picture: { rotation: 180 }, swapsAxes: false },
  4: { picture: { flip: { vertical: true } }, swapsAxes: false },
  5: { picture: { flip: { horizontal: true }, rotation: 270 }, swapsAxes: true },
  6: { picture: { rotation: 90 }, swapsAxes: true },
  7: { picture: { flip: { horizontal: true }, rotation: 90 }, swapsAxes: true },
  8: { picture: { rotation: 270 }, swapsAxes: true },
}

const EMU_PER_PX = 9525

// ============================================================
// MODERN TEMPLATE DOCX GENERATOR
// ============================================================

/**
 * Generate a DOCX buffer for the Modern template.
 * Layout: 2-column table -- sidebar (left, colored) + main content (right, white).
 * Sidebar: photo zone, contact, education, skills, languages, training.
 * Main: name + title header, summary, experience, projects.
 */
export async function generateModernDocx(
  resume: any,
  settings: DocxGeneratorSettings
): Promise<Buffer> {
  const {
    fontFamily,
    fontScale,
    titleFontSize,
    sectionDescFontSize,
    locale,
    sidebarHue,
    sidebarBrightness,
    sidebarWidth: sidebarWidthPercent,
    sidebarTopMargin,
    mainContentTopMargin,
    sidebarOrder: sidebarOrderRaw,
    mainContentOrder: mainContentOrderRaw,
    hiddenSidebarSections: hiddenSidebarRaw,
    hiddenMainSections: hiddenMainRaw,
    photoBase64,
  } = settings

  // Map editor-format section IDs to Modern template section IDs.
  // The editor uses generic IDs (e.g. 'keyAchievements', 'education' in main)
  // while Modern has 'contact' and 'education' in the sidebar.
  // mapEditorOrderToModern handles this translation, matching Live Preview behavior.
  //
  // The casts name the shared editor vocabulary instead of re-listing its
  // members: `DocxGeneratorSettings` declares these four as `string[]`, so a
  // cast is unavoidable here, but a cast to `EditorSidebarId[]` follows the
  // model when an id is added or renamed, where the hand-copied literal unions
  // that stood here did not.
  const {
    modernSidebarOrder: sidebarOrder,
    modernMainOrder,
    hiddenModernSidebar: hiddenSidebarSections,
    hiddenModernMain: hiddenMainSections,
  } = mapEditorOrderToModern(
    sidebarOrderRaw as EditorSidebarId[],
    mainContentOrderRaw as EditorMainId[],
    hiddenSidebarRaw as EditorSidebarId[],
    hiddenMainRaw as EditorMainId[],
  )

  /**
   * The main column's fallback is kept; the sidebar's was removed as dead.
   *
   * `mapEditorOrderToModern` builds its sidebar result as
   * `['contact', 'education', ...sharedInOrder]`, so it always has at least
   * two members and `modernSidebarOrder.length > 0` could never be false.
   * (`layout-settings.test.ts`, 'handles fully empty input without producing a
   * broken sidebar', pins that for the emptiest possible input.)
   *
   * The main result is a plain filter and CAN come back empty — a stored
   * `mainContentOrder` of `['education']` parses as valid, then loses its only
   * member to the mapping because Modern renders education in the sidebar.
   *
   * Part 3 US-010 moved the fallback this generator applied into
   * `resolveModernMainOrder`, because `modern-template.tsx` applied a DIFFERENT
   * condition — `mainContentOrder || DEFAULT_MODERN_MAIN_ORDER`, which an empty
   * array does not trigger — and drew an empty main column for the value this
   * generator drew the defaults for. One resolver, so they cannot disagree
   * again; the behaviour here is unchanged.
   */
  const mainContentOrder: readonly ModernMainId[] = resolveModernMainOrder(modernMainOrder)

  // Load translations
  const dict = getTranslations(locale as Locale, 'common')

  const contact = resume.contact || {}

  // Filter visible items only (matching Preview behavior)
  const experiences = (resume.experience || []).filter((exp: any) => exp.visible !== false)
  const education = (resume.education || []).filter((edu: any) => edu.visible !== false)
  const skills = (resume.skills || []).filter((skill: any) => skill.visible !== false)
  const certifications = (resume.certifications || []).filter((cert: any) => cert.visible !== false)
  const projects = (resume.projects || []).filter((project: any) => project.visible !== false)
  const languages = (resume.languages || []).filter((lang: any) => lang.visible !== false)

  // ============================================================
  // COLOR LOGIC (matching modern-template.tsx exactly)
  // Both colours derive from the resolved model's HSL, as the Preview's do.
  //
  // There is no template-default branch. The route always supplies the model's
  // colour, and the Preview is always handed `hsl(...)` built from it, so the
  // flat #333333 / #D4A843 pair `modern-template.tsx` keeps as a fallback is
  // not a colour either surface shows for a real resume. The `hasCustomColors`
  // flag that once selected it here was a constant `true` with one reader.
  // ============================================================

  // All three colour components come from the model. A `?? DEFAULT_RESUME_LAYOUT
  // .sidebarSaturation` stood on this one and could never fire —
  // `DocxGeneratorSettings.sidebarSaturation` is a required number, so the
  // route always supplies it — which made it a generator-side default for a
  // value the model already carries, the thing FR-4 forbids. The same dead
  // fallback was removed from `docx-professional.ts` in US-003.
  const sidebarSaturation = settings.sidebarSaturation

  const sidebarColorHex = hslToHex(sidebarHue, sidebarSaturation, sidebarBrightness)
  const accentColorHex = deriveAccentColorHex(sidebarHue, sidebarSaturation, sidebarBrightness)

  /**
   * The sidebar text the Preview draws in translucent white (US-006). A DOCX
   * run carries no alpha, so each element is written in the colour its own
   * translucency composites to over the sidebar fill this document draws.
   */
  const translucent = {
    contactLabel: docxTranslucentText('modern', 'contactLabel', sidebarColorHex),
    educationSchool: docxTranslucentText('modern', 'educationSchool', sidebarColorHex),
    languageLevel: docxTranslucentText('modern', 'languageLevel', sidebarColorHex),
    certIssuer: docxTranslucentText('modern', 'certIssuer', sidebarColorHex),
    certDate: docxTranslucentText('modern', 'certDate', sidebarColorHex),
  }

  /**
   * The skill bar's track (US-007): the Preview draws it in translucent white
   * over the sidebar, and a cell fill carries no alpha any more than a run does,
   * so it is written as the same composite US-006 writes for the text above it.
   */
  const skillBarTrackHex = modernSkillBarTrack(PALETTE.white, sidebarColorHex)

  /**
   * The sizes this document draws, in half-points.
   *
   * Two come from the model (Part 3 US-011): `modern-template.tsx` draws its
   * document title at the stored `titleFontSize` and its running text at the
   * stored `sectionDescFontSize`, both at the model's scale, and those are the
   * two keys `TEMPLATE_APPLIED_SIZE_KEYS.modern` names. The template renders
   * no input for either — the editor withdrew them (US-014) — but it applies
   * the stored value, so the export has to draw the same one. The other two
   * per-property sizes are untouched here: modern reads neither on any
   * surface, which is US-014's recorded decision and not a size to write.
   *
   * They are NOT read from `DEFAULT_RESUME_LAYOUT`: that reference resolves to
   * the default while the Preview keeps using the owner's value, the shape
   * Part 2's US-003 T-1 rejected.
   *
   * Each entry is a text box the Preview draws: its px size and its CSS line
   * height. A Word run's size is whole half-points, but the Preview's line box
   * is its px size times the line height, so line heights, the width scale and
   * the baseline raise below all use the exact px.
   */
  const boxes = {
    name: { px: titleFontSize * fontScale, lineHeight: LINE_HEIGHT.title },
    jobTitleBar: { px: FONT_SIZES.JOB_TITLE_BAR * fontScale, lineHeight: PREFLIGHT_LINE_HEIGHT },
    location: { px: FONT_SIZES.LOCATION * fontScale, lineHeight: PREFLIGHT_LINE_HEIGHT },
    mainSectionTitle: { px: FONT_SIZES.MAIN_SECTION_TITLE * fontScale, lineHeight: LINE_HEIGHT.compact },
    sidebarSectionTitle: { px: FONT_SIZES.SIDEBAR_SECTION_TITLE * fontScale, lineHeight: LINE_HEIGHT.compact },
    experiencePosition: { px: FONT_SIZES.EXPERIENCE_POSITION * fontScale, lineHeight: LINE_HEIGHT.compact },
    experienceDate: { px: FONT_SIZES.EXPERIENCE_DATE * fontScale, lineHeight: LINE_HEIGHT.compact },
    experienceCompany: { px: FONT_SIZES.EXPERIENCE_COMPANY * fontScale, lineHeight: LINE_HEIGHT.compact },
    experienceLocation: { px: FONT_SIZES.EXPERIENCE_LOCATION * fontScale, lineHeight: LINE_HEIGHT.compact },
    // Running text: the summary, an experience description and its achievements.
    body: { px: sectionDescFontSize * fontScale, lineHeight: LINE_HEIGHT.text },
    // Running text given as HTML, at `.formatted-content`'s line height.
    formatted: { px: sectionDescFontSize * fontScale, lineHeight: FORMATTED_CONTENT_LINE_HEIGHT },
    contactLabel: { px: FONT_SIZES.CONTACT_LABEL * fontScale, lineHeight: LINE_HEIGHT.compact },
    contactValue: { px: FONT_SIZES.CONTACT_VALUE * fontScale, lineHeight: LINE_HEIGHT.compact },
    educationDegree: { px: FONT_SIZES.EDUCATION_DEGREE * fontScale, lineHeight: LINE_HEIGHT.compact },
    educationSchool: { px: FONT_SIZES.EDUCATION_SCHOOL * fontScale, lineHeight: LINE_HEIGHT.text },
    skillCategory: { px: FONT_SIZES.SKILL_CATEGORY * fontScale, lineHeight: LINE_HEIGHT.compact },
    skillItem: { px: FONT_SIZES.SKILL_ITEM * fontScale, lineHeight: LINE_HEIGHT.compact },
    skillsFormatted: { px: FONT_SIZES.SKILL_ITEM * fontScale, lineHeight: FORMATTED_CONTENT_LINE_HEIGHT },
    languageName: { px: FONT_SIZES.LANGUAGE_NAME * fontScale, lineHeight: LINE_HEIGHT.compact },
    languageLevel: { px: FONT_SIZES.LANGUAGE_LEVEL * fontScale, lineHeight: LINE_HEIGHT.compact },
    certName: { px: FONT_SIZES.CERT_NAME * fontScale, lineHeight: LINE_HEIGHT.compact },
    certIssuer: { px: FONT_SIZES.CERT_ISSUER * fontScale, lineHeight: LINE_HEIGHT.text },
    certDate: { px: FONT_SIZES.CERT_DATE * fontScale, lineHeight: LINE_HEIGHT.text },
    projectName: { px: UNSCALED_FONT_SIZES.PROJECT_NAME, lineHeight: TAILWIND_TEXT_LINE_HEIGHT['text-lg'] },
    projectDescription: { px: sectionDescFontSize * fontScale, lineHeight: TAILWIND_LEADING['leading-relaxed'] },
    technology: { px: UNSCALED_FONT_SIZES.TECHNOLOGY, lineHeight: TAILWIND_TEXT_LINE_HEIGHT['text-xs'] },
  } satisfies Record<string, { px: number; lineHeight: number }>
  type BoxKey = keyof typeof boxes

  /** The size each box is written at, in whole half-points. */
  const scaledFontSizes = Object.fromEntries(
    (Object.keys(boxes) as BoxKey[]).map((key) => [key, pxToHalfPoints(boxes[key].px)])
  ) as Record<BoxKey, number>

  /**
   * A box's exact line (`w:line`, EXACT), from its unrounded size; `paddingPx`
   * adds a box's vertical padding to the line, for a box that is drawn as one
   * line of its own background.
   */
  const lineOf = (key: BoxKey, paddingPx = 0) =>
    paddingPx > 0
      ? exactLineSpacing({ lineHeight: boxes[key].lineHeight, halfPoints: boxes[key].px * 1.5, paddingPx })
      : exactLineSpacing([boxes[key].lineHeight, boxes[key].px * 1.5])

  // The family every run is written in, and the metrics its raise is computed
  // from: one resolution for both, so Word draws the face the raise is for.
  // A family the table has not measured is laid out with Arial's metrics
  // throughout — raises, padding spaces and bullet advances alike — because
  // the advances need some value, and two assumptions about one face (Arial's
  // widths, no raise) would describe a font that does not exist.
  const previewFont = resolvePreviewFont(fontFamily)
  const primaryFont = previewFont.name
  const layoutMetrics = previewFont.metrics ?? PREVIEW_FONT_METRICS.arial

  // A run rounded to whole half-points draws every glyph that much wider or
  // narrower than the Preview's px size (11px written as 17 half-points is 3%
  // wide), and Word then breaks lines at different words. Each run is scaled
  // horizontally (w:w, whole percent) back to the Preview's advance widths.
  const widthScale = (key: BoxKey) => Math.round((100 * boxes[key].px * 1.5) / scaledFontSizes[key])

  /**
   * The raise that puts a box's baseline where the Preview draws it, in the
   * Word line it is drawn in (its own, unless a row shares one) and
   * `offsetPx` below that line's top (padding, or flex centring).
   */
  const raiseOf = (key: BoxKey, wordLineTwips: number = lineOf(key).line, offsetPx = 0): UniversalMeasure =>
    baselineRaise(layoutMetrics, boxes[key].px, boxes[key].lineHeight, wordLineTwips, offsetPx)

  /** The run options every run of a box carries: size, width scale, raise and font. */
  const runBase = (key: BoxKey, wordLineTwips?: number, offsetPx?: number) => ({
    size: scaledFontSizes[key],
    scale: widthScale(key),
    position: raiseOf(key, wordLineTwips, offsetPx),
    font: primaryFont,
  })

  /**
   * Character spacing that widens one space of a box to `px`: horizontal
   * padding and gaps the Preview draws as box geometry, written as a space
   * (no-break inside a box) whose advance is the font's space plus this.
   */
  const paddingSpacing = (key: BoxKey, px: number) =>
    pxToTwips(px - layoutMetrics.space * boxes[key].px)

  // Calculate page dimensions for layout
  const pageWidthTwips = convertInchesToTwip(PAGE_WIDTH_INCHES)
  const sidebarWidthTwips = Math.round(pageWidthTwips * (sidebarWidthPercent / 100))
  const mainContentWidthTwips = pageWidthTwips - sidebarWidthTwips

  // The main column's p-8, exactly 32px each side (0.33" was 475 twips), and no
  // right indent beyond it: the Preview's text runs the full width inside p-8,
  // and an extra 0.15" made Word wrap at different words.
  const mainCellMargin = pxToTwips(SPACING.MAIN_PADDING)
  const mainContentTextWidth = mainContentWidthTwips - mainCellMargin * 2

  // Sidebar text indentation: the sidebar content's p-8. The cell has no
  // margins, so the photo and the section banners can span it edge to edge.
  const sidebarTextIndent = {
    left: pxToTwips(SPACING.SIDEBAR_PADDING),
    right: pxToTwips(SPACING.SIDEBAR_PADDING),
  }

  /**
   * A gap the Preview draws between two blocks, as a paragraph of its own whose
   * 1-twip line is part of the gap. The gap is its space *before*: where a page
   * breaks between the two blocks, the product PDF (Chromium's print of the
   * Preview) truncates the margin at the break, keeping the block above on the
   * page if its own box fits and starting the block below at the next page's
   * top. Word only places a paragraph whose spacing fits too, so a gap carried
   * as the block's space after moved a block whose box fits to the next page;
   * carried before the next block, it leaves that block where the PDF does.
   * Both orders put the next block at the same place otherwise.
   *
   * Word keeps a space before at the top of a page inside a table row that
   * spans pages (measured: empty and text paragraphs, compatibility modes 14
   * and 15), so the block after the break starts one gap lower than the PDF's.
   *
   * Word collapses a space after and the next paragraph's space before into
   * the larger of the two (measured), so a gap carried before must follow a
   * table or a paragraph with no space after; `'after'` keeps one that
   * follows spaced text whole.
   */
  const gapParagraph = (px: number, carriedAs: 'before' | 'after' = 'before') =>
    gapParagraphTwips(pxToTwips(px), carriedAs)
  const gapParagraphTwips = (twips: number, carriedAs: 'before' | 'after' = 'before') => {
    const gap = Math.max(0, twips - NO_TEXT_LINE.line)
    return new Paragraph({
      children: [],
      spacing: { before: carriedAs === 'before' ? gap : 0, after: carriedAs === 'after' ? gap : 0, ...NO_TEXT_LINE },
    })
  }

  /**
   * The paragraphs of a formatted (HTML) text block as `.formatted-content`
   * draws it: one per block `formattedBlocks` finds, stacked with no gap at the
   * box's line height, the last one carrying the space after the whole element;
   * a list item's marker hangs outside its text, which starts — and wraps — at
   * the list's indent. An element with no text still keeps that space.
   *
   * `prefix` is a run drawn before the first block's text and hung outside it
   * like a marker (an achievement's bullet): every block then starts at
   * `prefix.hangTwips`.
   */
  const formattedParagraphs = (
    html: string,
    options: {
      box: 'formatted' | 'skillsFormatted'
      color: string
      alignment: (typeof AlignmentType)[keyof typeof AlignmentType]
      spacingAfter: number
      indent?: { left: number; right: number }
      prefix?: { runs: TextRun[]; hangTwips: number }
    }
  ): Paragraph[] => {
    const { box, color, alignment, spacingAfter, prefix } = options
    const indent = options.indent ?? { left: 0, right: 0 }
    const blocks = formattedBlocks(html)
    if (blocks.length === 0) return [new Paragraph({ spacing: { after: spacingAfter, ...NO_TEXT_LINE }, indent })]
    const run = { ...runBase(box), color }
    const markerHang = pxToTwips(FORMATTED_LIST_MARKER_EM * boxes[box].px)
    const textStart = indent.left + (prefix?.hangTwips ?? 0)
    return blocks.map((block, i) => {
      const left = textStart + pxToTwips(FORMATTED_LIST_INDENT_PX * block.depth)
      const marker = block.marker === null ? [] : [new TextRun({ ...run, text: `${block.marker}\t` })]
      const first = i === 0 && prefix !== undefined
      return new Paragraph({
        children: [...(first ? prefix.runs : []), ...marker, ...parseHtmlToDocxRuns(bareInlineFormatTags(block.html), run)],
        spacing: { after: i === blocks.length - 1 ? spacingAfter : 0, ...lineOf(box) },
        indent: {
          left,
          right: indent.right,
          hanging: first ? left - indent.left : block.marker === null ? 0 : markerHang,
        },
        alignment: block.alignment ?? alignment,
      })
    })
  }

  /**
   * Running text in the main column as `renderFormattedText` draws it inside a
   * justified container: HTML through `.formatted-content` (its own line
   * height, the container's alignment unless a block sets one); plain text
   * through `formatText`'s justified div at the element's line height
   * (`plainBox`). A plain-text bulleted list keeps the shared list helper.
   */
  const runningText = (
    text: string,
    options: {
      plainBox: 'body' | 'projectDescription'
      color: string
      spacingAfter: number
      indent?: { left: number; right: number }
    }
  ): Paragraph[] => {
    const { plainBox, color, spacingAfter } = options
    const indent = options.indent ?? { left: 0, right: 0 }
    if (rendersAsFormattedContent(text)) {
      return formattedParagraphs(text, { box: 'formatted', color, alignment: AlignmentType.JUSTIFIED, spacingAfter, indent })
    }
    if (isPlainTextList(text)) {
      return parsePlainTextListToParagraphs(text, { ...runBase(plainBox), color }, {
        spacingAfterItem: pxToTwips(4),
        spacingAfterLast: spacingAfter,
        indent,
        alignment: extractAlignment(text) || AlignmentType.JUSTIFIED,
        lineSpacing: lineOf(plainBox),
      })
    }
    return [
      new Paragraph({
        children: parseHtmlToDocxRuns(text, { ...runBase(plainBox), color }),
        alignment: AlignmentType.JUSTIFIED,
        indent,
        spacing: { after: spacingAfter, ...lineOf(plainBox) },
      }),
    ]
  }

  // A sidebar skill bar is `width: 100%` of the same column that indent defines.
  const skillBarWidthTwips = sidebarWidthTwips - sidebarTextIndent.left - sidebarTextIndent.right

  // No-border definition for nested tables
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  } as const

  // ============================================================
  // HELPER: Create a sidebar section header
  // Mimics the SidebarSectionHeader component: an accent banner across the
  // whole sidebar (its -32px side margins cancel the sidebar's p-8), padded
  // 6px 12px, with white uppercase text. A one-cell table draws that box
  // exactly: cell margins are the padding, cell shading the background. Its
  // 12px margin below is the gap paragraph after it.
  // ============================================================
  function createSidebarSectionHeader(title: string): (Paragraph | Table)[] {
    const banner = new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      ...runBase('sidebarSectionTitle'),
                      text: title.toUpperCase(),
                      bold: true,
                      color: PALETTE.white,
                      characterSpacing: trackingSpacing(TRACKING.sectionHeading, scaledFontSizes.sidebarSectionTitle),
                    }),
                  ],
                  spacing: { before: 0, after: 0, ...lineOf('sidebarSectionTitle') },
                }),
              ],
              width: { size: sidebarWidthTwips, type: WidthType.DXA },
              margins: {
                top: pxToTwips(SPACING.SIDEBAR_HEADER_PADDING_Y),
                bottom: pxToTwips(SPACING.SIDEBAR_HEADER_PADDING_Y),
                left: pxToTwips(SPACING.SIDEBAR_HEADER_PADDING_X),
                right: pxToTwips(SPACING.SIDEBAR_HEADER_PADDING_X),
              },
              shading: { type: ShadingType.CLEAR, fill: accentColorHex, color: 'auto' },
              verticalAlign: VerticalAlign.TOP,
              borders: noBorders,
            }),
          ],
        }),
      ],
      width: { size: sidebarWidthTwips, type: WidthType.DXA },
      columnWidths: [sidebarWidthTwips],
      layout: TableLayoutType.FIXED,
      borders: noBorders,
    })
    return [banner, gapParagraph(SPACING.SIDEBAR_SECTION_HEADER_MB)]
  }

  // ============================================================
  // HELPER: Create a main section header paragraph
  // Mimics the MainSectionHeader component: uppercase dark text, 6px of
  // padding, a 2px accent rule, then 12px. Word takes a bottom border's space
  // in whole points only, so the rule sits 4pt below the line and the rest of
  // the 6px + 2px goes into the space after.
  // ============================================================
  const MAIN_HEADER_BORDER_SPACE_PT = 4
  const MAIN_HEADER_BORDER_SIZE = 12 // eighths of a point: 1.5pt = 2px
  const mainHeaderSpacingAfter =
    pxToTwips(SPACING.MAIN_HEADER_PADDING_BOTTOM + SPACING.MAIN_HEADER_RULE + SPACING.MAIN_SECTION_HEADER_MB) -
    MAIN_HEADER_BORDER_SPACE_PT * 20 -
    (MAIN_HEADER_BORDER_SIZE / 8) * 20
  function createMainSectionHeader(title: string): Paragraph {
    return new Paragraph({
      children: [
        new TextRun({
          ...runBase('mainSectionTitle'),
          text: title.toUpperCase(),
          bold: true,
          color: PALETTE.heading,
          characterSpacing: trackingSpacing(TRACKING.sectionHeading, scaledFontSizes.mainSectionTitle),
        }),
      ],
      spacing: {
        after: mainHeaderSpacingAfter,
        ...lineOf('mainSectionTitle'),
      },
      border: {
        bottom: {
          color: accentColorHex,
          space: MAIN_HEADER_BORDER_SPACE_PT,
          style: BorderStyle.SINGLE,
          size: MAIN_HEADER_BORDER_SIZE,
        },
      },
    })
  }

  // ============================================================
  // PHOTO EMBEDDING (Defect 1)
  // Convert base64 photo data to ImageRun for the sidebar.
  // Crop values are calculated here and applied via ZIP post-processing
  // after Packer.toBuffer(), since the docx library has no srcRect API.
  // ============================================================
  let photoImageRun: ImageRun | null = null
  let photoCropValues: { l: number; t: number; r: number; b: number } | null = null

  if (photoBase64) {
    try {
      const imageType = detectImageType(photoBase64)
      if (imageType) {
        const rawBase64 = extractBase64Data(photoBase64)
        const imageBuffer = Buffer.from(rawBase64, 'base64')

        // The zone is the sidebar cell's exact width, not rounded to a whole
        // px: rounded up, the photo ran past the cell. `docx` takes fractional px.
        const zoneWidthPx = sidebarWidthTwips / 15
        const zoneHeightPx = SPACING.PHOTO_ZONE_HEIGHT

        // The Preview draws a JPEG upright per its EXIF orientation; Word
        // draws the stored pixels, so the orientation becomes the picture's
        // transform. Orientation 1 keeps the untransformed path below exactly.
        const orientation = imageType === 'jpg' ? readJpegOrientation(imageBuffer) : EXIF_ORIENTATION_NONE
        const orientationTransform = EXIF_PHOTO_TRANSFORMS[orientation] ?? null
        const swapsAxes = orientationTransform?.swapsAxes === true

        // Parse original dimensions to calculate object-fit: cover crop
        const origDims = parseImageDimensions(imageBuffer, imageType)
        if (origDims) {
          // Cover is computed on the displayed size, as the Preview does.
          const displayed = swapsAxes
            ? { width: origDims.height, height: origDims.width }
            : origDims
          const displayedCrop = calculateCoverCropPercents(
            displayed.width, displayed.height,
            zoneWidthPx, zoneHeightPx
          )
          // srcRect is in the stored image's axes, which a 90° turn swaps.
          // Mapping display l→t, r→b, t→l, b→r holds only because the cover
          // crop is centred (l = r, t = b); an off-centre crop would need the
          // per-orientation mapping (for 90° clockwise, display left is the
          // stored bottom, and so on).
          photoCropValues = swapsAxes
            ? { l: displayedCrop.t, r: displayedCrop.b, t: displayedCrop.l, b: displayedCrop.r }
            : displayedCrop
          // Skip no-op crop (all zeros)
          if (photoCropValues.l === 0 && photoCropValues.t === 0 &&
              photoCropValues.r === 0 && photoCropValues.b === 0) {
            photoCropValues = null
          }
        }

        // A picture turned 90° is laid out unrotated (zone height × zone
        // width) and turned about its centre, so it is offset by half the
        // difference to land its turned box exactly on the zone. EMU, as Word
        // reads wp:posOffset.
        const pictureWidthPx = swapsAxes ? zoneHeightPx : zoneWidthPx
        const pictureHeightPx = swapsAxes ? zoneWidthPx : zoneHeightPx
        const offsetLeftEmu = swapsAxes ? Math.round(((zoneWidthPx - zoneHeightPx) / 2) * EMU_PER_PX) : 0
        const offsetTopEmu = swapsAxes ? Math.round(((zoneHeightPx - zoneWidthPx) / 2) * EMU_PER_PX) : 0

        // "In Front of Text" = floating with wrap NONE and behindDocument false.
        // Transformation uses zone dimensions; srcRect cropping (applied in
        // post-processing) ensures the source is cropped to matching aspect
        // ratio before being stretched to fill, preventing distortion.
        //
        // The anchor is PARAGRAPH-relative with layoutInCell: true, in the
        // sidebar cell's first paragraph, which starts at the cell's top: both
        // cells of the row have a top margin of 0 (below). A -32px offset stood
        // here to undo the main cell's 0.33" top margin, which Word applied to
        // the sidebar cell too.
        photoImageRun = new ImageRun({
          type: imageType,
          data: imageBuffer,
          transformation: {
            width: pictureWidthPx,
            height: pictureHeightPx,
            ...orientationTransform?.picture,
          },
          floating: {
            horizontalPosition: {
              relative: HorizontalPositionRelativeFrom.COLUMN,
              offset: offsetLeftEmu,
            },
            verticalPosition: {
              relative: VerticalPositionRelativeFrom.PARAGRAPH,
              offset: offsetTopEmu,
            },
            wrap: {
              type: TextWrappingType.NONE,
            },
            behindDocument: false,
            layoutInCell: true,
            allowOverlap: false,
          },
        })
      }
    } catch {
      // Photo embedding failed silently -- continue without photo
    }
  }

  // ============================================================
  // BUILD SIDEBAR CONTENT
  // ============================================================
  // Tables as well as paragraphs: a skill's proficiency bar is a table (US-007).
  const sidebarParagraphs: (Paragraph | Table)[] = []

  // The sidebar content starts below the photo zone, which the Preview always
  // draws (a placeholder when there is no photo), plus the content's top
  // padding: the stored sidebarTopMargin when it is positive, p-8 otherwise.
  // With "In Front of Text" wrapping the floating photo does not push text
  // down, so one paragraph carries the whole offset; it is also the photo's
  // anchor. Its 1-twip line is part of the offset.
  const sidebarContentTop =
    pxToTwips(SPACING.PHOTO_ZONE_HEIGHT) +
    pxToTwips(sidebarTopMargin > 0 ? sidebarTopMargin : SPACING.SIDEBAR_PADDING)
  sidebarParagraphs.push(
    new Paragraph({
      children: photoImageRun ? [photoImageRun] : [],
      spacing: { before: 0, after: sidebarContentTop - NO_TEXT_LINE.line, ...NO_TEXT_LINE },
    })
  )

  // Render sidebar sections in order, respecting visibility
  const visibleSidebarSections: readonly ModernSidebarId[] = sidebarOrder.filter(
    sectionId => !hiddenSidebarSections.includes(sectionId)
  )

  visibleSidebarSections.forEach((sectionId, index) => {
    const isLastSection = index === visibleSidebarSections.length - 1
    // Every sidebar section is mb-8 except languages, which sets its own 24px.
    const sectionMarginPx =
      sectionId === 'languages' ? SPACING.LANGUAGES_MARGIN_BOTTOM : SPACING.SECTION_MARGIN_BOTTOM_SIDEBAR
    const sectionSpacingAfter = isLastSection ? 0 : pxToTwips(sectionMarginPx)

    switch (sectionId) {
      // --- CONTACT ---
      case 'contact': {
        const hasContactData = contact.phone || contact.email || contact.website || contact.linkedin || contact.github || contact.location
        // `return`, not `break`, carried over verbatim from the if-chain this
        // switch replaced. It is the only control-flow statement in either
        // dispatch, and nothing follows the switch inside this callback, so the
        // two are equivalent here — left alone rather than "tidied" into a
        // `break`, because rewriting a jump is how a mechanical conversion
        // changes behaviour.
        if (!hasContactData) return

        sidebarParagraphs.push(
          ...createSidebarSectionHeader(
            (dict as any).resumes?.editor?.sections?.contact || 'Contact'
          )
        )

        // Contact items: emoji icon + label (uppercase, dimmed) + value (white)
        const contactEntries: { label: string; value: string; icon: string }[] = []
        if (contact.phone) contactEntries.push({ label: contactLabel(dict, 'phone'), value: contact.phone, icon: '\u{1F4DE}' })
        if (contact.email) contactEntries.push({ label: contactLabel(dict, 'email'), value: contact.email, icon: '\u{2709}\uFE0F' })
        if (contact.website) contactEntries.push({ label: contactLabel(dict, 'website'), value: contact.website, icon: '\u{1F310}' })
        if (contact.linkedin) contactEntries.push({ label: contactLabel(dict, 'linkedin'), value: contact.linkedin, icon: '\u{1F517}' })
        if (contact.github) contactEntries.push({ label: contactLabel(dict, 'github'), value: contact.github, icon: '\u{1F4BB}' })
        if (contact.location) contactEntries.push({ label: contactLabel(dict, 'location'), value: contact.location, icon: '\u{1F4CD}' })

        // One table, as the Preview's ContactItem rows: the label and value
        // right-aligned in the space left of the 32px icon badge, and the two
        // vertically centred against it (`align-items: center`), so an item is
        // at least 32px tall. The 10px between items are rows of their own.
        const iconCellWidth = pxToTwips(SPACING.CONTACT_ICON) + sidebarTextIndent.right
        const textCellWidth = sidebarWidthTwips - iconCellWidth
        const gapRow = () =>
          new TableRow({
            height: { value: pxToTwips(SPACING.CONTACT_ITEM_GAP), rule: HeightRule.EXACT },
            children: [textCellWidth, iconCellWidth].map(
              (width) =>
                new TableCell({
                  children: [new Paragraph({ children: [], spacing: NO_TEXT_LINE })],
                  width: { size: width, type: WidthType.DXA },
                  margins: { top: 0, bottom: 0, left: 0, right: 0 },
                  borders: noBorders,
                })
            ),
          })
        const contactRows: TableRow[] = []
        contactEntries.forEach((entry, i) => {
          if (i > 0) contactRows.push(gapRow())
          contactRows.push(
            new TableRow({
              height: { value: pxToTwips(SPACING.CONTACT_ICON), rule: HeightRule.ATLEAST },
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          ...runBase('contactLabel'),
                          text: entry.label.toUpperCase(),
                          bold: true,
                          color: translucent.contactLabel,
                          characterSpacing: trackingSpacing(TRACKING.contactLabel, scaledFontSizes.contactLabel),
                        }),
                      ],
                      alignment: AlignmentType.RIGHT,
                      spacing: { before: 0, after: 0, ...lineOf('contactLabel') },
                    }),
                    new Paragraph({
                      // `word-break: break-all`: the browser breaks a value that
                      // does not fit anywhere, filling the line, never after a
                      // hyphen it could break at. Word char-wraps a word that is
                      // wider than the line the same way, so hyphens are written
                      // as non-breaking ones to keep the value one word.
                      children: [
                        new TextRun({
                          ...runBase('contactValue'),
                          color: PALETTE.white,
                          children: entry.value
                            .split('-')
                            .flatMap((part, j) => (j === 0 ? [part] : [new NoBreakHyphen(), part])),
                        }),
                      ],
                      alignment: AlignmentType.RIGHT,
                      spacing: { before: 0, after: 0, ...lineOf('contactValue') },
                    }),
                  ],
                  width: { size: textCellWidth, type: WidthType.DXA },
                  margins: {
                    top: 0,
                    bottom: 0,
                    left: sidebarTextIndent.left,
                    right: pxToTwips(SPACING.CONTACT_ICON_GAP),
                  },
                  verticalAlign: VerticalAlign.CENTER,
                  borders: noBorders,
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: entry.icon,
                          size: pxToHalfPoints(16),
                          color: PALETTE.white,
                          font: primaryFont,
                        }),
                      ],
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 0, after: 0, line: pxToTwips(SPACING.CONTACT_ICON), lineRule: LineRuleType.EXACT },
                    }),
                  ],
                  width: { size: iconCellWidth, type: WidthType.DXA },
                  margins: { top: 0, bottom: 0, left: 0, right: sidebarTextIndent.right },
                  verticalAlign: VerticalAlign.CENTER,
                  borders: noBorders,
                }),
              ],
            })
          )
        })
        sidebarParagraphs.push(
          new Table({
            rows: contactRows,
            width: { size: sidebarWidthTwips, type: WidthType.DXA },
            columnWidths: [textCellWidth, iconCellWidth],
            layout: TableLayoutType.FIXED,
            borders: noBorders,
          }),
          gapParagraph(isLastSection ? 0 : sectionMarginPx)
        )
        break
      }

      // --- EDUCATION (sidebar) ---
      case 'education': {
        if (education.length > 0) {
          sidebarParagraphs.push(
            ...createSidebarSectionHeader(
              (dict as any).resumes?.editor?.sections?.education || 'Education'
            )
          )

          education.forEach((edu: any, i: number) => {
            const isLast = i === education.length - 1
            const itemEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.EDUCATION_ITEM_GAP)

            // Degree + Field (bold uppercase white)
            const degreeText = edu.field ? `${edu.degree} - ${edu.field}` : edu.degree || ''
            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    ...runBase('educationDegree'),
                    text: degreeText.toUpperCase(),
                    bold: true,
                    color: PALETTE.white,
                  }),
                ],
                indent: sidebarTextIndent,
                spacing: { after: 0, ...lineOf('educationDegree') },
              })
            )

            // School + Year
            let schoolLine = edu.school || ''
            if (edu.endDate) {
              schoolLine += ` | ${new Date(edu.endDate + '-01').toLocaleDateString(locale as Locale, { year: 'numeric' })}`
            } else if (edu.startDate) {
              schoolLine += ` | ${new Date(edu.startDate + '-01').toLocaleDateString(locale as Locale, { year: 'numeric' })}`
            }

            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    ...runBase('educationSchool'),
                    text: schoolLine,
                    color: translucent.educationSchool,
                  }),
                ],
                indent: sidebarTextIndent,
                spacing: { after: 0, ...lineOf('educationSchool') },
              }),
              gapParagraphTwips(itemEndSpacing)
            )
          })
        }
        break
      }

      // --- SKILLS (sidebar) ---
      case 'skills': {
        if (skills.length > 0) {
          sidebarParagraphs.push(
            ...createSidebarSectionHeader(
              (dict as any).resumes?.editor?.sections?.skills || 'Technical Skills'
            )
          )

          skills.forEach((skillCategory: any, i: number) => {
            const isLast = i === skills.length - 1
            const categoryEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.SKILL_CATEGORY_GAP)

            // Category name (bold uppercase white)
            if (skillCategory.category) {
              sidebarParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      ...runBase('skillCategory'),
                      text: skillCategory.category.toUpperCase(),
                      bold: true,
                      color: PALETTE.white,
                      characterSpacing: trackingSpacing(TRACKING.skillCategory, scaledFontSizes.skillCategory),
                    }),
                  ],
                  indent: sidebarTextIndent,
                  spacing: { after: 0, ...lineOf('skillCategory') },
                }),
                // margin 0 0 8px 0
                gapParagraph(8)
              )
            }

            // A category saved as rich text renders as that text, in an 11px
            // div at the compact height whose `.formatted-content` draws at its
            // own line height.
            if (skillCategory.skillsHtml) {
              if (rendersAsFormattedContent(skillCategory.skillsHtml)) {
                sidebarParagraphs.push(
                  ...formattedParagraphs(skillCategory.skillsHtml, {
                    box: 'skillsFormatted',
                    color: PALETTE.white,
                    alignment: AlignmentType.LEFT,
                    spacingAfter: 0,
                    indent: sidebarTextIndent,
                  })
                )
              } else {
                sidebarParagraphs.push(
                  new Paragraph({
                    children: parseHtmlToDocxRuns(skillCategory.skillsHtml, { ...runBase('skillItem'), color: PALETTE.white }),
                    indent: sidebarTextIndent,
                    spacing: { after: 0, ...lineOf('skillItem') },
                    alignment: AlignmentType.JUSTIFIED,
                  })
                )
              }
              sidebarParagraphs.push(gapParagraphTwips(categoryEndSpacing))
            } else if (skillCategory.items && skillCategory.items.length > 0) {
              // Render each skill item as a separate line (matching Preview layout),
              // each followed by the proficiency bar the Preview draws under it
              // (US-007). A table carries no spacing of its own, so the gap to the
              // next item is a paragraph of its own after the bar — which is also
              // what keeps a bar from being the last child of the sidebar cell,
              // where `docx` would append a default-spaced paragraph to it.
              skillCategory.items.forEach((skill: any, j: number) => {
                const skillName = typeof skill === 'string' ? skill : String(skill)
                const isLastSkill = j === skillCategory.items.length - 1
                const itemSpacing = isLastSkill ? categoryEndSpacing : pxToTwips(SPACING.SKILL_ITEM_GAP)

                sidebarParagraphs.push(
                  new Paragraph({
                    children: [
                      new TextRun({
                        ...runBase('skillItem'),
                        text: skillName,
                        color: PALETTE.white,
                      }),
                    ],
                    indent: sidebarTextIndent,
                    spacing: { after: 0, ...lineOf('skillItem') },
                  }),
                  gapParagraph(SPACING.SKILL_NAME_MB)
                )
                sidebarParagraphs.push(
                  shadedCellBar(
                    proportionalBar(
                      skillBarWidthTwips,
                      MODERN_SKILL_BAR.levelPercent,
                      accentColorHex,
                      skillBarTrackHex,
                    ),
                    graphicHeightTwips(MODERN_SKILL_BAR.heightPx),
                    sidebarTextIndent.left,
                  )
                )
                sidebarParagraphs.push(gapParagraphTwips(itemSpacing))
              })
            }
          })
        }
        break
      }

      // --- LANGUAGES (sidebar) ---
      case 'languages': {
        if (languages.length > 0) {
          sidebarParagraphs.push(
            ...createSidebarSectionHeader(
              (dict as any).resumes?.editor?.sections?.languages || 'Languages'
            )
          )

          // One flex row in the Preview (`align-items: center`): the name and
          // the level each at the compact height, the shorter one centred in
          // the row, which is the taller one's line. One Word line holds both,
          // each run raised to its own box's baseline in it.
          const languageRow = exactLineSpacing(
            [boxes.languageName.lineHeight, boxes.languageName.px * 1.5],
            [boxes.languageLevel.lineHeight, boxes.languageLevel.px * 1.5],
          )
          const centredOffset = (key: BoxKey) => (languageRow.line - lineOf(key).line) / 2 / 15

          languages.forEach((lang: any, i: number) => {
            const isLast = i === languages.length - 1
            const itemEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.LANGUAGE_ITEM_GAP)

            // Language name (left) + level (right-aligned via tab)
            const levelText = (dict as any).resumes?.editor?.levels?.[lang.level?.toLowerCase()] || lang.level
            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    ...runBase('languageName', languageRow.line, centredOffset('languageName')),
                    text: lang.language,
                    bold: true,
                    color: PALETTE.white,
                  }),
                  new TextRun({
                    ...runBase('languageLevel', languageRow.line, centredOffset('languageLevel')),
                    text: '\t' + levelText,
                    color: translucent.languageLevel,
                  }),
                ],
                indent: sidebarTextIndent,
                spacing: { after: 0, ...languageRow },
                // `justify-between`: the level ends on the sidebar's right
                // padding. A tab at TabStopPosition.MAX is not clamped to the
                // cell in Word 2010 layout (below): it would draw in the main column.
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: sidebarWidthTwips - sidebarTextIndent.right,
                  },
                ],
              }),
              gapParagraphTwips(itemEndSpacing)
            )
          })
        }
        break
      }

      // --- TRAINING / CERTIFICATIONS (sidebar) ---
      case 'training': {
        if (certifications.length > 0) {
          sidebarParagraphs.push(
            ...createSidebarSectionHeader(
              (dict as any).resumes?.editor?.sections?.certifications || 'Training'
            )
          )

          certifications.forEach((cert: any, i: number) => {
            const isLast = i === certifications.length - 1
            const itemEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.CERT_ITEM_GAP)

            // Cert name (bold white)
            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    ...runBase('certName'),
                    text: cert.name,
                    bold: true,
                    color: PALETTE.white,
                  }),
                ],
                indent: sidebarTextIndent,
                spacing: { after: 0, ...lineOf('certName') },
              })
            )

            // Issuer
            if (cert.issuer) {
              sidebarParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      ...runBase('certIssuer'),
                      text: cert.issuer,
                      color: translucent.certIssuer,
                    }),
                  ],
                  indent: sidebarTextIndent,
                  spacing: { after: 0, ...lineOf('certIssuer') },
                })
              )
            }

            // Date
            if (cert.date) {
              sidebarParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      ...runBase('certDate'),
                      text: new Date(cert.date + '-01').toLocaleDateString(locale as Locale, {
                        month: 'short',
                        year: 'numeric',
                      }),
                      color: translucent.certDate,
                    }),
                  ],
                  indent: sidebarTextIndent,
                  spacing: { after: 0, ...lineOf('certDate') },
                })
              )
            }
            sidebarParagraphs.push(gapParagraphTwips(itemEndSpacing))
          })
        }
        break
      }

      default:
        assertExhaustiveSection(sectionId)
    }
  })

  // ============================================================
  // BUILD MAIN CONTENT
  // ============================================================
  const mainContentParagraphs: Paragraph[] = []

  // The main column's top padding: the stored mainContentTopMargin when it is
  // positive, p-8 otherwise. The cell's own top margin is 0, like the sidebar
  // cell's: Word does not keep two different cell top margins in one row (it
  // applied the main cell's 0.33" to the sidebar too), so the padding is the
  // name's space before.
  const mainContentTop = pxToTwips(mainContentTopMargin > 0 ? mainContentTopMargin : SPACING.MAIN_PADDING)

  // --- HEADER: Name ---
  mainContentParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          ...runBase('name'),
          text: (contact.name || 'Your Name').toUpperCase(),
          bold: true,
          color: PALETTE['slate-900'],
          characterSpacing: trackingSpacing(TRACKING.name, scaledFontSizes.name),
        }),
      ],
      spacing: {
        before: mainContentTop,
        after: pxToTwips(SPACING.NAME_MB),
        ...lineOf('name'),
      },
    })
  )

  // --- HEADER: Job Title on accent bar ---
  if (resume.title) {
    // The bar is an inline-block: as wide as its text plus 12px of padding
    // each side, as tall as its text line, which inherits preflight's height,
    // plus 4px above and below. The paragraph's line is that box, with the
    // text the top padding below its top; the fill is run shading, so it
    // spans the text and the two padding runs only.
    const titleBarLine = lineOf('jobTitleBar', 2 * MODERN_TITLE_BAR_PADDING_Y_PX)
    const titleBarRun = {
      ...runBase('jobTitleBar', titleBarLine.line, MODERN_TITLE_BAR_PADDING_Y_PX),
      bold: true,
      color: PALETTE.white,
      shading: { type: ShadingType.CLEAR, fill: accentColorHex, color: 'auto' },
    }
    const titleBarPadding = () =>
      new TextRun({
        ...titleBarRun,
        text: ' ',
        characterSpacing: paddingSpacing('jobTitleBar', SPACING.TITLE_BAR_PADDING_X),
      })
    mainContentParagraphs.push(
      new Paragraph({
        children: [
          titleBarPadding(),
          new TextRun({
            ...titleBarRun,
            text: resume.title.toUpperCase(),
            characterSpacing: trackingSpacing(TRACKING.jobTitleBar, scaledFontSizes.jobTitleBar),
          }),
          titleBarPadding(),
        ],
        spacing: {
          after: pxToTwips(SPACING.TITLE_BAR_MB),
          ...titleBarLine,
        },
      })
    )
  }

  // --- HEADER: Location ---
  if (contact.location) {
    mainContentParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            ...runBase('location'),
            text: contact.location,
            color: PALETTE.meta, // #6b7280
          }),
        ],
        // The address line sets no line height, so it inherits preflight's;
        // with no job title above it, it has a 4px top margin.
        spacing: {
          before: resume.title ? 0 : pxToTwips(SPACING.LOCATION_NO_TITLE_MT),
          after: pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_MAIN),
          ...lineOf('location'),
        },
      })
    )
  } else {
    // The header's mb-6 when no address line carries it, after the name or
    // title bar's own space after.
    mainContentParagraphs.push(gapParagraph(SPACING.SECTION_MARGIN_BOTTOM_MAIN, 'after'))
  }

  // Render main content sections in order, respecting visibility
  const visibleMainSections = mainContentOrder.filter(
    sectionId => !hiddenMainSections.includes(sectionId)
  )

  visibleMainSections.forEach((sectionId, index) => {
    const isLastSection = index === visibleMainSections.length - 1 && projects.length === 0

    switch (sectionId) {
      // --- SUMMARY ---
      case 'summary': {
        if (resume.summary) {
          mainContentParagraphs.push(
            createMainSectionHeader(
              (dict as any).resumes?.editor?.sections?.summary || 'Professional Profile'
            )
          )

          const sectionEndSpacing = isLastSection ? 0 : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_MAIN)

          // The summary div's inline `text` height overrides its leading-relaxed class.
          mainContentParagraphs.push(
            ...runningText(resume.summary, { plainBox: 'body', color: PALETTE['slate-700'], spacingAfter: sectionEndSpacing })
          )
        }
        break
      }

      // --- EXPERIENCE (Defect 3: 2-column inner layout) ---
      case 'experience': {
        if (experiences.length > 0) {
          mainContentParagraphs.push(
            createMainSectionHeader(
              (dict as any).resumes?.editor?.sections?.experience || 'Professional Experience'
            )
          )

          // Modern template experience layout:
          // Left 40%: position, dates, company, location
          // Right 60%: description + achievements
          // Rendered as nested tables within the main content area
          experiences.forEach((exp: any, i: number) => {
            const isLastExp = i === experiences.length - 1
            const hasProjectsAfter = projects.length > 0

            // --- Build LEFT column paragraphs (40%) ---
            const leftParagraphs: Paragraph[] = []

            // Position (bold uppercase)
            leftParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    ...runBase('experiencePosition'),
                    text: (exp.position || '').toUpperCase(),
                    bold: true,
                    color: PALETTE.heading,
                  }),
                ],
                spacing: { after: pxToTwips(SPACING.EXPERIENCE_DATE_MT), ...lineOf('experiencePosition') },
              })
            )

            // Date range: years only, as the Preview writes it \u2014 the start
            // year (if any), " - ", then "Present" for a current or open entry,
            // else the end year.
            const yearOf = (date: string) =>
              new Date(date + '-01').toLocaleDateString(locale as Locale, { year: 'numeric' })
            const present = presentLabel(dict)
            const dateText = `${exp.startDate ? yearOf(exp.startDate) : ''} - ${
              exp.current ? present : exp.endDate ? yearOf(exp.endDate) : present
            }`
            leftParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    ...runBase('experienceDate'),
                    text: dateText,
                    color: PALETTE.meta, // #6b7280
                  }),
                ],
                spacing: { after: pxToTwips(SPACING.EXPERIENCE_COMPANY_MT), ...lineOf('experienceDate') },
              })
            )

            // Company (bold)
            if (exp.company) {
              leftParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      ...runBase('experienceCompany'),
                      text: exp.company,
                      bold: true,
                      color: PALETTE.heading,
                    }),
                  ],
                  spacing: {
                    after: exp.location ? pxToTwips(SPACING.EXPERIENCE_LOCATION_MT) : 0,
                    ...lineOf('experienceCompany'),
                  },
                })
              )
            }

            // Location
            if (exp.location) {
              leftParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      ...runBase('experienceLocation'),
                      text: exp.location,
                      color: PALETTE.meta, // #6b7280
                    }),
                  ],
                  spacing: { after: 0, ...lineOf('experienceLocation') },
                })
              )
            }

            // --- Build RIGHT column paragraphs (60%) ---
            const rightParagraphs: Paragraph[] = []
            const hasAchievements = exp.achievements && exp.achievements.length > 0

            // Description: a justified div at the running text's height.
            if (exp.description) {
              rightParagraphs.push(
                ...runningText(exp.description, {
                  plainBox: 'body',
                  color: PALETTE.experienceBody,
                  spacingAfter: hasAchievements ? pxToTwips(SPACING.ACHIEVEMENTS_MT) : 0,
                })
              )
            }

            // Achievements: each li is `flex gap-6px`, italic: the accent "\u2022",
            // then the text, so every line of the text starts \u2014 and wraps \u2014
            // after the bullet's advance plus 6px. Plain text draws through
            // formatText's justified div at the li's height; HTML through
            // `.formatted-content`, left-aligned, at its own height.
            if (hasAchievements) {
              const bulletAdvanceEm = layoutMetrics.bullet
              const achievementHang = pxToTwips(bulletAdvanceEm * boxes.body.px + SPACING.ACHIEVEMENT_BULLET_GAP)
              exp.achievements.forEach((achievement: string, j: number) => {
                const spacingAfter = j === exp.achievements.length - 1 ? 0 : pxToTwips(SPACING.ACHIEVEMENT_GAP)
                // Strip any existing <em>/<i> tags to prevent nested italic
                // toggling, then wrap the whole text in <i>: the li is italic.
                const italic = `<i>${achievement.replace(/<\/?(?:em|i)\b[^>]*>/gi, '')}</i>`
                const isHtml = rendersAsFormattedContent(achievement)
                const textBox: BoxKey = isHtml ? 'formatted' : 'body'
                const bullet = new TextRun({
                  ...runBase('body', lineOf(textBox).line),
                  text: '\u2022\t',
                  color: accentColorHex,
                  italics: true,
                })
                if (isHtml) {
                  rightParagraphs.push(
                    ...formattedParagraphs(italic, {
                      box: 'formatted',
                      color: PALETTE.experienceBody,
                      alignment: AlignmentType.LEFT,
                      spacingAfter,
                      prefix: { runs: [bullet], hangTwips: achievementHang },
                    })
                  )
                } else {
                  rightParagraphs.push(
                    new Paragraph({
                      children: [
                        bullet,
                        ...parseHtmlToDocxRuns(italic, { ...runBase('body'), color: PALETTE.experienceBody }),
                      ],
                      alignment: AlignmentType.JUSTIFIED,
                      indent: { left: achievementHang, hanging: achievementHang },
                      spacing: { after: spacingAfter, ...lineOf('body') },
                    })
                  )
                }
              })
            }

            // Ensure at least one paragraph in right column
            if (rightParagraphs.length === 0) {
              rightParagraphs.push(new Paragraph({ children: [], spacing: NO_TEXT_LINE }))
            }

            // --- Create 2-column nested table for this experience entry ---
            // The entry row spans the main column's text width: its left
            // column is 40% of it, then the row's 16px gap (the left cell's
            // right margin), and the right column takes the rest.
            const innerTableWidth = mainContentTextWidth
            const leftColumnWidth =
              Math.round(innerTableWidth * SPACING.EXPERIENCE_LEFT_SHARE) + pxToTwips(SPACING.EXPERIENCE_COLUMN_GAP)
            const rightColumnWidth = innerTableWidth - leftColumnWidth

            const experienceTable = new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: leftParagraphs,
                      width: { size: leftColumnWidth, type: WidthType.DXA },
                      verticalAlign: VerticalAlign.TOP,
                      margins: {
                        top: 0,
                        bottom: 0,
                        left: 0,
                        right: pxToTwips(SPACING.EXPERIENCE_COLUMN_GAP),
                      },
                      borders: noBorders,
                    }),
                    new TableCell({
                      children: rightParagraphs,
                      width: { size: rightColumnWidth, type: WidthType.DXA },
                      verticalAlign: VerticalAlign.TOP,
                      margins: {
                        top: 0,
                        bottom: 0,
                        left: 0,
                        right: 0,
                      },
                      borders: noBorders,
                    }),
                  ],
                }),
              ],
              width: { size: innerTableWidth, type: WidthType.DXA },
              columnWidths: [leftColumnWidth, rightColumnWidth],
              layout: TableLayoutType.FIXED,
              borders: noBorders,
            })

            // Cast Table to Paragraph[] type; resolved at assembly via mainContentChildren union cast
            mainContentParagraphs.push(experienceTable as unknown as Paragraph)

            // Add spacing after this experience entry
            const expEndSpacingPx = isLastExp
              ? (isLastSection && !hasProjectsAfter ? 0 : SPACING.SECTION_MARGIN_BOTTOM_MAIN)
              : SPACING.EXPERIENCE_ITEM_GAP

            if (expEndSpacingPx > 0) {
              mainContentParagraphs.push(gapParagraph(expEndSpacingPx))
            }
          })
        }
        break
      }

      default:
        assertExhaustiveSection(sectionId)
    }
  })

  // --- PROJECTS (always after main content sections, matching Preview) ---
  if (projects.length > 0) {
    mainContentParagraphs.push(
      createMainSectionHeader(
        (dict as any).resumes?.editor?.sections?.projects || 'Projects'
      )
    )

    // Every project is `relative pl-4`: its text starts 16px in, where the
    // drawn accent dot sits in the Preview; the DOCX hangs a "\u2022" there.
    const projectIndent = { left: pxToTwips(SPACING.PROJECT_INDENT), right: 0 }

    projects.forEach((project: any, i: number) => {
      const isLast = i === projects.length - 1
      const itemEndSpacing = isLast ? 0 : pxToTwips(SPACING.PROJECT_GAP)
      const hasTechnologies = project.technologies && project.technologies.length > 0

      // Project name (bold): the h3 draws at text-lg's line height. The
      // Preview's dot is a drawn circle beside it, not text, so the bullet run
      // adds no line box.
      mainContentParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              ...runBase('body', lineOf('projectName').line),
              text: '\u2022\t',
              color: accentColorHex,
            }),
            new TextRun({
              ...runBase('projectName'),
              text: project.name || '',
              bold: true,
              color: PALETTE['slate-900'],
            }),
          ],
          spacing: {
            after: project.description || hasTechnologies ? pxToTwips(SPACING.PROJECT_DESCRIPTION_MT) : itemEndSpacing,
            ...lineOf('projectName'),
          },
          indent: { ...projectIndent, hanging: projectIndent.left },
        })
      )

      // Project description: a leading-relaxed div (mt-1), or `.formatted-content` for HTML.
      if (project.description) {
        mainContentParagraphs.push(
          ...runningText(project.description, {
            plainBox: 'projectDescription',
            color: PALETTE['slate-700'],
            spacingAfter: hasTechnologies ? pxToTwips(SPACING.PROJECT_TECHNOLOGIES_MT) : itemEndSpacing,
            indent: projectIndent,
          })
        )
      }

      // Technologies: shaded runs per chip (US-007), slate-700 on slate-100.
      if (hasTechnologies) {
        // A chip is text-xs's line plus py-1 above and below; the paragraph's
        // line is that box, with the text the top padding below its top.
        // Horizontally it is px-2 (8px) of shaded padding each side of its
        // text, and chips are gap-2 (8px) apart: a breakable, unshaded space,
        // so chips wrap between each other only, as the flex row does.
        const chipLine = lineOf('technology', 2 * SPACING.TECHNOLOGY_PADDING_Y)
        const chipRun = {
          ...runBase('technology', chipLine.line, SPACING.TECHNOLOGY_PADDING_Y),
          color: PALETTE['slate-700'],
        }
        const chipShading = { type: ShadingType.CLEAR, fill: PALETTE['slate-100'], color: 'auto' }
        const chipPadding = () =>
          new TextRun({
            ...chipRun,
            text: ' ',
            shading: chipShading,
            characterSpacing: paddingSpacing('technology', SPACING.TECHNOLOGY_PADDING_X),
          })
        mainContentParagraphs.push(
          new Paragraph({
            children: project.technologies.flatMap((technology: unknown, t: number) => [
              ...(t === 0
                ? []
                : [new TextRun({ ...chipRun, text: ' ', characterSpacing: paddingSpacing('technology', SPACING.TECHNOLOGY_GAP) })]),
              chipPadding(),
              new TextRun({ ...chipRun, text: String(technology), shading: chipShading }),
              chipPadding(),
            ]),
            spacing: {
              after: itemEndSpacing,
              ...chipLine,
            },
            indent: projectIndent,
          })
        )
      }
    })
  }

  // ============================================================
  // CREATE DOCUMENT WITH TABLE LAYOUT
  // ============================================================

  // Cast mainContentParagraphs to the union type that TableCell accepts
  // This allows Tables (from experience section) alongside Paragraphs
  const mainContentChildren: (Paragraph | Table)[] = mainContentParagraphs as unknown as (Paragraph | Table)[]

  // Sidebar cell — margins set to 0 so the photo fills edge-to-edge.
  // Text content uses paragraph-level indentation instead (applied below).
  const sidebarCell = new TableCell({
    children: sidebarParagraphs.length > 0
      ? sidebarParagraphs
      : [new Paragraph({ children: [], spacing: NO_TEXT_LINE })], // DOCX requires at least one paragraph
    shading: {
      fill: sidebarColorHex,
      color: 'auto',
    },
    margins: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    },
    verticalAlign: VerticalAlign.TOP,
    width: {
      size: sidebarWidthTwips,
      type: WidthType.DXA,
    },
  })

  // Main content cell -- accepts both Paragraph and Table children
  const mainContentCell = new TableCell({
    children: mainContentChildren.length > 0
      ? mainContentChildren
      : [new Paragraph({ children: [], spacing: NO_TEXT_LINE })],
    // p-8 at the sides. The top padding is the name's space before, because
    // both cells of the row must share one top margin (above). There is no
    // bottom margin: Word reserves a cell's bottom margin at the foot of every
    // page the row spans, which ended page 1 32px early (measured), and the
    // Preview's bottom padding only follows the end of the main column.
    margins: {
      top: 0,
      bottom: 0,
      left: mainCellMargin,
      right: mainCellMargin,
    },
    verticalAlign: VerticalAlign.TOP,
    width: {
      size: mainContentWidthTwips,
      type: WidthType.DXA,
    },
  })

  // Page height: exact A4 in twips, not the two-decimal inches, which moved a
  // sidebar line ending within 0.3px of the PDF's page bottom to the next page
  // (measured; see PAGE_HEIGHT_TWIPS).
  const pageHeightTwips = PAGE_HEIGHT_TWIPS

  // The sidebar's fill on every page, top to foot. The cell's fill ends where
  // the row's part on that page ends — at the last line Word set there, not
  // at the page's foot (measured: page 1 of A filled to 1105px of 1123), and
  // after the row it stops altogether. So the fill is also a drawing in the
  // header, which repeats on every page: the sidebar's width, the page's
  // height, behind the text, where Word draws it under the cell's own fill.
  const sidebarFillHeader = new Header({
    children: [
      new Paragraph({
        children: [
          new ImageRun({
            type: 'png',
            data: solidColourPng(sidebarColorHex),
            transformation: { width: sidebarWidthTwips / 15, height: pageHeightTwips / 15 },
            floating: {
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
              wrap: { type: TextWrappingType.NONE },
              behindDocument: true,
              allowOverlap: true,
            },
          }),
        ],
        spacing: NO_TEXT_LINE,
      }),
    ],
  })

  // Row minimum height = full page minus trailing paragraph buffer.
  // AT_LEAST allows the row to grow when content exceeds one page.
  const trailingParagraphBuffer = 500
  const rowHeightTwips = pageHeightTwips - trailingParagraphBuffer

  const mainTable = new Table({
    rows: [
      new TableRow({
        children: [sidebarCell, mainContentCell],
        cantSplit: false,
        height: {
          value: rowHeightTwips,
          rule: HeightRule.ATLEAST,
        },
      }),
    ],
    width: {
      size: pageWidthTwips,
      type: WidthType.DXA,
    },
    columnWidths: [sidebarWidthTwips, mainContentWidthTwips],
    layout: TableLayoutType.FIXED,
    // Explicit table-level cell margins at 0 to prevent Word from applying
    // its default (~0.08") which contributes to the gap above the photo.
    // The Table constructor maps `margins` to `<w:tblCellMar>` in OOXML.
    margins: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
  })

  // Create document
  const doc = new Document({
    // Word 2013+ layout (compatibility mode 15) shrinks the spaces of a
    // justified line to fit one more word, which the browser never does, so
    // justified text broke one word later than the Preview (measured on the
    // Professional DOCX). Word 2010 layout only stretches them.
    compatibility: { version: 14 },
    styles: {
      default: {
        document: {
          run: {
            font: primaryFont,
            size: scaledFontSizes.body,
          },
          // Every paragraph writes its own line spacing; the default is running
          // text's, at the default run size, so nothing falls back to Word auto.
          paragraph: {
            spacing: {
              before: 0,
              after: 0,
              ...exactLineSpacing([LINE_HEIGHT.text, scaledFontSizes.body]),
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(PAGE_WIDTH_INCHES),
              height: pageHeightTwips,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              header: 0,
              footer: 0,
            },
          },
          // Set linePitch to minimum (1 twip) to prevent Word from snapping
          // the first line in a cell to a grid line at 360 twips from the top.
          // Default linePitch of 360 causes Word to add ~18pt of implicit
          // space before the first paragraph in each cell.
          grid: {
            linePitch: 1,
            type: DocumentGridType.DEFAULT,
          },
        },
        headers: { default: sidebarFillHeader },
        children: [
          mainTable,
          // Trailing paragraph required by OOXML after table
          new Paragraph({
            spacing: {
              before: 0,
              after: 0,
              line: 1,
              lineRule: LineRuleType.EXACT,
            },
            children: [],
          }),
        ],
      },
    ],
  })

  // Generate buffer
  let buffer = await Packer.toBuffer(doc)

  // Post-process: apply OOXML srcRect cropping for object-fit: cover on photo.
  // The docx library always emits an empty <a:srcRect/> inside <pic:blipFill>.
  // We replace the first occurrence with computed crop values via ZIP manipulation.
  if (photoCropValues) {
    try {
      const zip = await JSZip.loadAsync(buffer)
      const docXmlFile = zip.file('word/document.xml')
      if (docXmlFile) {
        let xml = await docXmlFile.async('string')
        const srcRectTag = `<a:srcRect l="${photoCropValues.l}" t="${photoCropValues.t}" r="${photoCropValues.r}" b="${photoCropValues.b}"/>`
        // The docx library may serialize as self-closing or open/close tag
        if (xml.includes('<a:srcRect/>')) {
          xml = xml.replace('<a:srcRect/>', srcRectTag)
        } else if (xml.includes('<a:srcRect></a:srcRect>')) {
          xml = xml.replace('<a:srcRect></a:srcRect>', srcRectTag)
        }
        zip.file('word/document.xml', xml)
        buffer = await zip.generateAsync({ type: 'nodebuffer' }) as Buffer
      }
    } catch {
      // srcRect post-processing failed — return uncropped DOCX
    }
  }

  return buffer as Buffer
}
