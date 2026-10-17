'use client'

import { useTranslations } from 'next-intl'

import { ListView, useListRead } from '@/components/list-view'
import { TableSkeleton } from '@/components/skeletons'
import { USER_SORT } from '@/lib/list-keys'
import { useListUrl } from '@/lib/use-list-url'

import { UsersTable } from './users-table'

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
      skeleton={<TableSkeleton columns={4} />}
      totalOf={users => users.total}
    >
      {users => <UsersTable users={users.items} paging={list.paging(users)} />}
    </ListView>
  )
}
