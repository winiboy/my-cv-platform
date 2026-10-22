import type { Active, Announcements, Over, ScreenReaderInstructions, UniqueIdentifier } from '@dnd-kit/core'
import type { JobStatus } from '@/types/database'
import { JOB_STATUS_CONFIG, JOB_STATUSES } from '@/lib/constants/job-statuses'

/**
 * Drag-and-drop screen-reader text, read from `kanban.dnd`. Templates take
 * `{title}`, `{company}` and `{column}`.
 */
export interface KanbanDndMessages {
  instructions?: string
  pickedUp?: string
  movedOver?: string
  notOver?: string
  dropped?: string
  droppedOutside?: string
  cancelled?: string
  roleDescription?: string
}

/**
 * English text used only when a dictionary key is missing; the locale files
 * carry the real values (locale-parity.test.ts keeps them present).
 */
export const KANBAN_DND_FALLBACK: Required<KanbanDndMessages> = {
  instructions:
    'To pick up a card, press the space bar or Enter. While dragging, press the left or right arrow key to move it to the previous or next column. Press the space bar or Enter again to drop it, or press Escape to cancel.',
  pickedUp: 'Picked up {title} at {company} from the {column} column.',
  movedOver: '{title} at {company} is over the {column} column.',
  notOver: '{title} at {company} is not over a column.',
  dropped: '{title} at {company} was dropped in the {column} column.',
  droppedOutside: '{title} at {company} was dropped outside the columns. Its status is unchanged.',
  cancelled: 'Move cancelled. {title} at {company} stays in the {column} column.',
  roleDescription: 'movable card',
}

interface CardIdentity {
  title: string
  company: string
  status: JobStatus
}

function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === 'string' && (JOB_STATUSES as string[]).includes(value)
}

/**
 * The dragged card's name and origin column, from the `data` the card passes
 * to `useDraggable`. dnd-kit hands the callbacks only ids, and the active id
 * is the application UUID, which must never be announced.
 */
function cardIdentity(active: Active): CardIdentity | null {
  const data = active.data.current as
    | { jobApplication?: { job_title?: unknown; company_name?: unknown }; status?: unknown }
    | undefined
  const title = data?.jobApplication?.job_title
  const company = data?.jobApplication?.company_name
  const status = data?.status
  if (typeof title !== 'string' || typeof company !== 'string' || !isJobStatus(status)) return null
  return { title, company, status }
}

// One pass with a replacer function: user text is inserted literally, so a
// title containing "{column}" or "$&" is not rewritten.
function fill(template: string, values: { title: string; company: string; column: string }): string {
  return template.replace(/\{(title|company|column)\}/g, (_, key: 'title' | 'company' | 'column') => values[key])
}

/**
 * Builds the `<DndContext accessibility>` instructions and announcements in
 * the page language. Droppable ids are the column statuses, so a column is
 * announced by its localized status label. A callback returns `undefined`
 * (no announcement) rather than fall back to a raw id when the card data or
 * the column id is not recognised. The announcements keep the current drag's
 * last column, so each `<DndContext>` needs its own instance.
 */
export function createKanbanDndAccessibility(
  messages: KanbanDndMessages,
  statusLabels: Record<string, string>
): { announcements: Announcements; screenReaderInstructions: ScreenReaderInstructions } {
  const text = (key: keyof KanbanDndMessages): string => messages[key] || KANBAN_DND_FALLBACK[key]

  const columnLabel = (id: UniqueIdentifier): string | undefined =>
    isJobStatus(id) ? statusLabels[id] || JOB_STATUS_CONFIG[id].label : undefined

  // The column the user last heard about. dnd-kit reports the card "over" its
  // own column in the same render as the pick-up, and the live region keeps
  // only the latest text, so announcing that first "over" would erase the
  // pick-up announcement before it reached the DOM; the pick-up already names
  // the column.
  let lastOverId: UniqueIdentifier | null = null

  const announceOver = (
    active: Active,
    over: Over | null,
    overKey: 'movedOver' | 'dropped',
    noneKey: 'notOver' | 'droppedOutside'
  ): string | undefined => {
    const card = cardIdentity(active)
    if (!card) return undefined
    if (!over) return fill(text(noneKey), { ...card, column: '' })
    const column = columnLabel(over.id)
    return column === undefined ? undefined : fill(text(overKey), { ...card, column })
  }

  const announceOrigin = (active: Active, key: 'pickedUp' | 'cancelled'): string | undefined => {
    const card = cardIdentity(active)
    if (!card) return undefined
    const column = columnLabel(card.status)
    return column === undefined ? undefined : fill(text(key), { ...card, column })
  }

  return {
    screenReaderInstructions: { draggable: text('instructions') },
    announcements: {
      onDragStart: ({ active }) => {
        lastOverId = cardIdentity(active)?.status ?? null
        return announceOrigin(active, 'pickedUp')
      },
      onDragOver: ({ active, over }) => {
        const overId = over?.id ?? null
        if (overId !== null && overId === lastOverId) return undefined
        lastOverId = overId
        return announceOver(active, over, 'movedOver', 'notOver')
      },
      onDragEnd: ({ active, over }) => {
        lastOverId = null
        return announceOver(active, over, 'dropped', 'droppedOutside')
      },
      onDragCancel: ({ active }) => {
        lastOverId = null
        return announceOrigin(active, 'cancelled')
      },
    },
  }
}
