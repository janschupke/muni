'use client'

import type { UserListItem } from '@muni/db/repositories'
import { type Role, ROLES } from '@muni/domain/enums'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { formatDateTime, PLACEHOLDER } from '@muni/utils/format'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { EmailLink } from '@/components/email-link'
import { usePaginationLabels } from '@/components/pagination-labels'
import { RoleBadge } from '@/components/status-badges'
import { nameColumn, rowActionsColumn } from '@/components/table-columns'

const col = createDataColumns<UserListItem>()

/** Sorting by role puts admins first. */
const rank = (role: Role) => ROLES.length - ROLES.indexOf(role)

/**
 * Everyone with access and their role. The name opens the user, where the role changes; the
 * row's only action is archiving, since editing is that same page.
 */
export function UsersTable({ users, paging }: { users: UserListItem[]; paging: TablePaging }) {
  const tcommon = useTranslations('common')
  const paginationLabels = usePaginationLabels()
  const t = useTranslations('users.columns')
  const tu = useTranslations('users')
  const columns = useMemo(
    () =>
      col.columns([
        nameColumn(col, {
          header: t('name'),
          name: u => u.name ?? u.email ?? undefined,
          href: u => `/users/${u.id}`,
        }),
        col.accessor(u => u.email ?? undefined, {
          id: 'email',
          header: t('email'),
          sortFn: 'text',
          cell: ({ getValue }) => <EmailLink email={getValue()} />,
        }),
        col.accessor(u => rank(u.role), {
          id: 'role',
          header: t('role'),
          sortFn: 'basic',
          cell: ({ row }) => <RoleBadge value={row.original.role} />,
        }),
        col.accessor(u => u.lastSignInAt ?? undefined, {
          id: 'lastSignInAt',
          header: t('lastSignInAt'),
          sortFn: 'datetime',
          meta: { nowrap: true },
          cell: ({ getValue }) => {
            const value = getValue()
            return value === undefined ? PLACEHOLDER : formatDateTime(value)
          },
        }),
        rowActionsColumn(col, tcommon('actions'), r => ({
          kind: 'user',
          id: r.id,
          name: r.name ?? r.email ?? r.id,
        })),
      ]),
    [t, tcommon]
  )
  return (
    <DataTable
      caption={tu('title')}
      columns={columns}
      data={users}
      getRowId={u => u.id}
      paging={paging}
      paginationLabels={paginationLabels}
    />
  )
}
