import { getTranslations, type Locale } from '@/lib/i18n'
import {
  Document,
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
  TabStopPosition,
  HeightRule,
  LineRuleType,
  TableLayoutType,
  PageOrientation,
  ShadingType,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
  DocumentGridType,
} from 'docx'
import JSZip from 'jszip'
import {
  pxToHalfPoints,
  pxToTwips,
  hslToHex,
  extractPrimaryFont,
  extractAlignment,
  isHtmlList,
  parseHtmlListToParagraphs,
  isPlainTextList,
  parsePlainTextListToParagraphs,
  parseHtmlToDocxRuns,
  formatDateRange,
  exactLineSpacing,
  trackingSpacing,
  NO_TEXT_LINE,
  type DocxGeneratorSettings,
} from './docx-helpers'
import { DOCX_PALETTE } from './docx-palette'
import { docxTranslucentText } from './docx-text-opacity'
import { PREVIEW_TRACKING } from '@/lib/resume-letter-spacing'
import {
  MODERN_LINE_HEIGHT,
  MODERN_TITLE_BAR_PADDING_Y_PX,
  PREFLIGHT_LINE_HEIGHT,
  TAILWIND_LEADING,
  TAILWIND_TEXT_LINE_HEIGHT,
  formattedTextLineHeight,
} from '@/lib/resume-line-height'
import {
  assertExhaustiveSection,
  DEFAULT_MODERN_MAIN_ORDER,
  mapEditorOrderToModern,
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
const FONT_SIZES = {
  NAME: 36,                     // h1 titleFontSize default
  JOB_TITLE_BAR: 16,           // Job title on accent bar
  LOCATION: 11,                 // Address line below title
  MAIN_SECTION_TITLE: 16,      // MainSectionHeader h2
  SIDEBAR_SECTION_TITLE: 13,   // SidebarSectionHeader h2
  EXPERIENCE_POSITION: 13,     // exp.position bold uppercase
  EXPERIENCE_DATE: 12,         // exp date text
  EXPERIENCE_COMPANY: 12,      // exp.company bold
  EXPERIENCE_LOCATION: 11,     // exp.location
  BODY: 14,                    // sectionDescFontSize default
  SUMMARY: 14,                 // Summary text (sectionDescFontSize)
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
  SECTION_MARGIN_BOTTOM_MAIN: 24,     // mb-6 on main sections
  SIDEBAR_SECTION_HEADER_MB: 12,      // marginBottom on SidebarSectionHeader
  MAIN_SECTION_HEADER_MB: 12,         // marginBottom on MainSectionHeader
  CONTACT_ITEM_GAP: 10,              // gap between contact items
  EDUCATION_ITEM_GAP: 12,            // gap between education entries
  SKILL_CATEGORY_GAP: 16,            // gap between skill categories
  SKILL_ITEM_GAP: 8,                 // gap between skill items
  LANGUAGE_ITEM_GAP: 8,              // gap between language items
  CERT_ITEM_GAP: 12,                 // gap between certifications
  EXPERIENCE_ITEM_GAP: 16,           // gap between experience entries
  NAME_MB: 8,                        // marginBottom on name
  TITLE_BAR_MB: 8,                   // marginBottom on title bar
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
   * member to the mapping because Modern renders education in the sidebar. The
   * branch is reachable, so it stays, and the value it falls back to is
   * `DEFAULT_MODERN_MAIN_ORDER` — the same shared default the Preview uses.
   *
   * The CONDITION is NOT reconciled with the Preview, and that is a known
   * divergence rather than an oversight. `modern-template.tsx` falls back with
   * `mainContentOrder || DEFAULT_MODERN_MAIN_ORDER`, which an empty array does
   * not trigger — so for that same stored value the Preview renders an empty
   * main column while this generator renders summary and experience. Making
   * them agree changes rendered output, which Part 2 forbids; it is recorded as
   * a finding for the parity work.
   */
  const mainContentOrder: readonly ModernMainId[] =
    modernMainOrder.length > 0 ? modernMainOrder : DEFAULT_MODERN_MAIN_ORDER

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

  // Calculate scaled font sizes
  const scaledFontSizes = {
    name: pxToHalfPoints(FONT_SIZES.NAME * fontScale),
    jobTitleBar: pxToHalfPoints(FONT_SIZES.JOB_TITLE_BAR * fontScale),
    location: pxToHalfPoints(FONT_SIZES.LOCATION * fontScale),
    mainSectionTitle: pxToHalfPoints(FONT_SIZES.MAIN_SECTION_TITLE * fontScale),
    sidebarSectionTitle: pxToHalfPoints(FONT_SIZES.SIDEBAR_SECTION_TITLE * fontScale),
    experiencePosition: pxToHalfPoints(FONT_SIZES.EXPERIENCE_POSITION * fontScale),
    experienceDate: pxToHalfPoints(FONT_SIZES.EXPERIENCE_DATE * fontScale),
    experienceCompany: pxToHalfPoints(FONT_SIZES.EXPERIENCE_COMPANY * fontScale),
    experienceLocation: pxToHalfPoints(FONT_SIZES.EXPERIENCE_LOCATION * fontScale),
    body: pxToHalfPoints(FONT_SIZES.BODY * fontScale),
    summary: pxToHalfPoints(FONT_SIZES.SUMMARY * fontScale),
    contactLabel: pxToHalfPoints(FONT_SIZES.CONTACT_LABEL * fontScale),
    contactValue: pxToHalfPoints(FONT_SIZES.CONTACT_VALUE * fontScale),
    educationDegree: pxToHalfPoints(FONT_SIZES.EDUCATION_DEGREE * fontScale),
    educationSchool: pxToHalfPoints(FONT_SIZES.EDUCATION_SCHOOL * fontScale),
    skillCategory: pxToHalfPoints(FONT_SIZES.SKILL_CATEGORY * fontScale),
    skillItem: pxToHalfPoints(FONT_SIZES.SKILL_ITEM * fontScale),
    languageName: pxToHalfPoints(FONT_SIZES.LANGUAGE_NAME * fontScale),
    languageLevel: pxToHalfPoints(FONT_SIZES.LANGUAGE_LEVEL * fontScale),
    certName: pxToHalfPoints(FONT_SIZES.CERT_NAME * fontScale),
    certIssuer: pxToHalfPoints(FONT_SIZES.CERT_ISSUER * fontScale),
    certDate: pxToHalfPoints(FONT_SIZES.CERT_DATE * fontScale),
  }

  // Extract primary font name from font family stack
  const primaryFont = extractPrimaryFont(fontFamily)

  // Calculate page dimensions for layout
  const pageWidthTwips = convertInchesToTwip(8.5)
  const sidebarWidthTwips = Math.round(pageWidthTwips * (sidebarWidthPercent / 100))
  const mainContentWidthTwips = pageWidthTwips - sidebarWidthTwips

  // Right indent for main content to prevent text touching the edge
  const mainContentRightIndent = convertInchesToTwip(0.15)

  // Sidebar text indentation — replaces cell margins (which are 0 for edge-to-edge photo).
  // All non-photo sidebar paragraphs use this left/right indent.
  const sidebarTextIndent = {
    left: convertInchesToTwip(0.33),
    right: convertInchesToTwip(0.33),
  }

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
  // HELPER: Create a sidebar section header paragraph
  // Mimics the SidebarSectionHeader component: accent-colored background,
  // white uppercase text, full-width banner
  // ============================================================
  function createSidebarSectionHeader(title: string): Paragraph {
    return new Paragraph({
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: scaledFontSizes.sidebarSectionTitle,
          color: PALETTE.white,
          font: primaryFont,
          characterSpacing: trackingSpacing(TRACKING.sectionHeading, scaledFontSizes.sidebarSectionTitle),
        }),
      ],
      indent: sidebarTextIndent,
      spacing: {
        after: pxToTwips(SPACING.SIDEBAR_SECTION_HEADER_MB),
        ...exactLineSpacing([LINE_HEIGHT.compact, scaledFontSizes.sidebarSectionTitle]),
      },
      shading: {
        type: ShadingType.SOLID,
        fill: accentColorHex,
        color: accentColorHex,
      },
    })
  }

  // ============================================================
  // HELPER: Create a main section header paragraph
  // Mimics the MainSectionHeader component: uppercase dark text
  // with accent-colored bottom border
  // ============================================================
  function createMainSectionHeader(title: string): Paragraph {
    return new Paragraph({
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: scaledFontSizes.mainSectionTitle,
          color: PALETTE.heading,
          font: primaryFont,
          characterSpacing: trackingSpacing(TRACKING.sectionHeading, scaledFontSizes.mainSectionTitle),
        }),
      ],
      spacing: {
        after: pxToTwips(SPACING.MAIN_SECTION_HEADER_MB),
        ...exactLineSpacing([LINE_HEIGHT.compact, scaledFontSizes.mainSectionTitle]),
      },
      border: {
        bottom: {
          color: accentColorHex,
          space: 1,
          style: BorderStyle.SINGLE,
          size: 6, // 2px line
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

        const sidebarInches = (sidebarWidthPercent / 100) * 8.5
        const zoneWidthPx = Math.round(sidebarInches * 96)
        const zoneHeightPx = 220

        // Parse original dimensions to calculate object-fit: cover crop
        const origDims = parseImageDimensions(imageBuffer, imageType)
        if (origDims) {
          photoCropValues = calculateCoverCropPercents(
            origDims.width, origDims.height,
            zoneWidthPx, zoneHeightPx
          )
          // Skip no-op crop (all zeros)
          if (photoCropValues.l === 0 && photoCropValues.t === 0 &&
              photoCropValues.r === 0 && photoCropValues.b === 0) {
            photoCropValues = null
          }
        }

        // "In Front of Text" = floating with wrap NONE and behindDocument false.
        // Transformation uses zone dimensions; srcRect cropping (applied in
        // post-processing) ensures the source is cropped to matching aspect
        // ratio before being stretched to fill, preventing distortion.
        //
        // Word adds internal rendering spacing inside table cells that cannot
        // be eliminated via cell margins or paragraph spacing alone. We use a
        // negative vertical offset (~32px = 304800 EMU) to push the image UP
        // to compensate for this gap. The anchor is PARAGRAPH-relative with
        // layoutInCell: true so Word positions relative to the cell content
        // then the negative offset pulls the photo flush to the cell top.
        const photoNegativeOffsetEmu = -304800 // -32px in EMU (32 * 9525)
        photoImageRun = new ImageRun({
          type: imageType,
          data: imageBuffer,
          transformation: {
            width: zoneWidthPx,
            height: zoneHeightPx,
          },
          floating: {
            horizontalPosition: {
              relative: HorizontalPositionRelativeFrom.COLUMN,
              offset: 0,
            },
            verticalPosition: {
              relative: VerticalPositionRelativeFrom.PARAGRAPH,
              offset: photoNegativeOffsetEmu,
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
  const sidebarParagraphs: Paragraph[] = []

  // Photo anchor paragraph — placed inside the sidebar cell so it does not
  // create an extra page before the table. The floating image uses
  // layoutInCell: true with PARAGRAPH-relative vertical positioning and a
  // negative offset to compensate for Word's internal cell rendering gap.
  // line: 1 (EXACT) makes the anchor take near-zero vertical space.
  if (photoImageRun) {
    sidebarParagraphs.push(
      new Paragraph({
        children: [photoImageRun],
        spacing: { before: 0, after: 0, line: 1, lineRule: LineRuleType.EXACT },
      })
    )
  }

  // Cell margins are 0, so recreate vertical padding via paragraph spacing.
  // With "In Front of Text" wrapping, the floating photo does NOT push text down,
  // so we must manually offset sidebar text below the 220px photo zone + 32px gap.
  // The anchor paragraph is now outside the table, so the full offset applies here.
  // When no photo: use the original 0.25" top padding.
  const topPaddingBeforeText = convertInchesToTwip(0.25)
  const photoZoneOffset = photoImageRun
    ? pxToTwips(220) + pxToTwips(32)  // 3780 twips = 252px (220px photo + 32px gap)
    : topPaddingBeforeText

  if (sidebarTopMargin > 0) {
    sidebarParagraphs.push(
      new Paragraph({
        spacing: {
          before: photoZoneOffset,
          after: pxToTwips(sidebarTopMargin),
          ...NO_TEXT_LINE,
        },
        indent: sidebarTextIndent,
        children: [],
      })
    )
  } else {
    // Always add the top padding spacer paragraph before first text content
    sidebarParagraphs.push(
      new Paragraph({
        spacing: { before: photoZoneOffset, after: 0, ...NO_TEXT_LINE },
        indent: sidebarTextIndent,
        children: [],
      })
    )
  }

  // Render sidebar sections in order, respecting visibility
  const visibleSidebarSections: readonly ModernSidebarId[] = sidebarOrder.filter(
    sectionId => !hiddenSidebarSections.includes(sectionId)
  )

  visibleSidebarSections.forEach((sectionId, index) => {
    const isLastSection = index === visibleSidebarSections.length - 1
    const sectionSpacingAfter = isLastSection ? 0 : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_SIDEBAR)

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
          createSidebarSectionHeader(
            (dict as any).resumes?.editor?.sections?.contact || 'Contact'
          )
        )

        // Contact items: emoji icon + label (uppercase, dimmed) + value (white) per line
        const contactEntries: { label: string; value: string; icon: string }[] = []
        if (contact.phone) contactEntries.push({ label: 'Phone', value: contact.phone, icon: '\u{1F4DE}' })
        if (contact.email) contactEntries.push({ label: 'Email', value: contact.email, icon: '\u{2709}\uFE0F' })
        if (contact.website) contactEntries.push({ label: 'Website', value: contact.website, icon: '\u{1F310}' })
        if (contact.linkedin) contactEntries.push({ label: 'LinkedIn', value: contact.linkedin, icon: '\u{1F517}' })
        if (contact.github) contactEntries.push({ label: 'GitHub', value: contact.github, icon: '\u{1F4BB}' })
        if (contact.location) contactEntries.push({ label: 'Location', value: contact.location, icon: '\u{1F4CD}' })

        contactEntries.forEach((entry, i) => {
          const isLast = i === contactEntries.length - 1

          // Label line (uppercase, dimmed white)
          sidebarParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: entry.label.toUpperCase(),
                  bold: true,
                  size: scaledFontSizes.contactLabel,
                  color: translucent.contactLabel,
                  font: primaryFont,
                  characterSpacing: trackingSpacing(TRACKING.contactLabel, scaledFontSizes.contactLabel),
                }),
              ],
              indent: sidebarTextIndent,
              spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.compact, scaledFontSizes.contactLabel]) },
            })
          )

          // Value line (with emoji icon prefix)
          const itemEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.CONTACT_ITEM_GAP)
          sidebarParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${entry.icon} `,
                  size: scaledFontSizes.contactValue,
                  color: PALETTE.white,
                  font: primaryFont,
                }),
                new TextRun({
                  text: entry.value,
                  size: scaledFontSizes.contactValue,
                  color: PALETTE.white,
                  font: primaryFont,
                }),
              ],
              indent: sidebarTextIndent,
              spacing: { after: itemEndSpacing, ...exactLineSpacing([LINE_HEIGHT.compact, scaledFontSizes.contactValue]) },
            })
          )
        })
        break
      }

      // --- EDUCATION (sidebar) ---
      case 'education': {
        if (education.length > 0) {
          sidebarParagraphs.push(
            createSidebarSectionHeader(
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
                    text: degreeText.toUpperCase(),
                    bold: true,
                    size: scaledFontSizes.educationDegree,
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                ],
                indent: sidebarTextIndent,
                spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.compact, scaledFontSizes.educationDegree]) },
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
                    text: schoolLine,
                    size: scaledFontSizes.educationSchool,
                    color: translucent.educationSchool,
                    font: primaryFont,
                  }),
                ],
                indent: sidebarTextIndent,
                spacing: { after: itemEndSpacing, ...exactLineSpacing([LINE_HEIGHT.text, scaledFontSizes.educationSchool]) },
              })
            )
          })
        }
        break
      }

      // --- SKILLS (sidebar) ---
      case 'skills': {
        if (skills.length > 0) {
          sidebarParagraphs.push(
            createSidebarSectionHeader(
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
                      text: skillCategory.category.toUpperCase(),
                      bold: true,
                      size: scaledFontSizes.skillCategory,
                      color: PALETTE.white,
                      font: primaryFont,
                      characterSpacing: trackingSpacing(TRACKING.skillCategory, scaledFontSizes.skillCategory),
                    }),
                  ],
                  indent: sidebarTextIndent,
                  // margin 0 0 8px 0
                  spacing: { after: pxToTwips(8), ...exactLineSpacing([LINE_HEIGHT.compact, scaledFontSizes.skillCategory]) },
                })
              )
            }

            // Every skill line takes the Preview skill item's line height.
            const skillLineSpacing = exactLineSpacing([LINE_HEIGHT.compact, scaledFontSizes.skillItem])

            // Skill items as text list (progress bars cannot render in DOCX)
            // Use skillsHtml if available, otherwise fall back to items array.
            // The Preview renders `items` only, never `skillsHtml`; that content
            // divergence is Part 3 US-016's. Until then these paragraphs take the
            // line height of the element they stand in for, the skill item.
            if (skillCategory.skillsHtml) {
              const skillsAlignment = extractAlignment(skillCategory.skillsHtml) || AlignmentType.LEFT

              if (isHtmlList(skillCategory.skillsHtml)) {
                const listParagraphs = parseHtmlListToParagraphs(
                  skillCategory.skillsHtml,
                  {
                    size: scaledFontSizes.skillItem,
                    color: PALETTE.white,
                    font: primaryFont,
                  },
                  pxToTwips(4),
                  categoryEndSpacing,
                  skillLineSpacing,
                  sidebarTextIndent,
                  skillsAlignment
                )
                sidebarParagraphs.push(...listParagraphs)
              } else {
                const skillsRuns = parseHtmlToDocxRuns(skillCategory.skillsHtml, {
                  size: scaledFontSizes.skillItem,
                  color: PALETTE.white,
                  font: primaryFont,
                })

                sidebarParagraphs.push(
                  new Paragraph({
                    children: skillsRuns,
                    indent: sidebarTextIndent,
                    spacing: { after: categoryEndSpacing, ...skillLineSpacing },
                    alignment: skillsAlignment,
                  })
                )
              }
            } else if (skillCategory.items && skillCategory.items.length > 0) {
              // Render each skill item as a separate line (matching Preview layout)
              skillCategory.items.forEach((skill: any, j: number) => {
                const skillName = typeof skill === 'string' ? skill : String(skill)
                const isLastSkill = j === skillCategory.items.length - 1
                const itemSpacing = isLastSkill ? categoryEndSpacing : pxToTwips(SPACING.SKILL_ITEM_GAP)

                sidebarParagraphs.push(
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: skillName,
                        size: scaledFontSizes.skillItem,
                        color: PALETTE.white,
                        font: primaryFont,
                      }),
                    ],
                    indent: sidebarTextIndent,
                    spacing: { after: itemSpacing, ...skillLineSpacing },
                  })
                )
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
            createSidebarSectionHeader(
              (dict as any).resumes?.editor?.sections?.languages || 'Languages'
            )
          )

          languages.forEach((lang: any, i: number) => {
            const isLast = i === languages.length - 1
            const itemEndSpacing = isLast ? sectionSpacingAfter : pxToTwips(SPACING.LANGUAGE_ITEM_GAP)

            // Language name (left) + level (right-aligned via tab)
            const levelText = (dict as any).resumes?.editor?.levels?.[lang.level?.toLowerCase()] || lang.level
            sidebarParagraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: lang.language,
                    bold: true,
                    size: scaledFontSizes.languageName,
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                  new TextRun({
                    text: '\t' + levelText,
                    size: scaledFontSizes.languageLevel,
                    color: translucent.languageLevel,
                    font: primaryFont,
                  }),
                ],
                indent: sidebarTextIndent,
                // One flex row in the Preview: the name and the level, each at the compact height.
                spacing: {
                  after: itemEndSpacing,
                  ...exactLineSpacing(
                    [LINE_HEIGHT.compact, scaledFontSizes.languageName],
                    [LINE_HEIGHT.compact, scaledFontSizes.languageLevel],
                  ),
                },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: TabStopPosition.MAX,
                  },
                ],
              })
            )
          })
        }
        break
      }

      // --- TRAINING / CERTIFICATIONS (sidebar) ---
      case 'training': {
        if (certifications.length > 0) {
          sidebarParagraphs.push(
            createSidebarSectionHeader(
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
                    text: cert.name,
                    bold: true,
                    size: scaledFontSizes.certName,
                    color: PALETTE.white,
                    font: primaryFont,
                  }),
                ],
                indent: sidebarTextIndent,
                spacing: {
                  after: cert.issuer || cert.date ? 0 : itemEndSpacing,
                  ...exactLineSpacing([LINE_HEIGHT.compact, scaledFontSizes.certName]),
                },
              })
            )

            // Issuer
            if (cert.issuer) {
              sidebarParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cert.issuer,
                      size: scaledFontSizes.certIssuer,
                      color: translucent.certIssuer,
                      font: primaryFont,
                    }),
                  ],
                  indent: sidebarTextIndent,
                  spacing: {
                    after: cert.date ? 0 : itemEndSpacing,
                    ...exactLineSpacing([LINE_HEIGHT.text, scaledFontSizes.certIssuer]),
                  },
                })
              )
            }

            // Date
            if (cert.date) {
              sidebarParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: new Date(cert.date + '-01').toLocaleDateString(locale as Locale, {
                        month: 'short',
                        year: 'numeric',
                      }),
                      size: scaledFontSizes.certDate,
                      color: translucent.certDate,
                      font: primaryFont,
                    }),
                  ],
                  indent: sidebarTextIndent,
                  spacing: { after: itemEndSpacing, ...exactLineSpacing([LINE_HEIGHT.text, scaledFontSizes.certDate]) },
                })
              )
            }
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

  // Apply main content top margin as initial spacing
  const initialMainSpacing = mainContentTopMargin > 0 ? pxToTwips(mainContentTopMargin) : 0

  // --- HEADER: Name ---
  mainContentParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: (contact.name || 'Your Name').toUpperCase(),
          bold: true,
          size: scaledFontSizes.name,
          color: PALETTE['slate-900'],
          font: primaryFont,
          characterSpacing: trackingSpacing(TRACKING.name, scaledFontSizes.name),
        }),
      ],
      spacing: {
        before: initialMainSpacing,
        after: pxToTwips(SPACING.NAME_MB),
        ...exactLineSpacing([LINE_HEIGHT.title, scaledFontSizes.name]),
      },
    })
  )

  // --- HEADER: Job Title on accent bar ---
  if (resume.title) {
    mainContentParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: resume.title.toUpperCase(),
            bold: true,
            size: scaledFontSizes.jobTitleBar,
            color: PALETTE.white,
            font: primaryFont,
            characterSpacing: trackingSpacing(TRACKING.jobTitleBar, scaledFontSizes.jobTitleBar),
          }),
        ],
        // The paragraph stands for the accent bar's box: its text line, which
        // inherits preflight's height, plus the bar's padding above and below, so
        // the shading covers what the Preview fills.
        spacing: {
          after: pxToTwips(SPACING.TITLE_BAR_MB),
          ...exactLineSpacing({
            lineHeight: PREFLIGHT_LINE_HEIGHT,
            halfPoints: scaledFontSizes.jobTitleBar,
            paddingPx: 2 * MODERN_TITLE_BAR_PADDING_Y_PX,
          }),
        },
        shading: {
          type: ShadingType.SOLID,
          fill: accentColorHex,
          color: accentColorHex,
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
            text: contact.location,
            size: scaledFontSizes.location,
            color: PALETTE.meta, // #6b7280
            font: primaryFont,
          }),
        ],
        // The address line sets no line height, so it inherits preflight's.
        spacing: {
          after: pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_MAIN),
          ...exactLineSpacing([PREFLIGHT_LINE_HEIGHT, scaledFontSizes.location]),
        },
      })
    )
  } else {
    // Gap after title bar if no location
    mainContentParagraphs.push(
      new Paragraph({
        spacing: { after: pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_MAIN), ...NO_TEXT_LINE },
        children: [],
      })
    )
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

          const summaryAlignment = extractAlignment(resume.summary) || AlignmentType.LEFT
          // The summary div's inline `text` height overrides its leading-relaxed class.
          const summaryLineSpacing = exactLineSpacing([
            formattedTextLineHeight(resume.summary, LINE_HEIGHT.text),
            scaledFontSizes.summary,
          ])

          if (isHtmlList(resume.summary)) {
            const listParagraphs = parseHtmlListToParagraphs(
              resume.summary,
              {
                size: scaledFontSizes.summary,
                color: PALETTE['slate-700'],
                font: primaryFont,
              },
              pxToTwips(4),
              sectionEndSpacing,
              summaryLineSpacing,
              { right: mainContentRightIndent },
              summaryAlignment
            )
            mainContentParagraphs.push(...listParagraphs)
          } else if (isPlainTextList(resume.summary)) {
            mainContentParagraphs.push(
              ...parsePlainTextListToParagraphs(
                resume.summary,
                {
                  size: scaledFontSizes.summary,
                  color: PALETTE['slate-700'],
                  font: primaryFont,
                },
                {
                  spacingAfterItem: pxToTwips(4),
                  spacingAfterLast: sectionEndSpacing,
                  indent: { right: mainContentRightIndent },
                  alignment: summaryAlignment,
                  lineSpacing: summaryLineSpacing,
                }
              )
            )
          } else {
            const summaryRuns = parseHtmlToDocxRuns(resume.summary, {
              size: scaledFontSizes.summary,
              color: PALETTE['slate-700'],
              font: primaryFont,
            })

            mainContentParagraphs.push(
              new Paragraph({
                children: summaryRuns,
                alignment: summaryAlignment,
                indent: { right: mainContentRightIndent },
                spacing: {
                  after: sectionEndSpacing,
                  ...summaryLineSpacing,
                },
              })
            )
          }
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
                    text: (exp.position || '').toUpperCase(),
                    bold: true,
                    size: scaledFontSizes.experiencePosition,
                    color: PALETTE.heading,
                    font: primaryFont,
                  }),
                ],
                spacing: { after: pxToTwips(2), ...exactLineSpacing([LINE_HEIGHT.compact, scaledFontSizes.experiencePosition]) },
              })
            )

            // Date range
            const dateText = formatDateRange(exp.startDate, exp.endDate, exp.current, locale as Locale, dict)
            if (dateText) {
              leftParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: dateText,
                      size: scaledFontSizes.experienceDate,
                      color: PALETTE.meta, // #6b7280
                      font: primaryFont,
                    }),
                  ],
                  spacing: { after: pxToTwips(8), ...exactLineSpacing([LINE_HEIGHT.compact, scaledFontSizes.experienceDate]) },
                })
              )
            }

            // Company (bold)
            if (exp.company) {
              leftParagraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: exp.company,
                      bold: true,
                      size: scaledFontSizes.experienceCompany,
                      color: PALETTE.heading,
                      font: primaryFont,
                    }),
                  ],
                  spacing: {
                    after: exp.location ? pxToTwips(2) : 0,
                    ...exactLineSpacing([LINE_HEIGHT.compact, scaledFontSizes.experienceCompany]),
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
                      text: exp.location,
                      size: scaledFontSizes.experienceLocation,
                      color: PALETTE.meta, // #6b7280
                      font: primaryFont,
                    }),
                  ],
                  spacing: { after: 0, ...exactLineSpacing([LINE_HEIGHT.compact, scaledFontSizes.experienceLocation]) },
                })
              )
            }

            // Ensure at least one paragraph in left column
            if (leftParagraphs.length === 0) {
              leftParagraphs.push(new Paragraph({ children: [], spacing: NO_TEXT_LINE }))
            }

            // --- Build RIGHT column paragraphs (60%) ---
            const rightParagraphs: Paragraph[] = []

            // Description
            if (exp.description) {
              const descAlignment = extractAlignment(exp.description) || AlignmentType.LEFT
              const descLineSpacing = exactLineSpacing([
                formattedTextLineHeight(exp.description, LINE_HEIGHT.text),
                scaledFontSizes.body,
              ])

              if (isHtmlList(exp.description)) {
                const listParagraphs = parseHtmlListToParagraphs(
                  exp.description,
                  {
                    size: scaledFontSizes.body,
                    color: PALETTE.experienceBody,
                    font: primaryFont,
                  },
                  pxToTwips(4),
                  exp.achievements && exp.achievements.length > 0 ? pxToTwips(6) : 0,
                  descLineSpacing,
                  undefined,
                  descAlignment
                )
                rightParagraphs.push(...listParagraphs)
              } else if (isPlainTextList(exp.description)) {
                rightParagraphs.push(
                  ...parsePlainTextListToParagraphs(
                    exp.description,
                    {
                      size: scaledFontSizes.body,
                      color: PALETTE.experienceBody,
                      font: primaryFont,
                    },
                    {
                      spacingAfterItem: pxToTwips(4),
                      spacingAfterLast: exp.achievements && exp.achievements.length > 0 ? pxToTwips(6) : 0,
                      alignment: descAlignment,
                      lineSpacing: descLineSpacing,
                    }
                  )
                )
              } else {
                const descRuns = parseHtmlToDocxRuns(exp.description, {
                  size: scaledFontSizes.body,
                  color: PALETTE.experienceBody,
                  font: primaryFont,
                })

                rightParagraphs.push(
                  new Paragraph({
                    children: descRuns,
                    spacing: {
                      after: exp.achievements && exp.achievements.length > 0 ? pxToTwips(6) : 0,
                      ...descLineSpacing,
                    },
                    alignment: descAlignment,
                  })
                )
              }
            }

            // Achievements (italic with accent-colored bullets)
            if (exp.achievements && exp.achievements.length > 0) {
              exp.achievements.forEach((achievement: string, j: number) => {
                const isLastAchievement = j === exp.achievements.length - 1

                // Strip any existing <em>/<i> tags to prevent nested italic toggling,
                // then wrap in <em> to match preview italic baseline
                const cleanAchievement = achievement.replace(/<\/?(?:em|i)>/gi, '')
                const achievementRuns = parseHtmlToDocxRuns(`<em>${cleanAchievement}</em>`, {
                  size: scaledFontSizes.body,
                  color: PALETTE.experienceBody,
                  font: primaryFont,
                })

                rightParagraphs.push(
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: '\u2022 ',
                        size: scaledFontSizes.body,
                        color: accentColorHex,
                        font: primaryFont,
                        italics: true,
                      }),
                      ...achievementRuns,
                    ],
                    // The achievement's lines are spaced at its text's height: the li's
                    // `text`, or the formatted-content height when it is HTML. The bullet
                    // is a separate flex item at the li's `text` height; it can make a
                    // one-line HTML item 0.1em taller in the Preview than its leading,
                    // which one Word paragraph cannot also express (recorded as a
                    // FINDING in the parity report).
                    spacing: {
                      after: isLastAchievement ? 0 : pxToTwips(SPACING.ACHIEVEMENT_GAP),
                      ...exactLineSpacing([formattedTextLineHeight(achievement, LINE_HEIGHT.text), scaledFontSizes.body]),
                    },
                  })
                )
              })
            }

            // Ensure at least one paragraph in right column
            if (rightParagraphs.length === 0) {
              rightParagraphs.push(new Paragraph({ children: [], spacing: NO_TEXT_LINE }))
            }

            // --- Create 2-column nested table for this experience entry ---
            // Calculate column widths: 40% left, 60% right of available main content width
            // Subtract cell margins from available width for inner table
            const innerTableWidth = mainContentWidthTwips - convertInchesToTwip(0.66)
            const leftColumnWidth = Math.round(innerTableWidth * 0.4)
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
                        right: pxToTwips(16), // gap: 16px between columns
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
            const expEndSpacing = isLastExp
              ? (isLastSection && !hasProjectsAfter ? 0 : pxToTwips(SPACING.SECTION_MARGIN_BOTTOM_MAIN))
              : pxToTwips(SPACING.EXPERIENCE_ITEM_GAP)

            if (expEndSpacing > 0) {
              mainContentParagraphs.push(
                new Paragraph({
                  spacing: { after: expEndSpacing, ...NO_TEXT_LINE },
                  children: [],
                })
              )
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

    projects.forEach((project: any, i: number) => {
      const isLast = i === projects.length - 1
      const itemEndSpacing = isLast ? 0 : pxToTwips(16)
      const projectNameSize = pxToHalfPoints(18 * fontScale) // text-lg
      // The description div's leading-relaxed, or the formatted-content height for HTML.
      const projectDescLineSpacing = exactLineSpacing([
        formattedTextLineHeight(project.description, TAILWIND_LEADING['leading-relaxed']),
        scaledFontSizes.body,
      ])

      // Project name (bold)
      mainContentParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '\u2022 ',
              size: scaledFontSizes.body,
              color: accentColorHex,
              font: primaryFont,
            }),
            new TextRun({
              text: project.name || '',
              bold: true,
              size: projectNameSize,
              color: PALETTE['slate-900'],
              font: primaryFont,
            }),
          ],
          // The h3 draws at text-lg's line height. The Preview's dot is a drawn
          // circle beside it, not text, so the bullet run adds no line box.
          spacing: {
            after: project.description || (project.technologies && project.technologies.length > 0) ? pxToTwips(4) : itemEndSpacing,
            ...exactLineSpacing([TAILWIND_TEXT_LINE_HEIGHT['text-lg'], projectNameSize]),
          },
          indent: { right: mainContentRightIndent },
        })
      )

      // Project description (Defect 4: use HTML parsing instead of raw text)
      if (project.description) {
        if (isHtmlList(project.description)) {
          const listParagraphs = parseHtmlListToParagraphs(
            project.description,
            {
              size: scaledFontSizes.body,
              color: PALETTE['slate-700'],
              font: primaryFont,
            },
            pxToTwips(4),
            project.technologies && project.technologies.length > 0 ? pxToTwips(8) : itemEndSpacing,
            projectDescLineSpacing,
            { left: pxToTwips(16), right: mainContentRightIndent }
          )
          mainContentParagraphs.push(...listParagraphs)
        } else if (isPlainTextList(project.description)) {
          mainContentParagraphs.push(
            ...parsePlainTextListToParagraphs(
              project.description,
              {
                size: scaledFontSizes.body,
                color: PALETTE['slate-700'],
                font: primaryFont,
              },
              {
                spacingAfterItem: pxToTwips(4),
                spacingAfterLast: project.technologies && project.technologies.length > 0 ? pxToTwips(8) : itemEndSpacing,
                indent: { left: pxToTwips(16), right: mainContentRightIndent },
                lineSpacing: projectDescLineSpacing,
              }
            )
          )
        } else {
          const descRuns = parseHtmlToDocxRuns(project.description, {
            size: scaledFontSizes.body,
            color: PALETTE['slate-700'],
            font: primaryFont,
          })

          mainContentParagraphs.push(
            new Paragraph({
              children: descRuns,
              spacing: {
                after: project.technologies && project.technologies.length > 0 ? pxToTwips(8) : itemEndSpacing,
                ...projectDescLineSpacing,
              },
              indent: { left: pxToTwips(16), right: mainContentRightIndent },
            })
          )
        }
      }

      // Technologies
      if (project.technologies && project.technologies.length > 0) {
        mainContentParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: project.technologies.join(' \u2022 '),
                size: pxToHalfPoints(12 * fontScale), // text-xs
                color: PALETTE['slate-700'],
                font: primaryFont,
              }),
            ],
            // Each chip's text draws at text-xs's line height; the chip's padding
            // and fill are graphics (US-007), not leading.
            spacing: {
              after: itemEndSpacing,
              ...exactLineSpacing([TAILWIND_TEXT_LINE_HEIGHT['text-xs'], pxToHalfPoints(12 * fontScale)]),
            },
            indent: { left: pxToTwips(16), right: mainContentRightIndent },
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
    margins: {
      top: convertInchesToTwip(0.33),
      bottom: convertInchesToTwip(0.33),
      left: convertInchesToTwip(0.33),
      right: convertInchesToTwip(0.33),
    },
    verticalAlign: VerticalAlign.TOP,
    width: {
      size: mainContentWidthTwips,
      type: WidthType.DXA,
    },
  })

  // Page height: US Letter = 11"
  const pageHeightTwips = convertInchesToTwip(11)

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
              width: convertInchesToTwip(8.5),
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
