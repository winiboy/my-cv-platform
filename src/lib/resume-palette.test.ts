import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import type { ResumeTemplate } from '@/types/database'
import { templateComponentFile } from '@/test/resume-template-files'
import { PREVIEW_PALETTE, TAILWIND_DEFAULT_TOKENS, THEME_TOKENS, type PreviewColour } from './resume-palette'
import { RESUME_TEMPLATES } from './resume-templates'

/**
 * Part 3 US-003: what a template paints may not drift from what the Preview's
 * source declares, in either direction.
 *
 * Forward: every value in `resume-palette.ts` equals what `globals.css`,
 * Tailwind's default theme or the template declares.
 *
 * Reverse: the colours a template draws outside its `print:hidden` editing
 * controls are listed in `DRAWN` below with the number of times the template
 * uses each, and each resolves to a palette entry or to an exclusion that names
 * its owner. A colour added, removed, or used a different number of times fails
 * here.
 *
 * Translucency is part of what is painted, so the scan reads it too: the
 * `opacity-*` utilities and `opacity` styles a template sets, alongside colour
 * modifiers (`text-white/90`) and `rgba()` literals. No Swiss template draws
 * see-through text, and the scan holds them to that: text drawn translucent
 * has no single colour the DOCX could write.
 *
 * The bars, pills, chips, rules and cards the Preview draws are palette
 * entries like any other colour; the only owner left is the page paper.
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
 * - Which element a colour sits on: swapping two elements' colours without
 *   changing the counts passes here. Each Swiss generator's own test covers
 *   the elements it writes.
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
const templateFile = (template: ResumeTemplate) => templateComponentFile(template)

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
const SPLIT_BY_ELEMENT: Readonly<Partial<Record<ResumeTemplate, readonly string[]>>> = {}

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
type Owner = 'the page paper: the DOCX page is white and writes no fill'

type Drawn = { count: number; palette: string } | { count: number; excluded: Owner }

const PAGE: Owner = 'the page paper: the DOCX page is white and writes no fill'

const DRAWN: Readonly<Record<ResumeTemplate, Readonly<Record<string, Drawn>>>> = {
  swissVocational: {
    // The accent strip and the square before each section heading.
    'bg-red-700': { count: 2, palette: 'red-700' },
    // The CV title and each skill category label (FR-15).
    'text-red-700': { count: 2, palette: 'red-700' },
    // Name, contact labels, headings, position, degree, certification name, language.
    'text-slate-900': { count: 7, palette: 'slate-900' },
    // Contact values, summary, achievements, experience and education descriptions, skill items.
    'text-slate-700': { count: 6, palette: 'slate-700' },
    // Dates, company, school, issuer, language level.
    'text-slate-600': { count: 5, palette: 'slate-600' },
    // The rule under the header.
    'border-slate-800': { count: 1, palette: 'slate-800' },
    // The section heading rule and the dotted rule under each language.
    'border-slate-300': { count: 2, palette: 'slate-300' },
    'bg-white': { count: 1, excluded: PAGE },
  },
  swissCommerce: {
    // The header band; each section heading and its rule; each skill category label.
    'style backgroundColor: #1f3a5f': { count: 1, palette: 'navy' },
    'style color: #1f3a5f': { count: 2, palette: 'navy' },
    'style borderColor: #1f3a5f': { count: 1, palette: 'navy' },
    // The name, on the band.
    'text-white': { count: 1, palette: 'white' },
    // The CV title, and the ring round the photo.
    'text-blue-300': { count: 1, palette: 'blue-300' },
    'border-blue-300': { count: 1, palette: 'blue-300' },
    // The contact row.
    'text-blue-100': { count: 1, palette: 'blue-100' },
    // A language pill's border and fill.
    'border-blue-200': { count: 1, palette: 'blue-200' },
    'bg-blue-50': { count: 1, palette: 'blue-50' },
    // Position, degree, certification name.
    'text-slate-900': { count: 3, palette: 'slate-900' },
    // Summary, achievements, experience and education descriptions, skills, language pill text.
    'text-slate-800': { count: 6, palette: 'slate-800' },
    // Dates, company, school, issuer.
    'text-slate-500': { count: 4, palette: 'slate-500' },
    'bg-white': { count: 1, excluded: PAGE },
  },
  swissTrades: {
    // The dark column, and the text it draws.
    'style backgroundColor: #334155': { count: 1, palette: 'sidebar' },
    'style color: #f1f5f9': { count: 1, palette: 'sidebarText' },
    // A skill tag's fill.
    'style backgroundColor: #475569': { count: 1, palette: 'tag' },
    // The photo's border; an entry's meta line under its title.
    'style borderColor: #64748b': { count: 1, palette: 'muted' },
    'style color: #64748b': { count: 1, palette: 'muted' },
    // The headings of the dark column.
    'style color: #fdba74': { count: 1, palette: 'sidebarHeading' },
    // The CV title and the dates.
    'style color: #c2410c': { count: 2, palette: 'accent' },
    // The rule after each main heading.
    'style backgroundColor: #fed7aa': { count: 1, palette: 'rule' },
    // The name, the main headings, an entry's title.
    'style color: #0f172a': { count: 3, palette: 'ink' },
    // Summary, achievements, experience and education descriptions.
    'style color: #1e293b': { count: 4, palette: 'body' },
    'bg-white': { count: 1, excluded: PAGE },
  },
  swissHealth: {
    // The name, the text of every heading pill, a skill category's caption.
    'style color: #134e4a': { count: 3, palette: 'heading' },
    // A heading pill's fill.
    'style backgroundColor: #ccfbf1': { count: 1, palette: 'pill' },
    // The bar down the left of an entry; the photo's ring.
    'style borderLeftColor: #99f6e4': { count: 1, palette: 'rule' },
    'style borderColor: #99f6e4': { count: 1, palette: 'rule' },
    // The photo's fill.
    'style backgroundColor: #f0fdfa': { count: 1, palette: 'photoFill' },
    // The CV title and the dates.
    'style color: #0f766e': { count: 2, palette: 'accent' },
    // The bold first line of an education, an experience and a certificate.
    'style color: #0f172a': { count: 3, palette: 'ink' },
    // The school, the employer and the issuer after that line.
    'style color: #64748b': { count: 3, palette: 'muted' },
    // The contact line.
    'style color: #475569': { count: 1, palette: 'contact' },
    // Achievements, descriptions, summary, skills and languages.
    'style color: #1e293b': { count: 5, palette: 'body' },
    'bg-white': { count: 1, excluded: PAGE },
  },
  swissFinance: {
    // The CV title and the text of every heading.
    'style color: #166534': { count: 2, palette: 'accent' },
    // The double rule under the header.
    'style borderBottomColor: #166534': { count: 1, palette: 'accent' },
    // The name, an entry's bold lead, a table row's label.
    'style color: #0f172a': { count: 3, palette: 'ink' },
    // The contact line, the dates, the school under a degree.
    'style color: #475569': { count: 3, palette: 'muted' },
    // The rest of an entry's first line, bullets, descriptions, the summary and a table row's value.
    'style color: #1e293b': { count: 5, palette: 'body' },
    // The rule under each heading; the photo's border.
    'style borderBottomColor: #cbd5e1': { count: 1, palette: 'rule' },
    'style borderColor: #cbd5e1': { count: 1, palette: 'rule' },
    // The photo's fill.
    'style backgroundColor: #f8fafc': { count: 1, palette: 'photoFill' },
    'bg-white': { count: 1, excluded: PAGE },
  },
  swissEngineering: {
    // The CV title and the text of every heading, in both columns.
    'style color: #1d4ed8': { count: 2, palette: 'accent' },
    // The light column's bar; a project card's thick left edge.
    'style borderLeftColor: #2563eb': { count: 2, palette: 'bar' },
    // The light column.
    'style backgroundColor: #f1f5f9': { count: 1, palette: 'column' },
    // A project card's fill and its thin border.
    'style backgroundColor: #f8fafc': { count: 1, palette: 'card' },
    'style borderColor: #bfdbfe': { count: 1, palette: 'cardBorder' },
    // The name; an education's lead, a skill category's caption; a project's name; an experience's first line.
    'style color: #0f172a': { count: 5, palette: 'ink' },
    // A project's technologies and link; an experience's dates and company line.
    'style color: #64748b': { count: 3, palette: 'muted' },
    // Every line of the light column; the summary, a project's description, bullets and descriptions.
    'style color: #1e293b': { count: 5, palette: 'body' },
    // The photo's ring and fill.
    'style borderColor: #cbd5e1': { count: 1, palette: 'photoRing' },
    'style backgroundColor: #e2e8f0': { count: 1, palette: 'photoFill' },
    'bg-white': { count: 1, excluded: PAGE },
  },
  swissIt: {
    // The band; the bold lead of an entry, a skill label (inline and stacked), a project's name.
    'style backgroundColor: #0f172a': { count: 1, palette: 'ink' },
    'style color: #0f172a': { count: 4, palette: 'ink' },
    // The name, the CV title and the contact lines, on the band.
    'style color: #ffffff': { count: 1, palette: 'name' },
    'style color: #4ade80': { count: 1, palette: 'prompt' },
    'style color: #cbd5e1': { count: 1, palette: 'contact' },
    // The photo's ring and fill.
    'style borderColor: #22c55e': { count: 1, palette: 'photoRing' },
    'style backgroundColor: #334155': { count: 1, palette: 'photoFill' },
    // The text of every heading.
    'style color: #15803d': { count: 1, palette: 'heading' },
    // A tag: its text, fill and outline.
    'style color: #166534': { count: 1, palette: 'tagText' },
    'style backgroundColor: #f0fdf4': { count: 1, palette: 'tagFill' },
    'style borderColor: #86efac': { count: 1, palette: 'tagBorder' },
    // Rich text, bullets, and the last section.
    'style color: #1e293b': { count: 3, palette: 'body' },
    // An entry's dates and second line; a project's link.
    'style color: #64748b': { count: 3, palette: 'muted' },
    // A project card's border.
    'style borderColor: #e2e8f0': { count: 1, palette: 'cardBorder' },
    'bg-white': { count: 1, excluded: PAGE },
  },
  swissExecutive: {
    // The name; the bold first line of an entry and of an achievement card.
    'style color: #0f172a': { count: 3, palette: 'ink' },
    // The CV title and the text of every heading.
    'style color: #9f1239': { count: 2, palette: 'accent' },
    // The contact line, the dates, an entry's second line, a card's technologies and link.
    'style color: #64748b': { count: 4, palette: 'muted' },
    // The summary, rich text, bullets, and the last section.
    'style color: #1e293b': { count: 4, palette: 'body' },
    // The summary's box and its bar; the header's rule and the cards' rules; the photo's ring and fill.
    'style backgroundColor: #faf6ee': { count: 1, palette: 'cream' },
    'style borderLeftColor: #a16207': { count: 1, palette: 'gold' },
    'style borderTopColor: #a16207': { count: 2, palette: 'gold' },
    'style borderColor: #a16207': { count: 1, palette: 'gold' },
    'style backgroundColor: #f5efe3': { count: 1, palette: 'photoFill' },
    'bg-white': { count: 1, excluded: PAGE },
  },
  swissAcademic: {
    // The name, the headings, a bold lead (entry, publication), a skill or languages label.
    'style color: #0f172a': { count: 7, palette: 'ink' },
    // Rich text, entry lines, bullets, publications and the last section.
    'style color: #1e293b': { count: 5, palette: 'body' },
    // The title, the contact line, the dates, the field of study, a publication's technologies and link.
    'style color: #475569': { count: 5, palette: 'muted' },
    // The rule under every heading.
    'style borderBottomColor: #94a3b8': { count: 1, palette: 'rule' },
    'bg-white': { count: 1, excluded: PAGE },
  },
  swissFirstJob: {
    // The sidebar's fill.
    'style backgroundColor: #f5f3ff': { count: 1, palette: 'sidebar' },
    // The name.
    'style color: #4c1d95': { count: 1, palette: 'name' },
    // The CV title, the headings of both columns, an entry's date line.
    'style color: #6d28d9': { count: 4, palette: 'accent' },
    // A heading's circle; a language's filled dots.
    'style backgroundColor: #7c3aed': { count: 2, palette: 'mark' },
    // A language's empty dots.
    'style backgroundColor: #ddd6fe': { count: 1, palette: 'emptyDot' },
    // The photo's ring and fill.
    'style borderColor: #c4b5fd': { count: 1, palette: 'soft' },
    'style backgroundColor: #ede9fe': { count: 1, palette: 'photoFill' },
    // A skill category's caption; an entry's bold title.
    'style color: #0f172a': { count: 2, palette: 'ink' },
    // Every line of the sidebar; rich text and bullets.
    'style color: #1e293b': { count: 3, palette: 'body' },
    // An entry's second line.
    'style color: #475569': { count: 1, palette: 'muted' },
    'bg-white': { count: 1, excluded: PAGE },
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
 * text.
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

  it('covers every template', () => {
    expect([...TEMPLATES].sort()).toEqual([...RESUME_TEMPLATES].sort())
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

  it('draws no see-through text', () => {
    expect(
      Object.keys(drawn).filter((use) => textAlpha(use) !== null),
      `${templateFile(template)} draws text translucent, which has no single colour the DOCX could write.`,
    ).toEqual([])
  })
})
