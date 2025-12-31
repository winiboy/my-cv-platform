/**
 * Font and size constants for the rich text editor
 * Uses system fonts only (no web fonts) for better compatibility with PDF/DOCX export
 */

export interface FontOption {
  name: string
  value: string
}

export const AVAILABLE_FONTS: FontOption[] = [
  { name: 'System Default', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { name: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { name: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { name: 'Courier New', value: '"Courier New", Courier, monospace' },
  { name: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { name: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { name: 'Calibri', value: 'Calibri, sans-serif' },
  { name: 'Segoe UI', value: '"Segoe UI", Tahoma, sans-serif' },
]

export const FONT_SIZES: number[] = [10, 11, 12, 13, 14, 15, 16, 17, 18]

export const DEFAULT_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
export const DEFAULT_FONT_SIZE = 14
