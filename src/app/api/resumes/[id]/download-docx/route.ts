import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { type Locale } from '@/lib/i18n'
import { pxToTwips, type DocxGeneratorSettings } from './docx-helpers'
import { generateProfessionalDocx } from './docx-professional'
import { generateModernDocx } from './docx-modern'
import { generateClassicDocx } from './docx-classic'
import { generateMinimalDocx } from './docx-minimal'

// ============================================================
// SUPPORTED TEMPLATES
// ============================================================
const SUPPORTED_TEMPLATES = ['professional', 'modern', 'classic', 'minimal', 'creative'] as const
type TemplateId = (typeof SUPPORTED_TEMPLATES)[number]

// ============================================================
// MAIN ROUTE HANDLER — TEMPLATE DISPATCHER
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()

    // Get all parameters from query string
    const { searchParams } = new URL(request.url)
    const locale = (searchParams.get('locale') || 'fr') as Locale

    // Styling parameters (with defaults matching professional-template.tsx)
    const fontFamily = searchParams.get('fontFamily') || 'Arial, Helvetica, sans-serif'
    const fontScale = parseFloat(searchParams.get('fontScale') || '1')
    const sidebarHue = parseInt(searchParams.get('sidebarHue') || '240')
    const sidebarBrightness = parseInt(searchParams.get('sidebarBrightness') || '35')
    const sidebarWidthPercent = parseFloat(searchParams.get('sidebarWidth') || '30')
    const sidebarTopMarginRaw = searchParams.get('sidebarTopMargin')
    const mainContentTopMarginRaw = searchParams.get('mainContentTopMargin')

    // Parse with defaults
    const sidebarTopMargin = sidebarTopMarginRaw ? parseInt(sidebarTopMarginRaw) : 64
    const mainContentTopMargin = mainContentTopMarginRaw ? parseInt(mainContentTopMarginRaw) : 24

    // DEBUG: Log received alignment values to identify where data flow breaks
    console.log('[DOCX Route Debug] Raw query params:', {
      sidebarWidth: searchParams.get('sidebarWidth'),
      sidebarTopMargin: sidebarTopMarginRaw,
      mainContentTopMargin: mainContentTopMarginRaw,
    })
    console.log('[DOCX Route Debug] Final values used:', {
      sidebarWidthPercent,
      sidebarTopMargin,
      mainContentTopMargin,
      sidebarTopMarginTwips: pxToTwips(sidebarTopMargin),
    })

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
      sidebarBrightness,
      sidebarWidth: sidebarWidthPercent,
      sidebarTopMargin,
      mainContentTopMargin,
      sidebarOrder,
      mainContentOrder,
      hiddenSidebarSections,
      hiddenMainSections,
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
        return NextResponse.json(
          { error: `DOCX export for template "${template}" is not yet implemented` },
          { status: 501 }
        )

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
  } catch (error) {
    console.error('Error generating Word document:', error)
    return NextResponse.json(
      { error: 'Failed to generate Word document' },
      { status: 500 }
    )
  }
}
