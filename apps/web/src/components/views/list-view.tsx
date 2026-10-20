'use client'

import type { Archivable } from '@muni/domain/archive'
import { cn } from '@muni/ui/cn'
import { PageHeader } from '@muni/ui/page-header'
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { readQuery } from '@/lib/query/queries'
import type { ReadInput, ReadName, ReadOutput } from '@/server/reads/core/registry'

import { type Create, ListActions, ListEmpty } from './list-actions'
import { ReadView } from './read-view'

/**
 * A list's read: the page the address asks for. While the next one loads (a new page, sort or
 * filter), the current rows stay on screen, dimmed (`ListView`).
 */
export function useListRead<N extends ReadName>(
  name: N,
  input: ReadInput<N>
): UseQueryResult<ReadOutput<N>> {
  return useQuery({ ...readQuery(name, input), placeholderData: keepPreviousData })
}

/**
 * A list page: its heading (for admins, its archived records and the way to a new one), what
 * sits above the rows (tabs, filters), then the rows, or what is missing and how to add the
 * first one. The rows stay on screen, dimmed and busy, while the next page loads.
 */
export function ListView<T>({
  kind,
  title,
  description,
  empty,
  canEdit,
  create,
  read,
  skeleton,
  totalOf,
  before,
  above,
  children,
}: {
  /** Whose archived records the header links to. */
  kind: Archivable
  title: ReactNode
  description: string
  /** Said in place of the rows when there are none. */
  empty: string
  /** Admins see the header's actions. */
  canEdit: boolean
  /** The new record's page, when the list has one. */
  create?: Create | undefined
  read: UseQueryResult<T>
  skeleton: ReactNode
  /** How many rows the list has, on every page. */
  totalOf: (data: T) => number
  /** Between the heading and the read: tabs, a toolbar. */
  before?: ReactNode
  /** Over the rows, dimmed with them: filters that come with the read. */
  above?: ((data: T) => ReactNode) | undefined
  /** The rows. */
  children: (data: T) => ReactNode
}) {
  const offer = canEdit ? create : undefined
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={canEdit && <ListActions kind={kind} create={offer} />}
      />
      {before}
      <ReadView titled query={read} skeleton={skeleton}>
        {data => (
          <div
            aria-busy={read.isPlaceholderData || undefined}
            className={cn('transition-opacity', read.isPlaceholderData && 'opacity-60')}
          >
            {above?.(data)}
            {totalOf(data) === 0 ? <ListEmpty title={empty} create={offer} /> : children(data)}
          </div>
        )}
      </ReadView>
    </>
  )
}
