'use client'

import type { ParsedRow, ValidationIssue } from '@muni/importer'
import { Button } from '@muni/ui/button'
import { cn } from '@muni/ui/cn'
import { Table, TableContainer, TBody, Td, Th, THead } from '@muni/ui/table'
import { Tooltip } from '@muni/ui/tooltip'
import { CircleAlert, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'

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

/** Paginated review table: sticky line number with a problem tooltip, editable cells, row actions. */
export function ReviewTable({
  columns,
  rows,
  onEdit,
  onRemove,
  onRestore,
  onRevert,
  readOnly = false,
}: {
  columns: string[]
  rows: IndexedRow[]
  onEdit?: (index: number, field: string, value: string) => void
  onRemove?: (index: number) => void
  onRestore?: (index: number) => void
  onRevert?: (index: number) => void
  readOnly?: boolean
}) {
  const { t, fieldLabel, issueText } = useImportText()
  const [editing, setEditing] = useState<{ index: number; field: string } | null>(null)

  const describe = (row: ParsedRow<unknown>) => {
    const line = (prefix: string, issue: ValidationIssue) =>
      `• ${fieldLabel(issue.field)}: ${issueText(issue)} (${prefix})`
    return [
      ...row.errors.map(i => line(t('review.errorPrefix'), i)),
      ...(row.errors.length && row.warnings.length ? [''] : []),
      ...row.warnings.map(i => line(t('review.warningPrefix'), i)),
    ].join('\n')
  }

  return (
    <TableContainer className="max-h-[70vh]">
      <Table className="text-xs">
        <THead className="sticky top-0 z-10">
          <tr>
            <Th className="sticky left-0 z-20 bg-surface-sunken">{t('review.rowNumber')}</Th>
            {columns.map(c => (
              <Th key={c}>{fieldLabel(c)}</Th>
            ))}
            {!readOnly && (
              <Th className="sticky right-0 z-20 bg-surface-sunken">{t('review.actions')}</Th>
            )}
          </tr>
        </THead>
        <TBody>
          {rows.map(({ index, row }) => {
            const hasError = row.errors.length > 0
            const hasWarning = row.warnings.length > 0
            return (
              <tr key={index} className={cn(row.isRemoved && 'opacity-50')}>
                <Td
                  className={cn(
                    'sticky left-0 z-[1] border-l-4 bg-surface-elevated font-medium tabular-nums',
                    hasError
                      ? 'border-l-danger-fill text-danger-fg'
                      : hasWarning
                        ? 'border-l-warning-fill text-warning-fg'
                        : 'border-l-transparent'
                  )}
                >
                  {hasError || hasWarning ? (
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
                  ) : (
                    row.rowNumber
                  )}
                </Td>
                {columns.map(field => {
                  const state = fieldState(row, field)
                  const value = row.raw[field] ?? ''
                  const isEditing = editing?.index === index && editing.field === field
                  return (
                    <Td key={field} className={cn('max-w-64 p-0', state && CELL_TINT[state])}>
                      {isEditing ? (
                        <input
                          autoFocus
                          defaultValue={value}
                          aria-label={t('review.editCell', {
                            field: fieldLabel(field),
                            row: row.rowNumber,
                          })}
                          className="w-full min-w-24 bg-surface-elevated px-2 py-1.5 text-xs outline-2 outline-focus-ring"
                          onBlur={event => {
                            setEditing(null)
                            if (event.target.value !== value)
                              onEdit?.(index, field, event.target.value)
                          }}
                          onKeyDown={event => {
                            if (event.key === 'Enter') event.currentTarget.blur()
                            if (event.key === 'Escape') {
                              event.currentTarget.value = value
                              setEditing(null)
                            }
                          }}
                        />
                      ) : readOnly || row.isRemoved ? (
                        <span className="block truncate px-3 py-2" title={value}>
                          {value}
                        </span>
                      ) : (
                        <button
                          type="button"
                          title={value}
                          aria-label={t('review.editCell', {
                            field: fieldLabel(field),
                            row: row.rowNumber,
                          })}
                          className="block w-full truncate px-3 py-2 text-left hover:bg-state-hover"
                          onClick={() => {
                            setEditing({ index, field })
                          }}
                        >
                          {value || '\u00a0'}
                        </button>
                      )}
                    </Td>
                  )
                })}
                {!readOnly && (
                  <Td className="sticky right-0 z-[1] bg-surface-elevated whitespace-nowrap">
                    {row.isRemoved ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('review.restore')}
                        title={t('review.restore')}
                        onClick={() => onRestore?.(index)}
                      >
                        <RotateCcw aria-hidden />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('review.remove')}
                        title={t('review.remove')}
                        onClick={() => onRemove?.(index)}
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
                        onClick={() => onRevert?.(index)}
                      >
                        <Undo2 aria-hidden />
                      </Button>
                    )}
                  </Td>
                )}
              </tr>
            )
          })}
        </TBody>
      </Table>
    </TableContainer>
  )
}
