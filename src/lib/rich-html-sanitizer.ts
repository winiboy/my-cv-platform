/**
 * The allowlist sanitizer for the rich text the editors store: only safe
 * formatting tags and three inline styles survive.
 *
 * Needs a DOM (`document`, `Node`). `html-utils.tsx` re-exports this very
 * function as `sanitizeHtml`, which the browser bundle calls; the cover-letter
 * PDF renderer (`src/lib/pdf/render-cover-letter.ts`) runs it inside its
 * headless page, so the PDF is sanitized by the same rules as the screen
 * without a second copy of them on the server.
 *
 * SELF-CONTAINED BY CONTRACT. That renderer, and `e2e/html-sanitizer.spec.ts`,
 * hand the function to a page as its source text, where module scope does not
 * exist: the body must reference nothing but its argument and DOM globals. An
 * import, or a helper moved out of the body, would make every cover-letter PDF
 * fail at render time and the sanitizer spec fail with a ReferenceError.
 */
export function sanitizeRichHtml(html: string): string {
  if (!html) return ''

  // Parse in an inert document: a div owned by the live document fetches and
  // runs handlers such as <img onerror> during parsing, before the allowlist
  // below has had a chance to remove them
  const inertDoc = document.implementation.createHTMLDocument('')
  const temp = inertDoc.createElement('div')
  temp.innerHTML = html

  // Allowed tags (DIV needed for text alignment)
  const allowedTags = ['P', 'DIV', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'SPAN', 'FONT']

  // Recursive function to clean nodes
  function cleanNode(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.cloneNode(true)
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element

      // Check if tag is allowed
      if (!allowedTags.includes(element.tagName)) {
        // If not allowed, return its text content
        return inertDoc.createTextNode(element.textContent || '')
      }

      // Normalize tags: <b> -> <strong>, <i> -> <em>, <font> -> <span>
      let tagName = element.tagName
      if (tagName === 'B') tagName = 'STRONG'
      if (tagName === 'I') tagName = 'EM'
      if (tagName === 'FONT') tagName = 'SPAN'

      // Create clean element
      const cleanElement = inertDoc.createElement(tagName)

      // Handle style attributes
      if (element.hasAttribute('style') || element.hasAttribute('face')) {
        const style = element.getAttribute('style') || ''

        // Extract allowed styles
        let fontFamily = style.match(/font-family:\s*([^;]+)/)?.[1]
        const fontSize = style.match(/font-size:\s*([^;]+)/)?.[1]
        const textAlign = style.match(/text-align:\s*([^;]+)/)?.[1]

        // For <font> tags, also check the deprecated 'face' attribute
        if (element.tagName === 'FONT' && element.hasAttribute('face') && !fontFamily) {
          fontFamily = element.getAttribute('face') || undefined
        }

        let cleanStyle = ''
        if (fontFamily) cleanStyle += `font-family: ${fontFamily};`
        if (fontSize) cleanStyle += `font-size: ${fontSize};`
        if (textAlign) cleanStyle += `text-align: ${textAlign};`

        if (cleanStyle) cleanElement.setAttribute('style', cleanStyle)
      }

      // Clean and append child nodes
      Array.from(element.childNodes).forEach(child => {
        const cleanChild = cleanNode(child)
        if (cleanChild) cleanElement.appendChild(cleanChild)
      })

      return cleanElement
    }

    return null
  }

  // Clean all nodes
  const cleanDiv = inertDoc.createElement('div')
  Array.from(temp.childNodes).forEach(child => {
    const cleanChild = cleanNode(child)
    if (cleanChild) cleanDiv.appendChild(cleanChild)
  })

  return cleanDiv.innerHTML
}
