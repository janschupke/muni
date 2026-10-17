'use client'

import { unpack } from '@muni/domain/advisor'
import { PageHeader } from '@muni/ui/page-header'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ReadView } from '@/components/read-view'
import { AdvisorSkeleton } from '@/components/skeletons'
import { ADVISOR_SORT } from '@/lib/list-keys'
import { readQuery } from '@/lib/query/queries'
import { advisorInput } from '@/lib/read-inputs'
import { useListUrl } from '@/lib/use-list-url'
import type { ReadOutput } from '@/server/reads/registry'

import { AdvisorWorkbench } from './advisor-workbench'
import type { AdvisorView as View } from './labels'

/** The plan arrives packed (each session once). */
const unpacked = ({ plan, ...rest }: ReadOutput<'advisor'>) => ({ ...rest, plan: unpack(plan) })

/**
 * The advisor: its plan, in the view and row the address asks for (`?view=`, `?bucket=`),
 * the table a page at a time, sorted on the server (`?sort=`, `?page=`).
 */
export function AdvisorView({
  view,
  bucket,
  canApply,
}: {
  view: View
  bucket: string | undefined
  canApply: boolean
}) {
  const t = useTranslations('advisor')
  // The action list is in queue order (rank) unless sorted; the others in the plan's.
  const list = useListUrl(ADVISOR_SORT, view === 'action' ? { id: 'rank', desc: false } : undefined)
  const read = useQuery({
    ...readQuery('advisor', advisorInput(view, bucket, list.input)),
    select: unpacked,
    placeholderData: keepPreviousData,
  })
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <ReadView titled query={read} skeleton={<AdvisorSkeleton />}>
        {({ plan, asOf, bucket: row, page, counts }) => (
          <AdvisorWorkbench
            plan={plan}
            asOf={asOf}
            view={view}
            bucket={row}
            total={page.total}
            counts={counts}
            paging={list.paging(page)}
            canApply={canApply}
          />
        )}
      </ReadView>
    </>
  )
}
