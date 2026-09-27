import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  BlockedRequestError,
  hostWithSubdomains,
  isHostAllowed,
  safeFetch,
  type AllowedHost,
} from '@/lib/security/safe-fetch'

/**
 * Request timeout in milliseconds (15 seconds).
 * Job boards can be slow, but we don't want to hang indefinitely.
 */
const FETCH_TIMEOUT_MS = 15_000

/**
 * Maximum number of redirect hops followed. Each hop is re-validated against
 * the allowlist and the private-address check before it is requested.
 */
const MAX_REDIRECTS = 5

/**
 * Maximum response body size in bytes (2MB).
 * Prevents memory issues from extremely large pages.
 */
const MAX_RESPONSE_SIZE = 2 * 1024 * 1024

/**
 * Allowed hosts for fetching job descriptions.
 *
 * Every entry allows subdomains, which is the behaviour this endpoint has
 * always had. For the multi-tenant ATS platforms that is knowingly wide: a
 * tenant subdomain is available to anyone who signs up, so `*.workday.com` and
 * friends let a third party serve arbitrary content — or an arbitrary redirect —
 * from inside the allowlist. The redirect and private-address checks in
 * `safeFetch` contain the consequences; narrowing these entries to `exactHost`
 * would reject legitimate tenant URLs users paste and is a product decision,
 * not a code cleanup.
 */
const ALLOWED_HOSTS: readonly AllowedHost[] = [
  // LinkedIn
  hostWithSubdomains('linkedin.com'),
  // Swiss job boards
  hostWithSubdomains('jobs.ch'),
  hostWithSubdomains('jobcloud.ch'),
  hostWithSubdomains('jobup.ch'),
  hostWithSubdomains('jobscout24.ch'),
  // International job boards
  hostWithSubdomains('indeed.com'),
  hostWithSubdomains('indeed.ch'),
  hostWithSubdomains('indeed.de'),
  hostWithSubdomains('indeed.fr'),
  hostWithSubdomains('glassdoor.com'),
  hostWithSubdomains('glassdoor.ch'),
  hostWithSubdomains('monster.ch'),
  hostWithSubdomains('monster.com'),
  hostWithSubdomains('stepstone.ch'),
  hostWithSubdomains('stepstone.de'),
  hostWithSubdomains('xing.com'),
  hostWithSubdomains('karriere.at'),
  // Adzuna
  hostWithSubdomains('adzuna.ch'),
  hostWithSubdomains('adzuna.com'),
  hostWithSubdomains('adzuna.de'),
  hostWithSubdomains('adzuna.fr'),
  hostWithSubdomains('adzuna.co.uk'),
  // Multi-tenant ATS / recruiting platforms — see the note above.
  hostWithSubdomains('join.com'),
  hostWithSubdomains('greenhouse.io'),
  hostWithSubdomains('lever.co'),
  hostWithSubdomains('workday.com'),
  hostWithSubdomains('smartrecruiters.com'),
  hostWithSubdomains('breezy.hr'),
  hostWithSubdomains('recruitee.com'),
  hostWithSubdomains('teamtailor.com'),
  hostWithSubdomains('personio.de'),
  hostWithSubdomains('personio.ch'),
  hostWithSubdomains('ashbyhq.com'),
]

/**
 * Zod schema for validating request body.
 */
const ExtractJobUrlRequestSchema = z.object({
  url: z.string().url('Invalid URL format'),
})

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5,fr;q=0.3,de;q=0.2',
  'Cache-Control': 'no-cache',
} as const

/**
 * Check if a URL's hostname is from an allowed host.
 * Supports exact match and subdomain match.
 */
function isAllowedDomain(urlString: string): boolean {
  try {
    return isHostAllowed(new URL(urlString).hostname, ALLOWED_HOSTS)
  } catch {
    return false
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

    // Fetch the page. Redirects are followed one hop at a time and each hop is
    // re-checked against the allowlist and refused if it resolves into private
    // network space, so an open redirect on a job board cannot turn this
    // endpoint into a reader of internal services.
    let response: Response
    try {
      response = await safeFetch(url, {
        allowlist: ALLOWED_HOSTS,
        timeoutMs: FETCH_TIMEOUT_MS,
        maxRedirects: MAX_REDIRECTS,
        headers: FETCH_HEADERS,
      })
    } catch (fetchError) {
      if (fetchError instanceof BlockedRequestError) {
        return NextResponse.json(
          {
            error: 'Destination not allowed',
            message:
              'This URL, or a page it redirects to, is not a supported job board. Please copy and paste the job description manually.',
          },
          { status: 400 }
        )
      }
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
