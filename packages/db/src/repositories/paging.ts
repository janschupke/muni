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
