'use client'

import { PageHeader } from '@muni/ui/page-header'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ListActions, ListEmpty } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { ROOM_SORT } from '@/lib/list-keys'
import { readQuery } from '@/lib/query/queries'
import { useListUrl } from '@/lib/use-list-url'

import { RoomsTable } from './rooms-table'

/** Rooms, a page at a time, sorted on the server. */
export function RoomsView({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('rooms')
  const create = canEdit && { href: '/rooms/new', label: t('new') }
  const list = useListUrl(ROOM_SORT)
  const read = useQuery({
    ...readQuery('rooms-list', list.input),
    placeholderData: keepPreviousData,
  })
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={create && <ListActions kind="room" create={create} />}
      />
      <ReadView titled query={read} skeleton={<TableSkeleton columns={5} />}>
        {rooms =>
          rooms.total === 0 ? (
            <ListEmpty title={t('empty')} create={create} />
          ) : (
            <RoomsTable rooms={rooms.items} paging={list.paging(rooms)} canEdit={canEdit} />
          )
        }
      </ReadView>
    </>
  )
}
