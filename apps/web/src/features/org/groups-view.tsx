'use client'

import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

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
  const t = useTranslations(kind)
  const read = useQuery(
    readQuery(kind === 'departments' ? 'departments-list' : 'positions-list', {})
  )
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
      <ReadView query={read} skeleton={<TableSkeleton columns={4} />}>
        {groups =>
          groups.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            // The read is the kind's own list (departments-list or positions-list).
            <GroupsTable
              {...({ kind, groups } as Parameters<typeof GroupsTable>[0])}
              canEdit={canEdit}
            />
          )
        }
      </ReadView>
    </>
  )
}
