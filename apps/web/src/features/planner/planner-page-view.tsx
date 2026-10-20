'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { Pagination } from '@muni/ui/pagination'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { usePaginationLabels } from '@/components/table/pagination-labels'
import { useListRead } from '@/components/views/list-view'
import { ReadView } from '@/components/views/read-view'
import { PlannerSkeleton } from '@/components/views/skeletons'
import { RulesCard } from '@/features/advisor/rules-card'
import { OFFER_SORT } from '@/lib/list/list-keys'
import { useListUrl } from '@/lib/list/use-list-url'

import { PlannerView } from './planner-view'

const RULES = ['group', 'split', 'day', 'room'] as const

/**
 * The planner: sessions to open, one section per course, most urgent first, ten courses a page;
 * the offers sort within each course, on the server, by the column asked for.
 */
export function PlannerPageView({ canCreate }: { canCreate: boolean }) {
  const t = useTranslations('planner')
  const labels = usePaginationLabels()
  const list = useListUrl(OFFER_SORT, { id: 'due', desc: false })
  const read = useListRead('planner', list.input)
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <ReadView titled query={read} skeleton={<PlannerSkeleton />}>
        {({ groups, rooms }) => {
          if (groups.total === 0) return <EmptyState title={t('empty')} />
          // The courses page below; each course's table shows all its offers.
          return (
            <>
              <PlannerView
                groups={groups.items}
                paging={list.paging({ page: 1, pageCount: 1 })}
                rooms={rooms}
                canCreate={canCreate}
              />
              <Pagination
                className="mt-6"
                page={groups.page}
                pageCount={groups.pageCount}
                hrefFor={list.hrefFor}
                linkAs={Link}
                labels={{ ...labels, status: labels.status(groups.page, groups.pageCount) }}
              />
            </>
          )
        }}
      </ReadView>
      <div className="mt-8">
        <RulesCard title={t('rules.title')} rules={RULES.map(rule => t(`rules.${rule}`))} />
      </div>
    </>
  )
}
