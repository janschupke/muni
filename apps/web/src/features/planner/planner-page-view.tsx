'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { Pagination } from '@muni/ui/pagination'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { useListRead } from '@/components/list-view'
import { usePaginationLabels } from '@/components/pagination-labels'
import { ReadView } from '@/components/read-view'
import { RulesCard } from '@/components/rules-card'
import { PlannerSkeleton } from '@/components/skeletons'
import { OFFER_SORT } from '@/lib/list-keys'
import { useListUrl } from '@/lib/use-list-url'

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
