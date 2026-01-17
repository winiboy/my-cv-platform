import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

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

    // Parse request body
    const body = await request.json()
    const { text, targetLanguage, sourceLanguage } = body

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

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
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
