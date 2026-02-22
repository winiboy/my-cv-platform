import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { type Locale } from '@/lib/i18n'
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

  // Styling parameters (with defaults matching professional-template.tsx)
  const fontFamily = searchParams.get('fontFamily') || 'Arial, Helvetica, sans-serif'
  const fontScale = parseFloat(searchParams.get('fontScale') || '1')
  const sidebarHueRaw = searchParams.get('sidebarHue')
  const sidebarSaturationRaw = searchParams.get('sidebarSaturation')
  const sidebarBrightnessRaw = searchParams.get('sidebarBrightness')
  const sidebarHue = parseInt(sidebarHueRaw || '240')
  const sidebarSaturation = parseInt(sidebarSaturationRaw || '85')
  const sidebarBrightness = parseInt(sidebarBrightnessRaw || '35')
  const sidebarWidthPercent = parseFloat(searchParams.get('sidebarWidth') || '30')
  const sidebarTopMarginRaw = searchParams.get('sidebarTopMargin')
  const mainContentTopMarginRaw = searchParams.get('mainContentTopMargin')

  // Detect whether the user explicitly set color values via the UI
  const hasCustomColors = sidebarHueRaw !== null || sidebarSaturationRaw !== null || sidebarBrightnessRaw !== null

  // Parse with defaults
  const sidebarTopMargin = sidebarTopMarginRaw ? parseInt(sidebarTopMarginRaw) : 64
  const mainContentTopMargin = mainContentTopMarginRaw ? parseInt(mainContentTopMarginRaw) : 24

  // Section ordering (JSON arrays)
  const sidebarOrderParam = searchParams.get('sidebarOrder')
  const mainContentOrderParam = searchParams.get('mainContentOrder')
  const hiddenSidebarParam = searchParams.get('hiddenSidebarSections')
  const hiddenMainParam = searchParams.get('hiddenMainSections')

  const sidebarOrder: string[] = sidebarOrderParam
    ? JSON.parse(sidebarOrderParam)
    : ['keyAchievements', 'skills', 'languages', 'training']
  const mainContentOrder: string[] = mainContentOrderParam
    ? JSON.parse(mainContentOrderParam)
    : ['summary', 'experience', 'education']
  const hiddenSidebarSections: string[] = hiddenSidebarParam
    ? JSON.parse(hiddenSidebarParam)
    : []
  const hiddenMainSections: string[] = hiddenMainParam
    ? JSON.parse(hiddenMainParam)
    : []

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
