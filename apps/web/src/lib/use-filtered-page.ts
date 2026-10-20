'use client'

import { useMemo, useState } from 'react'

/**
 * A list shown through a filter, a page at a time, in the browser. Choosing the filter that is
 * on goes back to `everything`; a new filter starts from the first page; a page that a shrinking
 * list leaves behind shows the last one there is. Each item keeps its index in the whole list.
 */
export function useFilteredPage<T, F extends string>(
  items: readonly T[],
  matches: (item: T, filter: F) => boolean,
  everything: F,
  pageSize: number
) {
  const [filter, setFilter] = useState<F>(everything)
  const [page, setPage] = useState(0)
  const filtered = useMemo(
    () => items.flatMap((item, index) => (matches(item, filter) ? [{ index, item }] : [])),
    [items, matches, filter]
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  return {
    filter,
    choose: (next: F) => {
      setFilter(prev => (prev === next ? everything : next))
      setPage(0)
    },
    filtered,
    page: Math.min(page, pageCount - 1),
    setPage,
  }
}
