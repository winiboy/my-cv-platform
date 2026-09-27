import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getGroqClient, MODELS } from '@/lib/ai/client'
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit'
import {
  AI_TEXT_LIMITS,
  enforceJsonBodyLimit,
  findOversizedField,
  oversizedFieldResponse,
} from '@/lib/api/ai-input-limits'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // This request spends the project's AI provider account. The budget is
    // keyed by the authenticated user, so it is counted once the identity is
    // known and cannot be reset by changing address.
    const throttled = await enforceAiRateLimit(request, { kind: 'user', userId: user.id })
    if (throttled) {
      return throttled
    }

    const oversizedBody = enforceJsonBodyLimit(request)
    if (oversizedBody) {
      return oversizedBody
    }

    // Parse request body
    const body = await request.json()
    const { text, targetLanguage, sourceLanguage } = body

    // Ceiling on the only field that reaches the prompt at length. The two
    // language fields cannot: both are mapped through the fixed table below,
    // never interpolated raw.
    const oversized = findOversizedField(body, { text: AI_TEXT_LIMITS.TRANSLATABLE_TEXT })
    if (oversized) {
      return oversizedFieldResponse(oversized)
    }

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'text is required and must be a string' },
        { status: 400 }
      )
    }

    if (!targetLanguage || !['fr', 'de', 'en', 'it'].includes(targetLanguage)) {
      return NextResponse.json(
        { error: 'targetLanguage must be one of: fr, de, en, it' },
        { status: 400 }
      )
    }

    const languageNames: Record<string, string> = {
      en: 'English',
      fr: 'French',
      de: 'German',
      it: 'Italian',
    }

    const targetLangName = languageNames[targetLanguage]
    const sourceLangName = sourceLanguage ? languageNames[sourceLanguage] : 'the original language'

    const prompt = `Translate the following text from ${sourceLangName} to ${targetLangName}.
Maintain the original formatting, including line breaks, bullet points, and paragraph structure.
Only output the translated text, nothing else.

Text to translate:
${text}`

    let groq
    try {
      groq = getGroqClient()
    } catch {
      return NextResponse.json(
        { error: 'GROQ_API_KEY not configured' },
        { status: 503 }
      )
    }

    const completion = await groq.chat.completions.create({
      model: MODELS.BALANCED,
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Translate text accurately while preserving formatting and tone.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    })

    const translatedText = completion.choices[0]?.message?.content?.trim() || text

    return NextResponse.json({
      success: true,
      translatedText,
      targetLanguage,
      tokensUsed: completion.usage?.total_tokens || 0,
    })
  } catch (error) {
    console.error('Error translating text:', error)
    return NextResponse.json(
      {
        error: 'Failed to translate text',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
