'use client'

import { PageHeader } from '@muni/ui/page-header'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ListActions } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'

import { UsersTable } from './users-table'

/** Everyone who can sign in, with their role, for admins. */
export function UsersView() {
  const t = useTranslations('users')
  const read = useQuery(readQuery('users-list', {}))
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={<ListActions kind="user" />}
      />
      <ReadView titled query={read} skeleton={<TableSkeleton columns={4} />}>
        {users => <UsersTable users={users} />}
      </ReadView>
    </>
  )
}
