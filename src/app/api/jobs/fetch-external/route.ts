import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

/**
 * API endpoint to fetch full job description from external URL
 * This runs server-side to avoid CORS issues and keep the fetch invisible to the user
 */
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
    const { url, targetLanguage } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    // Fetch the external page
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status}` },
        { status: 502 }
      )
    }

    const html = await response.text()

    // Extract job details from HTML
    const extractedData = extractJobDetails(html)

    // Translate if source language differs from target language
    let finalDescription = extractedData.description
    let finalTitle = extractedData.title
    const detectedLang = extractedData.detectedLanguage

    // Only translate if target language is specified and different from detected language
    if (targetLanguage && targetLanguage !== detectedLang && extractedData.description.length > 0) {
      try {
        const languageNames: Record<string, string> = {
          en: 'English',
          fr: 'French',
          de: 'German',
          it: 'Italian',
        }

        const targetLangName = languageNames[targetLanguage] || targetLanguage
        const sourceLangName = languageNames[detectedLang] || 'the original language'

        // Translate description
        const descriptionCompletion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are a professional translator. Translate text accurately while preserving formatting and tone. Only output the translated text, nothing else.',
            },
            {
              role: 'user',
              content: `Translate the following job description from ${sourceLangName} to ${targetLangName}. Maintain the original formatting, including line breaks, bullet points, and paragraph structure.\n\nText to translate:\n${extractedData.description}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 4096,
        })

        const translatedDescription = descriptionCompletion.choices[0]?.message?.content?.trim()
        if (translatedDescription) {
          finalDescription = translatedDescription
        }

        // Translate title if present
        if (extractedData.title) {
          const titleCompletion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content: 'You are a professional translator. Translate the job title accurately. Only output the translated title, nothing else.',
              },
              {
                role: 'user',
                content: `Translate this job title from ${sourceLangName} to ${targetLangName}: ${extractedData.title}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 100,
          })

          const translatedTitle = titleCompletion.choices[0]?.message?.content?.trim()
          if (translatedTitle) {
            finalTitle = translatedTitle
          }
        }
      } catch (translateError) {
        console.error('Translation error:', translateError)
        // Continue with untranslated content if translation fails
      }
    }

    return NextResponse.json({
      success: true,
      jobDescription: finalDescription,
      jobTitle: finalTitle,
      company: extractedData.company,
      originalLanguage: detectedLang,
      translatedTo: targetLanguage !== detectedLang ? targetLanguage : null,
    })
  } catch (error) {
    console.error('Error fetching external job:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch job description',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Extract job details from HTML content
 * Uses common patterns found in job listing websites
 */
function extractJobDetails(html: string): {
  title: string
  description: string
  company: string
  detectedLanguage: string
} {
  // Remove script and style tags
  let cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')

  // Try to extract title from common patterns
  let title = ''

  // Try og:title first
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
  if (ogTitleMatch) {
    title = ogTitleMatch[1]
  }

  // Try title tag
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch) {
      title = titleMatch[1].split('|')[0].split('-')[0].trim()
    }
  }

  // Try h1 tag
  if (!title) {
    const h1Match = cleanHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    if (h1Match) {
      title = h1Match[1].trim()
    }
  }

  // Try to extract company name
  let company = ''

  // 1. Try JSON-LD structured data (schema.org/JobPosting) - most reliable
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  if (jsonLdMatch) {
    for (const scriptContent of jsonLdMatch) {
      try {
        const jsonContent = scriptContent.replace(/<script[^>]*>|<\/script>/gi, '')
        const jsonData = JSON.parse(jsonContent)

        // Handle array of schemas or single schema
        const schemas = Array.isArray(jsonData) ? jsonData : [jsonData]
        for (const schema of schemas) {
          if (schema['@type'] === 'JobPosting' && schema.hiringOrganization) {
            const org = schema.hiringOrganization
            company = typeof org === 'string' ? org : (org.name || org.legalName || '')
            if (company) break
          }
        }
        if (company) break
      } catch {
        // JSON parsing failed, continue to next pattern
      }
    }
  }

  // 2. Try common meta tags for employer/company
  if (!company) {
    const metaCompanyPatterns = [
      /<meta[^>]*(?:name|property)=["'](?:employer|company|hiring-company|og:employer)["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:employer|company|hiring-company)["']/i,
    ]

    for (const pattern of metaCompanyPatterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        company = match[1].trim()
        break
      }
    }
  }

  // 3. Try to extract from og:title (often "Job Title at Company Name" or "Job Title - Company Name")
  if (!company && title) {
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    if (ogTitle && ogTitle[1]) {
      const fullTitle = ogTitle[1]
      // Try "at Company" pattern
      const atMatch = fullTitle.match(/\bat\s+([^|•\-–—]+)/i)
      if (atMatch && atMatch[1]) {
        company = atMatch[1].trim()
      }
      // Try "- Company" or "| Company" pattern (take last part)
      if (!company) {
        const separatorMatch = fullTitle.match(/[\-–—|•]\s*([^|\-–—•]+)$/)
        if (separatorMatch && separatorMatch[1]) {
          const potentialCompany = separatorMatch[1].trim()
          // Exclude common job board names
          const jobBoards = ['adzuna', 'indeed', 'linkedin', 'glassdoor', 'monster', 'jobup', 'jobs.ch', 'jobscout24']
          if (!jobBoards.some(board => potentialCompany.toLowerCase().includes(board))) {
            company = potentialCompany
          }
        }
      }
    }
  }

  // 4. Try HTML elements with company-related classes/attributes
  if (!company) {
    const htmlCompanyPatterns = [
      /<[^>]*(?:class|id)=["'][^"']*(?:company-name|employer-name|hiring-company|companyName|employerName)[^"']*["'][^>]*>([^<]+)</i,
      /<[^>]*data-(?:company|employer)=["']([^"']+)["']/i,
      /<span[^>]*class=["'][^"']*company[^"']*["'][^>]*>([^<]+)</i,
    ]

    for (const pattern of htmlCompanyPatterns) {
      const match = cleanHtml.match(pattern)
      if (match && match[1]) {
        company = match[1].trim()
        break
      }
    }
  }

  // 5. Fallback: og:site_name but exclude known job boards
  if (!company) {
    const siteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)
    if (siteNameMatch && siteNameMatch[1]) {
      const siteName = siteNameMatch[1].trim()
      const jobBoards = ['adzuna', 'indeed', 'linkedin', 'glassdoor', 'monster', 'jobup', 'jobs.ch', 'jobscout24', 'stepstone', 'career', 'recruit']
      if (!jobBoards.some(board => siteName.toLowerCase().includes(board))) {
        company = siteName
      }
    }
  }

  // Extract main content - look for job description containers
  let description = ''

  // Common class/id patterns for job descriptions
  const descriptionPatterns = [
    /<div[^>]*(?:class|id)=["'][^"']*(?:job-description|jobDescription|job_description|description|posting-body|job-details|job-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
    /<main[^>]*>([\s\S]*?)<\/main>/gi,
  ]

  for (const pattern of descriptionPatterns) {
    const matches = cleanHtml.matchAll(pattern)
    for (const match of matches) {
      if (match[1] && match[1].length > description.length) {
        description = match[1]
      }
    }
  }

  // If no specific container found, use body content
  if (!description) {
    const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    if (bodyMatch) {
      description = bodyMatch[1]
    }
  }

  // Clean up HTML tags and normalize whitespace
  description = description
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()

  // Detect language (simple heuristic)
  let detectedLanguage = 'en'
  const frenchWords = /\b(nous|vous|avec|pour|dans|cette|offre|poste|emploi|travail)\b/gi
  const germanWords = /\b(wir|sie|mit|für|und|diese|stelle|arbeit|beruf)\b/gi
  const italianWords = /\b(noi|voi|con|per|questa|offerta|lavoro|posizione)\b/gi

  const text = description.toLowerCase()
  const frenchCount = (text.match(frenchWords) || []).length
  const germanCount = (text.match(germanWords) || []).length
  const italianCount = (text.match(italianWords) || []).length

  if (frenchCount > germanCount && frenchCount > italianCount && frenchCount > 5) {
    detectedLanguage = 'fr'
  } else if (germanCount > frenchCount && germanCount > italianCount && germanCount > 5) {
    detectedLanguage = 'de'
  } else if (italianCount > frenchCount && italianCount > germanCount && italianCount > 5) {
    detectedLanguage = 'it'
  }

  return {
    title: decodeHTMLEntities(title),
    description,
    company: decodeHTMLEntities(company),
    detectedLanguage,
  }
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
}
