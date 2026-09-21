/**
 * Escapes a plain-text value for safe interpolation into HTML text or a
 * quoted attribute value.
 *
 * `&` is replaced first so the entities produced by the later replacements are
 * not themselves re-escaped. `null` and `undefined` become an empty string so
 * optional fields can be interpolated without a separate guard.
 *
 * Pure and DOM-free on purpose: it runs identically on the server, in the
 * browser, and under the node test environment.
 */
export function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
