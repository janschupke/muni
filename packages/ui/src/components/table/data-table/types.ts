import type { ComponentProps, ReactNode } from 'react'

import type { Pagination } from '../pagination'
import type { SortingState } from './columns'

/**
 * How a table's rows are paged and sorted. `server`: the rows are one page the server sorted
 * and cut; the table neither sorts nor pages them, its pager steps are links and a sort header
 * hands the new order to `onSortingChange` (which changes the address). `local`: every row is
 * here, sorted (and paged, with `pageSize`) in the browser, for the reason given — rows that
 * exist only in the browser, or a list bounded by something small. The rendered table carries
 * which (`data-paging`), and the e2e checks hold every table to it.
 */
export type TablePaging =
  | {
      server: {
        page: number
        pageCount: number
        sorting: SortingState
        onSortingChange: (sorting: SortingState) => void
      } & (
        | { hrefFor: (page: number) => string; linkAs: ComponentProps<typeof Pagination>['linkAs'] }
        /** A list whose page is not in the address (one in an opened row). */
        | { onPageChange: (page: number) => void }
      )
    }
  | { local: string }

/** Rows the reader picks for an action (a checkbox column before the data). */
export interface RowSelection<TData> {
  selected: ReadonlySet<string>
  onSelectedChange: (next: Set<string>) => void
  /** Rows that can be picked; the others show no checkbox. Default: every row. */
  isRowSelectable?: ((row: TData) => boolean) | undefined
  /** Accessible name of a row's checkbox ("Select Novák Jan"). */
  rowLabel: (row: TData) => string
  /** Accessible name of the header checkbox ("Select every row on this page"). */
  pageLabel: string
}

/** The pager's words; `status` says where the reader is ("Page 2 of 5"). */
export interface PaginationLabels {
  nav: string
  previous: string
  next: string
  status: (page: number, pageCount: number) => ReactNode
}
