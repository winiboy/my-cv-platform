/**
 * Type declarations for pdf-parse v1.x
 * This module provides a simple function to extract text from PDF buffers.
 */
declare module 'pdf-parse' {
  interface PDFInfo {
    PDFFormatVersion?: string
    IsAcroFormPresent?: boolean
    IsXFAPresent?: boolean
    Title?: string
    Author?: string
    Subject?: string
    Creator?: string
    Producer?: string
    CreationDate?: string
    ModDate?: string
  }

  interface PDFMetadata {
    _metadata?: Record<string, unknown>
  }

  interface PDFData {
    /** Number of pages in the PDF */
    numpages: number
    /** Number of rendered pages */
    numrender: number
    /** PDF info object */
    info: PDFInfo
    /** PDF metadata */
    metadata: PDFMetadata | null
    /** PDF version */
    version: string
    /** Extracted text content from all pages */
    text: string
  }

  interface PDFOptions {
    /** First page to extract (1-indexed, default: 1) */
    pagerender?: (pageData: unknown) => Promise<string>
    /** Maximum pages to extract (default: 0 = all) */
    max?: number
    /** PDF.js worker source */
    version?: string
  }

  /**
   * Parse a PDF buffer and extract text content.
   * @param dataBuffer - Buffer containing PDF data
   * @param options - Optional parsing configuration
   * @returns Promise resolving to PDF data including extracted text
   */
  function pdfParse(dataBuffer: Buffer, options?: PDFOptions): Promise<PDFData>

  export = pdfParse
}
