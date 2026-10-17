'use client'

import type { EmployeeListItem } from '@muni/db/repositories'
import { sortName } from '@muni/domain/names'
import { BarRow } from '@muni/ui/bar-row'
import { createDataColumns, DataTable, type SortingState } from '@muni/ui/data-table'
import { Meter } from '@muni/ui/meter'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMemo, useTransition } from 'react'

import { withParams } from '@/lib/search-params'

import { OrgLink } from './org-links'
import { RowActions } from './record-actions'
import { RequirementPanel } from './requirement-panel'
import { ComplianceBadge, EmploymentBadge, rateTone } from './status-badges'

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
  omit,
  canEdit = false,
  caption,
  panelLevel = 2,
}: {
  items: EmployeeListItem[]
  /** The table's accessible name: "Employees" unless the section names them otherwise. */
  caption?: string | undefined
  /** An opened row's panel heads with an `h2`, or an `h3` under a section's `h2`. */
  panelLevel?: 2 | 3 | undefined
  /** Admins get a pencil and archive on each row. */
  canEdit?: boolean | undefined
  /** A column every row shares, left out: the department on a department's page. */
  omit?: 'department' | 'position' | undefined
  /** The list page's filters: sorting rewrites the URL. Without them the table sorts itself. */
  query?: Record<string, string | undefined>
  sort?: { by: string; desc: boolean } | undefined
}) {
  const t = useTranslations('employees')
  const tcommon = useTranslations('common')
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
        col.accessor(e => sortName(e), {
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
        ...(omit === 'department'
          ? []
          : [
              col.accessor('department', {
                header: t('columns.department'),
                cell: ({ row }) => (
                  <OrgLink
                    kind="departments"
                    id={row.original.departmentId}
                    name={row.original.department}
                  />
                ),
              }),
            ]),
        ...(omit === 'position'
          ? []
          : [
              col.accessor('position', {
                header: t('columns.position'),
                cell: ({ row }) => (
                  <OrgLink
                    kind="positions"
                    id={row.original.positionId}
                    name={row.original.position}
                  />
                ),
              }),
            ]),
        col.accessor('status', {
          header: t('columns.status'),
          cell: ({ getValue }) => <EmploymentBadge status={getValue()} />,
        }),
        col.accessor('compliance', {
          header: t('columns.compliance'),
          cell: ({ row }) => (
            <ComplianceBadge
              status={row.original.status === 'LEFT' ? null : row.original.compliance}
            />
          ),
        }),
        // Held (valid or still valid but expiring) out of required: the share of the person's
        // mandatory trainings in force. Sorting is by the same share, on the server.
        col.accessor(e => e.counts.total, {
          id: 'required',
          header: t('columns.valid'),
          meta: { headerClassName: 'w-44' },
          cell: ({ row }) => {
            const { counts } = row.original
            if (counts.total === 0) return PLACEHOLDER
            const held = counts.VALID + counts.EXPIRING
            return (
              <BarRow
                layout="inline"
                bar={
                  <Meter
                    value={held}
                    max={counts.total}
                    label={t('columns.valid')}
                    tone={rateTone(held / counts.total)}
                  />
                }
                value={t('validOf', { valid: held, total: counts.total })}
              />
            )
          },
        }),
        ...(canEdit
          ? [
              col.display({
                id: 'actions',
                header: () => <span className="sr-only">{tcommon('actions')}</span>,
                meta: { headerClassName: 'w-0', align: 'right' },
                cell: ({ row }) => (
                  <RowActions
                    kind="employee"
                    id={row.original.id}
                    name={sortName(row.original)}
                    editHref={`/employees/${row.original.externalId}/edit`}
                  />
                ),
              }),
            ]
          : []),
      ]),
    [canEdit, omit, t, tcommon]
  )

  return (
    <div aria-busy={pending}>
      <DataTable
        caption={caption ?? t('title')}
        columns={columns}
        data={items}
        getRowId={e => e.externalId}
        {...(query
          ? { manualSorting: true, sorting }
          : { initialSorting: [{ id: 'name', desc: false }] })}
        renderExpanded={e => <RequirementPanel requirements={e.requirements} level={panelLevel} />}
        getRowCanExpand={e => e.requirements.length > 0}
        expandLabel={e => t('panel.toggle', { name: sortName(e) })}
        expandHeader={t('panel.header')}
        onSortingChange={next => {
          if (!query) return
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
