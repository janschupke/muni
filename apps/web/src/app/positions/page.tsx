import { listPositionSummaries } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ListActions } from '@/components/list-actions'
import { GroupsTable } from '@/features/org/groups-table'
import { requireReader } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('positions'))('title') }
}

export default async function PositionsPage() {
  const user = await requireReader()
  const [positions, t] = await Promise.all([listPositionSummaries(), getTranslations('positions')])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canWrite(user.role) && (
            <ListActions kind="position" create={{ href: '/positions/new', label: t('new') }} />
          )
        }
      />
      {positions.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <GroupsTable kind="positions" groups={positions} canEdit={canWrite(user.role)} />
      )}
    </>
  )
}
