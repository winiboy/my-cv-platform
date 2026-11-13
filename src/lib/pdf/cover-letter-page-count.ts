import { coverLetterExportLanguage, type CoverLetterPdfFields } from '@/lib/cover-letter-pdf-html'
import type { CoverLetterLanguage } from '@/lib/cover-letter-language'
import type { CoverLetterSenderDetails } from '@/lib/cover-letter-sender'
import { measureCoverLetterPageCount } from './render-cover-letter'
import { PdfRenderError } from './render-preview'
import { tryAcquirePdfRenderSlot } from './render-slots'

/**
 * How many pages a letter prints on, for the AI routes' one-page check
 * (cover-letter-one-page, US-002), under the PDF export's own rules: a render
 * slot shared with every PDF render, the caller's time limit, and the
 * language and date line the PDF route would print the letter with
 * (`coverLetterExportLanguage`).
 *
 * @param pageLanguage The language of the page that asked, for a letter whose
 *   own language cannot be told, as the PDF route takes it.
 * @param timeoutMs The longest the whole measurement may take, browser launch
 *   included (`COVER_LETTER_MEASUREMENT_TIMEOUT_MS` at most).
 * @throws PdfRenderError when every slot is taken (stage `launch`) or the
 *   measurement fails or times out. The caller keeps the letter as it is.
 */
export async function countCoverLetterPages(
  coverLetter: CoverLetterPdfFields,
  senderDetails: CoverLetterSenderDetails,
  pageLanguage: CoverLetterLanguage,
  timeoutMs: number,
): Promise<number> {
  const slot = tryAcquirePdfRenderSlot()
  if (!slot) throw new PdfRenderError('launch', 'Every PDF render slot is taken')
  try {
    const { language, currentDate } = coverLetterExportLanguage(coverLetter, pageLanguage, new Date())
    return await measureCoverLetterPageCount({
      coverLetter,
      senderDetails,
      currentDate,
      language,
      timeoutMs,
    })
  } finally {
    slot.release()
  }
}

/**
 * The stage and the cause's error name only: a browser error's message can
 * quote the letter it was evaluating, which is never logged.
 */
export function logPageCountFailure(label: string, error: unknown): void {
  const stage = error instanceof PdfRenderError ? error.stage : 'unknown'
  const cause = error instanceof PdfRenderError ? error.cause : error
  console.error(`[${label}] One-page check could not measure the letter at ${stage}.`, cause instanceof Error ? cause.name : '')
}
