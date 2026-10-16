'use client'

import type { EmployeeListItem } from '@muni/db/repositories'
import { createDataColumns, DataTable, type SortingState } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMemo, useTransition } from 'react'

import { withParams } from '@/lib/search-params'

import { ComplianceBadge, EmploymentBadge } from './status-badges'

const col = createDataColumns<EmployeeListItem>()

/**
 * One server page of employees. The list is paginated on the server, so sorting is too:
 * a header click rewrites `?sort=&dir=` and the server returns the page in that order.
 * Column ids are the repository's sort keys.
 */
export function EmployeesTable({
  items,
  query,
  sort,
}: {
  items: EmployeeListItem[]
  query: Record<string, string | undefined>
  sort: { by: string; desc: boolean } | undefined
}) {
  const t = useTranslations('employees')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Without a sort parameter the server returns name order; show it as such.
  const sorting: SortingState = [
    sort ? { id: sort.by, desc: sort.desc } : { id: 'name', desc: false },
  ]

  const columns = useMemo(
    () =>
      col.columns([
        // Accessors only make the columns sortable here; the server does the ordering.
        col.accessor(e => `${e.lastName} ${e.firstName}`, {
          id: 'name',
          header: t('columns.name'),
          cell: ({ row }) => (
            <CellStack
              title={
                <TextLink asChild emphasis>
                  <Link href={`/employees/${row.original.externalId}`}>
                    {row.original.lastName} {row.original.firstName}
                  </Link>
                </TextLink>
              }
              meta={row.original.externalId}
            />
          ),
        }),
        col.accessor('department', {
          header: t('columns.department'),
          cell: ({ getValue }) => getValue() ?? PLACEHOLDER,
        }),
        col.accessor('position', {
          header: t('columns.position'),
          cell: ({ getValue }) => getValue() ?? PLACEHOLDER,
        }),
        col.accessor('status', {
          header: t('columns.status'),
          cell: ({ getValue }) => <EmploymentBadge status={getValue()} />,
        }),
        col.accessor('compliance', {
          header: t('columns.compliance'),
          cell: ({ row }) => (
            <ComplianceBadge
              status={row.original.status === 'TERMINATED' ? null : row.original.compliance}
            />
          ),
        }),
        col.accessor(e => e.counts.total, {
          id: 'required',
          header: t('columns.required'),
          meta: { align: 'right' },
          cell: ({ row }) => {
            const { counts } = row.original
            return counts.total > 0
              ? `${String(counts.VALID + counts.EXPIRING)} / ${String(counts.total)}`
              : PLACEHOLDER
          },
        }),
      ]),
    [t]
  )

  return (
    <div aria-busy={pending}>
      <DataTable
        columns={columns}
        data={items}
        getRowId={e => e.externalId}
        manualSorting
        sorting={sorting}
        onSortingChange={next => {
          const [first] = next
          startTransition(() => {
            router.push(
              withParams('/employees', query, {
                sort: first?.id,
                dir: first?.desc ? 'desc' : undefined,
                page: undefined,
              }),
              { scroll: false }
            )
          })
        }}
      />
    </div>
  )
}
