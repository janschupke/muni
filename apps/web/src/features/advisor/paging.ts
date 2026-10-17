'use client'

import type { Bucket } from '@muni/domain/advisor'
import type { PaginationState } from '@muni/ui/data-table'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { usePaginationLabels } from '@/components/pagination-labels'

import { advisorHref, type AdvisorView } from './labels'

/** Rows per page in each of the advisor's tables. */
export const ADVISOR_PAGE_SIZE = 25

/**
 * A table's pages in the address (`?page=`), kept with its view and bucket: what DataTable
 * takes. A new order (sorting) goes back to the first page, replacing the address.
 */
export function useAdvisorPages(view: AdvisorView, bucket: Bucket | undefined, page: number) {
  const router = useRouter()
  const labels = usePaginationLabels()
  return {
    pagination: { pageIndex: Math.max(0, page - 1), pageSize: ADVISOR_PAGE_SIZE },
    onPaginationChange: (next: PaginationState) => {
      router.replace(advisorHref(view, bucket, next.pageIndex + 1), { scroll: false })
    },
    pageLinks: { hrefFor: (to: number) => advisorHref(view, bucket, to), linkAs: Link },
    paginationLabels: labels,
  }
}
