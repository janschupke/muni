import { listPositionSummaries } from '@muni/db/repositories'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { getTranslations } from 'next-intl/server'

import { GroupsTable } from '@/features/org/groups-table'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('positions'))('title') }
}

export default async function PositionsPage() {
  // Live data: render per request, never at build time (nothing else here reads the request).
  await connection()
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
