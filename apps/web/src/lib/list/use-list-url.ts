'use client'

import type { SortingState, TablePaging } from '@muni/ui/data-table'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Link } from '@/components/navigation/link'

import { type ListInput, listParam, listQuery, parseList, withParams } from './search-params'

/** The order a list has when none is asked for, shown on its column's header. */
export interface DefaultOrder<K extends string> {
  id: K
  desc: boolean
}

/** A server page's place among the others. */
export interface PageInfo {
  page: number
  pageCount: number
}

/** The header state for a list's sort: the one asked for, else the server's own order. */
const sortingOf = <K extends string>(
  sort: { by: K; desc: boolean } | undefined,
  fallback: DefaultOrder<K> | undefined
): SortingState => (sort ? [{ id: sort.by, desc: sort.desc }] : fallback ? [fallback] : [])

/**
 * A server-paged list's place in the address: its sort and page (`sort`, `dir`, `page`, or
 * `<prefix>Sort`… for a page's second list), read the way the page's prefetch read them.
 * `input` is what the list's read takes; `paging(result)` is the table's `paging`, whose pager
 * links and sort headers change the address and keep every other parameter (filters, the
 * page's other lists). A new order starts from the first page.
 */
export function useListUrl<K extends string, P extends string = ''>(
  keys: readonly K[],
  fallback?: DefaultOrder<K>,
  prefix: P = '' as P
): {
  input: ListInput<K, P>
  paging: (result: PageInfo) => TablePaging
  /** The address of another page of the list, everything else kept. */
  hrefFor: (page: number) => string
} {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const current = Object.fromEntries(params.entries())
  const input = parseList(current, keys, prefix)
  const href = (changes: Record<string, string | number | undefined>) =>
    withParams(pathname, current, changes)
  const sorting = sortingOf(listQuery(input, keys, prefix).sort, fallback)
  const hrefFor = (page: number) =>
    href({ [listParam(prefix, 'page')]: page > 1 ? page : undefined })
  return {
    input,
    hrefFor,
    paging: result => ({
      server: {
        page: result.page,
        pageCount: result.pageCount,
        hrefFor,
        linkAs: Link,
        sorting,
        onSortingChange: next => {
          const by = next[0]
          router.push(
            href({
              [listParam(prefix, 'sort')]: by?.id,
              [listParam(prefix, 'dir')]: by?.desc ? 'desc' : undefined,
              [listParam(prefix, 'page')]: undefined,
            }),
            { scroll: false }
          )
        },
      },
    }),
  }
}
