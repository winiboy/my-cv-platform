import { describe, expect, it, vi } from 'vitest'
import type { ClientRect, Over, SensorContext } from '@dnd-kit/core'
import { createColumnKeyboardCoordinates } from './kanban-keyboard-coordinates'

/**
 * The board's keyboard getter centres the held card on the previous or next
 * column, so `closestCenter` selects exactly that column.
 */

const ORDER = ['saved', 'applied', 'interviewing'] as const

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

// Columns of different heights: the tall one would lose to a short neighbour
// under closestCenter if the card kept its own height on the page.
const COLUMNS = new Map<string, ClientRect>([
  ['saved', rect(0, 100, 280, 300)],
  ['applied', rect(300, 100, 280, 2000)],
  ['interviewing', rect(600, 100, 56, 300)], // collapsed
])
const CARD = rect(20, 120, 240, 100)

function call(code: string, overId: string | null, columns = COLUMNS, card: ClientRect | null = CARD) {
  // The unit tests run in node, which has no KeyboardEvent; the getter reads
  // only `code` and calls `preventDefault`.
  const preventDefault = vi.fn()
  const event = { code, preventDefault } as unknown as KeyboardEvent
  const context = {
    collisionRect: card,
    droppableRects: columns,
    over: overId === null ? null : ({ id: overId } as Over),
  } as unknown as SensorContext
  const result = createColumnKeyboardCoordinates(ORDER)(event, {
    active: 'card',
    context,
    currentCoordinates: card ? { x: card.left, y: card.top } : { x: 0, y: 0 },
  })
  return { result, prevented: preventDefault.mock.calls.length > 0 }
}

/** The top-left that puts the card's centre on the column's centre. */
function centredOn(id: string) {
  const column = COLUMNS.get(id)!
  return {
    x: column.left + column.width / 2 - CARD.width / 2,
    y: column.top + column.height / 2 - CARD.height / 2,
  }
}

describe('createColumnKeyboardCoordinates', () => {
  it('ArrowRight centres the card on the next column', () => {
    expect(call('ArrowRight', 'saved')).toEqual({ result: centredOn('applied'), prevented: true })
  })

  it('ArrowLeft centres the card on the previous column', () => {
    expect(call('ArrowLeft', 'interviewing')).toEqual({ result: centredOn('applied'), prevented: true })
  })

  it('a collapsed column is a target like any other', () => {
    expect(call('ArrowRight', 'applied').result).toEqual(centredOn('interviewing'))
  })

  it('does nothing past either end of the board', () => {
    expect(call('ArrowLeft', 'saved')).toEqual({ result: undefined, prevented: true })
    expect(call('ArrowRight', 'interviewing')).toEqual({ result: undefined, prevented: true })
  })

  it('ArrowUp and ArrowDown do nothing and do not scroll', () => {
    expect(call('ArrowUp', 'applied')).toEqual({ result: undefined, prevented: true })
    expect(call('ArrowDown', 'applied')).toEqual({ result: undefined, prevented: true })
  })

  it('leaves other keys alone', () => {
    expect(call('KeyA', 'applied')).toEqual({ result: undefined, prevented: false })
  })

  it('skips a column that is not measured', () => {
    const withoutApplied = new Map(COLUMNS)
    withoutApplied.delete('applied')
    expect(call('ArrowRight', 'saved', withoutApplied).result).toEqual(centredOn('interviewing'))
  })

  it('not over a column: starts from the nearest one', () => {
    expect(call('ArrowRight', null).result).toEqual(centredOn('applied'))
  })

  it('without a measured card it does nothing', () => {
    expect(call('ArrowRight', 'saved', COLUMNS, null).result).toBeUndefined()
  })
})
