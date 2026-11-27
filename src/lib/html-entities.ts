/**
 * The entities the resume rich-text editor writes into a stored value, and the
 * characters they stand for. A no-break space stays a no-break space, so the
 * Preview keeps the spacing that was typed.
 */
const TEXT_ENTITIES: Readonly<Record<string, string>> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
}

const WITH_NBSP = /&(?:nbsp|amp|lt|gt|quot|#39|#x27);/g
const WITHOUT_NBSP = /&(?:amp|lt|gt|quot|#39|#x27);/g

export interface DecodeHtmlEntitiesOptions {
  /**
   * Decode `&nbsp;` too. Word turns `&nbsp;` into a space before its tags are
   * removed and passes `false`: an `&nbsp;` that only forms once a tag inside
   * it is gone (`&nb<b>sp;</b>`) was never one, and stays text.
   */
  nbsp: boolean
}

/**
 * Decode text that holds no tags, in one pass, so a decoded `&` never starts a
 * second entity: `&amp;lt;` is the text `&lt;`, as the browser shows it.
 *
 * The result is text, never markup: callers hand it to React as a text node or
 * to a DOCX `TextRun`, both of which escape it. It needs no DOM, because the
 * Preview calls it during server rendering.
 */
export function decodeHtmlEntities(text: string, { nbsp }: DecodeHtmlEntitiesOptions): string {
  return text.replace(nbsp ? WITH_NBSP : WITHOUT_NBSP, (entity) => TEXT_ENTITIES[entity] ?? entity)
}
