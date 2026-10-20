'use client'

import type { ParsedRow, ValidationIssue } from '@muni/importer'
import { cn } from '@muni/ui/cn'
import { createDataColumns, DataTable, type PaginationState } from '@muni/ui/data-table'
import { Input } from '@muni/ui/field'
import { IconButton } from '@muni/ui/icon-button'
import { Tooltip } from '@muni/ui/tooltip'
import { CircleX, Pencil, RotateCcw, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import { type ReactElement, useMemo, useState } from 'react'

import { usePaginationLabels } from '@/components/table/pagination-labels'

import { useImportText } from './use-issue-text'

export interface IndexedRow {
  index: number
  row: ParsedRow<unknown>
}

function fieldState(row: ParsedRow<unknown>, field: string): 'error' | 'warning' | 'edited' | null {
  if (row.errors.some(i => i.field === field)) return 'error'
  if (row.warnings.some(i => i.field === field)) return 'warning'
  if (row.raw[field] !== row.originalRaw[field]) return 'edited'
  return null
}

const CELL_TINT = {
  error: 'bg-danger-soft',
  warning: 'bg-warning-soft',
  edited: 'bg-info-soft',
} as const

/** Each state also has its own mark, so it never rests on the tint alone. */
const CELL_MARK = {
  error: { Icon: CircleX, className: 'text-danger-fg' },
  warning: { Icon: TriangleAlert, className: 'text-warning-fg' },
  edited: { Icon: Pencil, className: 'text-info-fg' },
} as const

const LINE = '__line'
const ACTIONS = '__actions'

const col = createDataColumns<IndexedRow>()

/**
 * Review table: sticky line number with a problem tooltip, editable cells, row actions.
 * Sorting and paging run over every row of the current filter, sorting first.
 */
export function ReviewTable({
  caption,
  columns,
  rows,
  pagination,
  onPaginationChange,
  onEdit,
  onRemove,
  onRestore,
  onRevert,
}: {
  /** The dataset's name: the table's accessible name. */
  caption: string
  columns: string[]
  rows: IndexedRow[]
  pagination: PaginationState
  onPaginationChange: (pagination: PaginationState) => void
  onEdit: (index: number, field: string, value: string) => void
  onRemove: (index: number) => void
  onRestore: (index: number) => void
  onRevert: (index: number) => void
}) {
  const { t, fieldLabel, issueText } = useImportText()
  const paginationLabels = usePaginationLabels()
  const [editing, setEditing] = useState<{ index: number; field: string } | null>(null)

  const tableColumns = useMemo(() => {
    const describe = (row: ParsedRow<unknown>) => {
      const line = (prefix: string, issue: ValidationIssue) =>
        `• ${fieldLabel(issue.field)}: ${issueText(issue)} (${prefix})`
      return [
        ...row.errors.map(i => line(t('review.errorPrefix'), i)),
        ...(row.errors.length && row.warnings.length ? [''] : []),
        ...row.warnings.map(i => line(t('review.warningPrefix'), i)),
      ].join('\n')
    }

    return col.columns([
      col.accessor(r => r.row.rowNumber, {
        id: LINE,
        header: t('review.rowNumber'),
        sortFn: 'basic',
        meta: { sticky: 'left', className: 'border-l-4 font-medium tabular-nums' },
        cell: ({ row: { original } }) => {
          const { row } = original
          if (row.errors.length === 0 && row.warnings.length === 0) return row.rowNumber
          return (
            <Tooltip content={describe(row)} side="right">
              <button
                type="button"
                className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 transition-colors hover:bg-state-hover"
                aria-label={`${t('review.problems', { row: row.rowNumber })}\n${describe(row)}`}
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
        },
      }),
      ...columns.map(field =>
        col.accessor(r => r.row.raw[field] ?? '', {
          id: field,
          header: fieldLabel(field),
          sortFn: 'text',
          cell: ({ row: { original } }) => {
            const { index, row } = original
            const value = row.raw[field] ?? ''
            const label = t('review.editCell', { field: fieldLabel(field), row: row.rowNumber })
            if (editing?.index === index && editing.field === field) {
              return (
                <Input
                  size="cell"
                  // The field replaces the cell the user just chose to edit, so focus follows.
                  // eslint-disable-next-line jsx-a11y-x/no-autofocus
                  autoFocus
                  defaultValue={value}
                  aria-label={label}
                  onBlur={event => {
                    setEditing(null)
                    if (event.target.value !== value) onEdit(index, field, event.target.value)
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                      event.currentTarget.value = value
                      setEditing(null)
                    }
                  }}
                />
              )
            }
            // The full value on hover: cells truncate long text.
            const full = (cell: ReactElement) =>
              value === '' ? cell : <Tooltip content={value}>{cell}</Tooltip>
            if (row.isRemoved) {
              return full(<span className="block truncate px-3 py-2">{value}</span>)
            }
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
                onClick={() => {
                  setEditing({ index, field })
                }}
              >
                <span className="min-w-0 flex-1 truncate">{value || '\u00a0'}</span>
                {mark && (
                  <mark.Icon aria-hidden className={cn('size-3 shrink-0', mark.className)} />
                )}
              </button>
            )
          },
        })
      ),
      col.display({
        id: ACTIONS,
        header: t('review.actions'),
        meta: { sticky: 'right', nowrap: true },
        cell: ({ row: { original } }) => {
          const { index, row } = original
          return (
            <>
              {row.isRemoved ? (
                <IconButton
                  size="icon"
                  tone="success"
                  label={t('review.restore', { row: row.rowNumber })}
                  onClick={() => {
                    onRestore(index)
                  }}
                >
                  <RotateCcw aria-hidden />
                </IconButton>
              ) : (
                <IconButton
                  size="icon"
                  tone="danger"
                  label={t('review.remove', { row: row.rowNumber })}
                  onClick={() => {
                    onRemove(index)
                  }}
                >
                  <Trash2 aria-hidden />
                </IconButton>
              )}
              {row.isEdited && (
                <IconButton
                  size="icon"
                  tone="accent"
                  label={t('review.revert', { row: row.rowNumber })}
                  onClick={() => {
                    onRevert(index)
                  }}
                >
                  <Undo2 aria-hidden />
                </IconButton>
              )}
            </>
          )
        },
      }),
    ])
  }, [columns, editing, fieldLabel, issueText, onEdit, onRemove, onRestore, onRevert, t])

  return (
    <DataTable
      caption={caption}
      columns={tableColumns}
      data={rows}
      getRowId={r => String(r.index)}
      paging={{
        local: 'rows of the uploaded files, which exist only in this browser until imported',
      }}
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      paginationLabels={paginationLabels}
      className="text-xs"
      containerClassName="max-h-[70vh]"
      rowClassName={r => (r.row.isRemoved || r.row.isSkipped ? 'opacity-50' : undefined)}
      cellClassName={({ row }, columnId) => {
        if (columnId === LINE) {
          return row.errors.length > 0
            ? 'border-l-danger-fill text-danger-fg'
            : row.warnings.length > 0
              ? 'border-l-warning-edge text-warning-fg'
              : 'border-l-transparent'
        }
        if (columnId === ACTIONS) return undefined
        const state = fieldState(row, columnId)
        return cn('max-w-64 p-0', state && CELL_TINT[state])
      }}
    />
  )
}
