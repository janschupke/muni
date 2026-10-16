'use client'

import type { UserListItem } from '@muni/db/repositories'
import { type Role, ROLES } from '@muni/domain/enums'
import { Badge } from '@muni/ui/badge'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { formatDateTime, PLACEHOLDER } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

const col = createDataColumns<UserListItem>()

/** Sorting by role puts admins first. */
const rank = (role: Role) => ROLES.length - ROLES.indexOf(role)

/** Everyone with access and their role. Roles are changed in Clerk, not here. */
export function UsersTable({ users }: { users: UserListItem[] }) {
  const t = useTranslations('users.columns')
  const tr = useTranslations('status.role')
  const locale = useLocale()
  const columns = useMemo(
    () =>
      col.columns([
        col.accessor(u => u.name ?? undefined, {
          id: 'name',
          header: t('name'),
          sortFn: 'text',
          cell: ({ getValue }) => (
            <span className="font-medium text-fg">{getValue() ?? PLACEHOLDER}</span>
          ),
        }),
        col.accessor(u => u.email ?? undefined, {
          id: 'email',
          header: t('email'),
          sortFn: 'text',
          cell: ({ getValue }) => getValue() ?? PLACEHOLDER,
        }),
        col.accessor(u => rank(u.role), {
          id: 'role',
          header: t('role'),
          sortFn: 'basic',
          cell: ({ row }) => (
            <Badge tone={row.original.role === 'ADMIN' ? 'accent' : 'neutral'}>
              {tr(row.original.role)}
            </Badge>
          ),
        }),
        col.accessor(u => u.lastSignInAt ?? undefined, {
          id: 'lastSignInAt',
          header: t('lastSignInAt'),
          sortFn: 'datetime',
          meta: { nowrap: true },
          cell: ({ getValue }) => {
            const value = getValue()
            return value === undefined ? PLACEHOLDER : formatDateTime(value, locale)
          },
        }),
      ]),
    [locale, t, tr]
  )
  return <DataTable columns={columns} data={users} getRowId={u => u.id} />
}
