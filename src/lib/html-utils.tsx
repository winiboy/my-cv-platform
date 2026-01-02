/**
 * HTML utility functions for rich text editing
 * Handles HTML sanitization, conversion between HTML/plain text, and rendering
 */

/**
 * Sanitize HTML to prevent XSS attacks
 * Only allows safe formatting tags and inline styles
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''

  // Create a temporary div to parse HTML
  const temp = document.createElement('div')
  temp.innerHTML = html

  // Allowed tags
  const allowedTags = ['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'SPAN', 'FONT']

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
        return document.createTextNode(element.textContent || '')
      }

      // Normalize tags: <b> -> <strong>, <i> -> <em>, <font> -> <span>
      let tagName = element.tagName
      if (tagName === 'B') tagName = 'STRONG'
      if (tagName === 'I') tagName = 'EM'
      if (tagName === 'FONT') tagName = 'SPAN'

      // Create clean element
      const cleanElement = document.createElement(tagName)

      // Handle style attributes for SPAN (and converted FONT tags)
      if ((element.tagName === 'SPAN' || element.tagName === 'FONT') && (element.hasAttribute('style') || element.hasAttribute('face'))) {
        const style = element.getAttribute('style') || ''

        // Extract font-family and font-size from style
        let fontFamily = style.match(/font-family:\s*([^;]+)/)?.[1]
        const fontSize = style.match(/font-size:\s*([^;]+)/)?.[1]

        // For <font> tags, also check the deprecated 'face' attribute
        if (element.tagName === 'FONT' && element.hasAttribute('face') && !fontFamily) {
          fontFamily = element.getAttribute('face') || undefined
        }

        let cleanStyle = ''
        if (fontFamily) cleanStyle += `font-family: ${fontFamily};`
        if (fontSize) cleanStyle += `font-size: ${fontSize};`

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
  const cleanDiv = document.createElement('div')
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

  // Create temporary div to parse HTML
  const temp = document.createElement('div')
  temp.innerHTML = html

  // Convert specific elements to text equivalents
  // Convert <br> to \n
  temp.querySelectorAll('br').forEach(br => {
    br.replaceWith(document.createTextNode('\n'))
  })

  // Convert </p> to \n\n
  temp.querySelectorAll('p').forEach(p => {
    const textNode = document.createTextNode(p.textContent + '\n\n')
    p.replaceWith(textNode)
  })

  // Convert <li> to bullet points or numbers
  temp.querySelectorAll('ul > li').forEach(li => {
    const textNode = document.createTextNode('• ' + li.textContent + '\n')
    li.replaceWith(textNode)
  })

  temp.querySelectorAll('ol').forEach(ol => {
    Array.from(ol.children).forEach((li, index) => {
      if (li.tagName === 'LI') {
        const textNode = document.createTextNode(`${index + 1}. ${li.textContent}\n`)
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
 */
export function migrateTextToHtml(text: string): string {
  if (!text) return ''

  // If already HTML, return as is
  if (/<[^>]+>/.test(text)) return text

  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/)

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
        html += `<li>${content}</li>`
      })
      html += '</ul>'
      return
    }

    // Check if all lines are numbered
    if (lines.every(line => /^\d+[\.\)]\s/.test(line))) {
      html += '<ol>'
      lines.forEach(line => {
        const content = line.replace(/^\d+[\.\)]\s+/, '').trim()
        html += `<li>${content}</li>`
      })
      html += '</ol>'
      return
    }

    // Regular paragraph
    html += `<p>${para.replace(/\n/g, '<br>')}</p>`
  })

  return html || `<p>${text}</p>`
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
    // Legacy plain text - convert to HTML
    const converted = migrateTextToHtml(html)
    return (
      <div
        className="formatted-content"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(converted) }}
      />
    )
  }

  // HTML content - sanitize and render
  return (
    <div
      className="formatted-content"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  )
}
