'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ReadView } from '@/components/read-view'
import { RulesCard } from '@/components/rules-card'
import { PlannerSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'

import { PlannerView } from './planner-view'

const RULES = ['group', 'split', 'day', 'room'] as const

/** The planner: sessions to open, one section per course, most urgent first. */
export function PlannerPageView({ canCreate }: { canCreate: boolean }) {
  const t = useTranslations('planner')
  const read = useQuery(readQuery('planner', {}))
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <ReadView titled query={read} skeleton={<PlannerSkeleton />}>
        {({ groups, rooms }) =>
          groups.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <PlannerView groups={groups} rooms={rooms} canCreate={canCreate} />
          )
        }
      </ReadView>
      <div className="mt-8">
        <RulesCard title={t('rules.title')} rules={RULES.map(rule => t(`rules.${rule}`))} />
      </div>
    </>
  )
}
