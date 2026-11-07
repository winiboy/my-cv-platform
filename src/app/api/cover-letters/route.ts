/**
 * Cover Letters API Route
 * GET: List all cover letters for the authenticated user
 * POST: Create a new cover letter
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { COVER_LETTER_FIELD_LIMITS } from '@/lib/cover-letter-limits'
import { coverLetterSenderFieldsShape, normalizeAnnexes } from '@/lib/cover-letter-sender'

/**
 * Zod schema for cover letter creation
 * Validates all fields that can be provided when creating a new cover letter
 */
const coverLetterCreateSchema = z.object({
  title: z.string().min(1).max(COVER_LETTER_FIELD_LIMITS.title).optional(),
  resume_id: z.string().uuid().nullable().optional(),
  recipient_name: z.string().max(COVER_LETTER_FIELD_LIMITS.recipient_name).nullable().optional(),
  recipient_title: z.string().max(COVER_LETTER_FIELD_LIMITS.recipient_title).nullable().optional(),
  company_name: z.string().max(COVER_LETTER_FIELD_LIMITS.company_name).nullable().optional(),
  company_address: z.string().max(COVER_LETTER_FIELD_LIMITS.company_address).nullable().optional(),
  greeting: z.string().max(COVER_LETTER_FIELD_LIMITS.greeting).optional(),
  opening_paragraph: z.string().max(COVER_LETTER_FIELD_LIMITS.opening_paragraph).nullable().optional(),
  body_paragraphs: z.array(z.string().max(COVER_LETTER_FIELD_LIMITS.body_paragraph)).optional(),
  closing_paragraph: z.string().max(COVER_LETTER_FIELD_LIMITS.closing_paragraph).nullable().optional(),
  sign_off: z.string().max(COVER_LETTER_FIELD_LIMITS.sign_off).optional(),
  sender_name: z.string().max(COVER_LETTER_FIELD_LIMITS.sender_name).nullable().optional(),
  ...coverLetterSenderFieldsShape,
  job_title: z.string().max(COVER_LETTER_FIELD_LIMITS.job_title).nullable().optional(),
  job_description: z.string().max(COVER_LETTER_FIELD_LIMITS.job_description).nullable().optional(),
  template: z.literal('modern').optional(),
})

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Include linked resume info (id, title) via Supabase join syntax
    const { data: coverLetters, error } = await supabase
      .from('cover_letters')
      .select('*, resume:resumes(id, title)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching cover letters:', error)
      return NextResponse.json(
        { error: 'Failed to fetch cover letters' },
        { status: 500 }
      )
    }

    return NextResponse.json({ coverLetters })
  } catch (error) {
    console.error('Error in cover letters GET:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate request body with Zod schema
    const validationResult = coverLetterCreateSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      )
    }

    const {
      title,
      resume_id,
      recipient_name,
      recipient_title,
      company_name,
      company_address,
      greeting,
      opening_paragraph,
      body_paragraphs,
      closing_paragraph,
      sign_off,
      sender_name,
      sender_street,
      sender_postal_locality,
      sender_phone,
      sender_email,
      annexes,
      job_title,
      job_description,
      template,
    } = validationResult.data

    const { data: coverLetter, error } = await supabase
      .from('cover_letters')
      .insert({
        user_id: user.id,
        title: title || 'Untitled Cover Letter',
        resume_id: resume_id || null,
        recipient_name: recipient_name || null,
        recipient_title: recipient_title || null,
        company_name: company_name || null,
        company_address: company_address || null,
        // Empty, not omitted: the columns' database default is English. An
        // empty greeting and sign-off print the letter language's defaults.
        greeting: greeting ?? '',
        opening_paragraph: opening_paragraph || null,
        body_paragraphs: body_paragraphs || [],
        closing_paragraph: closing_paragraph || null,
        sign_off: sign_off ?? '',
        sender_name: sender_name || null,
        // Not `|| null`: an empty sender detail is one the user cleared, and
        // stays empty, where null falls back to the linked CV
        // (`effectiveSenderDetails`); an empty annexes is a letter without an
        // Annexes block, where null prints the default list.
        sender_street: sender_street ?? null,
        sender_postal_locality: sender_postal_locality ?? null,
        sender_phone: sender_phone ?? null,
        sender_email: sender_email ?? null,
        annexes: normalizeAnnexes(annexes ?? null),
        job_title: job_title || null,
        job_description: job_description || null,
        template: template || 'modern',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating cover letter:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      // Return more specific error information for debugging
      return NextResponse.json(
        {
          error: 'Failed to create cover letter',
          details: error.message,
          code: error.code,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ coverLetter }, { status: 201 })
  } catch (error) {
    console.error('Error in cover letters POST:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
