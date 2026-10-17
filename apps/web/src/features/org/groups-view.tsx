'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ListActions } from '@/components/list-actions'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'

import { GroupsTable } from './groups-table'

/** The departments or the positions, each with its people and compliance. */
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
  const read = useQuery(readQuery('departments-list', {}))
  return (
    <GroupsPage kind="departments" canEdit={canEdit} read={read}>
      {groups => <GroupsTable kind="departments" groups={groups} canEdit={canEdit} />}
    </GroupsPage>
  )
}

function PositionsList({ canEdit }: { canEdit: boolean }) {
  const read = useQuery(readQuery('positions-list', {}))
  return (
    <GroupsPage kind="positions" canEdit={canEdit} read={read}>
      {groups => <GroupsTable kind="positions" groups={groups} canEdit={canEdit} />}
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
  read: UseQueryResult<G[]>
  children: (groups: G[]) => ReactNode
}) {
  const t = useTranslations(kind)
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canEdit && (
            <ListActions
              kind={kind === 'departments' ? 'department' : 'position'}
              create={{ href: `/${kind}/new`, label: t('new') }}
            />
          )
        }
      />
      <ReadView titled query={read} skeleton={<TableSkeleton columns={4} />}>
        {groups => (groups.length === 0 ? <EmptyState title={t('empty')} /> : children(groups))}
      </ReadView>
    </>
  )
}
