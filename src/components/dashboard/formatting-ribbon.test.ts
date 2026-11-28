import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import en from '@/locales/en/common.json'
import fr from '@/locales/fr/common.json'
import de from '@/locales/de/common.json'
import it_ from '@/locales/it/common.json'
import { ALIGN_FORMAT_COMMANDS, FormattingRibbon } from '@/components/dashboard/formatting-ribbon'
import { ALIGNMENT_COMMANDS, TEXT_ALIGNMENTS, resolveActiveAlignment, type JustifyCommand } from '@/lib/rich-text-alignment'
import { richTextToBlocks } from '@/app/api/cover-letters/[id]/download-docx/rich-text-blocks'

/**
 * The ribbon's paragraph alignment buttons (cover-letter-alignment-and-job-banner,
 * US-001): opt-in, in Word's order, labelled from the dictionary, and left
 * active until the cursor says otherwise. Applying the commands to real
 * paragraphs needs a browser and is covered by
 * `e2e/cover-letter-paragraph-alignment.spec.ts`.
 */

const DICTS = { en, fr, de, it: it_ } as Record<'en' | 'fr' | 'de' | 'it', Record<string, unknown>>

const ALIGN_KEYS = ['alignLeft', 'alignCenter', 'alignRight', 'alignJustify'] as const

const render = (props: { showAlignment?: boolean; dict?: Record<string, unknown> }) =>
  renderToStaticMarkup(createElement(FormattingRibbon, { editorId: 'editor', onFormat: () => {}, ...props }))

/** Each alignment button's label and pressed state, in document order. */
function alignmentButtons(html: string): { label: string; title: string; pressed: string }[] {
  const group = /<div[^>]*data-testid="formatting-ribbon-alignment"[^>]*>([\s\S]*?)<\/div>/.exec(html)
  if (!group) return []
  return [...group[1].matchAll(/<button([^>]*)>/g)].map(([, attributes]) => ({
    label: /aria-label="([^"]*)"/.exec(attributes)?.[1] ?? '',
    title: /title="([^"]*)"/.exec(attributes)?.[1] ?? '',
    pressed: /aria-pressed="([^"]*)"/.exec(attributes)?.[1] ?? '',
  }))
}

const toolbar = (dict: Record<string, unknown>) =>
  ((dict.resumes as Record<string, unknown>).editor as Record<string, unknown>).richTextToolbar as Record<
    string,
    string
  >

describe('FormattingRibbon alignment buttons', () => {
  it('are absent by default, as on every CV field, which keeps its ribbon unchanged', () => {
    const html = render({ dict: en })
    expect(alignmentButtons(html)).toEqual([])
    expect(html).not.toContain('aria-pressed')
    expect(html).toBe(render({ dict: en, showAlignment: false }))
  })

  for (const locale of ['en', 'fr', 'de', 'it'] as const) {
    it(`${locale}: shows left, center, right, justify in that order, named and titled from the dictionary`, () => {
      const labels = ALIGN_KEYS.map((key) => toolbar(DICTS[locale])[key])
      expect(labels.every(Boolean)).toBe(true)
      expect(new Set(labels).size).toBe(4)
      const buttons = alignmentButtons(render({ dict: DICTS[locale], showAlignment: true }))
      expect(buttons.map((button) => button.label)).toEqual(labels)
      expect(buttons.map((button) => button.title)).toEqual(labels)
    })
  }

  it('shows left as active before the cursor reports anything', () => {
    const buttons = alignmentButtons(render({ dict: en, showAlignment: true }))
    expect(buttons.map((button) => button.pressed)).toEqual(['true', 'false', 'false', 'false'])
  })

  it('keeps every other ribbon control when enabled', () => {
    const without = render({ dict: en })
    const withAlignment = render({ dict: en, showAlignment: true })
    for (const label of ['Bold (Ctrl+B)', 'Italic (Ctrl+I)', 'Underline (Ctrl+U)', 'Bullet list', 'Numbered list']) {
      expect(without).toContain(`aria-label="${label}"`)
      expect(withAlignment).toContain(`aria-label="${label}"`)
    }
  })
})

/**
 * The cover letter's one toolbar under the header (cover-letter-top-toolbar,
 * US-001): the same controls, in a `toolbar` named from the dictionary, and
 * disabled while no field is its target. Which field it formats needs a
 * browser and is covered by `e2e/cover-letter-top-toolbar.spec.ts`.
 */
describe('FormattingRibbon shared placement', () => {
  const renderShared = (editorId: string | null, dict: Record<string, unknown> = en) =>
    renderToStaticMarkup(
      createElement(FormattingRibbon, {
        placement: 'shared',
        label: 'Text formatting',
        editorId,
        onFormat: () => {},
        showAlignment: true,
        dict,
      }),
    )

  /**
   * Each button's and select's accessible name and aria-disabled, in document
   * order, and whether it has the native `disabled`, which would take it out
   * of the Tab order.
   */
  const controls = (html: string) =>
    [...html.matchAll(/<(button|select)([^>]*)>/g)].map(([, , attributes]) => ({
      label: /aria-label="([^"]*)"/.exec(attributes)?.[1] ?? '',
      ariaDisabled: /aria-disabled="([^"]*)"/.exec(attributes)?.[1],
      nativeDisabled: /\sdisabled=""/.test(attributes),
    }))

  /** Bold's, Italic's and Underline's aria-pressed, in that order. */
  const textFormatPressed = (html: string) =>
    [t.bold, t.italic, t.underline].map(
      (label) => new RegExp(`<button[^>]*aria-label="${label.replace(/[()+]/g, '\\$&')}"[^>]*>`).exec(html)?.[0].match(/aria-pressed="([^"]*)"/)?.[1],
    )

  const t = toolbar(en)
  const ALL_CONTROLS = [
    t.bold,
    t.italic,
    t.underline,
    t.bulletList,
    t.numberedList,
    t.alignLeft,
    t.alignCenter,
    t.alignRight,
    t.alignJustify,
    t.font,
    t.fontSize,
  ]

  it('is a toolbar with the accessible name it is given', () => {
    expect(renderShared('opening-paragraph')).toMatch(/^<div role="toolbar" aria-label="Text formatting"/)
  })

  it('sits flat in its band: no border, background or rounded frame of its own', () => {
    const container = /^<div[^>]*class="([^"]*)"/.exec(renderShared('opening-paragraph'))?.[1] ?? ''
    expect(container.split(' ')).toEqual(['flex', 'flex-wrap', 'items-center', 'gap-1', 'print:hidden'])
  })

  it('marks every control aria-disabled, still focusable, and none pressed, while there is no target', () => {
    const html = renderShared(null)
    expect(controls(html)).toEqual(ALL_CONTROLS.map((label) => ({ label, ariaDisabled: 'true', nativeDisabled: false })))
    expect(alignmentButtons(html).map((button) => button.pressed)).toEqual(['false', 'false', 'false', 'false'])
    expect(textFormatPressed(html)).toEqual(['false', 'false', 'false'])
    expect(html).toContain('aria-disabled:opacity-50')
  })

  it('enables every control once a field is the target', () => {
    const html = renderShared('body-paragraph-1')
    expect(controls(html)).toEqual(ALL_CONTROLS.map((label) => ({ label, ariaDisabled: 'false', nativeDisabled: false })))
    expect(alignmentButtons(html).map((button) => button.pressed)).toEqual(['true', 'false', 'false', 'false'])
    expect(textFormatPressed(html)).toEqual(['false', 'false', 'false'])
  })

  for (const locale of ['en', 'fr', 'de', 'it'] as const) {
    it(`${locale}: has a toolbar name in the dictionary`, () => {
      const editor = (DICTS[locale].coverLetters as Record<string, unknown>).editor as Record<string, unknown>
      expect(typeof editor.formattingToolbar).toBe('string')
      expect((editor.formattingToolbar as string).trim()).not.toBe('')
    })
  }

  it('leaves the attached ribbon (the default) without toolbar role, disabled state, pressed text formats or disabled styling', () => {
    for (const html of [render({ dict: en }), render({ dict: en, showAlignment: true })]) {
      expect(html).toMatch(/^<div class="flex flex-wrap items-center gap-1 p-2 bg-slate-50 border border-slate-200 rounded-t-lg print:hidden">/)
      expect(html).not.toContain('role=')
      expect(html).not.toContain('disabled')
      expect(textFormatPressed(html)).toEqual([undefined, undefined, undefined])
    }
  })
})

describe('alignment commands', () => {
  it("map each button to the browser's justify command for its alignment", () => {
    expect(Object.fromEntries(Object.entries(ALIGN_FORMAT_COMMANDS).map(([command, alignment]) => [command, ALIGNMENT_COMMANDS[alignment]]))).toEqual({
      alignLeft: 'justifyLeft',
      alignCenter: 'justifyCenter',
      alignRight: 'justifyRight',
      alignJustify: 'justifyFull',
    })
  })
})

describe('resolveActiveAlignment', () => {
  const only = (active: JustifyCommand | null) => (command: JustifyCommand) => command === active

  it('reads each alignment from its command state', () => {
    expect(resolveActiveAlignment(only('justifyLeft'))).toBe('left')
    expect(resolveActiveAlignment(only('justifyCenter'))).toBe('center')
    expect(resolveActiveAlignment(only('justifyRight'))).toBe('right')
    expect(resolveActiveAlignment(only('justifyFull'))).toBe('justify')
  })

  it('falls back to left when no command reports true', () => {
    expect(resolveActiveAlignment(only(null))).toBe('left')
  })
})

describe('TEXT_ALIGNMENTS', () => {
  const alignmentOf = (value: string) =>
    richTextToBlocks(`<p style="text-align: ${value};">x</p>`)[0].alignment

  it('are exactly the alignments the Word export reads', () => {
    expect(TEXT_ALIGNMENTS.map(alignmentOf)).toEqual([...TEXT_ALIGNMENTS])
    for (const other of ['start', 'end', 'inherit', '-webkit-center', 'match-parent']) {
      expect(alignmentOf(other), other).toBeUndefined()
    }
  })
})
