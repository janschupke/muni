'use client'

import type { RowData } from '@tanstack/react-table'
import { type ReactNode, useId } from 'react'

import { cn } from '../../../cn'
import { Table, TableContainer, TBody, THead } from '../table'
import { BodyRow } from './body-row'
import type { Columns, PaginationState, SortingState } from './columns'
import { HeaderRow } from './header-row'
import { pageSelection } from './page-selection'
import { TablePager } from './table-pager'
import type { PaginationLabels, RowSelection, TablePaging } from './types'
import { useTableState } from './use-table-state'

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  paging,
  initialSorting = [],
  sorting,
  onSortingChange,
  manualSorting = false,
  enableSorting = true,
  pageSize,
  pagination,
  onPaginationChange,
  paginationLabels,
  rowClassName,
  cellClassName,
  density,
  className,
  containerClassName,
  caption,
  renderExpanded,
  getRowCanExpand,
  expandLabel,
  expandHeader,
  selection,
}: {
  columns: Columns<TData>
  data: TData[]
  getRowId: (row: TData) => string
  paging: TablePaging
  initialSorting?: SortingState | undefined
  /** Controlled sorting; with `manualSorting` the caller sorts `data` (e.g. on the server). */
  sorting?: SortingState | undefined
  onSortingChange?: ((sorting: SortingState) => void) | undefined
  manualSorting?: boolean | undefined
  enableSorting?: boolean | undefined
  /** Paginates in the browser, after sorting. Omit to show every row. */
  pageSize?: number | undefined
  pagination?: PaginationState | undefined
  onPaginationChange?: ((pagination: PaginationState) => void) | undefined
  paginationLabels?: PaginationLabels
  rowClassName?: (row: TData) => string | undefined
  cellClassName?: (row: TData, columnId: string) => string | undefined
  density?: 'default' | 'compact' | undefined
  className?: string | undefined
  containerClassName?: string | undefined
  /** The table's accessible name (read out, not shown): every table has one. */
  caption: string
  /** A detail panel under the row, toggled by a disclosure button in a leading column. */
  renderExpanded?: ((row: TData) => ReactNode) | undefined
  getRowCanExpand?: ((row: TData) => boolean) | undefined
  /** Accessible name of each row's disclosure button ("Details: Novák Jan"). */
  expandLabel?: ((row: TData) => string) | undefined
  /** Visually hidden header of the disclosure column ("Details"). */
  expandHeader?: string | undefined
  selection?: RowSelection<TData> | undefined
}) {
  const state = useTableState({
    columns,
    data,
    getRowId,
    paging,
    initialSorting,
    sorting,
    onSortingChange,
    manualSorting,
    enableSorting,
    pageSize,
    pagination,
    onPaginationChange,
    renderExpanded,
    getRowCanExpand,
  })
  const { table, rows } = state
  const idPrefix = useId()
  const picks = pageSelection(selection, rows)
  const leading = (renderExpanded ? 1 : 0) + (selection ? 1 : 0)

  return (
    <>
      <TableContainer
        className={cn('@container', containerClassName)}
        paging={'server' in paging ? 'server' : paging.local}
      >
        <Table density={density} className={className}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <THead className="sticky top-0 z-10">
            {table.getHeaderGroups().map(group => (
              <HeaderRow
                key={group.id}
                group={group}
                expandHeader={renderExpanded ? (expandHeader ?? '') : null}
                selectPage={
                  selection
                    ? {
                        shown: picks.selectableIds.length > 0,
                        checked: picks.pageState,
                        onToggle: picks.togglePage,
                        label: selection.pageLabel,
                      }
                    : null
                }
              />
            ))}
          </THead>
          <TBody>
            {rows.map(row => (
              <BodyRow
                key={row.id}
                row={row}
                detailId={`${idPrefix}-${row.id}-detail`}
                leading={leading}
                className={rowClassName?.(row.original)}
                cellClassName={cellClassName}
                expand={
                  renderExpanded
                    ? { label: expandLabel?.(row.original), render: renderExpanded }
                    : null
                }
                select={
                  selection
                    ? {
                        shown: selection.isRowSelectable?.(row.original) ?? true,
                        checked: selection.selected.has(row.id),
                        onChange: on => {
                          picks.toggleRow(row.id, on)
                        },
                        label: selection.rowLabel(row.original),
                      }
                    : null
                }
              />
            ))}
          </TBody>
        </Table>
      </TableContainer>
      <TablePager
        server={state.server}
        local={
          state.paginated
            ? {
                pagination: state.pagination,
                pageCount: state.pageCount,
                onChange: state.setPagination,
              }
            : null
        }
        labels={paginationLabels}
      />
    </>
  )
}
