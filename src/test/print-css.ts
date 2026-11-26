import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * `globals.css` split at its print block, for unit tests that hold a
 * template's printed page margins equal to its geometry. A printed margin is
 * only observable in a browser's print, which the unit suite does not have;
 * the e2e specs print the PDF and measure it.
 */
export function readGlobalsCss(): { screen: string; print: string } {
  const globals = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const start = globals.indexOf('@media print')
  if (start < 0) throw new Error('globals.css has no print block')
  return { screen: globals.slice(0, start), print: globals.slice(start) }
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The declarations of the rule whose whole selector list is `selector`, as
 * trimmed `property: value` strings in source order; empty when no rule has
 * exactly that selector. Whitespace in `selector` matches any whitespace, and
 * a list's commas any line breaks after them. `@page` rules are found by their
 * prelude, e.g. `@page swiss-health:first`.
 */
export function ruleDeclarations(css: string, selector: string): string[] {
  const pattern = selector
    .trim()
    .split(/\s*,\s*/)
    .map((part) => part.split(/\s+/).map(escapeRegExp).join('\\s+'))
    .join(',\\s*')
  const match = new RegExp(`(?:^|[\\n}])\\s*${pattern}\\s*\\{([^}]*)\\}`).exec(css)
  if (!match) return []
  return match[1]
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
}
