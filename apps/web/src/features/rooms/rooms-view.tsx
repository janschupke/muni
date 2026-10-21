'use client'

import { useTranslations } from 'next-intl'

import { ListView, useListRead } from '@/components/views/list-view'
import { PageLoading, TableSkeleton } from '@/components/views/skeletons'
import { ROOM_SORT } from '@/lib/list/list-keys'
import { useListUrl } from '@/lib/list/use-list-url'

import { RoomsTable } from './rooms-table'

// What the page shows until its data is there, here and as its route's loading state.
const SKELETON = <TableSkeleton columns={5} />

/** Rooms, a page at a time, sorted on the server. */
export function RoomsView({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('rooms')
  const list = useListUrl(ROOM_SORT)
  return (
    <ListView
      kind="room"
      title={t('title')}
      description={t('description')}
      empty={t('empty')}
      canEdit={canEdit}
      create={{ href: '/rooms/new', label: t('new') }}
      read={useListRead('rooms-list', list.input)}
      skeleton={SKELETON}
      totalOf={rooms => rooms.total}
    >
      {rooms => <RoomsTable rooms={rooms.items} paging={list.paging(rooms)} canEdit={canEdit} />}
    </ListView>
  )
}

/** The page until its data is there (its route's `loading.tsx`): its heading, then the rows. */
export function RoomsLoading() {
  const t = useTranslations('rooms')
  return (
    <PageLoading title={t('title')} description={t('description')}>
      {SKELETON}
    </PageLoading>
  )
}
