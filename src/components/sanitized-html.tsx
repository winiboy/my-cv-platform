'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { sanitizeHtml } from '@/lib/html-utils'

interface SanitizedHtmlProps {
  html: string
  className?: string
}

// Nothing ever changes the answer to "is this a browser render", so there is
// nothing to subscribe to.
function subscribeNever(): () => void {
  return () => {}
}

function isBrowserRender(): boolean {
  return true
}

function isServerRender(): boolean {
  return false
}

/**
 * Renders untrusted rich HTML after sanitizing it in the browser.
 *
 * `sanitizeHtml` parses with the DOM, which does not exist while a
 * `'use client'` component is rendered on the server. Rather than emit the raw
 * HTML there, the server and the hydration pass render the wrapper with no
 * content, and the sanitized HTML is filled in by the render that follows
 * hydration. `useSyncExternalStore` reports the server snapshot during both of
 * those passes, so the markup matches and hydration does not warn. A component
 * mounted only on the client (the editor's live preview) is not hydrating, so
 * it gets the content on its first render.
 */
export function SanitizedHtml({ html, className }: SanitizedHtmlProps) {
  const inBrowser = useSyncExternalStore(subscribeNever, isBrowserRender, isServerRender)
  const sanitized = useMemo(() => (inBrowser ? sanitizeHtml(html) : ''), [inBrowser, html])

  if (!inBrowser) {
    return <div className={className} />
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitized }} />
}
