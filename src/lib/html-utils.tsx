/**
 * HTML utility functions for rich text editing
 * Handles HTML sanitization, conversion between HTML/plain text, and rendering
 */

// This import is circular: sanitized-html imports sanitizeHtml and
// migrateTextToHtml from here. That is safe because every binding involved is
// a function DECLARATION, which ESM hoists and
// initialises during module instantiation - so whichever of the two modules is
// evaluated second already finds the other's binding defined rather than in the
// temporal dead zone. Converting either to a `const` arrow function would break
// that at import time, not at render time.
import { SanitizedHtml } from '@/components/sanitized-html'

/**
 * Sanitize HTML to prevent XSS attacks
 * Only allows safe formatting tags and inline styles
 *
 * Client-only: requires `document`.
 */
export function sanitizeHtml(html: string): string {
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

/**
 * Convert HTML to plain text
 * Strips all HTML tags and preserves line breaks
 */
export function htmlToPlainText(html: string): string {
  if (!html) return ''

  // Check if it's already plain text (no HTML tags)
  if (!/<[^>]+>/.test(html)) return html

  // Parse in an inert document for the same reason as sanitizeHtml
  const inertDoc = document.implementation.createHTMLDocument('')
  const temp = inertDoc.createElement('div')
  temp.innerHTML = html

  // Convert specific elements to text equivalents
  // Convert <br> to \n
  temp.querySelectorAll('br').forEach(br => {
    br.replaceWith(inertDoc.createTextNode('\n'))
  })

  // Convert </p> to \n\n
  temp.querySelectorAll('p').forEach(p => {
    const textNode = inertDoc.createTextNode(p.textContent + '\n\n')
    p.replaceWith(textNode)
  })

  // Convert <li> to bullet points or numbers
  temp.querySelectorAll('ul > li').forEach(li => {
    const textNode = inertDoc.createTextNode('• ' + li.textContent + '\n')
    li.replaceWith(textNode)
  })

  temp.querySelectorAll('ol').forEach(ol => {
    Array.from(ol.children).forEach((li, index) => {
      if (li.tagName === 'LI') {
        const textNode = inertDoc.createTextNode(`${index + 1}. ${li.textContent}\n`)
        li.replaceWith(textNode)
      }
    })
  })

  // Get clean text content
  let text = temp.textContent || ''

  // Clean up extra whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim()

  return text
}

/**
 * Convert plain text to HTML
 * Detects line breaks, bullet points, and numbered lists
 *
 * Client-only: requires `document`.
 */
export function migrateTextToHtml(text: string): string {
  if (!text) return ''

  // If already HTML, return as is
  if (/<[^>]+>/.test(text)) return text

  // Past this point the input has no complete tag, but that does not make it
  // safe text: `<img src=x onerror=...//` has no closing `>` and would be
  // completed by the `>` of the wrapping `</p>`. So every piece of text is
  // escaped before it is wrapped.
  //
  // Tagless input can also be HTML the editor saved itself: a single typed
  // line is stored as its serialized text node, e.g. `R&amp;D &lt; 5%`. It has
  // always been rendered as HTML (showing `R&D < 5%`), so entities are decoded
  // first; otherwise escaping would double-encode them on every save.
  //
  // Both helpers are defined inline because this function is injected via
  // toString() in e2e tests, where module-level helpers do not exist.
  const decodeEntities = (value: string): string => {
    // Markup assigned to a textarea is parsed as RCDATA: entities are decoded
    // but no elements are created, so nothing in the input can load or run.
    // That parse also normalizes CRLF and lone CR to LF, so text stored with
    // Windows line endings now splits into paragraphs where it previously
    // carried a stray CR into the output; that difference is accepted.
    const textarea = document.createElement('textarea')
    textarea.innerHTML = value
    return textarea.value
  }
  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  // Decoded once up front so that bullet and number detection see the text
  // as rendered (a stored `&bull; item` is a bullet).
  const decoded = decodeEntities(text)

  // Split into paragraphs
  const paragraphs = decoded.split(/\n\n+/)

  let html = ''

  paragraphs.forEach(para => {
    para = para.trim()
    if (!para) return

    const lines = para.split('\n').filter(line => line.trim())

    // Check if all lines are bullet points
    if (lines.every(line => /^[•\-\*]\s/.test(line))) {
      html += '<ul>'
      lines.forEach(line => {
        const content = line.replace(/^[•\-\*]\s+/, '').trim()
        html += `<li>${escapeHtml(content)}</li>`
      })
      html += '</ul>'
      return
    }

    // Check if all lines are numbered
    if (lines.every(line => /^\d+[\.\)]\s/.test(line))) {
      html += '<ol>'
      lines.forEach(line => {
        const content = line.replace(/^\d+[\.\)]\s+/, '').trim()
        html += `<li>${escapeHtml(content)}</li>`
      })
      html += '</ol>'
      return
    }

    // Regular paragraph
    html += `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`
  })

  return html || `<p>${escapeHtml(decoded)}</p>`
}

/**
 * Render formatted HTML in React templates
 * Used in resume templates to display formatted content
 */
export function renderFormattedHtml(html: string | null | undefined): React.ReactNode {
  if (!html) return null

  // Check if content is HTML (contains tags)
  const isHtml = /<[^>]+>/.test(html)

  if (!isHtml) {
    // Legacy plain text - converted to HTML in the browser, like sanitizing
    return <SanitizedHtml className="formatted-content" plainText={html} />
  }

  // HTML content - sanitized in the browser, see SanitizedHtml
  return <SanitizedHtml className="formatted-content" html={html} />
}
