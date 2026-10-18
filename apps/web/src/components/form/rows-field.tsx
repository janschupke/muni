'use client'

import { Button } from '@muni/ui/button'
import { cn } from '@muni/ui/cn'
import { IconButton } from '@muni/ui/icon-button'
import { Plus, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'

import { useField } from './form-shell'

/** One row of a `RowsField`: its stable key, its cells, and the name its Remove button says. */
export interface FieldRowItem {
  key: string
  cells: ReactNode
  removeLabel: string
}

/**
 * Repeated rows in a form, as a table: a header names each column, every row holds its own
 * controls (each labelled for assistive technology, `hideLabel`) and a Remove button named for
 * the row; "Add" opens a new row under the last. The rows post as `name.0.field`,
 * `name.1.field`, … (`rows` in lib/form reads them back), so an error on one field of one row
 * shows on that field; an error about the rows as a whole (`name`) shows under the legend.
 * Focus moves to a new row's first control, and back to "Add" after a row is removed.
 */
export function RowsField({
  name,
  legend,
  help,
  columns,
  items,
  addLabel,
  onAdd,
  onRemove,
  empty,
  canAdd = true,
}: {
  name: string
  legend: string
  help?: string | undefined
  /** The column headers, one per cell. */
  columns: string[]
  items: FieldRowItem[]
  addLabel: string
  onAdd: () => void
  onRemove: (key: string) => void
  /** Said in place of the rows when there are none. */
  empty: string
  /** False when there is nothing left to add (every course is listed). */
  canAdd?: boolean | undefined
}) {
  const { error, changed } = useField(name)
  const list = useRef<HTMLDivElement>(null)
  const add = useRef<HTMLButtonElement>(null)
  const pending = useRef<'added' | 'removed' | null>(null)
  const count = items.length

  // Once the rows have changed: the form sees what it now posts, and the new row's first
  // control, or "Add", takes the focus.
  useEffect(() => {
    const what = pending.current
    if (what === null) return
    pending.current = null
    changed()
    if (what === 'added') {
      const rows = list.current?.querySelectorAll<HTMLElement>('[data-row]')
      rows?.[rows.length - 1]?.querySelector<HTMLElement>('button, input, select')?.focus()
    } else {
      add.current?.focus()
    }
  }, [count, changed])

  const grid = cn(
    'grid items-start gap-x-3 gap-y-2',
    columns.length === 2 ? 'grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]' : 'grid-cols-[1fr_auto]'
  )
  return (
    <fieldset data-field={name} className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-fg">{legend}</legend>
      {help && <p className="text-xs text-fg-muted">{help}</p>}
      {error && (
        <p aria-live="polite" className="text-xs text-danger-fg">
          {error}
        </p>
      )}
      <div ref={list} className="flex flex-col gap-2">
        {count === 0 ? (
          <p className="text-sm text-fg-subtle">{empty}</p>
        ) : (
          <>
            <div aria-hidden className={cn(grid, 'text-xs font-medium text-fg-muted')}>
              {columns.map(c => (
                <span key={c}>{c}</span>
              ))}
              <span className="w-8" />
            </div>
            {items.map(item => (
              <div key={item.key} data-row className={grid}>
                {item.cells}
                <IconButton
                  tone="danger"
                  label={item.removeLabel}
                  onClick={() => {
                    pending.current = 'removed'
                    onRemove(item.key)
                  }}
                >
                  <X aria-hidden />
                </IconButton>
              </div>
            ))}
          </>
        )}
      </div>
      {canAdd && (
        <div>
          <Button
            ref={add}
            size="sm"
            onClick={() => {
              pending.current = 'added'
              onAdd()
            }}
          >
            <Plus aria-hidden />
            {addLabel}
          </Button>
        </div>
      )}
    </fieldset>
  )
}
