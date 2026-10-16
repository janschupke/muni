import { listPositionSummaries } from '@muni/db/repositories'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { GroupsTable } from '@/features/org/groups-table'
import { requireReader } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('positions'))('title') }
}

export default async function PositionsPage() {
  await requireReader()
  const [positions, t] = await Promise.all([listPositionSummaries(), getTranslations('positions')])
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {positions.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <GroupsTable kind="positions" groups={positions} />
      )}
    </>
  )
}
