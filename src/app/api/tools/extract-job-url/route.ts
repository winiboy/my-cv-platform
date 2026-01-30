import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Request timeout in milliseconds (15 seconds).
 * Job boards can be slow, but we don't want to hang indefinitely.
 */
const FETCH_TIMEOUT_MS = 15_000

/**
 * Maximum response body size in bytes (2MB).
 * Prevents memory issues from extremely large pages.
 */
const MAX_RESPONSE_SIZE = 2 * 1024 * 1024

/**
 * Allowed domains for fetching job descriptions.
 * Prevents SSRF attacks by restricting to known job board domains.
 */
const ALLOWED_DOMAINS = [
  // LinkedIn
  'linkedin.com',
  'www.linkedin.com',
  // Swiss job boards
  'jobs.ch',
  'jobcloud.ch',
  'jobup.ch',
  'jobscout24.ch',
  // International job boards
  'indeed.com',
  'indeed.ch',
  'indeed.de',
  'indeed.fr',
  'glassdoor.com',
  'glassdoor.ch',
  'monster.ch',
  'monster.com',
  'stepstone.ch',
  'stepstone.de',
  'xing.com',
  'karriere.at',
  // Adzuna
  'adzuna.ch',
  'adzuna.com',
  'adzuna.de',
  'adzuna.fr',
  'adzuna.co.uk',
  // ATS/Recruiting platforms
  'join.com',
  'greenhouse.io',
  'lever.co',
  'workday.com',
  'smartrecruiters.com',
  'breezy.hr',
  'recruitee.com',
  'teamtailor.com',
  'personio.de',
  'personio.ch',
  'ashbyhq.com',
  'jobs.lever.co',
  'boards.greenhouse.io',
] as const

/**
 * Zod schema for validating request body.
 */
const ExtractJobUrlRequestSchema = z.object({
  url: z.string().url('Invalid URL format'),
})

/**
 * Check if a URL's hostname is from an allowed domain.
 * Supports exact match and subdomain match.
 */
function isAllowedDomain(urlString: string): boolean {
  try {
    const parsedUrl = new URL(urlString)
    const hostname = parsedUrl.hostname.toLowerCase()

    return ALLOWED_DOMAINS.some((domain) => {
      const lowerDomain = domain.toLowerCase()
      return hostname === lowerDomain || hostname.endsWith('.' + lowerDomain)
    })
  } catch {
    return false
  }
}

/**
 * Fetch URL with timeout and proper headers.
 * Uses AbortController for timeout handling.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5,fr;q=0.3,de;q=0.2',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    })

    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Extract text content from HTML.
 * Removes scripts, styles, and HTML tags while preserving structure.
 */
function extractTextFromHtml(html: string): string {
  // Remove script tags and their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

  // Remove style tags and their content
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

  // Remove noscript tags and their content
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')

  // Remove SVG tags and their content
  text = text.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')

  // Remove head section
  text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')

  // Remove nav sections (navigation menus)
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')

  // Remove footer sections
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')

  // Remove header sections (site headers, not content headers)
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')

  // Convert line break elements to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n')

  // Convert block elements to double newlines for paragraph separation
  text = text.replace(/<\/p>/gi, '\n\n')
  text = text.replace(/<\/div>/gi, '\n')
  text = text.replace(/<\/h[1-6]>/gi, '\n\n')

  // Convert list items to bullet points
  text = text.replace(/<li[^>]*>/gi, '\n• ')
  text = text.replace(/<\/li>/gi, '')

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode HTML entities
  text = decodeHtmlEntities(text)

  // Normalize whitespace
  text = text
    .replace(/[ \t]+/g, ' ') // Multiple spaces/tabs to single space
    .replace(/\n\s+\n/g, '\n\n') // Clean up around newlines
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()

  return text
}

/**
 * Decode common HTML entities to their character equivalents.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&bull;/g, '•')
    .replace(/&hellip;/g, '...')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
}

/**
 * Try to extract the job description from known content containers.
 * Falls back to full body text if no specific container is found.
 */
function extractJobDescription(html: string): string {
  // Try to find job description in common container patterns
  const containerPatterns = [
    // Job description specific classes/IDs
    /<div[^>]*(?:class|id)=["'][^"']*(?:job-description|jobDescription|job_description|description-content|posting-body|job-details|job-content|vacancy-description|job-posting-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
    // Article tags (often contain main content)
    /<article[^>]*(?:class|id)=["'][^"']*(?:job|posting|vacancy)[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi,
    // Section tags with job-related classes
    /<section[^>]*(?:class|id)=["'][^"']*(?:job-description|description|content)[^"']*["'][^>]*>([\s\S]*?)<\/section>/gi,
    // Main content areas
    /<main[^>]*>([\s\S]*?)<\/main>/gi,
    // Generic article
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
  ]

  let bestContent = ''

  for (const pattern of containerPatterns) {
    const matches = [...html.matchAll(pattern)]
    for (const match of matches) {
      if (match[1]) {
        const content = extractTextFromHtml(match[1])
        // Keep the longest meaningful content found
        if (content.length > bestContent.length && content.length > 100) {
          bestContent = content
        }
      }
    }
    // If we found good content with a specific pattern, use it
    if (bestContent.length > 500) {
      break
    }
  }

  // If no specific container found, extract from body
  if (!bestContent || bestContent.length < 100) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    if (bodyMatch && bodyMatch[1]) {
      bestContent = extractTextFromHtml(bodyMatch[1])
    } else {
      // Fallback to full HTML extraction
      bestContent = extractTextFromHtml(html)
    }
  }

  return bestContent
}

/**
 * Check if the content appears to be a redirect/interstitial page.
 * Returns true if the content is likely not the actual job description.
 */
function isRedirectContent(content: string): boolean {
  if (!content || content.length < 50) return true

  const lowerContent = content.toLowerCase()

  const redirectIndicators = [
    'you will be redirected',
    'vous allez être redirigé',
    'si vous n\'êtes pas redirigé',
    "si vous n'êtes pas redirigé",
    'redirecting you',
    'please wait while we redirect',
    'in 5 seconds',
    'dans les 5 secondes',
    'weitergeleitet',
    'in wenigen sekunden',
  ]

  const matchCount = redirectIndicators.filter((phrase) =>
    lowerContent.includes(phrase)
  ).length

  // If multiple redirect phrases found, it's likely a redirect page
  if (matchCount >= 1 && content.length < 500) return true
  if (matchCount >= 2) return true

  return false
}

/**
 * Check if the content is blocked/protected (login wall, etc).
 */
function isBlockedContent(content: string): { blocked: boolean; reason?: string } {
  if (!content || content.length < 50) {
    return { blocked: true, reason: 'Page content is empty or too short' }
  }

  const lowerContent = content.toLowerCase()

  // LinkedIn specific blocks
  if (
    lowerContent.includes('sign in to view') ||
    lowerContent.includes('join to apply') ||
    lowerContent.includes('sign in to apply')
  ) {
    return {
      blocked: true,
      reason: 'LinkedIn requires authentication to view this job posting',
    }
  }

  // Generic login walls
  if (
    (lowerContent.includes('log in') || lowerContent.includes('sign in')) &&
    (lowerContent.includes('to continue') || lowerContent.includes('to view'))
  ) {
    return {
      blocked: true,
      reason: 'This page requires authentication to view',
    }
  }

  // CAPTCHA/bot protection
  if (
    lowerContent.includes('prove you are human') ||
    lowerContent.includes('captcha') ||
    lowerContent.includes('verify you are not a robot')
  ) {
    return {
      blocked: true,
      reason: 'This page is protected by bot detection',
    }
  }

  // Access denied
  if (
    lowerContent.includes('access denied') ||
    lowerContent.includes('403 forbidden')
  ) {
    return { blocked: true, reason: 'Access to this page was denied' }
  }

  return { blocked: false }
}

/**
 * POST /api/tools/extract-job-url
 *
 * Extracts job description text from a job posting URL.
 * Fetches the page server-side to avoid CORS issues.
 *
 * Request: { url: string }
 * Response: { success: true, jobDescription: string } or { error: string }
 *
 * This is a public endpoint - no authentication required.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    // Validate input with Zod
    const validationResult = ExtractJobUrlRequestSchema.safeParse(body)
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }))
      return NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: 400 }
      )
    }

    const { url } = validationResult.data

    // Security: Validate domain is allowed
    if (!isAllowedDomain(url)) {
      return NextResponse.json(
        {
          error: 'Domain not allowed',
          message:
            'This domain is not in the list of supported job boards. Please copy and paste the job description manually.',
        },
        { status: 400 }
      )
    }

    // Fetch the page
    let response: Response
    try {
      response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          {
            error: 'Request timeout',
            message:
              'The job board took too long to respond. Please try again or paste the job description manually.',
          },
          { status: 504 }
        )
      }
      throw fetchError
    }

    // Check response status
    if (!response.ok) {
      if (response.status === 403) {
        return NextResponse.json(
          {
            error: 'Access denied',
            message:
              'The job board blocked access to this page. Please paste the job description manually.',
          },
          { status: 403 }
        )
      }
      if (response.status === 404) {
        return NextResponse.json(
          {
            error: 'Job not found',
            message:
              'This job posting may have been removed or the URL is incorrect.',
          },
          { status: 404 }
        )
      }
      return NextResponse.json(
        {
          error: 'Failed to fetch page',
          message: `The job board returned an error (${response.status}). Please try again or paste the job description manually.`,
        },
        { status: response.status }
      )
    }

    // Check content length before reading
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      return NextResponse.json(
        {
          error: 'Response too large',
          message: 'The page is too large to process. Please paste the job description manually.',
        },
        { status: 413 }
      )
    }

    // Read HTML content
    const html = await response.text()

    // Check if we got too much data
    if (html.length > MAX_RESPONSE_SIZE) {
      return NextResponse.json(
        {
          error: 'Response too large',
          message: 'The page is too large to process. Please paste the job description manually.',
        },
        { status: 413 }
      )
    }

    // Extract job description
    const jobDescription = extractJobDescription(html)

    // Check for blocked content
    const blockCheck = isBlockedContent(jobDescription)
    if (blockCheck.blocked) {
      return NextResponse.json(
        {
          error: 'Content blocked',
          message: blockCheck.reason || 'Could not access the job description.',
        },
        { status: 403 }
      )
    }

    // Check for redirect content
    if (isRedirectContent(jobDescription)) {
      return NextResponse.json(
        {
          error: 'Redirect page',
          message:
            'The URL appears to be a redirect page. Please use the final job posting URL or paste the job description manually.',
        },
        { status: 422 }
      )
    }

    // Validate we got meaningful content
    if (jobDescription.length < 100) {
      return NextResponse.json(
        {
          error: 'Insufficient content',
          message:
            'Could not extract enough content from this page. Please paste the job description manually.',
        },
        { status: 422 }
      )
    }

    // Success
    return NextResponse.json({
      success: true,
      jobDescription,
    })
  } catch (error) {
    console.error('Error extracting job from URL:', error)
    return NextResponse.json(
      {
        error: 'Extraction failed',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to extract job description from URL. Please paste the job description manually.',
      },
      { status: 500 }
    )
  }
}
