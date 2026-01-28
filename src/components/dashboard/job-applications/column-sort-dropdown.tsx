'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Check } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  COLUMN_SORT_OPTIONS,
  type ColumnSortOption,
} from '@/types/filters'

interface ColumnSortDropdownProps {
  sortOption: ColumnSortOption
  onSortChange: (sortOption: ColumnSortOption) => void
  dict: Record<string, unknown>
}

/**
 * Compact dropdown for sorting cards within a Kanban column.
 * Displays an icon indicating current sort direction and provides
 * radio-style selection for sort options.
 */
export function ColumnSortDropdown({
  sortOption,
  onSortChange,
  dict,
}: ColumnSortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Extract translations with fallbacks
  const kanbanDict = (dict.kanban || {}) as Record<string, unknown>
  const sortDict = (kanbanDict.sort || {}) as Record<string, string>

  /**
   * Get the appropriate icon based on current sort option.
   * - recent/oldest: ArrowUpDown (time-based)
   * - company_asc: ArrowUp (A-Z ascending)
   * - company_desc: ArrowDown (Z-A descending)
   */
  function getSortIcon() {
    switch (sortOption) {
      case 'company_asc':
        return <ArrowUp className="h-3.5 w-3.5" />
      case 'company_desc':
        return <ArrowDown className="h-3.5 w-3.5" />
      default:
        return <ArrowUpDown className="h-3.5 w-3.5" />
    }
  }

  /**
   * Get translated label for a sort option
   */
  function getSortLabel(option: typeof COLUMN_SORT_OPTIONS[number]): string {
    return sortDict[option.labelKey] || option.fallbackLabel
  }

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close dropdown on Escape key
  useEffect(() => {
    function handleEscapeKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey)
      return () => document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isOpen])

  const toggleDropdown = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const handleSortChange = useCallback(
    (newSortOption: ColumnSortOption) => {
      onSortChange(newSortOption)
      setIsOpen(false)
    },
    [onSortChange]
  )

  return (
    <div ref={dropdownRef} className="relative">
      {/* Sort button - compact icon-only trigger */}
      <button
        type="button"
        onClick={toggleDropdown}
        className={cn(
          'flex items-center justify-center rounded p-1 transition-colors',
          'text-slate-500 hover:bg-slate-200 hover:text-slate-700',
          'dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-300',
          isOpen && 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
        )}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={sortDict.label || 'Sort column'}
        title={sortDict.label || 'Sort column'}
      >
        {getSortIcon()}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className={cn(
            'absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border bg-white shadow-lg',
            'dark:border-slate-700 dark:bg-slate-800',
            'animate-in fade-in-0 zoom-in-95 duration-150 origin-top-left'
          )}
          role="menu"
          aria-orientation="vertical"
        >
          <div className="p-1.5">
            {COLUMN_SORT_OPTIONS.map((option) => {
              const isSelected = sortOption === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() => handleSortChange(option.value)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                    'hover:bg-slate-100 dark:hover:bg-slate-700',
                    isSelected && 'bg-slate-100 dark:bg-slate-700'
                  )}
                >
                  <span className="text-slate-700 dark:text-slate-300">
                    {getSortLabel(option)}
                  </span>
                  {isSelected && (
                    <Check className="h-4 w-4 text-teal-600 dark:text-teal-500" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
