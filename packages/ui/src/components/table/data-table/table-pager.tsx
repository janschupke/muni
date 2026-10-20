import { Pagination } from '../pagination'
import type { PaginationState } from './columns'
import type { PaginationLabels, TablePaging } from './types'

/**
 * The pager under a table: a server list's (its steps are links, or a callback for a list
 * whose page is not in the address), or a local list's, paging in the browser.
 */
export function TablePager({
  server,
  local,
  labels,
}: {
  server: Extract<TablePaging, { server: unknown }>['server'] | undefined
  /** The browser's page, when the table pages its own rows. */
  local: {
    pagination: PaginationState
    pageCount: number
    onChange: (pagination: PaginationState) => void
  } | null
  labels: PaginationLabels | undefined
}) {
  if (!labels) return null
  const words = (page: number, pageCount: number) => ({
    nav: labels.nav,
    previous: labels.previous,
    next: labels.next,
    status: labels.status(page, pageCount),
  })
  if (server)
    return (
      <Pagination
        page={server.page}
        pageCount={server.pageCount}
        {...('hrefFor' in server
          ? { hrefFor: server.hrefFor, linkAs: server.linkAs }
          : { onPageChange: server.onPageChange })}
        labels={words(server.page, server.pageCount)}
      />
    )
  if (!local) return null
  const page = local.pagination.pageIndex + 1
  return (
    <Pagination
      page={page}
      pageCount={local.pageCount}
      onPageChange={(next: number) => {
        local.onChange({ ...local.pagination, pageIndex: next - 1 })
      }}
      labels={words(page, local.pageCount)}
    />
  )
}
