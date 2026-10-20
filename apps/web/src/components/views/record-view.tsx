'use client'

import { PageHeader } from '@muni/ui/page-header'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { BackLink } from '@/components/navigation/back-link'
import { useDocumentTitle } from '@/lib/query/use-document-title'
import type { ReadInput, ReadName, ReadOutput } from '@/server/reads/core/registry'

import { useListRead } from './list-view'
import { RecordActions, type Target } from './record-actions'

/**
 * A record page's read, its name in the tab's title. Its lists' pages and sorts are part of
 * the input: while another loads, the page stays on screen.
 */
export function useRecordRead<N extends ReadName>(
  name: N,
  input: ReadInput<N>,
  titleOf: (data: ReadOutput<N>) => string
): UseQueryResult<ReadOutput<N>> {
  const read = useListRead(name, input)
  useDocumentTitle(read.data && titleOf(read.data))
  return read
}

/**
 * A record page's heading: the way back (to where it was opened from, else its list), its
 * name and the line under it, and for admins (`record`) archive, edit and the page's own
 * primary action (`children`).
 */
export function RecordHeader({
  list,
  title,
  description,
  record,
  children,
}: {
  /** The list the record is in: the way back when the page was opened directly. */
  list: { href: string; label: string }
  title: ReactNode
  description?: ReactNode
  /** What the admin's actions act on; none for readers. */
  record?: Target | false | undefined
  children?: ReactNode
}) {
  return (
    <PageHeader
      eyebrow={<BackLink fallback={list} />}
      title={title}
      description={description}
      actions={
        record && (
          <RecordActions {...record} then={list.href}>
            {children}
          </RecordActions>
        )
      }
    />
  )
}
