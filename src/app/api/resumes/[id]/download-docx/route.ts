import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { type Locale } from '@/lib/i18n'
import { DEFAULT_RESUME_LAYOUT } from '@/lib/layout-settings'
import { type DocxGeneratorSettings } from './docx-helpers'
import { generateProfessionalDocx } from './docx-professional'
import { generateModernDocx } from './docx-modern'
import { generateClassicDocx } from './docx-classic'
import { generateMinimalDocx } from './docx-minimal'
import { generateCreativeDocx } from './docx-creative'

// ============================================================
// SUPPORTED TEMPLATES
// ============================================================
const SUPPORTED_TEMPLATES = ['professional', 'modern', 'classic', 'minimal', 'creative'] as const
type TemplateId = (typeof SUPPORTED_TEMPLATES)[number]

// ============================================================
// SHARED LOGIC: Parse search params and generate DOCX
// ============================================================

async function handleDocxGeneration(
  request: NextRequest,
  id: string,
  body?: { photoBase64?: string }
): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient()

  // Get all parameters from query string
  const { searchParams } = new URL(request.url)
  const locale = (searchParams.get('locale') || 'fr') as Locale

  // Styling parameters. Every fallback comes from DEFAULT_RESUME_LAYOUT, which
  // is the same constant the editor and the preview initialise from — an export
  // requested without a parameter therefore renders at the value the Preview
  // would have shown.
  const fontFamily = searchParams.get('fontFamily') || DEFAULT_RESUME_LAYOUT.fontFamily
  const fontScale = parseFloat(searchParams.get('fontScale') || String(DEFAULT_RESUME_LAYOUT.fontScale))
  const sidebarHueRaw = searchParams.get('sidebarHue')
  const sidebarSaturationRaw = searchParams.get('sidebarSaturation')
  const sidebarBrightnessRaw = searchParams.get('sidebarBrightness')
  const sidebarHue = parseInt(sidebarHueRaw || String(DEFAULT_RESUME_LAYOUT.sidebarHue))
  const sidebarSaturation = parseInt(sidebarSaturationRaw || String(DEFAULT_RESUME_LAYOUT.sidebarSaturation))
  const sidebarBrightness = parseInt(sidebarBrightnessRaw || String(DEFAULT_RESUME_LAYOUT.sidebarBrightness))
  const sidebarWidthPercent = parseFloat(searchParams.get('sidebarWidth') || String(DEFAULT_RESUME_LAYOUT.sidebarWidth))
  const sidebarTopMarginRaw = searchParams.get('sidebarTopMargin')
  const mainContentTopMarginRaw = searchParams.get('mainContentTopMargin')

  // Detect whether the user explicitly set color values via the UI
  const hasCustomColors = sidebarHueRaw !== null || sidebarSaturationRaw !== null || sidebarBrightnessRaw !== null

  // Parse with defaults
  const sidebarTopMargin = sidebarTopMarginRaw ? parseInt(sidebarTopMarginRaw) : DEFAULT_RESUME_LAYOUT.sidebarTopMargin
  const mainContentTopMargin = mainContentTopMarginRaw ? parseInt(mainContentTopMarginRaw) : DEFAULT_RESUME_LAYOUT.mainContentTopMargin

  // Section ordering (JSON arrays)
  const sidebarOrderParam = searchParams.get('sidebarOrder')
  const mainContentOrderParam = searchParams.get('mainContentOrder')
  const hiddenSidebarParam = searchParams.get('hiddenSidebarSections')
  const hiddenMainParam = searchParams.get('hiddenMainSections')

  const sidebarOrder: string[] = sidebarOrderParam
    ? JSON.parse(sidebarOrderParam)
    : [...DEFAULT_RESUME_LAYOUT.sidebarOrder]
  const mainContentOrder: string[] = mainContentOrderParam
    ? JSON.parse(mainContentOrderParam)
    : [...DEFAULT_RESUME_LAYOUT.mainContentOrder]
  const hiddenSidebarSections: string[] = hiddenSidebarParam
    ? JSON.parse(hiddenSidebarParam)
    : [...DEFAULT_RESUME_LAYOUT.hiddenSidebarSections]
  const hiddenMainSections: string[] = hiddenMainParam
    ? JSON.parse(hiddenMainParam)
    : [...DEFAULT_RESUME_LAYOUT.hiddenMainSections]

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch resume
  const result: any = await supabase
    .from('resumes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (result.error || !result.data) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
  }

  const resume = result.data

  // Build generator settings (shared across all template generators)
  const settings: DocxGeneratorSettings = {
    fontFamily,
    fontScale,
    locale,
    sidebarHue,
    sidebarSaturation,
    sidebarBrightness,
    sidebarWidth: sidebarWidthPercent,
    sidebarTopMargin,
    mainContentTopMargin,
    sidebarOrder,
    mainContentOrder,
    hiddenSidebarSections,
    hiddenMainSections,
    hasCustomColors,
    photoBase64: body?.photoBase64,
  }

  // Determine template: query param override > DB value > default
  const templateOverride = searchParams.get('template')
  const templateRaw = templateOverride || resume.template || 'professional'
  const template = (SUPPORTED_TEMPLATES as readonly string[]).includes(templateRaw)
    ? (templateRaw as TemplateId)
    : 'professional'

  // Dispatch to the appropriate template generator
  let buffer: Buffer

  switch (template) {
    case 'professional':
      buffer = await generateProfessionalDocx(resume, settings)
      break

    case 'modern':
      buffer = await generateModernDocx(resume, settings)
      break

    case 'classic':
      buffer = await generateClassicDocx(resume, settings)
      break

    case 'minimal':
      buffer = await generateMinimalDocx(resume, settings)
      break

    case 'creative':
      buffer = await generateCreativeDocx(resume, settings)
      break

    default:
      // Fallback to professional for any unknown template
      buffer = await generateProfessionalDocx(resume, settings)
      break
  }

  // Return as downloadable file
  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${resume.title || 'resume'}.docx"`,
    },
  })
}

// ============================================================
// GET HANDLER — backward-compatible (no photo support)
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    return await handleDocxGeneration(request, id)
  } catch (error) {
    console.error('Error generating Word document:', error)
    return NextResponse.json(
      { error: 'Failed to generate Word document' },
      { status: 500 }
    )
  }
}

// ============================================================
// POST HANDLER — supports photo data in request body
// ============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Parse body for photo data
    let body: { photoBase64?: string } = {}
    try {
      body = await request.json()
    } catch {
      // If body parsing fails, continue without photo
    }

    return await handleDocxGeneration(request, id, body)
  } catch (error) {
    console.error('Error generating Word document:', error)
    return NextResponse.json(
      { error: 'Failed to generate Word document' },
      { status: 500 }
    )
  }
}
