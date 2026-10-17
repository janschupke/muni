'use client'

import type { EmployeeListItem } from '@muni/db/repositories'
import { needsBooking } from '@muni/domain/advisor'
import { sortName } from '@muni/domain/names'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { BookNeedButton } from '@/features/bookings/book-button'

import { HeldMeter } from './compliance-breakdown'
import { OrgLink } from './org-links'
import { usePaginationLabels } from './pagination-labels'
import { RowActions } from './record-actions'
import { RequirementPanel } from './requirement-panel'
import { ComplianceBadge, EmploymentBadge } from './status-badges'

const col = createDataColumns<EmployeeListItem>()

/**
 * Employees, a page the server sorted and cut (the list, a department's or position's people).
 * A header click asks the server for the new order; column ids are the repository's sort keys.
 */
export function EmployeesTable({
  items,
  paging,
  omit,
  canEdit = false,
  canBook = false,
  caption,
  panelLevel = 2,
}: {
  items: EmployeeListItem[]
  paging: TablePaging
  /** The table's accessible name: "Employees" unless the section names them otherwise. */
  caption?: string | undefined
  /** An opened row's panel heads with an `h2`, or an `h3` under a section's `h2`. */
  panelLevel?: 2 | 3 | undefined
  /** Admins get a pencil and archive on each row. */
  canEdit?: boolean | undefined
  /** Admins get "Book…" on each person with trainings to book, and on each such training. */
  canBook?: boolean | undefined
  /** A column every row shares, left out: the department on a department's page. */
  omit?: 'department' | 'position' | undefined
}) {
  const t = useTranslations('employees')
  const tcommon = useTranslations('common')
  const tb = useTranslations('bookings')
  const paginationLabels = usePaginationLabels()

  const columns = useMemo(
    () =>
      col.columns([
        // Accessors only make the columns sortable here; the server does the ordering.
        col.accessor(e => sortName(e), {
          id: 'name',
          header: t('columns.name'),
          // On a phone the table scrolls sideways; the name stays in view.
          meta: { sticky: 'left' },
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
          cell: ({ row }) =>
            row.original.counts.total === 0 ? (
              PLACEHOLDER
            ) : (
              <HeldMeter counts={row.original.counts} label={t('columns.valid')} />
            ),
        }),
        ...(canBook
          ? [
              col.display({
                id: 'book',
                header: () => <span className="sr-only">{t('panel.book')}</span>,
                meta: { headerClassName: 'w-0', nowrap: true },
                cell: ({ row }) =>
                  row.original.requirements.some(r => needsBooking(r, row.original.status)) && (
                    <BookNeedButton
                      query={{ employee: row.original.externalId }}
                      label={tb('bookAllFor', { name: sortName(row.original) })}
                    />
                  ),
              }),
            ]
          : []),
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
    [canEdit, canBook, omit, t, tb, tcommon]
  )

  return (
    <DataTable
      caption={caption ?? t('title')}
      columns={columns}
      data={items}
      getRowId={e => e.externalId}
      paging={paging}
      paginationLabels={paginationLabels}
      renderExpanded={e => (
        <RequirementPanel
          person={{ externalId: e.externalId, name: sortName(e), status: e.status }}
          requirements={e.requirements}
          canBook={canBook}
          level={panelLevel}
        />
      )}
      getRowCanExpand={e => e.requirements.length > 0}
      expandLabel={e => t('panel.toggle', { name: sortName(e) })}
      expandHeader={t('panel.header')}
    />
  )
}
