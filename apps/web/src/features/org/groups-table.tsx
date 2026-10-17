'use client'

import type { DepartmentSummary, PositionSummary } from '@muni/db/repositories'
import { Badge } from '@muni/ui/badge'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { PersonLink, personText } from '@/components/archived'
import { HeldMeter } from '@/components/compliance-breakdown'
import { useListRead } from '@/components/list-view'
import { usePaginationLabels } from '@/components/pagination-labels'
import { ReadView } from '@/components/read-view'
import { TableSkeleton } from '@/components/skeletons'
import { nameColumn, rowActionsColumn } from '@/components/table-columns'

import { MembersTable } from './members-table'

type Group = DepartmentSummary | PositionSummary

const col = createDataColumns<Group>()

/**
 * Departments or positions: who leads each (departments) or where it sits (positions), its
 * people, how its mandatory training stands. A row opens to the records of its people.
 */
export function GroupsTable(
  props: (
    | { kind: 'departments'; groups: DepartmentSummary[] }
    | { kind: 'positions'; groups: PositionSummary[] }
  ) & {
    paging: TablePaging
    /** Admins get a pencil (rename) and archive on each row, and book from an opened one. */
    canEdit?: boolean | undefined
  }
) {
  const { kind, paging, canEdit = false } = props
  const paginationLabels = usePaginationLabels()
  const tcommon = useTranslations('common')
  const t = useTranslations(kind)
  const to = useTranslations('org')
  const locale = useLocale()
  const columns = useMemo(() => {
    const n = (value: number) => formatInteger(value, locale)
    return col.columns([
      nameColumn(col, {
        header: t('columns.name'),
        name: g => g.name,
        href: g => `/${kind}/${g.id}`,
      }),
      kind === 'departments'
        ? col.accessor(g => ('head' in g && g.head ? personText(g.head) : undefined), {
            id: 'head',
            header: t('columns.head'),
            sortFn: 'text',
            cell: ({ row }) => {
              const head = 'head' in row.original ? row.original.head : null
              return head ? <PersonLink person={head} /> : PLACEHOLDER
            },
          })
        : col.accessor(g => ('departments' in g ? g.departments.map(d => d.name).join(', ') : ''), {
            id: 'departments',
            header: t('columns.departments'),
            sortFn: 'text',
            cell: ({ getValue }) => getValue() || PLACEHOLDER,
          }),
      col.accessor('active', {
        id: 'people',
        header: to('columns.people'),
        sortFn: 'basic',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <CellStack
            title={n(row.original.active)}
            meta={
              row.original.parentalLeave > 0
                ? to('onLeave', { count: row.original.parentalLeave })
                : undefined
            }
          />
        ),
      }),
      col.accessor(g => (g.counts.total > 0 ? g.rate : undefined), {
        id: 'compliance',
        header: to('columns.compliance'),
        sortFn: 'basic',
        meta: { headerClassName: 'w-52' },
        cell: ({ row }) =>
          row.original.counts.total === 0 ? (
            PLACEHOLDER
          ) : (
            <HeldMeter
              counts={row.original.counts}
              label={to('columns.compliance')}
              figure="share"
            />
          ),
      }),
      col.accessor('requiredCourses', {
        id: 'required',
        header: to('columns.required'),
        sortFn: 'basic',
        meta: { align: 'right' },
        cell: ({ getValue }) => n(getValue()),
      }),
      col.accessor('actionNow', {
        header: to('columns.actionNow'),
        sortFn: 'basic',
        meta: { align: 'right' },
        cell: ({ getValue }) =>
          getValue() > 0 ? <Badge tone="danger">{n(getValue())}</Badge> : n(0),
      }),
      col.accessor('upcomingBookings', {
        id: 'bookings',
        header: to('columns.bookings'),
        sortFn: 'basic',
        meta: { align: 'right' },
        cell: ({ row, getValue }) =>
          getValue() === 0 ? (
            n(0)
          ) : (
            <TextLink asChild hitArea>
              <Link
                href={`/${kind}/${row.original.id}/bookings`}
                aria-label={to('bookings.link', { count: getValue(), name: row.original.name })}
              >
                {n(getValue())}
              </Link>
            </TextLink>
          ),
      }),
      ...(canEdit
        ? [
            rowActionsColumn(col, tcommon('actions'), r => ({
              kind: kind === 'departments' ? 'department' : 'position',
              id: r.id,
              name: r.name,
              editHref: `/${kind}/${r.id}/edit`,
            })),
          ]
        : []),
    ])
  }, [canEdit, kind, locale, t, tcommon, to])
  return (
    <DataTable<Group>
      caption={t('title')}
      columns={columns}
      data={props.groups}
      getRowId={g => g.id}
      paging={paging}
      paginationLabels={paginationLabels}
      renderExpanded={g => (
        <GroupMembers
          kind={kind === 'departments' ? 'department' : 'position'}
          group={g}
          canBook={canEdit}
        />
      )}
      getRowCanExpand={g => g.memberCount > 0}
      expandLabel={g => t('toggle', { name: g.name })}
      expandHeader={to('panelHeader')}
    />
  )
}

/** An opened row's people, read when it opens. */
function GroupMembers({
  kind,
  group,
  canBook,
}: {
  kind: 'department' | 'position'
  group: { id: string; name: string; memberCount: number }
  canBook: boolean
}) {
  const [page, setPage] = useState(1)
  const read = useListRead('group-members', { kind, id: group.id, ...(page > 1 && { page }) })
  return (
    <ReadView
      titled
      query={read}
      skeleton={<TableSkeleton rows={Math.min(group.memberCount, 6)} columns={5} />}
    >
      {members => (
        <MembersTable
          name={group.name}
          members={members}
          onPageChange={setPage}
          other={kind === 'department' ? 'position' : 'department'}
          canBook={canBook}
        />
      )}
    </ReadView>
  )
}
