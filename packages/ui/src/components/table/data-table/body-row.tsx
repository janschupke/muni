import { FlexRender, type Row, type RowData } from '@tanstack/react-table'
import { Fragment, type ReactNode } from 'react'

import { cn } from '../../../cn'
import { SelectBox } from '../../forms/checkbox'
import { ExpandButton } from '../expand-button'
import { Td, Tr } from '../table'
import type { Features } from './columns'

/**
 * One row: its disclosure button and checkbox (when the table has them), its cells, and, when
 * open, its detail panel spanning the table under it.
 */
export function BodyRow<TData extends RowData>({
  row,
  detailId,
  leading,
  className,
  cellClassName,
  expand,
  select,
}: {
  row: Row<Features, TData>
  detailId: string
  /** Columns before the data (disclosure, checkbox), for the detail panel to span. */
  leading: number
  className: string | undefined
  cellClassName: ((row: TData, columnId: string) => string | undefined) | undefined
  expand: { label: string | undefined; render: (row: TData) => ReactNode } | null
  /** The row's checkbox; none without selection, an empty cell for a row that cannot be picked. */
  select: {
    shown: boolean
    checked: boolean
    onChange: (on: boolean) => void
    label: string
  } | null
}) {
  const open = row.getIsExpanded()
  const cells = row.getAllCells()
  return (
    <Fragment>
      <Tr
        className={cn(
          className,
          open && '[--row-state:var(--color-state-hover)]',
          select?.checked && '[--row-state:var(--color-state-selected)]'
        )}
      >
        {expand && (
          <Td className="w-0 px-1">
            {row.getCanExpand() && (
              <ExpandButton
                open={open}
                aria-controls={open ? detailId : undefined}
                aria-label={expand.label}
                onClick={row.getToggleExpandedHandler()}
              />
            )}
          </Td>
        )}
        {select && (
          <Td className="w-0 px-2">
            {select.shown && (
              <SelectBox
                checked={select.checked}
                onCheckedChange={select.onChange}
                aria-label={select.label}
              />
            )}
          </Td>
        )}
        {cells.map(cell => {
          const meta = cell.column.columnDef.meta
          return (
            <Td
              key={cell.id}
              align={meta?.align}
              nowrap={meta?.nowrap}
              sticky={meta?.sticky}
              className={cn(meta?.className, cellClassName?.(row.original, cell.column.id))}
            >
              <FlexRender cell={cell} />
            </Td>
          )
        })}
      </Tr>
      {open && expand && (
        <tr id={detailId} className="bg-surface-sunken">
          <td colSpan={cells.length + leading} className="p-0">
            {/* Opens from zero height: the grid row animates from its starting style. */}
            <div className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-(--motion-normal) starting:grid-rows-[0fr]">
              <div className="overflow-hidden">
                {/* As wide as the visible table, not the whole one: on a phone a
                    wide table scrolls sideways, its opened row stays in view. */}
                <div className="sticky left-0 w-[100cqw] max-w-full p-4">
                  {expand.render(row.original)}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}
