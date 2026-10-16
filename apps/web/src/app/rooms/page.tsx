import { listRooms } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ListActions } from '@/components/list-actions'
import { RoomsTable } from '@/features/rooms/rooms-table'
import { requireReader } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('rooms'))('title') }
}

export default async function RoomsPage() {
  const user = await requireReader()
  const [rooms, t] = await Promise.all([listRooms(), getTranslations('rooms')])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canWrite(user.role) && (
            <ListActions kind="room" create={{ href: '/rooms/new', label: t('new') }} />
          )
        }
      />
      {rooms.length === 0 ? <EmptyState title={t('empty')} /> : <RoomsTable rooms={rooms} />}
    </>
  )
}
