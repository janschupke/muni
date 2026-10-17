'use client'

import { PageHeader } from '@muni/ui/page-header'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ListActions, ListEmpty } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'

import { RoomsTable } from './rooms-table'

export function RoomsView({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('rooms')
  const create = canEdit && { href: '/rooms/new', label: t('new') }
  const read = useQuery(readQuery('rooms-list', {}))
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={create && <ListActions kind="room" create={create} />}
      />
      <ReadView titled query={read} skeleton={<TableSkeleton columns={5} />}>
        {rooms =>
          rooms.length === 0 ? (
            <ListEmpty title={t('empty')} create={create} />
          ) : (
            <RoomsTable rooms={rooms} canEdit={canEdit} />
          )
        }
      </ReadView>
    </>
  )
}
