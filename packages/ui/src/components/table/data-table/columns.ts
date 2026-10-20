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
} from '@tanstack/react-table'

import type { CellLayout } from '../table'

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

export const features = tableFeatures({
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

export type Features = typeof features

/**
 * Column helper typed to DataTable's features. Accessors return `undefined` for a missing
 * value; those rows sort last in both directions. Strings sort with `sortFn: 'text'` (Czech
 * collation), numbers with `'basic'`, `Date`s with `'datetime'`.
 */
export function createDataColumns<TData extends RowData>() {
  return createColumnHelper<Features, TData>()
}

/** The column helper for a table of `TData` rows. */
export type DataColumns<TData extends RowData> = ReturnType<typeof createDataColumns<TData>>

export type Columns<TData extends RowData> = ReturnType<DataColumns<TData>['columns']>

export type { PaginationState, RowData, SortingState }
