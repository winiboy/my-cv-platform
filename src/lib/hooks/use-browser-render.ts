'use client'

import { useSyncExternalStore } from 'react'

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
 * Whether this render is happening in the browser with the DOM available.
 *
 * `'use client'` components are still rendered on the server for the initial
 * HTML, where `document` does not exist. Anything derived from the DOM - a
 * sanitized string, the plain-text projection of stored HTML - therefore cannot
 * be produced during that render, nor during hydration, where the markup has to
 * match what the server sent or React warns and discards it.
 *
 * `useSyncExternalStore` reports the server snapshot for both of those passes
 * and the client snapshot for every render after, which is exactly the
 * distinction needed: render a neutral placeholder while this is `false`, and
 * the real value once it turns `true`. A component mounted only on the client
 * is not hydrating, so it gets `true` on its first render and never shows the
 * placeholder at all.
 */
export function useBrowserRender(): boolean {
  return useSyncExternalStore(subscribeNever, isBrowserRender, isServerRender)
}
