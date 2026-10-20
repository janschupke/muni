import { type RowData, useTable } from '@tanstack/react-table'
import { type ReactNode, useState } from 'react'

import { type Columns, features, type PaginationState, type SortingState } from './columns'
import type { TablePaging } from './types'

/**
 * The table and the order and page it shows. A server list's order is the address's (a
 * header asks for the next one); a local list sorts and pages in the browser, controlled or
 * not. A page past the end (fewer rows than before, an old address) shows the last page,
 * never an empty table under "Page 3 of 2".
 */
export function useTableState<TData extends RowData>({
  columns,
  data,
  getRowId,
  paging,
  initialSorting,
  sorting: controlledSorting,
  onSortingChange,
  manualSorting,
  enableSorting,
  pageSize,
  pagination: controlledPagination,
  onPaginationChange,
  renderExpanded,
  getRowCanExpand,
}: {
  columns: Columns<TData>
  data: TData[]
  getRowId: (row: TData) => string
  paging: TablePaging
  initialSorting: SortingState
  sorting: SortingState | undefined
  onSortingChange: ((sorting: SortingState) => void) | undefined
  manualSorting: boolean
  enableSorting: boolean
  pageSize: number | undefined
  pagination: PaginationState | undefined
  onPaginationChange: ((pagination: PaginationState) => void) | undefined
  renderExpanded: ((row: TData) => ReactNode) | undefined
  getRowCanExpand: ((row: TData) => boolean) | undefined
}) {
  const server = 'server' in paging ? paging.server : undefined
  const [innerSorting, setInnerSorting] = useState<SortingState>(initialSorting)
  const [innerPagination, setInnerPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize ?? 50,
  })
  const sorting = server?.sorting ?? controlledSorting ?? innerSorting
  const asked = controlledPagination ?? innerPagination
  const paginated = !server && (pageSize !== undefined || controlledPagination !== undefined)
  const lastIndex = Math.max(0, Math.ceil(data.length / asked.pageSize) - 1)
  const pagination = asked.pageIndex > lastIndex ? { ...asked, pageIndex: lastIndex } : asked

  const setPagination = (next: PaginationState) => {
    if (controlledPagination === undefined) setInnerPagination(next)
    onPaginationChange?.(next)
  }

  const table = useTable({
    features,
    columns,
    data,
    getRowId,
    state: { sorting, pagination },
    onSortingChange: updater => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      // The server sorts, from the first page: the new order goes to the address.
      if (server) {
        server.onSortingChange(next)
        return
      }
      if (controlledSorting === undefined) setInnerSorting(next)
      onSortingChange?.(next)
      // A new order starts from the first page.
      if (paginated && pagination.pageIndex !== 0) setPagination({ ...pagination, pageIndex: 0 })
    },
    onPaginationChange: updater => {
      setPagination(typeof updater === 'function' ? updater(pagination) : updater)
    },
    manualSorting: manualSorting || server !== undefined,
    enableSorting,
    enableMultiSort: false,
    // A server list always has an order: a header flips between its two directions.
    enableSortingRemoval: server === undefined,
    sortDescFirst: false,
    // Editing a row must not throw the reader back to page 1.
    autoResetPageIndex: false,
    defaultColumn: { sortUndefined: 'last' },
    getRowCanExpand: row =>
      renderExpanded !== undefined && (getRowCanExpand?.(row.original) ?? true),
    // A new page of data (server sort, an edit) keeps what the reader had open.
    autoResetExpanded: false,
  })

  return {
    table,
    server,
    paginated,
    pagination,
    setPagination,
    rows: paginated ? table.getRowModel().rows : table.getPrePaginatedRowModel().rows,
    pageCount: paginated ? table.getPageCount() : 1,
  }
}
