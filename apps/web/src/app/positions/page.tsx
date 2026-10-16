import { listPositionSummaries } from '@muni/db/repositories'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { PositionsTable } from '@/features/org/positions-table'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('positions'))('title') }
}

export default async function PositionsPage() {
  const [positions, t] = await Promise.all([listPositionSummaries(), getTranslations('positions')])
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {positions.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <PositionsTable positions={positions} />
      )}
    </>
  )
}
