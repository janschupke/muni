'use client'

import {
  constructSortFn,
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_datetime,
  tableFeatures,
  useTable,
  type PaginationState,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { cn } from '../cn'
import { Pagination } from './pagination'
import { Table, TableContainer, TBody, Td, Th, THead, Tr, type CellLayout } from './table'

/** Per-column layout, read by the renderer. */
interface DataColumnMeta extends CellLayout {
  headerClassName?: string
  className?: string
}

// Czech data in either UI language: collate as Czech (č after c, ch after h), numbers naturally.
const collator = new Intl.Collator('cs', { numeric: true, sensitivity: 'base' })

const sortFn_text = constructSortFn({
  resolveDataValue: (value: unknown) =>
    typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '',
  sort: (a: string, b: string) => collator.compare(a, b),
})

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  // 'auto' resolves strings with digits to `alphanumeric`; the collator is already numeric.
  sortFns: {
    text: sortFn_text,
    alphanumeric: sortFn_text,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
  },
  columnMeta: metaHelper<DataColumnMeta>(),
})

type Features = typeof features

/**
 * Column helper typed to DataTable's features. Accessors return `undefined` for a missing
 * value; those rows sort last in both directions. Strings sort with `sortFn: 'text'` (Czech
 * collation), numbers with `'basic'`, `Date`s with `'datetime'`.
 */
export function createDataColumns<TData extends RowData>() {
  return createColumnHelper<Features, TData>()
}

type Columns<TData extends RowData> = ReturnType<
  ReturnType<typeof createDataColumns<TData>>['columns']
>

export type { PaginationState, SortingState }

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  initialSorting = [],
  sorting: controlledSorting,
  onSortingChange,
  manualSorting = false,
  enableSorting = true,
  pageSize,
  pagination: controlledPagination,
  onPaginationChange,
  paginationLabels,
  rowClassName,
  cellClassName,
  density,
  className,
  containerClassName,
  caption,
}: {
  columns: Columns<TData>
  data: TData[]
  getRowId: (row: TData) => string
  initialSorting?: SortingState
  /** Controlled sorting; with `manualSorting` the caller sorts `data` (e.g. on the server). */
  sorting?: SortingState
  onSortingChange?: (sorting: SortingState) => void
  manualSorting?: boolean
  enableSorting?: boolean
  /** Paginates in the browser, after sorting. Omit to show every row. */
  pageSize?: number
  pagination?: PaginationState
  onPaginationChange?: (pagination: PaginationState) => void
  paginationLabels?: {
    nav: string
    previous: string
    next: string
    status: (page: number, pageCount: number) => ReactNode
  }
  rowClassName?: (row: TData) => string | undefined
  cellClassName?: (row: TData, columnId: string) => string | undefined
  density?: 'default' | 'compact'
  className?: string
  containerClassName?: string
  /** Accessible table name, visually hidden. */
  caption?: string
}) {
  const [innerSorting, setInnerSorting] = useState<SortingState>(initialSorting)
  const [innerPagination, setInnerPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize ?? 50,
  })
  const sorting = controlledSorting ?? innerSorting
  const pagination = controlledPagination ?? innerPagination
  const paginated = pageSize !== undefined || controlledPagination !== undefined

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
      if (controlledSorting === undefined) setInnerSorting(next)
      onSortingChange?.(next)
      // A new order starts from the first page.
      if (paginated && pagination.pageIndex !== 0) setPagination({ ...pagination, pageIndex: 0 })
    },
    onPaginationChange: updater => {
      setPagination(typeof updater === 'function' ? updater(pagination) : updater)
    },
    manualSorting,
    enableSorting,
    enableMultiSort: false,
    sortDescFirst: false,
    // Editing a row must not throw the reader back to page 1.
    autoResetPageIndex: false,
    defaultColumn: { sortUndefined: 'last' },
  })

  const rows = paginated ? table.getRowModel().rows : table.getPrePaginatedRowModel().rows
  const pageCount = paginated ? table.getPageCount() : 1

  return (
    <>
      <TableContainer className={containerClassName}>
        <Table density={density} className={className}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <THead className="sticky top-0 z-10">
            {table.getHeaderGroups().map(group => (
              <tr key={group.id}>
                {group.headers.map(header => {
                  const meta = header.column.columnDef.meta
                  const sorted = header.column.getIsSorted()
                  const content = header.isPlaceholder ? null : <table.FlexRender header={header} />
                  return (
                    <Th
                      key={header.id}
                      align={meta?.align}
                      sticky={meta?.sticky}
                      aria-sort={sorted ? ARIA_SORT[sorted] : undefined}
                      className={meta?.headerClassName}
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            '-mx-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-fg',
                            sorted && 'text-fg'
                          )}
                        >
                          {content}
                          <SortIcon direction={sorted} />
                        </button>
                      ) : (
                        content
                      )}
                    </Th>
                  )
                })}
              </tr>
            ))}
          </THead>
          <TBody>
            {rows.map(row => (
              <Tr key={row.id} className={rowClassName?.(row.original)}>
                {row.getAllCells().map(cell => {
                  const meta = cell.column.columnDef.meta
                  return (
                    <Td
                      key={cell.id}
                      align={meta?.align}
                      nowrap={meta?.nowrap}
                      sticky={meta?.sticky}
                      className={cn(meta?.className, cellClassName?.(row.original, cell.column.id))}
                    >
                      <table.FlexRender cell={cell} />
                    </Td>
                  )
                })}
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableContainer>
      {paginated && paginationLabels && (
        <Pagination
          page={pagination.pageIndex + 1}
          pageCount={pageCount}
          onPageChange={page => {
            setPagination({ ...pagination, pageIndex: page - 1 })
          }}
          labels={{
            nav: paginationLabels.nav,
            previous: paginationLabels.previous,
            next: paginationLabels.next,
            status: paginationLabels.status(pagination.pageIndex + 1, pageCount),
          }}
        />
      )}
    </>
  )
}

function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown
  return (
    <Icon
      aria-hidden
      className={cn('size-3.5 shrink-0', direction === false && 'text-fg-subtle')}
    />
  )
}
