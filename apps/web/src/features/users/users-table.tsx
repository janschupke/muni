'use client'

import type { UserListItem } from '@muni/db/repositories'
import { type Role, ROLES } from '@muni/domain/enums'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { TextLink } from '@muni/ui/text-link'
import { formatDateTime, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { EmailLink } from '@/components/email-link'
import { usePaginationLabels } from '@/components/pagination-labels'
import { RowActions } from '@/components/record-actions'
import { RoleBadge } from '@/components/status-badges'

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
        col.accessor(u => u.name ?? undefined, {
          id: 'name',
          header: t('name'),
          // On a phone the table scrolls sideways; the name stays in view.
          meta: { sticky: 'left' },
          sortFn: 'text',
          cell: ({ row, getValue }) => (
            <TextLink asChild emphasis>
              <Link href={`/users/${row.original.id}`}>
                {getValue() ?? row.original.email ?? PLACEHOLDER}
              </Link>
            </TextLink>
          ),
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
        col.display({
          id: 'actions',
          header: () => <span className="sr-only">{tcommon('actions')}</span>,
          meta: { headerClassName: 'w-0', align: 'right' },
          cell: ({ row }) => (
            <RowActions
              kind="user"
              id={row.original.id}
              name={row.original.name ?? row.original.email ?? row.original.id}
            />
          ),
        }),
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
