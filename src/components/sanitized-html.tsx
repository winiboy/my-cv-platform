'use client'

import { useMemo } from 'react'
import { migrateTextToHtml, sanitizeHtml } from '@/lib/html-utils'
import { useBrowserRender } from '@/lib/hooks/use-browser-render'

/**
 * Exactly one source: stored rich HTML, or legacy plain text that has to be
 * migrated to HTML first. Migration also uses the DOM (it decodes entities),
 * so it cannot run on the server any more than sanitizing can.
 */
type SanitizedHtmlProps = { className?: string } & (
  | { html: string; plainText?: never }
  | { plainText: string; html?: never }
)

/**
 * Renders untrusted rich HTML after sanitizing it in the browser.
 *
 * `sanitizeHtml` parses with the DOM, which does not exist while a
 * `'use client'` component is rendered on the server. Rather than emit the raw
 * HTML there, the server and the hydration pass render the wrapper with no
 * content, and the sanitized HTML is filled in by the render that follows
 * hydration - see `useBrowserRender` for why that is hydration-safe.
 */
export function SanitizedHtml({ html, plainText, className }: SanitizedHtmlProps) {
  const inBrowser = useBrowserRender()
  const sanitized = useMemo(() => {
    if (!inBrowser) return ''
    return sanitizeHtml(plainText !== undefined ? migrateTextToHtml(plainText) : (html ?? ''))
  }, [inBrowser, html, plainText])

  if (!inBrowser) {
    return <div className={className} />
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitized }} />
}
