import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_RESUME_LAYOUT, type ResumeLayoutModel } from './layout-settings'

/**
 * ONE OWNER, ASSERTED — the guard that fails if the two surfaces can drift
 * apart again.
 *
 * WHAT THIS IS FOR
 *
 * `resume-editor.tsx` and `resume-preview-wrapper.tsx` each used to declare the
 * same nineteen `useState` calls, load them with the same effect, cache them
 * with the same effect and persist them with the same hook. Nothing enforced
 * that the two copies agreed; they agreed because two files happened to be
 * edited together, and they had already stopped agreeing in places by the time
 * US-002 was written. Removing the duplication is not durable on its own — the
 * next person to add a layout control can reach for `useState` in whichever
 * file they have open, and nothing would notice until a user saw one surface
 * disagree with the other.
 *
 * WHY IT IS A SOURCE-LEVEL TEST AND NOT A BEHAVIOURAL ONE
 *
 * The property is structural: it is about where state is DECLARED, not about
 * what a particular render produces. A behavioural test can only ever catch the
 * drift that has already reached the screen, and only for the property it
 * happens to exercise — a second `useState` for `sidebarWidth` would sail past
 * a test that drives the title size. This asserts the shape directly, for all
 * nineteen properties at once, and the E2E suite asserts the behaviour that
 * shape produces.
 *
 * The keys come from `DEFAULT_RESUME_LAYOUT` at runtime rather than from a list
 * repeated here, so a twentieth layout property is covered the moment it is
 * added to the model.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM
 *
 * That the two surfaces RENDER identically. They do not share a render path —
 * the editor switches on the template itself, the wrapper goes through
 * `resume-preview.tsx` — and unifying those is not this story. This asserts
 * only that both read the same state from the same owner.
 */

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const SURFACES: ReadonlyArray<{ name: string; text: string }> = [
  {
    name: 'resume-editor.tsx',
    text: source('../components/dashboard/resume-editor.tsx'),
  },
  {
    name: 'resume-preview-wrapper.tsx',
    text: source('../components/dashboard/resume-preview-wrapper.tsx'),
  },
]

const LAYOUT_KEYS = Object.keys(DEFAULT_RESUME_LAYOUT) as (keyof ResumeLayoutModel)[]

/**
 * Matches an array-destructured state pair for a layout property —
 * `const [titleFontSize, setTitleFontSize] = useState(...)` — and NOT the
 * object destructuring both surfaces now use to unpack the shared model.
 */
function statePairPattern(key: string): RegExp {
  return new RegExp(`\\[\\s*${key}\\s*,\\s*set`)
}

describe('the layout model has exactly one owner', () => {
  it('covers all nineteen properties', () => {
    expect(LAYOUT_KEYS).toHaveLength(19)
  })

  for (const surface of SURFACES) {
    describe(surface.name, () => {
      it('calls the shared owner', () => {
        expect(surface.text).toContain('useResumeLayout(')
      })

      it.each(LAYOUT_KEYS)('does not hold its own useState for %s', (key) => {
        expect(statePairPattern(key).test(surface.text)).toBe(false)
      })

      /**
       * The four things the owner does. A surface that IMPORTS any of them is
       * doing the owner's job a second time, which is how two answers to one
       * question get built.
       *
       * Matched against import statements rather than against the whole file:
       * a comment that cites one of these by name to explain where the work
       * moved is exactly what a reader needs, and banning the words would push
       * the next author into writing a vaguer comment instead.
       */
      it.each([
        ['resolveResumeLayout', 'resolving the stores'],
        ['adoptCachedLayout', 'migrating a browser cache onto the account'],
        ['usePersistedLayout', 'writing the account'],
        ['serializeLayoutModel', 'writing the browser cache'],
      ])('does not import %s (%s belongs to the owner)', (symbol) => {
        const imported = new RegExp(`import[^;]*\\b${symbol}\\b[^;]*from`)
        expect(imported.test(surface.text)).toBe(false)
      })

      it('does not touch the layout cache key directly', () => {
        // The key is stated once, in `resume-layout-store.ts`. A second spelling
        // here would read or write a different browser's worth of settings and
        // report nothing when it missed.
        expect(surface.text).not.toContain('resume_slider_settings_')
      })
    })
  }
})
