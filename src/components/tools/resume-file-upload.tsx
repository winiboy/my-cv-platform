'use client'

import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react'
import { Upload, File, X, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Maximum file size in bytes (5MB).
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024

/**
 * Accepted file extensions and MIME types.
 */
const ACCEPTED_EXTENSIONS = '.pdf,.docx'
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

/**
 * Translation strings required by the ResumeFileUpload component.
 */
export interface ResumeFileUploadTranslations {
  /** Label shown above the upload area */
  uploadLabel: string
  /** Text shown in the drag-drop zone */
  dragDropText: string
  /** Text for the browse button/link */
  browseText: string
  /** Text showing accepted file types */
  acceptedFilesText: string
  /** Error message for files exceeding size limit */
  fileTooLargeError: string
  /** Error message for unsupported file types */
  unsupportedFileError: string
  /** Error message for extraction failures */
  extractionFailedError: string
  /** Text shown while extracting text */
  extractingText: string
  /** Accessible label for remove file button */
  removeFileLabel: string
}

interface ResumeFileUploadProps {
  /** Callback when text is successfully extracted from the file */
  onTextExtracted: (text: string) => void
  /** Translated UI strings */
  translations: ResumeFileUploadTranslations
  /** Optional external error message */
  error?: string
  /** Optional flag to disable the component */
  disabled?: boolean
}

/**
 * Response shape from the /api/tools/extract-text endpoint.
 */
interface ExtractTextResponse {
  success?: boolean
  text?: string
  fileName?: string
  error?: string
  message?: string
}

/**
 * ResumeFileUpload component provides drag-and-drop or click-to-upload
 * functionality for PDF and DOCX resume files.
 *
 * Features:
 * - Drag-and-drop zone with visual feedback
 * - Click to browse for files
 * - File type validation (PDF, DOCX only)
 * - File size validation (5MB max)
 * - Server-side text extraction
 * - Loading state during extraction
 * - Error handling with user-friendly messages
 * - Remove button to clear selected file
 * - Dark mode support
 */
export function ResumeFileUpload({
  onTextExtracted,
  translations,
  error: externalError,
  disabled = false,
}: ResumeFileUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * Validates file type and size.
   * Returns error message if invalid, null if valid.
   */
  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file type
      if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        return translations.unsupportedFileError
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        return translations.fileTooLargeError
      }

      return null
    },
    [translations]
  )

  /**
   * Extracts text from the file using the server-side API endpoint.
   */
  const extractText = useCallback(
    async (file: File) => {
      setIsExtracting(true)
      setError(null)

      try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/tools/extract-text', {
          method: 'POST',
          body: formData,
        })

        // Check response.ok BEFORE attempting to parse JSON
        if (!response.ok) {
          // Try to parse error details from JSON body, fallback to status text
          let errorMessage = translations.extractionFailedError
          try {
            const errorData: ExtractTextResponse = await response.json()
            errorMessage = errorData.message || errorData.error || translations.extractionFailedError
          } catch {
            // JSON parsing failed, use status text as fallback
            errorMessage = response.statusText || translations.extractionFailedError
          }
          throw new Error(errorMessage)
        }

        const data: ExtractTextResponse = await response.json()

        if (!data.success) {
          throw new Error(data.message || data.error || translations.extractionFailedError)
        }

        if (!data.text) {
          throw new Error(translations.extractionFailedError)
        }

        // Success - call the callback with extracted text
        onTextExtracted(data.text)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : translations.extractionFailedError
        console.error('Error extracting text from file:', err)
        setError(errorMessage)
        setSelectedFile(null)
      } finally {
        setIsExtracting(false)
      }
    },
    [onTextExtracted, translations.extractionFailedError]
  )

  /**
   * Processes a selected file - validates and initiates extraction.
   */
  const processFile = useCallback(
    (file: File) => {
      // Validate the file
      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        setSelectedFile(null)
        return
      }

      // Clear previous error and set the file
      setError(null)
      setSelectedFile(file)

      // Extract text from the file
      extractText(file)
    },
    [validateFile, extractText]
  )

  /**
   * Handles drag enter event.
   */
  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled && !isExtracting) {
        setIsDragActive(true)
      }
    },
    [disabled, isExtracting]
  )

  /**
   * Handles drag leave event.
   */
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
  }, [])

  /**
   * Handles drag over event.
   */
  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled && !isExtracting) {
        setIsDragActive(true)
      }
    },
    [disabled, isExtracting]
  )

  /**
   * Handles file drop event.
   */
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(false)

      if (disabled || isExtracting) return

      const files = e.dataTransfer.files
      if (files && files.length > 0) {
        processFile(files[0])
      }
    },
    [disabled, isExtracting, processFile]
  )

  /**
   * Handles file input change event.
   */
  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        processFile(files[0])
      }
      // Reset input value to allow selecting the same file again
      e.target.value = ''
    },
    [processFile]
  )

  /**
   * Opens the file browser dialog.
   */
  const handleBrowseClick = useCallback(() => {
    if (!disabled && !isExtracting && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }, [disabled, isExtracting])

  /**
   * Clears the selected file and resets state.
   */
  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null)
    setError(null)
    // Note: We don't clear the extracted text here - that's managed by the parent
  }, [])

  // Determine if we should show an error
  const displayError = externalError || error

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
        {translations.uploadLabel}
      </label>

      {/* Drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleBrowseClick}
        role="button"
        tabIndex={disabled || isExtracting ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleBrowseClick()
          }
        }}
        aria-label={translations.dragDropText}
        aria-disabled={disabled || isExtracting}
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 p-8',
          'border-2 border-dashed rounded-lg cursor-pointer',
          'transition-all duration-200 outline-none',
          // Focus visible state for keyboard navigation
          'focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
          // Base state
          !disabled &&
            !isExtracting &&
            !isDragActive &&
            'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50',
          // Hover state
          !disabled &&
            !isExtracting &&
            !isDragActive &&
            'hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-900/20 hover:shadow-sm',
          // Drag active state
          isDragActive &&
            'border-teal-500 bg-teal-50 dark:bg-teal-900/30 ring-2 ring-teal-500/30',
          // Disabled/extracting state
          (disabled || isExtracting) &&
            'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/30 cursor-not-allowed opacity-60',
          // Error state
          displayError &&
            'border-red-400 dark:border-red-500'
        )}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileInputChange}
          disabled={disabled || isExtracting}
          className="sr-only"
          aria-hidden="true"
        />

        {/* Content based on state */}
        {isExtracting ? (
          // Extracting state
          <>
            <Loader2
              className="h-10 w-10 text-teal-600 dark:text-teal-400 animate-spin"
              aria-hidden="true"
            />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {translations.extractingText}
            </p>
          </>
        ) : selectedFile ? (
          // File selected state
          <div className="flex items-center gap-3">
            <File
              className="h-8 w-8 text-teal-600 dark:text-teal-400 flex-shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleRemoveFile()
              }}
              aria-label={translations.removeFileLabel}
              className={cn(
                'p-1.5 rounded-md flex-shrink-0',
                'text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400',
                'hover:bg-red-50 dark:hover:bg-red-900/20',
                'transition-colors focus:outline-none focus:ring-2 focus:ring-red-500'
              )}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          // Default drop zone state
          <>
            <Upload
              className={cn(
                'h-10 w-10',
                isDragActive
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-slate-400 dark:text-slate-500'
              )}
              aria-hidden="true"
            />
            <div className="text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {translations.dragDropText}{' '}
                <span className="text-teal-600 dark:text-teal-400 font-medium hover:underline">
                  {translations.browseText}
                </span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                {translations.acceptedFilesText}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Error message */}
      {displayError && (
        <div
          className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <p>{displayError}</p>
        </div>
      )}
    </div>
  )
}
