/**
 * Makes modern CSS colours survive an html2canvas render.
 *
 * THE PROBLEM
 *
 * html2canvas 1.4.1 resolves every colour it meets through a parser that knows
 * only `rgb()`, `rgba()`, `hsl()` and `hsla()`. Anything else throws
 * `Attempting to parse an unsupported color function "<name>"` and aborts the
 * whole render, producing no image and therefore no PDF.
 *
 * 1.4.1 is not a version anyone can move off: it is the last release html2canvas
 * ever had (2021), and `html2pdf.js` declares `html2canvas: ^1.0.0`, so there is
 * no fix available inside that range. `html2canvas-pro` is the maintained fork
 * that does parse `oklch()`, but its UMD build exports a namespace object where
 * 1.4.1 exported the function itself, so aliasing it over the `html2canvas`
 * specifier makes `html2pdf.js` call a non-function - it needs a CJS shim and a
 * bundler alias on top of the alias, not the one-line override it looks like.
 *
 * Meanwhile this project is Tailwind v4 and `src/app/globals.css` defines its
 * whole palette in `oklch()`. Two rules there reach every render:
 * `@layer base { * { @apply border-border } }` puts an oklch `border-color` on
 * literally every element, and `body { @apply bg-background text-foreground }`
 * puts an oklch `background-color` and `color` on the document body. That broke
 * the cover letter PDF export outright, for every user in every browser.
 *
 * THE FIX
 *
 * html2canvas does all of its parsing against a throwaway clone of the document,
 * inside an iframe it creates itself, and it hands that clone to the `onclone`
 * callback before reading a single style from it. So the app's colours can be
 * replaced with sRGB equivalents there: the substitution is invisible to the
 * page, cannot leak into anything the user sees, and does not require the export
 * markup or the theme to change.
 *
 * WHAT THIS COVERS, AND WHAT IT DOES NOT
 *
 * html2canvas is frozen, so the set of properties it colour-parses cannot grow.
 * It is exactly these, and the stylesheet below covers all of them:
 *
 *   `background-color`, `border-{top,right,bottom,left}-color`, `color`,
 *   `text-decoration-color`, `-webkit-text-stroke-color`, plus the colours
 *   embedded in `background-image` gradients, `box-shadow` and `text-shadow`
 *
 * The closure is over properties, not over the *sources* a declaration can
 * arrive from. These declarations carry no `!important` (see below for why), so
 * they beat other stylesheets and nothing else. Two paths put colour on the
 * clone as an *inline* style, which no stylesheet can beat, both in
 * html2canvas's own `DocumentCloner`:
 *
 *   - `resolvePseudoContent` copies the computed style of a generated
 *     `::before`/`::after` onto the replaced element it creates
 *     (`html2canvas.esm.js:5464-5478`);
 *   - a custom element - `isCustomElement` is nothing more than a dashed tag
 *     name - sets `copyStyles`, which `cloneNode` then applies to it and
 *     propagates to every descendant (`:5435, :5450-5451`).
 *
 * `copyCSSStyles` skips only `['all', 'd', 'content']`, so an oklch colour
 * reached either way arrives inline and unbeatable.
 *
 * Tailwind colour *utilities* are a far narrower exposure, and specificity has
 * nothing to do with it. Tailwind v4 emits them inside a named cascade layer -
 * `@layer utilities{ ... .bg-teal-500{background-color:oklch(55% .2 180)} ... }`
 * in the compiled bundle - and layer precedence is resolved before specificity,
 * so this sheet, being unlayered, beats every utility in that layer whatever it
 * is attached to and however specific its selector.
 *
 * Exactly two things get past that:
 *
 *   - `color`, the one covered property the `*` rule does not reset. It cannot
 *     be reset there: `src/lib/cover-letter-pdf-html.ts` sets `color` inline on
 *     the letter's root wrapper and lets every descendant inherit it, and a
 *     declaration on `*` beats inheritance, so resetting it per element would
 *     repaint the whole letter. `text-teal-500` on an element inside the export
 *     subtree therefore does supply oklch and does abort the render.
 *   - a `!`-modified utility, `bg-teal-500!`, because an `!important`
 *     declaration inside a layer outranks an unlayered normal one. This is the
 *     only lever that defeats the sheet on a covered property, and it is the
 *     one `e2e/cover-letter-pdf-export.spec.ts` pulls to force its failure case.
 *
 * Both gaps are dormant, not closed. `src/lib/cover-letter-pdf-html.ts` builds
 * the export markup with inline hex colours only - no classes, no custom
 * elements, no generated content - which is what keeps them dormant, and is
 * therefore a constraint on that file rather than an accident of it.
 *
 * THE GUARANTEE, STATED EXACTLY
 *
 * Unlayered and without `!important`, this sheet beats every layered declaration
 * and every unlayered one the `*` rule outranks - which is to say specificity
 * (0,0,0). It does not beat a more specific unlayered rule. The compiled bundle
 * has exactly one of those touching a covered property:
 * `body:has(.professional-template)`, specificity (0,1,1), whose print gradient
 * resolves to oklch. It is inert here only because it sits inside
 * `@media print`, and html2canvas renders the clone as screen media.
 *
 * ONE MORE COST OF A BLANKET RESET
 *
 * The override *erases* rather than translates: `background-image: none` and
 * `box-shadow: none` throw away a decoration instead of approximating it. So a
 * declaration inside the covered set degrades the rendered page silently, where
 * an uncovered one aborts the render loudly. Silent wrongness is the price paid
 * for not having to enumerate the theme's colours, and it is only acceptable
 * because the export markup above owns all of its own colour inline.
 */

/**
 * The override stylesheet, in CSS source order significance.
 *
 * Every value is the property's CSS initial value, or - where html2canvas
 * discards the value anyway - an arbitrary sRGB one.
 *
 * The declarations carry no `!important` on purpose. This sheet is unlayered, so
 * it already outranks everything in Tailwind's `@layer base` whatever the
 * specificity, which is all it needs to displace the theme's oklch tokens.
 * Adding `!important` would buy nothing there and would cost the one thing that
 * must survive: the inline styles `src/lib/cover-letter-pdf-html.ts` puts on the
 * letter itself, which are its only intended source of colour and are hex
 * throughout. An `!important` reset would repaint the letter white-on-black.
 */
export const HTML2CANVAS_COLOR_FALLBACK_CSS = `
html, body {
  /*
   * html2canvas parses both of these unconditionally, before it looks at the
   * element it was asked to render, and then throws the result away unless that
   * element *is* the document root - so the specific colours here never reach
   * the output. \`color\` is set as well as \`background-color\` because \`color\`
   * inherits: left alone it would arrive, still in oklch, on the render target
   * further down the tree.
   */
  background-color: #ffffff;
  color: #000000;
}

*, ::before, ::after {
  border-color: currentcolor;
  background-color: transparent;
  background-image: none;
  text-decoration-color: currentcolor;
  -webkit-text-stroke-color: currentcolor;
  box-shadow: none;
  text-shadow: none;
}
`

/**
 * Installs {@link HTML2CANVAS_COLOR_FALLBACK_CSS} into a cloned document.
 *
 * Pass as html2canvas's `onclone`. The document is html2canvas's own private
 * clone, discarded as soon as the render finishes, so nothing here is observable
 * from the live page.
 */
export function applyHtml2canvasColorFallback(clonedDocument: Document): void {
  const style = clonedDocument.createElement('style')
  style.dataset.html2canvasColorFallback = ''
  style.textContent = HTML2CANVAS_COLOR_FALLBACK_CSS

  // `head` is guaranteed here: html2canvas adopts a full clone of
  // `documentElement`, and the parser synthesises a head even when the source
  // document somehow lacks one.
  clonedDocument.head.appendChild(style)
}
