import Groq from 'groq-sdk'

// Initialize Groq client

export function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing or empty");
  }

  return new Groq({ apiKey });
}


// Default model to use
export const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

// Model options for different use cases
export const MODELS = {
  // Fast and efficient for most tasks
  FAST: 'llama-3.1-8b-instant',

  // Balanced performance and quality (recommended)
  BALANCED: 'llama-3.3-70b-versatile',

  // Best quality for complex tasks
  QUALITY: 'llama-3.3-70b-versatile',
} as const

/**
 * Generate a completion using Groq
 */
export async function generateCompletion(
  prompt: string,
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
  } = {}
) {
  const {
    model = DEFAULT_MODEL,
    temperature = 0.7,
    maxTokens = 1000,
  } = options

  const groq = getGroqClient()

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model,
      temperature,
      max_tokens: maxTokens,
    })

    return {
      text: completion.choices[0]?.message?.content || '',
      usage: completion.usage,
    }
  } catch (error) {
    console.error('Groq API error:', error)
    throw new Error('Failed to generate AI completion')
  }
}
