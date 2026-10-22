import { KeyboardCode, type KeyboardCoordinateGetter, type UniqueIdentifier } from '@dnd-kit/core'

const ARROW_KEYS: readonly string[] = [KeyboardCode.Left, KeyboardCode.Right, KeyboardCode.Up, KeyboardCode.Down]

/**
 * Keyboard coordinates for the Kanban board: ArrowLeft and ArrowRight move the
 * dragged card onto the centre of the previous or next column, in board order.
 * ArrowUp and ArrowDown do nothing, since a column has no order to move within,
 * and an arrow at either end of the board does nothing.
 *
 * dnd-kit's default getter moves the card 25px per press, so reaching the next
 * column took a dozen presses. The card is centred on the target column
 * because the board uses `closestCenter`: a matching centre is the only
 * position guaranteed to select that column whatever the column heights.
 *
 * Collapsed columns stay in the order: they are drop targets for the mouse
 * too, and hovering one expands it as before.
 *
 * Every arrow press has its default prevented, so it never scrolls the page
 * while a card is held.
 */
export function createColumnKeyboardCoordinates(columnOrder: readonly UniqueIdentifier[]): KeyboardCoordinateGetter {
  return (event, { context }) => {
    if (!ARROW_KEYS.includes(event.code)) return undefined
    event.preventDefault()

    const step = event.code === KeyboardCode.Right ? 1 : event.code === KeyboardCode.Left ? -1 : 0
    const { collisionRect, droppableRects, over } = context
    if (step === 0 || !collisionRect) return undefined

    const columns = columnOrder.filter((id) => droppableRects.has(id))
    let index = over ? columns.indexOf(over.id) : -1
    if (index === -1) {
      // Not over a column: start from the column whose centre is nearest.
      const centre = collisionRect.left + collisionRect.width / 2
      let nearest = Infinity
      columns.forEach((id, candidate) => {
        const rect = droppableRects.get(id)
        if (!rect) return
        const distance = Math.abs(rect.left + rect.width / 2 - centre)
        if (distance < nearest) {
          nearest = distance
          index = candidate
        }
      })
      if (index === -1) return undefined
    }

    const target = columns[index + step]
    const rect = target === undefined ? undefined : droppableRects.get(target)
    if (!rect) return undefined
    return {
      x: rect.left + rect.width / 2 - collisionRect.width / 2,
      y: rect.top + rect.height / 2 - collisionRect.height / 2,
    }
  }
}
