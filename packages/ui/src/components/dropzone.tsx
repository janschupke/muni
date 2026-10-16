'use client'

import { Upload } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'

import { cn } from '../cn'

/** File drop target that also works as a plain file picker (keyboard and touch). */
export function Dropzone({
  accept,
  multiple,
  onFiles,
  title,
  hint,
}: {
  accept?: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  title: ReactNode
  hint?: ReactNode
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <label
      htmlFor={inputId}
      onDragOver={event => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => {
        setDragging(false)
      }}
      onDrop={event => {
        event.preventDefault()
        setDragging(false)
        onFiles(Array.from(event.dataTransfer.files))
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-emphasis bg-surface-elevated px-6 py-10 text-center transition-colors hover:bg-state-hover',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring',
        dragging && 'border-accent bg-state-selected'
      )}
    >
      <Upload aria-hidden className="size-6 text-fg-muted" />
      <span className="font-medium text-fg">{title}</span>
      {hint && <span className="text-sm text-fg-muted">{hint}</span>}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={event => {
          onFiles(Array.from(event.target.files ?? []))
          if (inputRef.current) inputRef.current.value = ''
        }}
      />
    </label>
  )
}
