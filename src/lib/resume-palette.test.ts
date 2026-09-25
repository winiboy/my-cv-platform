import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import type { ResumeTemplate } from '@/types/database'
import { PREVIEW_PALETTE, TAILWIND_DEFAULT_TOKENS, THEME_TOKENS, type PreviewColour } from './resume-palette'
import { PREVIEW_TEXT_ALPHA, type PreviewAlpha } from './resume-text-opacity'

/**
 * Part 3 US-003, extended by US-006: what a template paints may not drift from
 * what the Preview's source declares, in either direction.
 *
 * Forward: every value in `resume-palette.ts` equals what `globals.css`,
 * Tailwind's default theme or the template declares.
 *
 * Reverse: the colours a template draws outside its `print:hidden` editing
 * controls are listed in `DRAWN` below with the number of times the template
 * uses each, and each resolves to a palette entry, to a translucency
 * `resume-text-opacity.ts` declares, or to an exclusion that names its owner.
 * A colour added, removed, or used a different number of times fails here.
 *
 * Translucency is part of what is painted, so the scan reads it too (US-006):
 * the `opacity-*` utilities and `opacity` styles a template sets, alongside the
 * colour modifiers (`text-white/90`) and `rgba()` literals it already read. The
 * translucency of TEXT — an `opacity-*` utility, a `text-…/…` modifier, an
 * inline `rgba()` text colour — must be one `PREVIEW_TEXT_ALPHA` declares for
 * that template, written the same way, and every entry it declares must be
 * drawn. A translucent FILL is not text: it keeps an owner, because the colour
 * the DOCX draws for it is a composite over what the DOCX itself draws behind
 * it, not a palette colour.
 *
 * Since US-007 the bars, pills, chips, rules and cards the Preview draws are
 * palette entries like any other colour, and the only owners left are ones no
 * later story retires: the user's colour, the page paper, the photo zone, the
 * later stops of a gradient, the two the Preview draws see-through, which are
 * drawn but are not opaque colours — modern's skill-bar track, written as a
 * composite, and creative's header circles, drawn as rasters with real alpha —
 * and creative's timeline dot, which is drawable and deliberately not drawn.
 *
 * Covered:
 * - Class lists, read fully or rejected. Every named or arbitrary-value colour
 *   utility counts (`text-slate-700`, `ring-red-500`, `text-[#ff0000]`), as does
 *   every `opacity-*` utility; a class
 *   list built from anything but literals, templates, ternaries and `&&` / `||`
 *   / `??` fails the test with its file and line.
 * - Style objects, which must be object literals: a `style` that is a variable
 *   or call, or holds a spread, shorthand or computed entry, fails the test with
 *   its file and line, as does a spread attribute.
 * - Any value under the four colour keys `color`, `borderColor`, `background`
 *   and `backgroundColor`, and under `opacity`: a literal is counted as written,
 *   anything else as its expression (`style color: {accentColor}`).
 * - A literal colour-like string under any other style key or in any attribute
 *   (`borderBottom: '2px solid #ff0000'`, `fill="#FFFFFF"`).
 *
 * Not covered:
 * - A non-literal value under any other style key or in an attribute — a
 *   variable or interpolation in a border shorthand or `boxShadow`, an SVG
 *   `fill` / `stroke`, the HTML `color` attribute. None of these is a text
 *   colour, and none of today's templates uses one.
 * - Which element a colour or a translucency sits on: swapping two elements'
 *   colours without changing the counts passes here. The per-element DOCX tests
 *   and `pnpm test:parity` cover the sampled elements.
 * - Removing a `PREVIEW_TEXT_ALPHA` entry whose written form another entry of
 *   the same template shares — deleting `modern.certDate`, whose
 *   `rgba(255,255,255,0.6)` `modern.contactLabel` also writes. The forms drawn
 *   and the forms declared still match, because this compares forms, not
 *   entries; the DOCX loses the element, which `docx-text-opacity.test.ts`
 *   catches on a generated document, and `tsc` catches at the call site.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf-8')

/** The `--color-*` declarations of one `@theme` block, by token name. */
function colourTokens(css: string, block: RegExp, label: string): Map<string, string> {
  const body = block.exec(css)
  if (!body) throw new Error(`${label} has no ${block.source} block`)
  const tokens = new Map<string, string>()
  for (const [, name, value] of body[1].matchAll(/--color-([\w-]+):\s*([^;]+);/g)) {
    if (tokens.has(name)) throw new Error(`${label} declares --color-${name} twice`)
    tokens.set(name, value.trim())
  }
  return tokens
}

const globals = colourTokens(read('src/app/globals.css'), /@theme inline\s*\{([\s\S]*?)\n\}/, 'globals.css')
const tailwindDefaults = colourTokens(
  read('node_modules/tailwindcss/theme.css'),
  /@theme default\s*\{([\s\S]*?)\n\}/,
  'tailwindcss/theme.css',
)

const TEMPLATES = Object.keys(PREVIEW_PALETTE) as ResumeTemplate[]
const templateFile = (template: ResumeTemplate) => `src/components/dashboard/resume-templates/${template}-template.tsx`

// ---------------------------------------------------------------------------
// Scanning a template for the colours it draws
// ---------------------------------------------------------------------------
//
// The scan fails closed. A colour it recognises is counted and must be in
// `DRAWN`; a colour form it cannot read — a class list or style it cannot see
// into, a colour inside a shorthand — is reported as a problem and fails the
// test, rather than being skipped.

const COLOUR_NAMES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
/** Utility families that take a colour. `border` may carry a side (`border-l-…`). */
const COLOUR_FAMILIES =
  'text|bg|border(?:-[xytrblse])?|from|via|to|ring|ring-offset|outline|divide|decoration|accent|caret|placeholder|fill|stroke|shadow'
/**
 * A colour utility, with any variant prefix and opacity modifier — `text-slate-700`,
 * `hover:bg-white/10`, `ring-red-500` — or any arbitrary value in a colour family,
 * `text-[#ff0000]`, which is counted whatever it holds, so it needs an inventory entry.
 */
const COLOUR_UTILITY = new RegExp(
  `^(?:[a-z0-9-]+:)*(?:${COLOUR_FAMILIES})-(?:(?:(?:${COLOUR_NAMES})-\\d{2,3}|white|black)(?:/\\d+)?|\\[[^\\]]+\\])$`,
)
/** A Tailwind opacity utility, with any variant prefix: `opacity-80`, `group-hover:opacity-100`. */
const OPACITY_UTILITY = /^(?:[a-z0-9-]+:)*opacity-(\d{1,3})$/
const STYLE_COLOUR_KEYS = new Set(['color', 'borderColor', 'background', 'backgroundColor'])
/** Style keys read for their literal value even though they hold no colour. */
const STYLE_OPACITY_KEY = 'opacity'
/** Values that paint nothing. */
const NOT_A_COLOUR = new Set(['none', 'transparent', 'currentColor', 'inherit'])

/** CSS named colours (CSS Color 4), less the keywords that paint nothing. */
const NAMED_COLOURS =
  'aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|' +
  'cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|' +
  'darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|' +
  'darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|' +
  'firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|' +
  'hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|' +
  'lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|' +
  'lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|' +
  'mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|' +
  'midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|' +
  'palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|' +
  'rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|' +
  'slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|' +
  'whitesmoke|yellow|yellowgreen'
/** Anything in a string that is, or contains, a CSS colour. */
const COLOUR_LIKE = new RegExp(
  `#[0-9a-f]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\\s*\\(|(?<![\\w-])(?:${NAMED_COLOURS})(?![\\w-])`,
  'i',
)

/** Every string literal inside an expression, in source order. */
function literals(node: ts.Node, out: string[] = []): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push(node.text)
  } else if (ts.isTemplateExpression(node)) {
    out.push(node.head.text)
    for (const span of node.templateSpans) {
      literals(span.expression, out)
      out.push(span.literal.text)
    }
  } else {
    ts.forEachChild(node, (child) => {
      literals(child, out)
    })
  }
  return out
}

function attribute(element: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return element.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name,
  )
}

/** A value whose text the scan cannot see; it fails the test at `node`. */
class Unreadable extends Error {
  constructor(readonly node: ts.Node, what: string) {
    super(what)
  }
}

/**
 * The strings a class-list expression can evaluate to. Literals, templates,
 * conditionals and `&&` / `||` / `??` are read; any other value — a variable, a
 * call, a property — could hold any class, so it is unreadable.
 */
function classStrings(node: ts.Expression): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text]
  if (ts.isParenthesizedExpression(node)) return classStrings(node.expression)
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.flatMap((span) => [...classStrings(span.expression), span.literal.text])]
  }
  if (ts.isConditionalExpression(node)) return [...classStrings(node.whenTrue), ...classStrings(node.whenFalse)]
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return classStrings(node.right)
    if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
      return [...classStrings(node.left), ...classStrings(node.right)]
    }
  }
  throw new Unreadable(node, `a class list built from \`${node.getText()}\``)
}

function classes(element: ts.JsxOpeningLikeElement): string[] {
  const initializer = attribute(element, 'className')?.initializer
  if (!initializer) return []
  const expression = ts.isJsxExpression(initializer) ? initializer.expression : initializer
  if (!expression) return []
  return classStrings(expression).join(' ').split(/\s+/).filter(Boolean)
}

/**
 * Colour uses split by element, where one class is used by elements with
 * different owners. The use is keyed `<class> @ <the element's classes, sorted>`.
 */
const SPLIT_BY_ELEMENT: Readonly<Partial<Record<ResumeTemplate, readonly string[]>>> = {
  creative: ['text-white', 'bg-white', 'from-purple-500', 'to-pink-500'],
}

interface Scan {
  /** Each colour use of the template, counted. */
  uses: Record<string, number>
  /** Colour forms the scan could not read, each as `file:line: what`. They fail the test. */
  problems: string[]
}

/**
 * Each colour use of a template, counted. A utility is keyed as written; an
 * inline colour as `style color: <literal>`, a colour computed at runtime as
 * `style color: {<expression>}`, a colour in any other style property as
 * `style <key>: <literal>`, and a colour in any other attribute (an SVG `fill`,
 * `stroke`, `stop-color`) as `attr <name>: <literal>`.
 */
function scanTemplate(template: ResumeTemplate): Scan {
  const file = templateFile(template)
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const uses: Record<string, number> = {}
  const problems: string[] = []
  const count = (use: string) => {
    uses[use] = (uses[use] ?? 0) + 1
  }
  const problem = (node: ts.Node, what: string) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
    problems.push(`${file}:${line}: ${what}`)
  }
  const split = new Set(SPLIT_BY_ELEMENT[template] ?? [])

  const recordStyle = (style: ts.JsxAttribute) => {
    const initializer = style.initializer
    const object = initializer && ts.isJsxExpression(initializer) ? initializer.expression : undefined
    if (!object || !ts.isObjectLiteralExpression(object)) {
      problem(style, `a style that is not an object literal (\`${initializer?.getText() ?? ''}\`)`)
      return
    }
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
        problem(property, `a style entry the scan cannot read (\`${property.getText()}\`)`)
        continue
      }
      const key = property.name.text
      const value = property.initializer
      if (STYLE_COLOUR_KEYS.has(key)) {
        if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
          if (!NOT_A_COLOUR.has(value.text)) count(`style ${key}: ${value.text}`)
        } else {
          count(`style ${key}: {${value.getText()}}`)
        }
        continue
      }
      if (key === STYLE_OPACITY_KEY) {
        count(ts.isNumericLiteral(value) ? `style ${key}: ${value.text}` : `style ${key}: {${value.getText()}}`)
        continue
      }
      for (const text of literals(value)) if (COLOUR_LIKE.test(text)) count(`style ${key}: ${text}`)
    }
  }

  const record = (element: ts.JsxOpeningLikeElement, names: readonly string[]) => {
    const signature = [...names].sort().join(' ')
    for (const name of names) {
      if (COLOUR_UTILITY.test(name)) count(split.has(name) ? `${name} @ ${signature}` : name)
      else if (OPACITY_UTILITY.test(name)) count(name)
    }
    for (const property of element.attributes.properties) {
      if (ts.isJsxSpreadAttribute(property)) {
        problem(property, `spread attributes (\`${property.getText()}\`) could carry any class or style`)
        continue
      }
      const name = property.name.getText()
      if (name === 'className' || name === 'key') continue
      if (name === 'style') {
        recordStyle(property)
        continue
      }
      const initializer = property.initializer
      if (!initializer) continue
      // A handler's strings are code, and JSX passed as a prop is scanned as elements.
      const expression = ts.isJsxExpression(initializer) ? initializer.expression : initializer
      if (
        !expression ||
        ts.isArrowFunction(expression) ||
        ts.isFunctionExpression(expression) ||
        ts.isJsxElement(expression) ||
        ts.isJsxSelfClosingElement(expression) ||
        ts.isJsxFragment(expression)
      ) {
        continue
      }
      for (const text of literals(initializer)) {
        if (!NOT_A_COLOUR.has(text) && COLOUR_LIKE.test(text)) count(`attr ${name}: ${text}`)
      }
    }
  }

  // JSX passed as a prop (`icon={<svg … />}`) is drawn where the element is, so
  // attribute values are walked with the element's own visibility.
  const visitAttributes = (element: ts.JsxOpeningLikeElement, hidden: boolean) => {
    for (const property of element.attributes.properties) {
      ts.forEachChild(property, (child) => {
        visit(child, hidden)
      })
    }
  }
  const visitElement = (element: ts.JsxOpeningLikeElement, hidden: boolean): boolean => {
    let names: string[]
    try {
      names = classes(element)
    } catch (error) {
      if (!(error instanceof Unreadable)) throw error
      if (!hidden) problem(error.node, error.message)
      names = []
    }
    const inside = hidden || names.includes('print:hidden')
    if (!inside) record(element, names)
    visitAttributes(element, inside)
    return inside
  }
  const visit = (node: ts.Node, hidden: boolean): void => {
    if (ts.isJsxElement(node)) {
      const inside = visitElement(node.openingElement, hidden)
      for (const child of node.children) visit(child, inside)
      return
    }
    if (ts.isJsxSelfClosingElement(node)) {
      visitElement(node, hidden)
      return
    }
    ts.forEachChild(node, (child) => {
      visit(child, hidden)
    })
  }
  visit(source, false)
  return { uses, problems }
}

// ---------------------------------------------------------------------------
// What each template draws
// ---------------------------------------------------------------------------

/** Why a drawn colour has no palette entry, and whose it is. */
type Owner =
  | "the user's colour, from the layout model"
  | "later gradient stops: DOCX shading is solid, so the DOCX takes the first stop (a recorded LIMITATION)"
  | 'the page paper: the DOCX page is white and writes no fill'
  | 'the photo zone: the photo is browser-local and not in the DOCX (a recorded DECISION)'
  | 'a translucent fill: the DOCX draws the composite over what it draws behind it (src/lib/resume-graphics.ts)'
  | 'a translucent shape: the DOCX draws it as a floating raster whose alpha channel carries the tint (src/lib/resume-graphics.ts)'
  | 'the experience timeline dot: the DOCX does not draw it, by an owner decision recorded in src/lib/resume-graphics.ts'

/**
 * `translucent` marks text the Preview draws see-through: its colour is not a
 * palette entry but the tint `resume-text-opacity.ts` declares, resolved
 * against that module below.
 */
type Drawn =
  | { count: number; palette: string }
  | { count: number; translucent: true }
  | { count: number; excluded: Owner }

const USER: Owner = "the user's colour, from the layout model"
const STOPS: Owner = 'later gradient stops: DOCX shading is solid, so the DOCX takes the first stop (a recorded LIMITATION)'
const PAGE: Owner = 'the page paper: the DOCX page is white and writes no fill'
const PHOTO: Owner = 'the photo zone: the photo is browser-local and not in the DOCX (a recorded DECISION)'
const COMPOSITE: Owner =
  'a translucent fill: the DOCX draws the composite over what it draws behind it (src/lib/resume-graphics.ts)'
const RASTER: Owner =
  'a translucent shape: the DOCX draws it as a floating raster whose alpha channel carries the tint (src/lib/resume-graphics.ts)'
const DOT: Owner =
  'the experience timeline dot: the DOCX does not draw it, by an owner decision recorded in src/lib/resume-graphics.ts'

const DRAWN: Readonly<Record<ResumeTemplate, Readonly<Record<string, Drawn>>>> = {
  professional: {
    'text-white': { count: 1, palette: 'white' },
    'border-white': { count: 4, palette: 'white' },
    "style color: oklch(0.2 0 0)": { count: 7, palette: 'heading' },
    "style borderColor: oklch(0.2 0 0)": { count: 3, palette: 'heading' },
    "style color: oklch(0.3 0 0)": { count: 3, palette: 'body' },
    "style color: oklch(0.4 0 0)": { count: 4, palette: 'meta' },
    "style color: oklch(0.5 0 0)": { count: 3, palette: 'date' },
    'style backgroundColor: white': { count: 1, excluded: PAGE },
    'style backgroundColor: {activeSidebarColor}': { count: 1, excluded: USER },
    // Key-achievement descriptions, skill items and language levels.
    'opacity-80': { count: 3, translucent: true },
  },
  modern: {
    'text-slate-900': { count: 2, palette: 'slate-900' },
    'text-slate-700': { count: 3, palette: 'slate-700' },
    'text-white': { count: 1, palette: 'white' },
    'style color: #1a1a1a': { count: 3, palette: 'heading' },
    'style color: #6b7280': { count: 3, palette: 'meta' },
    'style color: #374151': { count: 2, palette: 'experienceBody' },
    'style color: #FFFFFF': { count: 9, palette: 'white' },
    'attr stroke: #FFFFFF': { count: 5, palette: 'white' },
    'attr fill: #FFFFFF': { count: 1, palette: 'white' },
    // Contact labels and certification dates; language levels and issuers; education schools.
    'style color: rgba(255,255,255,0.6)': { count: 2, translucent: true },
    'style color: rgba(255,255,255,0.7)': { count: 2, translucent: true },
    'style color: rgba(255,255,255,0.8)': { count: 1, translucent: true },
    // The skill bar's track, drawn over the sidebar fill (US-007).
    'style backgroundColor: rgba(255,255,255,0.2)': { count: 1, excluded: COMPOSITE },
    'style color: {accentColor}': { count: 1, excluded: USER },
    'style backgroundColor: {accentColor}': { count: 6, excluded: USER },
    'style backgroundColor: {activeSidebarColor}': { count: 1, excluded: USER },
    'style backgroundColor: white': { count: 2, excluded: PAGE },
    'style backgroundColor: #444444': { count: 1, excluded: PHOTO },
    'attr fill: rgba(255,255,255,0.3)': { count: 2, excluded: PHOTO },
    // The technology chips' fill; the DOCX shades one run per chip.
    'bg-slate-100': { count: 1, palette: 'slate-100' },
  },
  classic: {
    'text-slate-900': { count: 14, palette: 'slate-900' },
    'text-slate-800': { count: 6, palette: 'slate-800' },
    'text-slate-700': { count: 6, palette: 'slate-700' },
    'text-slate-600': { count: 6, palette: 'slate-600' },
    'border-slate-900': { count: 1, palette: 'slate-900' },
    'border-slate-400': { count: 7, palette: 'slate-400' },
    'bg-white': { count: 1, excluded: PAGE },
  },
  minimal: {
    'text-slate-900': { count: 4, palette: 'slate-900' },
    'text-slate-700': { count: 6, palette: 'slate-700' },
    // One per skills branch: the rich-text one US-016 added, and the items list.
    'text-slate-600': { count: 5, palette: 'slate-600' },
    'text-slate-500': { count: 7, palette: 'slate-500' },
    'text-slate-400': { count: 8, palette: 'slate-400' },
    'bg-slate-400': { count: 1, palette: 'slate-400' },
    'border-slate-300': { count: 1, palette: 'slate-300' },
    'border-slate-200': { count: 7, palette: 'slate-200' },
    'bg-white': { count: 1, excluded: PAGE },
  },
  creative: {
    // The header, whose text is white; the header fill is the gradient below.
    'text-white @ bg-gradient-to-br from-purple-600 overflow-hidden p-10 print:p-8 relative text-white to-orange-400 via-pink-500':
      { count: 1, palette: 'white' },
    // A technology pill: the DOCX shades one run per pill, in the gradient's first stop.
    'text-white @ bg-gradient-to-r font-semibold from-purple-500 px-3 py-1 rounded-full text-white to-pink-500':
      { count: 1, palette: 'white' },
    'from-purple-500 @ bg-gradient-to-r font-semibold from-purple-500 px-3 py-1 rounded-full text-white to-pink-500':
      { count: 1, palette: 'purple-500' },
    'to-pink-500 @ bg-gradient-to-r font-semibold from-purple-500 px-3 py-1 rounded-full text-white to-pink-500':
      { count: 1, excluded: STOPS },
    // A language level bar segment, filled or empty: shaded cells of a nested table.
    'from-purple-500 @ bg-gradient-to-r bg-slate-200 from-purple-500 h-1.5 rounded to-pink-500 w-full':
      { count: 1, palette: 'purple-500' },
    'to-pink-500 @ bg-gradient-to-r bg-slate-200 from-purple-500 h-1.5 rounded to-pink-500 w-full':
      { count: 1, excluded: STOPS },
    // The experience timeline dot. Neither stop is drawn: the DOCX draws the
    // timeline's rule and no marker. Not STOPS, which is for a gradient whose
    // first stop the DOCX does take.
    'from-purple-500 @ absolute bg-gradient-to-br from-purple-500 h-3 left-0 rounded-full to-pink-500 top-1 w-3':
      { count: 1, excluded: DOT },
    'to-pink-500 @ absolute bg-gradient-to-br from-purple-500 h-3 left-0 rounded-full to-pink-500 top-1 w-3':
      { count: 1, excluded: DOT },
    // The bars before the section headings; the DOCX writes a purple-600 "|" in their place.
    'to-pink-500 @ bg-gradient-to-b from-purple-600 h-6 to-pink-500 w-1': { count: 3, excluded: STOPS },
    'to-pink-500 @ bg-gradient-to-b from-purple-600 h-8 to-pink-500 w-1.5': { count: 3, excluded: STOPS },
    // The page paper.
    'bg-white @ bg-white mx-auto print:shadow-none shadow-lg': { count: 1, excluded: PAGE },
    // The three dots between the header's contact items.
    'bg-white @ bg-white h-1.5 rounded-full w-1.5': { count: 3, palette: 'white' },
    'text-purple-700': { count: 2, palette: 'purple-700' },
    'bg-purple-100': { count: 2, palette: 'purple-100' },
    'text-purple-600': { count: 8, palette: 'purple-600' },
    // The header gradient's and the heading bars' first stop.
    'from-purple-600': { count: 7, palette: 'purple-600' },
    'text-purple-500': { count: 1, palette: 'purple-500' },
    'text-slate-900': { count: 3, palette: 'slate-900' },
    'text-slate-800': { count: 3, palette: 'slate-800' },
    // Includes both skills branches: the rich-text one US-016 added, and the items list.
    'text-slate-700': { count: 5, palette: 'slate-700' },
    'text-slate-600': { count: 3, palette: 'slate-600' },
    'text-slate-500': { count: 1, palette: 'slate-500' },
    // The header summary, and the header's second contact row.
    'text-white/90': { count: 1, translucent: true },
    'text-white/80': { count: 1, translucent: true },
    // The header gradient's later stops.
    'via-pink-500': { count: 1, excluded: STOPS },
    'to-orange-400': { count: 1, excluded: STOPS },
    // A language level bar's empty segments.
    'bg-slate-200': { count: 1, palette: 'slate-200' },
    // The experience timeline line (a left paragraph border, at the gradient's first stop).
    'from-purple-300': { count: 1, palette: 'purple-300' },
    // The project card's rule and fill.
    'border-purple-500': { count: 1, palette: 'purple-500' },
    'bg-slate-50': { count: 1, palette: 'slate-50' },
    // The header's decorative circles, drawn as floating PNG discs (US-007).
    'bg-white/10': { count: 2, excluded: RASTER },
  },
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** A hex colour in one spelling, so `#fff` and `#FFFFFF` are one colour. */
function normalise(css: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(css)
  return (short ? `#${short.slice(1).map((digit) => digit + digit).join('')}` : css).toLowerCase()
}

/** The token a utility resolves through, or null for an inline or SVG colour. */
function utilityToken(use: string): string | null {
  // A use split by element carries ` @ <the element's classes>`.
  const utility = use.split(' @ ')[0]
  if (utility.includes(' ')) return null
  return new RegExp(`^(?:[a-z0-9-]+:)*(?:${COLOUR_FAMILIES})-(.+)$`).exec(utility)?.[1] ?? null
}

/**
 * The alpha a use draws TEXT at, or null where it draws text opaque — or draws
 * no text at all. Three forms make text see-through: an `opacity-*` utility on
 * the element, an opacity modifier on a text colour (`text-white/90`), and an
 * inline `rgba()` under `color`. A translucent fill, border or SVG paint is not
 * text and keeps its owner in `DRAWN`.
 */
function textAlpha(use: string): number | null {
  const utility = use.split(' @ ')[0]
  const opacity = OPACITY_UTILITY.exec(utility)
  if (opacity) return Number(opacity[1]) / 100
  if (COLOUR_UTILITY.test(utility) && /^(?:[a-z0-9-]+:)*text-/.test(utility)) {
    const modifier = /\/(\d{1,3})$/.exec(utility)
    if (modifier) return Number(modifier[1]) / 100
  }
  const colour = /^style color: (.+)$/.exec(use)?.[1]
  const rgba = colour ? /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/.exec(colour) : null
  if (rgba) return Number(rgba[1])
  return null
}

/** How `PREVIEW_TEXT_ALPHA` says the template writes one translucency, as the scan keys it. */
function writtenForm(entry: PreviewAlpha): string {
  return entry.source === 'inline' ? `style color: ${entry.css}` : entry.utility
}

/** Whether a drawn colour is the colour of the palette entry it claims. */
function resolves(use: string, entry: PreviewColour): boolean {
  const token = utilityToken(use)
  if (token !== null) {
    if (token.includes('/')) return false
    if (entry.source !== 'inline') return entry.token === token
    const declared = globals.get(token) ?? tailwindDefaults.get(token)
    return declared !== undefined && normalise(declared) === normalise(entry.css)
  }
  const literal = /^(?:style \w+|attr [\w-]+): (.+)$/.exec(use)?.[1]
  return entry.source === 'inline' && literal !== undefined && literal === entry.css
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('THEME_TOKENS', () => {
  it.each(Object.entries(THEME_TOKENS))('--color-%s equals the value globals.css declares', (token, css) => {
    expect(globals.get(token), `globals.css declares no --color-${token}`).toBe(css)
  })
})

describe('TAILWIND_DEFAULT_TOKENS', () => {
  it.each(Object.entries(TAILWIND_DEFAULT_TOKENS))(
    '--color-%s equals Tailwind’s default and globals.css does not redefine it',
    (token, css) => {
      expect(tailwindDefaults.get(token), `tailwindcss/theme.css declares no --color-${token}`).toBe(css)
      expect(globals.has(token), `globals.css redefines --color-${token}, so it is a theme token`).toBe(false)
    },
  )
})

describe('PREVIEW_PALETTE', () => {
  const entries = TEMPLATES.flatMap((template) =>
    Object.entries(PREVIEW_PALETTE[template]).map(([name, colour]: [string, PreviewColour]) => ({ template, name, colour })),
  )

  it('covers all five templates', () => {
    expect([...TEMPLATES].sort()).toEqual(['classic', 'creative', 'minimal', 'modern', 'professional'])
  })

  it('holds each Preview colour of a template once', () => {
    for (const template of TEMPLATES) {
      const css = Object.values(PREVIEW_PALETTE[template]).map((colour: PreviewColour) => normalise(colour.css))
      expect(new Set(css).size, `${template} lists one colour under two names`).toBe(css.length)
    }
  })

  it.each(entries)('$template $name equals its declared token', ({ colour }) => {
    if (colour.source === 'inline') return
    const tokens: Readonly<Record<string, string>> = colour.source === 'theme' ? THEME_TOKENS : TAILWIND_DEFAULT_TOKENS
    expect(colour.css).toBe(tokens[colour.token])
  })
})

describe.each(TEMPLATES)('%s-template.tsx draws only colours the palette or an owner accounts for', (template) => {
  const { uses: drawn, problems } = scanTemplate(template)
  const expected = DRAWN[template]

  it('draws colour only in forms the scan can read', () => {
    expect(problems, 'Rewrite these so the scan can read them, or extend the scan: it fails closed.').toEqual([])
  })

  it('draws exactly the inventoried colours, each as often as inventoried', () => {
    const actual = Object.fromEntries(Object.entries(drawn).sort(([a], [b]) => a.localeCompare(b)))
    const inventory = Object.fromEntries(
      Object.entries(expected)
        .map(([use, entry]) => [use, entry.count] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    )
    expect(
      actual,
      `${templateFile(template)} draws a colour that is new, gone or used a different number of times ` +
        `(${Object.keys({ ...actual, ...inventory }).filter((use) => actual[use] !== inventory[use]).join('; ')}). ` +
        'Map it to the palette (and the DOCX) or give it an owner in DRAWN.',
    ).toEqual(inventory)
  })

  it.each(Object.entries(expected).filter(([, entry]) => 'palette' in entry))(
    '%s is the palette entry it claims',
    (use, entry) => {
      const key = (entry as { palette: string }).palette
      const colour = (PREVIEW_PALETTE[template] as Readonly<Record<string, PreviewColour>>)[key]
      expect(colour, `${template} has no palette entry "${key}"`).toBeDefined()
      expect(resolves(use, colour), `${use} does not draw ${template} palette "${key}" (${colour.css})`).toBe(true)
    },
  )

  it('uses every palette entry somewhere', () => {
    const claimed = new Set(
      Object.values(expected).flatMap((entry) => ('palette' in entry ? [entry.palette] : [])),
    )
    expect(Object.keys(PREVIEW_PALETTE[template]).filter((key) => !claimed.has(key))).toEqual([])
  })

  it('marks every translucent text colour as one, and nothing else', () => {
    const inventoried = Object.entries(expected)
      .filter(([, entry]) => 'translucent' in entry)
      .map(([use]) => use)
      .sort()
    expect(
      Object.keys(drawn).filter((use) => textAlpha(use) !== null).sort(),
      'A use that draws text see-through is a translucency, not an owned exclusion, and the reverse.',
    ).toEqual(inventoried)
  })

  it('draws the translucencies resume-text-opacity.ts declares for it, and no others', () => {
    const declared: Readonly<Record<string, PreviewAlpha>> = PREVIEW_TEXT_ALPHA[template]
    const forms = new Map(Object.values(declared).map((entry) => [writtenForm(entry), entry.alpha]))
    const inventoried = Object.entries(expected).filter(([, entry]) => 'translucent' in entry).map(([use]) => use)
    expect(
      inventoried.sort(),
      `${templateFile(template)} and PREVIEW_TEXT_ALPHA.${template} disagree on which text is translucent ` +
        'and how it is written. Declare it there, or stop drawing it.',
    ).toEqual([...forms.keys()].sort())
    for (const use of inventoried) {
      expect(textAlpha(use), `${use} draws a different alpha than ${template} declares for it`).toBe(forms.get(use))
    }
  })
})
