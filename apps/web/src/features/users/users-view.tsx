'use client'

import { useTranslations } from 'next-intl'

import { ListView, useListRead } from '@/components/views/list-view'
import { PageLoading, TableSkeleton } from '@/components/views/skeletons'
import { USER_SORT } from '@/lib/list/list-keys'
import { useListUrl } from '@/lib/list/use-list-url'

import { UsersTable } from './users-table'

// What the page shows until its data is there, here and as its route's loading state.
const SKELETON = <TableSkeleton columns={4} />

/** Everyone who can sign in, with their role, for admins: a page at a time. */
export function UsersView() {
  const t = useTranslations('users')
  const list = useListUrl(USER_SORT)
  return (
    <ListView
      kind="user"
      title={t('title')}
      description={t('description')}
      empty={t('empty')}
      // Only admins reach this page; people sign up themselves, so there is no new one.
      canEdit
      read={useListRead('users-list', list.input)}
      skeleton={SKELETON}
      totalOf={users => users.total}
    >
      {users => <UsersTable users={users.items} paging={list.paging(users)} />}
    </ListView>
  )
}

/** The page until its data is there (its route's `loading.tsx`): its heading, then the rows. */
export function UsersLoading() {
  const t = useTranslations('users')
  return (
    <PageLoading title={t('title')} description={t('description')}>
      {SKELETON}
    </PageLoading>
  )
}
