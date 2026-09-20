import { createElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CoverLetter } from '@/types/database'
import { ModernLetterTemplate } from '@/components/dashboard/cover-letter-templates/modern-letter-template'
import { renderFormattedText } from '@/lib/format-text'
import { renderFormattedHtml } from '@/lib/html-utils'

/**
 * Server rendering of user-authored rich HTML.
 *
 * `'use client'` components are still rendered on the server for the initial
 * HTML, where `document` does not exist. Sanitizing during render therefore
 * threw `ReferenceError: document is not defined` and turned a direct load of
 * the resume preview or the cover-letter editor into an HTTP 500.
 *
 * These tests run in the node environment on purpose: that is the server. They
 * assert two things - that rendering does not throw, and that no part of the
 * untrusted payload reaches the server HTML, sanitized or not. Content only
 * appears after hydration, where the browser-side sanitizer runs.
 */

const PAYLOAD = '<p><strong>x</strong><img src=x onerror="alert(1)"><script>alert(2)</script></p>'

function expectNoPayload(html: string): void {
  expect(html).not.toContain('onerror')
  expect(html).not.toContain('<img')
  expect(html).not.toContain('<script')
  expect(html).not.toContain('alert(')
  expect(html).not.toContain(PAYLOAD)
}

function renderInWrapper(node: ReactNode): string {
  return renderToString(createElement('section', null, node))
}

const COVER_LETTER: CoverLetter = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: '00000000-0000-4000-8000-000000000002',
  resume_id: null,
  job_application_id: null,
  title: 'Unit fixture',
  recipient_name: null,
  recipient_title: null,
  company_name: null,
  company_address: null,
  greeting: 'Dear Hiring Manager,',
  opening_paragraph: PAYLOAD,
  body_paragraphs: [PAYLOAD, PAYLOAD],
  closing_paragraph: PAYLOAD,
  sign_off: 'Sincerely,',
  sender_name: null,
  job_title: null,
  job_description: null,
  template: 'modern',
  analysis_score: null,
  analysis_results: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('server rendering of rich HTML', () => {
  it('renderFormattedText renders HTML content without touching the DOM or leaking the payload', () => {
    let html = ''
    expect(() => {
      html = renderInWrapper(renderFormattedText(PAYLOAD))
    }).not.toThrow()

    expectNoPayload(html)
    // The wrapper is still emitted so the hydrated DOM keeps its structure.
    expect(html).toContain('<div class="formatted-content"></div>')
  })

  it('renderFormattedHtml renders HTML content without touching the DOM or leaking the payload', () => {
    let html = ''
    expect(() => {
      html = renderInWrapper(renderFormattedHtml(PAYLOAD))
    }).not.toThrow()

    expectNoPayload(html)
    expect(html).toContain('<div class="formatted-content"></div>')
  })

  it('renderFormattedHtml renders legacy plain text without touching the DOM', () => {
    let html = ''
    expect(() => {
      html = renderInWrapper(renderFormattedHtml('Plain line\n\n- one\n- two'))
    }).not.toThrow()

    expect(html).toContain('<div class="formatted-content"></div>')
  })

  it('renderFormattedText still renders plain text on the server', () => {
    const html = renderInWrapper(renderFormattedText('First line\nSecond line'))

    expect(html).toContain('First line')
    expect(html).toContain('Second line')
  })

  it('ModernLetterTemplate renders HTML paragraphs without touching the DOM or leaking the payload', () => {
    let html = ''
    expect(() => {
      html = renderToString(createElement(ModernLetterTemplate, { coverLetter: COVER_LETTER }))
    }).not.toThrow()

    expectNoPayload(html)
    // Opening + two body paragraphs share one class; the closing has its own.
    expect(html.match(/<div class="mb-4 text-justify"><\/div>/g)).toHaveLength(3)
    expect(html).toContain('<div class="mb-6 text-justify"></div>')
  })
})
