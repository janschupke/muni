'use client'

import { PageHeader } from '@muni/ui/page-header'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ListActions, ListEmpty } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { USER_SORT } from '@/lib/list-keys'
import { readQuery } from '@/lib/query/queries'
import { useListUrl } from '@/lib/use-list-url'

import { UsersTable } from './users-table'

/** Everyone who can sign in, with their role, for admins: a page at a time. */
export function UsersView() {
  const t = useTranslations('users')
  const list = useListUrl(USER_SORT)
  const read = useQuery({
    ...readQuery('users-list', list.input),
    placeholderData: keepPreviousData,
  })
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={<ListActions kind="user" />}
      />
      <ReadView titled query={read} skeleton={<TableSkeleton columns={4} />}>
        {users =>
          users.total === 0 ? (
            <ListEmpty title={t('empty')} />
          ) : (
            <UsersTable users={users.items} paging={list.paging(users)} />
          )
        }
      </ReadView>
    </>
  )
}
