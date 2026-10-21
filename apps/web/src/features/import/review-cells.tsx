'use client'

import type { ParsedRow } from '@muni/importer'
import { cn } from '@muni/ui/cn'
import { Input } from '@muni/ui/field'
import { IconButton } from '@muni/ui/icon-button'
import { Tooltip } from '@muni/ui/tooltip'
import { CircleX, Pencil, RotateCcw, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import type { ReactElement } from 'react'

import { useImportText } from './use-issue-text'

/** What one cell of a row is: wrong, worth a look, changed by hand, or as it was read. */
export function fieldState(
  row: ParsedRow<unknown>,
  field: string
): 'error' | 'warning' | 'edited' | null {
  if (row.errors.some(i => i.field === field)) return 'error'
  if (row.warnings.some(i => i.field === field)) return 'warning'
  if (row.raw[field] !== row.originalRaw[field]) return 'edited'
  return null
}

/** Each state also has its own mark, so it never rests on the tint alone. */
const CELL_MARK = {
  error: { Icon: CircleX, className: 'text-danger-fg' },
  warning: { Icon: TriangleAlert, className: 'text-warning-fg' },
  edited: { Icon: Pencil, className: 'text-info-fg' },
} as const

/** The row's line number; with problems, a button whose tooltip lists them. */
export function LineCell({ row, problems }: { row: ParsedRow<unknown>; problems: string }) {
  const { t } = useImportText()
  if (row.errors.length === 0 && row.warnings.length === 0) return row.rowNumber
  return (
    <Tooltip content={problems} side="right">
      <button
        type="button"
        className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 transition-colors hover:bg-state-hover"
        aria-label={`${t('review.problems', { row: row.rowNumber })}\n${problems}`}
      >
        {row.rowNumber}
        {row.errors.length > 0 ? (
          <CircleX aria-hidden className="size-3.5" />
        ) : (
          <TriangleAlert aria-hidden className="size-3.5" />
        )}
      </button>
    </Tooltip>
  )
}

/**
 * One value of a row: a button that opens it for editing (with its state as a mark), or, while
 * editing, a field. Enter or leaving keeps what was typed; Escape puts the value back. A
 * removed row's values are text only.
 */
export function EditableCell({
  row,
  field,
  label,
  editing,
  onStart,
  onDone,
}: {
  row: ParsedRow<unknown>
  field: string
  /** The edit's accessible name ("Edit Course code, row 4"). */
  label: string
  editing: boolean
  onStart: () => void
  /** Editing ended; with the new value when it changed. */
  onDone: (value: string | null) => void
}) {
  const { t } = useImportText()
  const value = row.raw[field] ?? ''
  if (editing) {
    return (
      <Input
        size="cell"
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the field replaces the cell the user just chose to edit, so focus follows
        autoFocus
        defaultValue={value}
        aria-label={label}
        onBlur={event => {
          onDone(event.target.value === value ? null : event.target.value)
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            event.currentTarget.value = value
            onDone(null)
          }
        }}
      />
    )
  }
  // The full value on hover: cells truncate long text.
  const full = (cell: ReactElement) =>
    value === '' ? cell : <Tooltip content={value}>{cell}</Tooltip>
  if (row.isRemoved) return full(<span className="block truncate px-3 py-2">{value}</span>)
  const state = fieldState(row, field)
  const mark = state && CELL_MARK[state]
  return full(
    <button
      type="button"
      // What is in it, its state, and what pressing does: the value is not hidden.
      aria-label={[value || t('review.empty'), state && t(`review.state.${state}`), label]
        .filter(Boolean)
        .join(', ')}
      className="flex w-full items-center gap-1 px-3 py-2 text-left hover:bg-state-hover"
      onClick={onStart}
    >
      <span className="min-w-0 flex-1 truncate">{value || ' '}</span>
      {mark && <mark.Icon aria-hidden className={cn('size-3 shrink-0', mark.className)} />}
    </button>
  )
}

/** Remove or restore a row, and undo its edits. */
export function RowActions({
  row,
  onRemove,
  onRestore,
  onRevert,
}: {
  row: ParsedRow<unknown>
  onRemove: () => void
  onRestore: () => void
  onRevert: () => void
}) {
  const { t } = useImportText()
  return (
    <>
      {row.isRemoved ? (
        <IconButton
          size="icon"
          tone="success"
          label={t('review.restore', { row: row.rowNumber })}
          onClick={onRestore}
        >
          <RotateCcw aria-hidden />
        </IconButton>
      ) : (
        <IconButton
          size="icon"
          tone="danger"
          label={t('review.remove', { row: row.rowNumber })}
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </IconButton>
      )}
      {row.isEdited && (
        <IconButton
          size="icon"
          tone="accent"
          label={t('review.revert', { row: row.rowNumber })}
          onClick={onRevert}
        >
          <Undo2 aria-hidden />
        </IconButton>
      )}
    </>
  )
}
