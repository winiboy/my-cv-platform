import { useState, useCallback, useMemo, useRef, type MutableRefObject } from 'react'
import type { JobApplicationWithRelations, JobStatus } from '@/types/database'
import { JOB_STATUSES } from '@/lib/constants/job-statuses'

interface KanbanNavigationState {
  columnIndex: number
  cardIndex: number
}

/** Registry of card refs keyed by card ID for direct DOM focus */
export type CardRefRegistry = MutableRefObject<Map<string, HTMLDivElement>>

interface UseKanbanKeyboardNavigationProps {
  /** Applications grouped by status column */
  applicationsByStatus: Record<JobStatus, JobApplicationWithRelations[]>
  /** Whether drag operation is active (disables arrow navigation) */
  isDragActive: boolean
}

interface UseKanbanKeyboardNavigationReturn {
  /** ID of the currently focused card, or null if none */
  focusedCardId: string | null
  /** Handler for keyboard events on the board container */
  handleBoardKeyDown: (event: React.KeyboardEvent) => void
  /** Manually set the focused card (e.g., when a card receives focus via tab) */
  setFocusedCardId: (id: string | null) => void
  /** Reset focus state (e.g., when drag starts) */
  resetFocus: () => void
  /** Registry for card refs - cards register themselves here */
  cardRefRegistry: CardRefRegistry
  /** Register a card ref in the registry */
  registerCardRef: (id: string, el: HTMLDivElement | null) => void
}

/**
 * Custom hook for keyboard navigation within a Kanban board.
 *
 * Navigation behavior:
 * - ArrowDown: Move to next card in current column
 * - ArrowUp: Move to previous card in current column
 * - ArrowRight: Move to same index in next non-empty column (clamps to last card)
 * - ArrowLeft: Move to same index in previous non-empty column (clamps to last card)
 *
 * The hook tracks position by column index and card index to enable
 * horizontal navigation that maintains approximate vertical position.
 */
export function useKanbanKeyboardNavigation({
  applicationsByStatus,
  isDragActive,
}: UseKanbanKeyboardNavigationProps): UseKanbanKeyboardNavigationReturn {
  const [navigationState, setNavigationState] = useState<KanbanNavigationState | null>(null)

  /**
   * Registry of card refs for direct DOM focus.
   * Cards register their refs here so we can call focus() imperatively.
   */
  const cardRefRegistry = useRef<Map<string, HTMLDivElement>>(new Map())

  /**
   * Register or unregister a card's ref in the registry.
   * Called by each card when it mounts/unmounts.
   */
  const registerCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      cardRefRegistry.current.set(id, el)
    } else {
      cardRefRegistry.current.delete(id)
    }
  }, [])

  /**
   * Build a flat list of non-empty columns with their applications.
   * Used for efficient navigation calculations.
   */
  const columnsWithCards = useMemo(() => {
    return JOB_STATUSES
      .map((status, index) => ({
        status,
        originalIndex: index,
        cards: applicationsByStatus[status] || [],
      }))
      .filter((col) => col.cards.length > 0)
  }, [applicationsByStatus])

  /**
   * Compute the currently focused card ID from navigation state.
   */
  const focusedCardId = useMemo(() => {
    if (!navigationState || columnsWithCards.length === 0) {
      return null
    }

    // Find the column in our filtered list that matches the navigation state
    const targetColumn = columnsWithCards.find(
      (col) => col.originalIndex === navigationState.columnIndex
    )

    if (!targetColumn || targetColumn.cards.length === 0) {
      return null
    }

    // Clamp card index to valid range
    const clampedCardIndex = Math.min(
      navigationState.cardIndex,
      targetColumn.cards.length - 1
    )

    return targetColumn.cards[clampedCardIndex]?.id ?? null
  }, [navigationState, columnsWithCards])

  /**
   * Set the focused card by ID.
   * Finds the card's position and updates navigation state.
   */
  const setFocusedCardId = useCallback(
    (id: string | null) => {
      if (!id) {
        setNavigationState(null)
        return
      }

      // Find the card's position in the grid
      for (const status of JOB_STATUSES) {
        const cards = applicationsByStatus[status] || []
        const cardIndex = cards.findIndex((card) => card.id === id)

        if (cardIndex !== -1) {
          const columnIndex = JOB_STATUSES.indexOf(status)
          setNavigationState({ columnIndex, cardIndex })
          return
        }
      }

      // Card not found, reset state
      setNavigationState(null)
    },
    [applicationsByStatus]
  )

  /**
   * Reset focus state entirely.
   */
  const resetFocus = useCallback(() => {
    setNavigationState(null)
  }, [])

  /**
   * Focus a card by its ID using the ref registry.
   * This provides synchronous DOM focus, avoiding the async issues with useEffect.
   */
  const focusCardById = useCallback((cardId: string | null) => {
    if (!cardId) return
    const cardEl = cardRefRegistry.current.get(cardId)
    if (cardEl) {
      cardEl.focus()
    }
  }, [])

  /**
   * Helper to update navigation state and immediately focus the target card.
   * This ensures DOM focus follows state synchronously.
   */
  const navigateToCard = useCallback(
    (newState: KanbanNavigationState) => {
      setNavigationState(newState)

      // Compute the target card ID from the new state
      const targetColumn = columnsWithCards.find(
        (col) => col.originalIndex === newState.columnIndex
      )
      if (targetColumn && targetColumn.cards.length > 0) {
        const clampedIndex = Math.min(newState.cardIndex, targetColumn.cards.length - 1)
        const targetCardId = targetColumn.cards[clampedIndex]?.id
        if (targetCardId) {
          // Use requestAnimationFrame to ensure state has settled
          // before focusing (needed for initial navigation)
          requestAnimationFrame(() => {
            focusCardById(targetCardId)
          })
        }
      }
    },
    [columnsWithCards, focusCardById]
  )

  /**
   * Find the next non-empty column in a given direction.
   * Returns the column data or null if none found.
   */
  const findAdjacentColumn = useCallback(
    (currentOriginalIndex: number, direction: 'left' | 'right') => {
      const currentInFiltered = columnsWithCards.findIndex(
        (col) => col.originalIndex === currentOriginalIndex
      )

      if (currentInFiltered === -1) {
        // Current column is empty, find nearest in direction
        if (direction === 'right') {
          return columnsWithCards.find((col) => col.originalIndex > currentOriginalIndex) ?? null
        } else {
          // Find last column before current
          const candidates = columnsWithCards.filter(
            (col) => col.originalIndex < currentOriginalIndex
          )
          return candidates[candidates.length - 1] ?? null
        }
      }

      const nextIndex = direction === 'right' ? currentInFiltered + 1 : currentInFiltered - 1
      return columnsWithCards[nextIndex] ?? null
    },
    [columnsWithCards]
  )

  /**
   * Handle keyboard navigation events on the board.
   */
  const handleBoardKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Disable navigation during drag operations
      if (isDragActive) return

      // Only handle arrow keys
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        return
      }

      // No cards to navigate
      if (columnsWithCards.length === 0) return

      event.preventDefault()

      // If no current focus, initialize to first card of first column
      if (!navigationState) {
        const firstColumn = columnsWithCards[0]
        if (firstColumn && firstColumn.cards.length > 0) {
          navigateToCard({
            columnIndex: firstColumn.originalIndex,
            cardIndex: 0,
          })
        }
        return
      }

      const { columnIndex, cardIndex } = navigationState

      // Find current column in filtered list
      const currentColumn = columnsWithCards.find(
        (col) => col.originalIndex === columnIndex
      )

      switch (event.key) {
        case 'ArrowDown': {
          if (!currentColumn) return
          const maxCardIndex = currentColumn.cards.length - 1
          if (cardIndex < maxCardIndex) {
            navigateToCard({
              columnIndex,
              cardIndex: cardIndex + 1,
            })
          }
          break
        }

        case 'ArrowUp': {
          if (cardIndex > 0) {
            navigateToCard({
              columnIndex,
              cardIndex: cardIndex - 1,
            })
          }
          break
        }

        case 'ArrowRight': {
          const nextColumn = findAdjacentColumn(columnIndex, 'right')
          if (nextColumn) {
            // Clamp card index to the new column's bounds
            const clampedIndex = Math.min(cardIndex, nextColumn.cards.length - 1)
            navigateToCard({
              columnIndex: nextColumn.originalIndex,
              cardIndex: clampedIndex,
            })
          }
          break
        }

        case 'ArrowLeft': {
          const prevColumn = findAdjacentColumn(columnIndex, 'left')
          if (prevColumn) {
            // Clamp card index to the new column's bounds
            const clampedIndex = Math.min(cardIndex, prevColumn.cards.length - 1)
            navigateToCard({
              columnIndex: prevColumn.originalIndex,
              cardIndex: clampedIndex,
            })
          }
          break
        }
      }
    },
    [isDragActive, columnsWithCards, navigationState, findAdjacentColumn, navigateToCard]
  )

  return {
    focusedCardId,
    handleBoardKeyDown,
    setFocusedCardId,
    resetFocus,
    cardRefRegistry,
    registerCardRef,
  }
}
