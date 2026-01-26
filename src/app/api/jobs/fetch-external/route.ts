import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isRedirectContent } from '@/lib/adzuna-client'
import Groq from 'groq-sdk'

import { getGroqClient } from "@/lib/ai/client";


/**
 * Allowed domains for fetching job descriptions
 * This prevents SSRF attacks by only allowing known job board domains
 */
const ALLOWED_DOMAINS = [
  // Adzuna domains
  'adzuna.ch', 'adzuna.com', 'adzuna.de', 'adzuna.fr', 'adzuna.co.uk',
  // Swiss job boards
  'jobs.ch', 'jobcloud.ch', 'jobup.ch', 'jobscout24.ch',
  // International job boards
  'indeed.com', 'indeed.ch', 'indeed.de', 'indeed.fr',
  'linkedin.com',
  'glassdoor.com', 'glassdoor.ch',
  'monster.ch', 'monster.com',
  'stepstone.ch', 'stepstone.de',
  'xing.com',
  'karriere.at',
  // Swiss company career pages (common domains)
  'join.com', 'greenhouse.io', 'lever.co', 'workday.com', 'smartrecruiters.com',
  'breezy.hr', 'recruitee.com', 'teamtailor.com', 'personio.de', 'personio.ch',
]

/**
 * Check if a URL's hostname is from an allowed domain
 */
function isAllowedDomain(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()

    // Check if hostname matches or is a subdomain of an allowed domain
    return ALLOWED_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    )
  } catch {
    return false
  }
}

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

    let groq;
    try {
      groq = getGroqClient();
    } catch {
      return NextResponse.json(
        { error: "GROQ_API_KEY not configured" },
        { status: 500 }
      );
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

    // Security: Validate that the URL is from an allowed domain to prevent SSRF
    if (!isAllowedDomain(parsedUrl.toString())) {
      console.log('[fetch-external] Domain not allowed:', parsedUrl.hostname)
      return NextResponse.json(
        { error: 'Domain not allowed for job fetching' },
        { status: 400 }
      )
    }

    // Fetch the external page with redirect following
    let html = await fetchWithRedirectHandling(parsedUrl.toString())

    // Check if this is a redirect/interstitial page and handle it
    const redirectResult = detectAndHandleRedirectPage(html, parsedUrl.toString())
    if (redirectResult.isRedirect && redirectResult.targetUrl) {
      // Security: Validate redirect URL is from an allowed domain
      if (isAllowedDomain(redirectResult.targetUrl)) {
        console.log('[fetch-external] Detected redirect page, following to:', redirectResult.targetUrl)
        try {
          html = await fetchWithRedirectHandling(redirectResult.targetUrl)
        } catch (redirectError) {
          console.error('[fetch-external] Failed to follow redirect:', redirectError)
          // Continue with original HTML if redirect fails
        }
      } else {
        console.log('[fetch-external] Redirect URL not from allowed domain:', redirectResult.targetUrl)
      }
    }

    // Extract job details from HTML
    const extractedData = extractJobDetails(html)

    // If extraction still looks like a redirect page, try the Adzuna land/ad URL
    if (isUnusableContent(extractedData.description)) {
      const landAdUrl = extractAdzunaLandUrl(html)
      // Security: Validate land/ad URL is from an allowed domain
      if (landAdUrl && isAllowedDomain(landAdUrl)) {
        console.log('[fetch-external] Content still looks like redirect, trying land/ad URL:', landAdUrl)
        try {
          const landHtml = await fetchWithRedirectHandling(landAdUrl)
          const landData = extractJobDetails(landHtml)
          if (!isUnusableContent(landData.description) && landData.description.length > extractedData.description.length) {
            return processAndRespond(landData, targetLanguage, groq)
          }
        } catch (landError) {
          console.error('[fetch-external] Failed to fetch land/ad URL:', landError)
        }
      } else if (landAdUrl) {
        console.log('[fetch-external] Land/ad URL not from allowed domain:', landAdUrl)
      }
    }

    // Final check: if extracted content is still redirect content, return error
    // This ensures the frontend knows the fetch failed and can handle it appropriately
    if (isUnusableContent(extractedData.description)) {
      console.log('[fetch-external] Final content is still redirect content, returning error')
      return NextResponse.json({
        success: false,
        error: 'Could not extract job description - content appears to be a redirect page',
        isRedirectContent: true,
      })
    }

    // Process and respond with the extracted data
    return processAndRespond(extractedData, targetLanguage, groq)
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
 * Fetch URL with proper headers and redirect handling
 */
async function fetchWithRedirectHandling(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5,fr;q=0.3,de;q=0.2',
    },
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status}`)
  }

  return response.text()
}

/**
 * Detect if the HTML is a redirect/interstitial page and extract target URL
 */
function detectAndHandleRedirectPage(html: string, originalUrl: string): { isRedirect: boolean; targetUrl: string | null } {
  // Patterns that indicate a redirect page
  const redirectIndicators = [
    /redirig[ée]/i,                           // French: "redirigé"
    /redirect/i,                               // English: "redirect"
    /weitergeleitet/i,                         // German: "weitergeleitet"
    /vous allez être redirigé/i,               // French: "You will be redirected"
    /you will be redirected/i,                 // English
    /si vous n'êtes pas redirigé/i,            // French: "If you are not redirected"
    /if you are not redirected/i,              // English
    /StepStone/i,                              // StepStone specific
    /Indeed/i,                                 // Indeed specific
    /jobup/i,                                  // JobUp specific
    /Jobcloud/i,                               // Jobcloud specific
    /tous les emplois\.\s*partout/i,           // Adzuna French tagline
    /all jobs\.\s*everywhere/i,                // Adzuna English tagline
  ]

  const isRedirect = redirectIndicators.some(pattern => pattern.test(html))

  if (!isRedirect) {
    return { isRedirect: false, targetUrl: null }
  }

  console.log('[fetch-external] Redirect page detected, attempting to extract target URL')

  // Try to extract the redirect URL from various sources

  // 1. Meta refresh tag
  const metaRefreshMatch = html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'\s>]+)/i)
  if (metaRefreshMatch) {
    console.log('[fetch-external] Found meta refresh redirect:', metaRefreshMatch[1])
    return { isRedirect: true, targetUrl: metaRefreshMatch[1] }
  }

  // 2. JavaScript window.location redirect
  const jsRedirectPatterns = [
    /window\.location\s*=\s*["']([^"']+)["']/i,
    /window\.location\.href\s*=\s*["']([^"']+)["']/i,
    /location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i,
  ]
  for (const pattern of jsRedirectPatterns) {
    const match = html.match(pattern)
    if (match && match[1] && !match[1].includes('javascript:')) {
      console.log('[fetch-external] Found JS redirect:', match[1])
      return { isRedirect: true, targetUrl: match[1] }
    }
  }

  // 3. Look for "see the ad here" type links (various patterns)
  const linkPatterns = [
    // French patterns - "voir l'annonce ici" link
    /<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*voir[^<]*l['']annonce[^<]*ici/i,
    /<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*voir[^<]*annonce/i,
    /voir l['']annonce ici[^<]*<a[^>]*href=["']([^"']+)["']/i,
    /voir l['']annonce[^<]*<a[^>]*href=["']([^"']+)["']/i,
    // English patterns
    /see the (?:ad|job|listing) here[^<]*<a[^>]*href=["']([^"']+)["']/i,
    /<a[^>]*href=["']([^"']+)["'][^>]*>(?:[^<]*voir[^<]*annonce|[^<]*see[^<]*job)/i,
    // German patterns
    /<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*Anzeige[^<]*ansehen/i,
  ]
  for (const pattern of linkPatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const url = resolveUrl(match[1], originalUrl)
      console.log('[fetch-external] Found "see ad here" link:', url)
      return { isRedirect: true, targetUrl: url }
    }
  }

  // 4. Look for Jobcloud/Swiss job board URLs directly in links
  const jobcloudPatterns = [
    /href=["'](https?:\/\/[^"']*(?:jobs\.ch|jobcloud\.ch|jobup\.ch|jobscout24\.ch)[^"']*)["']/i,
    /href=["'](https?:\/\/[^"']*\.jobcloud\.[^"']*)["']/i,
  ]
  for (const pattern of jobcloudPatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      console.log('[fetch-external] Found Jobcloud URL:', match[1])
      return { isRedirect: true, targetUrl: match[1] }
    }
  }

  // 5. Look for Adzuna land/ad URL pattern
  const landAdMatch = html.match(/href=["'](https?:\/\/[^"']*adzuna[^"']*\/land\/ad\/[^"']+)["']/i)
  if (landAdMatch) {
    console.log('[fetch-external] Found Adzuna land/ad URL:', landAdMatch[1])
    return { isRedirect: true, targetUrl: landAdMatch[1] }
  }

  // 6. Generic fallback: Find any external link that might be the job posting
  // Look for links to common job board domains
  const externalJobBoardPatterns = [
    /href=["'](https?:\/\/[^"']*(?:stepstone|indeed|linkedin|monster|glassdoor|xing|karriere)[^"']*)["']/i,
  ]
  for (const pattern of externalJobBoardPatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      console.log('[fetch-external] Found external job board URL:', match[1])
      return { isRedirect: true, targetUrl: match[1] }
    }
  }

  // 7. Last resort: Find any anchor tag that looks like an external job link
  // Exclude common non-job links like social media, terms, privacy
  const allLinksMatch = html.matchAll(/<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)</gi)
  for (const match of allLinksMatch) {
    const url = match[1]
    const linkText = match[2].toLowerCase()

    // Skip social media, navigation, and policy links
    const excludePatterns = [
      /facebook|twitter|linkedin\.com\/share|instagram|youtube/i,
      /privacy|terms|conditions|cookie|legal|imprint|impressum/i,
      /adzuna\.(?:com|ch|de|fr)/i, // Skip internal Adzuna links
    ]

    const shouldExclude = excludePatterns.some(p => p.test(url))

    // Include if link text suggests it's the job link
    const includeTextPatterns = ['voir', 'annonce', 'see', 'job', 'view', 'apply', 'postuler', 'ansehen', 'stelle']
    const hasIncludeText = includeTextPatterns.some(t => linkText.includes(t))

    if (!shouldExclude && hasIncludeText) {
      console.log('[fetch-external] Found potential job link via text analysis:', url)
      return { isRedirect: true, targetUrl: url }
    }
  }

  console.log('[fetch-external] No redirect URL found in page')
  return { isRedirect: true, targetUrl: null }
}

/**
 * Resolve a potentially relative URL against a base URL
 */
function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  try {
    const base = new URL(baseUrl)
    if (url.startsWith('//')) {
      return `${base.protocol}${url}`
    }
    if (url.startsWith('/')) {
      return `${base.origin}${url}`
    }
    // Relative path
    const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1)
    return `${base.origin}${basePath}${url}`
  } catch {
    return url
  }
}

/**
 * Check if extracted content is unusable (empty, too short, or redirect content)
 * Uses the shared isRedirectContent function from adzuna-client.ts
 */
function isUnusableContent(description: string): boolean {
  // Empty or very short descriptions are unusable
  if (!description || description.length < 50) {
    console.log('[fetch-external] Content is empty or too short')
    return true
  }

  // Delegate redirect detection to the shared function
  if (isRedirectContent(description)) {
    console.log('[fetch-external] Content detected as redirect page by isRedirectContent')
    return true
  }

  return false
}

/**
 * Extract Adzuna land/ad URL from HTML for following external redirects
 */
function extractAdzunaLandUrl(html: string): string | null {
  // Look for the "apply" link which redirects to the actual job source
  const applyLinkMatch = html.match(/href=["'](https?:\/\/[^"']*adzuna[^"']*\/land\/ad\/[^"']+)["']/i)
  if (applyLinkMatch) {
    return applyLinkMatch[1]
  }
  return null
}

/**
 * Process extracted data, translate if needed, and return response
 */
async function processAndRespond(
  extractedData: { title: string; description: string; company: string; detectedLanguage: string },
  targetLanguage: string | undefined,
  groq: Groq
): Promise<NextResponse> {
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
  const cleanHtml = html
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
