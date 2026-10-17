'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ListActions } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'

import { RoomsTable } from './rooms-table'

export function RoomsView({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('rooms')
  const read = useQuery(readQuery('rooms-list', {}))
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canEdit && <ListActions kind="room" create={{ href: '/rooms/new', label: t('new') }} />
        }
      />
      <ReadView query={read} skeleton={<TableSkeleton columns={5} />}>
        {rooms =>
          rooms.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <RoomsTable rooms={rooms} canEdit={canEdit} />
          )
        }
      </ReadView>
    </>
  )
}
