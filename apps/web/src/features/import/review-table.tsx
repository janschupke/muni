'use client'

import type { ParsedRow, ValidationIssue } from '@muni/importer'
import { Button } from '@muni/ui/button'
import { cn } from '@muni/ui/cn'
import { createDataColumns, DataTable, type PaginationState } from '@muni/ui/data-table'
import { Input } from '@muni/ui/field'
import { Tooltip } from '@muni/ui/tooltip'
import { CircleAlert, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

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

const LINE = '__line'
const ACTIONS = '__actions'

const col = createDataColumns<IndexedRow>()

/**
 * Review table: sticky line number with a problem tooltip, editable cells, row actions.
 * Sorting and paging run over every row of the current filter, sorting first.
 */
export function ReviewTable({
  columns,
  rows,
  pagination,
  onPaginationChange,
  onEdit,
  onRemove,
  onRestore,
  onRevert,
}: {
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
  const tc = useTranslations('common')
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
                className="inline-flex items-center gap-1 rounded-sm hover:underline"
                aria-label={`${t('review.problems', { row: row.rowNumber })}\n${describe(row)}`}
              >
                {row.rowNumber}
                <CircleAlert aria-hidden className="size-3.5" />
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
            if (row.isRemoved) {
              return (
                <span className="block truncate px-3 py-2" title={value}>
                  {value}
                </span>
              )
            }
            return (
              <button
                type="button"
                title={value}
                aria-label={label}
                className="block w-full truncate px-3 py-2 text-left hover:bg-state-hover"
                onClick={() => {
                  setEditing({ index, field })
                }}
              >
                {value || '\u00a0'}
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
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('review.restore')}
                  title={t('review.restore')}
                  onClick={() => {
                    onRestore(index)
                  }}
                >
                  <RotateCcw aria-hidden />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('review.remove')}
                  title={t('review.remove')}
                  onClick={() => {
                    onRemove(index)
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
              {row.isEdited && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('review.revert')}
                  title={t('review.revert')}
                  onClick={() => {
                    onRevert(index)
                  }}
                >
                  <Undo2 aria-hidden />
                </Button>
              )}
            </>
          )
        },
      }),
    ])
  }, [columns, editing, fieldLabel, issueText, onEdit, onRemove, onRestore, onRevert, t])

  return (
    <DataTable
      columns={tableColumns}
      data={rows}
      getRowId={r => String(r.index)}
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      paginationLabels={{
        nav: tc('pagination'),
        previous: tc('previous'),
        next: tc('next'),
        status: (page, pageCount) => tc('page', { page, pageCount }),
      }}
      className="text-xs"
      containerClassName="max-h-[70vh]"
      rowClassName={r => (r.row.isRemoved ? 'opacity-50' : undefined)}
      cellClassName={({ row }, columnId) => {
        if (columnId === LINE) {
          return row.errors.length > 0
            ? 'border-l-danger-fill text-danger-fg'
            : row.warnings.length > 0
              ? 'border-l-warning-fill text-warning-fg'
              : 'border-l-transparent'
        }
        if (columnId === ACTIONS) return undefined
        const state = fieldState(row, columnId)
        return cn('max-w-64 p-0', state && CELL_TINT[state])
      }}
    />
  )
}
