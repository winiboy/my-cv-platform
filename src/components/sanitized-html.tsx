'use client'

import { useMemo } from 'react'
import { sanitizeHtml } from '@/lib/html-utils'
import { useBrowserRender } from '@/lib/hooks/use-browser-render'

interface SanitizedHtmlProps {
  html: string
  className?: string
}

/**
 * Renders untrusted rich HTML after sanitizing it in the browser.
 *
 * `sanitizeHtml` parses with the DOM, which does not exist while a
 * `'use client'` component is rendered on the server. Rather than emit the raw
 * HTML there, the server and the hydration pass render the wrapper with no
 * content, and the sanitized HTML is filled in by the render that follows
 * hydration - see `useBrowserRender` for why that is hydration-safe.
 */
export function SanitizedHtml({ html, className }: SanitizedHtmlProps) {
  const inBrowser = useBrowserRender()
  const sanitized = useMemo(() => (inBrowser ? sanitizeHtml(html) : ''), [inBrowser, html])

  if (!inBrowser) {
    return <div className={className} />
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitized }} />
}
