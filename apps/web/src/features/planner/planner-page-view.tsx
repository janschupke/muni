'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ReadView } from '@/components/read-view'
import { ListSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'

import { PlannerView } from './planner-view'

/** The planner: sessions to open, one section per course, most urgent first. */
export function PlannerPageView({ canCreate }: { canCreate: boolean }) {
  const t = useTranslations('planner')
  const read = useQuery(readQuery('planner', {}))
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <ReadView query={read} skeleton={<ListSkeleton columns={6} />}>
        {({ groups, rooms }) =>
          groups.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <PlannerView groups={groups} rooms={rooms} canCreate={canCreate} />
          )
        }
      </ReadView>
      <p className="mt-8 max-w-3xl text-xs text-fg-muted">{t('rule')}</p>
    </>
  )
}
