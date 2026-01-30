import { NextRequest, NextResponse } from 'next/server'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

/**
 * Maximum allowed file size in bytes (5MB).
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024

/**
 * Supported MIME types for file uploads.
 */
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number]

/**
 * POST /api/tools/extract-text
 *
 * Extracts text content from uploaded PDF or DOCX files.
 * Used by the resume file upload component to convert documents to plain text.
 *
 * Request: multipart/form-data with a single 'file' field
 * Response: { success: true, text: string } or { error: string, message?: string }
 *
 * This is a public endpoint - no authentication required.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse form data
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json(
        { error: 'Invalid form data' },
        { status: 400 }
      )
    }

    // Get the file from form data
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided', message: 'Please upload a PDF or DOCX file' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: 'File too large',
          message: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        },
        { status: 400 }
      )
    }

    // Validate file type
    const mimeType = file.type as SupportedMimeType
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        {
          error: 'Unsupported file type',
          message: 'Only PDF and DOCX files are supported',
        },
        { status: 400 }
      )
    }

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let extractedText: string

    // Extract text based on file type
    if (mimeType === 'application/pdf') {
      extractedText = await extractTextFromPdf(buffer)
    } else {
      extractedText = await extractTextFromDocx(buffer)
    }

    // Validate that we extracted meaningful content
    const trimmedText = extractedText.trim()
    if (!trimmedText) {
      return NextResponse.json(
        {
          error: 'No text content',
          message: 'Could not extract any text from the file. The file may be empty or contain only images.',
        },
        { status: 422 }
      )
    }

    return NextResponse.json({
      success: true,
      text: trimmedText,
      fileName: file.name,
      fileSize: file.size,
    })
  } catch (error) {
    console.error('Error extracting text from file:', error)
    return NextResponse.json(
      {
        error: 'Extraction failed',
        message: error instanceof Error ? error.message : 'Failed to extract text from file',
      },
      { status: 500 }
    )
  }
}

/**
 * Extracts text content from a PDF buffer using pdf-parse v2.
 * Normalizes whitespace and removes excessive blank lines.
 */
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2 requires Uint8Array, convert from Buffer
  const data = new Uint8Array(buffer)
  const parser = new PDFParse({ data })
  const result = await parser.getText()
  // Clean up the parser to free resources
  await parser.destroy()
  return normalizeExtractedText(result.text)
}

/**
 * Extracts text content from a DOCX buffer using mammoth.
 * Extracts raw text without HTML formatting for plain text usage.
 */
async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return normalizeExtractedText(result.value)
}

/**
 * Normalizes extracted text by:
 * - Trimming leading/trailing whitespace
 * - Collapsing multiple consecutive blank lines into single blank lines
 * - Normalizing various whitespace characters to standard spaces
 */
function normalizeExtractedText(text: string): string {
  return text
    // Replace various whitespace characters with regular spaces
    .replace(/[\t\f\v]/g, ' ')
    // Collapse multiple spaces into single space
    .replace(/ +/g, ' ')
    // Collapse more than 2 consecutive newlines into double newline
    .replace(/\n{3,}/g, '\n\n')
    // Trim each line
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    // Final trim
    .trim()
}
