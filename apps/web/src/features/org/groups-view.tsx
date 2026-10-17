'use client'

import type { Page } from '@muni/db/repositories'
import { PageHeader } from '@muni/ui/page-header'
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ListActions, ListEmpty } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { GROUP_SORT } from '@/lib/list-keys'
import { readQuery } from '@/lib/query/queries'
import { useListUrl } from '@/lib/use-list-url'

import { GroupsTable } from './groups-table'

/** The departments or the positions, each with its people and compliance, a page at a time. */
export function GroupsView({
  kind,
  canEdit,
}: {
  kind: 'departments' | 'positions'
  canEdit: boolean
}) {
  return kind === 'departments' ? (
    <DepartmentsList canEdit={canEdit} />
  ) : (
    <PositionsList canEdit={canEdit} />
  )
}

function DepartmentsList({ canEdit }: { canEdit: boolean }) {
  const list = useListUrl(GROUP_SORT)
  const read = useQuery({
    ...readQuery('departments-list', list.input),
    placeholderData: keepPreviousData,
  })
  return (
    <GroupsPage kind="departments" canEdit={canEdit} read={read}>
      {groups => (
        <GroupsTable
          kind="departments"
          groups={groups.items}
          paging={list.paging(groups)}
          canEdit={canEdit}
        />
      )}
    </GroupsPage>
  )
}

function PositionsList({ canEdit }: { canEdit: boolean }) {
  const list = useListUrl(GROUP_SORT)
  const read = useQuery({
    ...readQuery('positions-list', list.input),
    placeholderData: keepPreviousData,
  })
  return (
    <GroupsPage kind="positions" canEdit={canEdit} read={read}>
      {groups => (
        <GroupsTable
          kind="positions"
          groups={groups.items}
          paging={list.paging(groups)}
          canEdit={canEdit}
        />
      )}
    </GroupsPage>
  )
}

function GroupsPage<G>({
  kind,
  canEdit,
  read,
  children,
}: {
  kind: 'departments' | 'positions'
  canEdit: boolean
  read: UseQueryResult<Page<G>>
  children: (groups: Page<G>) => ReactNode
}) {
  const t = useTranslations(kind)
  const create = canEdit && { href: `/${kind}/new`, label: t('new') }
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          create && (
            <ListActions
              kind={kind === 'departments' ? 'department' : 'position'}
              create={create}
            />
          )
        }
      />
      <ReadView titled query={read} skeleton={<TableSkeleton columns={4} />}>
        {groups =>
          groups.total === 0 ? <ListEmpty title={t('empty')} create={create} /> : children(groups)
        }
      </ReadView>
    </>
  )
}
