'use client'

import {
  constructSortFn,
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  metaHelper,
  type PaginationState,
  type RowData,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_datetime,
  type SortingState,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Fragment, type ReactNode, useId, useState } from 'react'

import { cn } from '../cn'
import { SelectBox } from './checkbox'
import { ExpandButton } from './expand-button'
import { Pagination } from './pagination'
import { type CellLayout, Table, TableContainer, TBody, Td, Th, THead, Tr } from './table'

/** Per-column layout, read by the renderer. */
interface DataColumnMeta extends CellLayout {
  headerClassName?: string | undefined
  className?: string | undefined
}

// Czech data in either UI language: collate as Czech (č after c, ch after h), numbers naturally.
const collator = new Intl.Collator('cs', { numeric: true, sensitivity: 'base' })

const sortFn_text = constructSortFn({
  resolveDataValue: (value: unknown) =>
    typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '',
  sort: (a: string, b: string) => collator.compare(a, b),
})

const features = tableFeatures({
  rowExpandingFeature,
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
  renderExpanded,
  getRowCanExpand,
  expandLabel,
  expandHeader,
  selection,
}: {
  columns: Columns<TData>
  data: TData[]
  getRowId: (row: TData) => string
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
  paginationLabels?: {
    nav: string
    previous: string
    next: string
    status: (page: number, pageCount: number) => ReactNode
  }
  rowClassName?: (row: TData) => string | undefined
  cellClassName?: (row: TData, columnId: string) => string | undefined
  density?: 'default' | 'compact' | undefined
  className?: string | undefined
  containerClassName?: string | undefined
  /** Accessible table name, visually hidden. */
  caption?: string | undefined
  /** A detail panel under the row, toggled by a disclosure button in a leading column. */
  renderExpanded?: ((row: TData) => ReactNode) | undefined
  getRowCanExpand?: ((row: TData) => boolean) | undefined
  /** Accessible name of each row's disclosure button ("Details: Novák Jan"). */
  expandLabel?: ((row: TData) => string) | undefined
  /** Visually hidden header of the disclosure column ("Details"). */
  expandHeader?: string | undefined
  selection?: RowSelection<TData> | undefined
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
    getRowCanExpand: row =>
      renderExpanded !== undefined && (getRowCanExpand?.(row.original) ?? true),
    // A new page of data (server sort, an edit) keeps what the reader had open.
    autoResetExpanded: false,
  })
  const idPrefix = useId()
  const expandable = renderExpanded !== undefined

  const rows = paginated ? table.getRowModel().rows : table.getPrePaginatedRowModel().rows
  const pageCount = paginated ? table.getPageCount() : 1
  const leading = (expandable ? 1 : 0) + (selection ? 1 : 0)

  const selectableIds = selection
    ? rows.filter(row => selection.isRowSelectable?.(row.original) ?? true).map(row => row.id)
    : []
  const pickedOnPage = selectableIds.filter(id => selection?.selected.has(id)).length
  const pageState =
    pickedOnPage === 0 ? false : pickedOnPage === selectableIds.length ? true : 'indeterminate'
  const togglePage = () => {
    if (!selection) return
    const next = new Set(selection.selected)
    for (const id of selectableIds) {
      if (pageState === true) next.delete(id)
      else next.add(id)
    }
    selection.onSelectedChange(next)
  }
  const toggleRow = (id: string, on: boolean) => {
    if (!selection) return
    const next = new Set(selection.selected)
    if (on) next.add(id)
    else next.delete(id)
    selection.onSelectedChange(next)
  }

  return (
    <>
      <TableContainer className={containerClassName}>
        <Table density={density} className={className}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <THead className="sticky top-0 z-10">
            {table.getHeaderGroups().map(group => (
              <tr key={group.id}>
                {expandable && (
                  <Th className="w-0 px-1">
                    <span className="sr-only">{expandHeader}</span>
                  </Th>
                )}
                {selection && (
                  <Th className="w-0 px-2">
                    {selectableIds.length > 0 && (
                      <SelectBox
                        checked={pageState}
                        onCheckedChange={togglePage}
                        aria-label={selection.pageLabel}
                      />
                    )}
                  </Th>
                )}
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
            {rows.map(row => {
              const open = row.getIsExpanded()
              const detailId = `${idPrefix}-${row.id}-detail`
              const cells = row.getAllCells()
              return (
                <Fragment key={row.id}>
                  <Tr
                    className={cn(
                      rowClassName?.(row.original),
                      open && '[--row-state:var(--color-state-hover)]',
                      selection?.selected.has(row.id) && '[--row-state:var(--color-state-selected)]'
                    )}
                  >
                    {expandable && (
                      <Td className="w-0 px-1">
                        {row.getCanExpand() && (
                          <ExpandButton
                            open={open}
                            aria-controls={open ? detailId : undefined}
                            aria-label={expandLabel?.(row.original)}
                            onClick={row.getToggleExpandedHandler()}
                          />
                        )}
                      </Td>
                    )}
                    {selection && (
                      <Td className="w-0 px-2">
                        {(selection.isRowSelectable?.(row.original) ?? true) && (
                          <SelectBox
                            checked={selection.selected.has(row.id)}
                            onCheckedChange={on => {
                              toggleRow(row.id, on)
                            }}
                            aria-label={selection.rowLabel(row.original)}
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
                          className={cn(
                            meta?.className,
                            cellClassName?.(row.original, cell.column.id)
                          )}
                        >
                          <table.FlexRender cell={cell} />
                        </Td>
                      )
                    })}
                  </Tr>
                  {open && renderExpanded && (
                    <tr id={detailId} className="bg-surface-sunken">
                      <td colSpan={cells.length + leading} className="p-0">
                        {/* Opens from zero height: the grid row animates from its starting style. */}
                        <div className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-(--motion-normal) starting:grid-rows-[0fr]">
                          <div className="overflow-hidden">
                            <div className="p-4">{renderExpanded(row.original)}</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
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
