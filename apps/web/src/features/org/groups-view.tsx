'use client'

import { useTranslations } from 'next-intl'

import { ListView, useListRead } from '@/components/views/list-view'
import { TableSkeleton } from '@/components/views/skeletons'
import { GROUP_SORT } from '@/lib/list/list-keys'
import { useListUrl } from '@/lib/list/use-list-url'

import { GroupsTable } from './groups-table'

type Kind = 'departments' | 'positions'

/** The departments or the positions, each with its people and compliance, a page at a time. */
export function GroupsView({ kind, canEdit }: { kind: Kind; canEdit: boolean }) {
  return kind === 'departments' ? (
    <DepartmentsList canEdit={canEdit} />
  ) : (
    <PositionsList canEdit={canEdit} />
  )
}

/** What both lists share but their rows. */
function useGroupList(kind: Kind, canEdit: boolean) {
  const t = useTranslations(kind)
  return {
    list: useListUrl(GROUP_SORT),
    view: {
      kind: kind === 'departments' ? ('department' as const) : ('position' as const),
      title: t('title'),
      description: t('description'),
      empty: t('empty'),
      canEdit,
      create: { href: `/${kind}/new`, label: t('new') },
      skeleton: <TableSkeleton columns={4} />,
      totalOf: (groups: { total: number }) => groups.total,
    },
  }
}

function DepartmentsList({ canEdit }: { canEdit: boolean }) {
  const { list, view } = useGroupList('departments', canEdit)
  return (
    <ListView {...view} read={useListRead('departments-list', list.input)}>
      {groups => (
        <GroupsTable
          kind="departments"
          groups={groups.items}
          paging={list.paging(groups)}
          canEdit={canEdit}
        />
      )}
    </ListView>
  )
}

function PositionsList({ canEdit }: { canEdit: boolean }) {
  const { list, view } = useGroupList('positions', canEdit)
  return (
    <ListView {...view} read={useListRead('positions-list', list.input)}>
      {groups => (
        <GroupsTable
          kind="positions"
          groups={groups.items}
          paging={list.paging(groups)}
          canEdit={canEdit}
        />
      )}
    </ListView>
  )
}
