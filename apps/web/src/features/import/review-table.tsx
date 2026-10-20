'use client'

import type { ParsedRow, ValidationIssue } from '@muni/importer'
import { cn } from '@muni/ui/cn'
import { createDataColumns, DataTable, type PaginationState } from '@muni/ui/data-table'
import { useMemo, useState } from 'react'

import { usePaginationLabels } from '@/components/table/pagination-labels'

import { EditableCell, fieldState, LineCell, RowActions } from './review-cells'
import { useImportText } from './use-issue-text'

export interface IndexedRow {
  index: number
  row: ParsedRow<unknown>
}

const CELL_TINT = {
  error: 'bg-danger-soft',
  warning: 'bg-warning-soft',
  edited: 'bg-info-soft',
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
        cell: ({ row: { original } }) => (
          <LineCell row={original.row} problems={describe(original.row)} />
        ),
      }),
      ...columns.map(field =>
        col.accessor(r => r.row.raw[field] ?? '', {
          id: field,
          header: fieldLabel(field),
          sortFn: 'text',
          cell: ({ row: { original } }) => {
            const { index, row } = original
            return (
              <EditableCell
                row={row}
                field={field}
                label={t('review.editCell', { field: fieldLabel(field), row: row.rowNumber })}
                editing={editing?.index === index && editing.field === field}
                onStart={() => {
                  setEditing({ index, field })
                }}
                onDone={value => {
                  setEditing(null)
                  if (value !== null) onEdit(index, field, value)
                }}
              />
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
            <RowActions
              row={row}
              onRemove={() => {
                onRemove(index)
              }}
              onRestore={() => {
                onRestore(index)
              }}
              onRevert={() => {
                onRevert(index)
              }}
            />
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
