import { czechCollator } from '@muni/utils/text'

/** One page of a list, with where it sits among the rest. */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

/**
 * Where a page asked for falls among `total` rows: the size held to 1–100, the page to the
 * ones that exist (an empty list still has page 1), and how many rows to skip to reach it.
 */
export function pageBounds(
  total: number,
  asked: { page?: number | undefined; pageSize?: number | undefined }
): { page: number; pageSize: number; pageCount: number; skip: number } {
  const pageSize = Math.min(Math.max(asked.pageSize ?? 25, 1), 100)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(asked.page ?? 1, 1), pageCount)
  return { page, pageSize, pageCount, skip: (page - 1) * pageSize }
}

/** What a list reads from the address: the page, and the column it is sorted by. */
export interface ListQuery<K extends string> {
  page?: number | undefined
  pageSize?: number | undefined
  sort?: { by: K; desc: boolean } | undefined
}

/** A value a list sorts by; missing ones sort last in either direction. */
export type SortValue = string | number | null | undefined

function compare(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  // Czech data in either UI language: č after c, ch after h, numbers within text naturally.
  return czechCollator.compare(String(a), String(b))
}

/**
 * One page of rows, sorted on the server by the column asked for (`keys` gives each column's
 * value), else kept in the order they come in. The sort is stable, so ties keep that order.
 */
export function pageOf<T, K extends string>(
  rows: readonly T[],
  query: ListQuery<K>,
  keys: Record<K, (row: T) => SortValue>
): Page<T> {
  const sort = query.sort
  const sorted = sort
    ? [...rows].sort((x, y) => {
        const a = keys[sort.by](x)
        const b = keys[sort.by](y)
        const missingA = a === null || a === undefined || a === ''
        const missingB = b === null || b === undefined || b === ''
        if (missingA || missingB) return missingA === missingB ? 0 : missingA ? 1 : -1
        return sort.desc ? compare(b, a) : compare(a, b)
      })
    : rows
  const { page, pageSize, pageCount, skip } = pageBounds(sorted.length, query)
  return {
    items: sorted.slice(skip, skip + pageSize),
    total: sorted.length,
    page,
    pageSize,
    pageCount,
  }
}
