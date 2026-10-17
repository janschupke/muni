'use client'

import type { PlanItem } from '@muni/domain/advisor'
import { DataTable } from '@muni/ui/data-table'
import { EmptyState } from '@muni/ui/empty-state'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { usePaginationLabels } from '@/components/pagination-labels'
import { RemoveBookingButton } from '@/components/remove-booking-button'

import { col, itemId, SessionCell, usePlanColumns } from './columns'
import { RemediationBadge } from './labels'

/** Trainings that already have a named booking, and the gap each booking still leaves. */
export function PlannedTable({
  items,
  asOf,
  canEdit,
}: {
  items: PlanItem[]
  asOf: string
  canEdit: boolean
}) {
  const t = useTranslations('advisor')
  const shared = usePlanColumns(asOf)
  const paginationLabels = usePaginationLabels()

  const columns = useMemo(
    () =>
      col.columns([
        shared.person,
        shared.training,
        shared.lapses,
        col.accessor(i => (i.booked ? Date.parse(i.booked.startsAt) : undefined), {
          id: 'booked',
          header: t('columns.booked'),
          sortFn: 'basic',
          cell: ({ row }) =>
            row.original.booked && (
              <div className="flex flex-col items-start gap-1">
                <SessionCell session={row.original.booked} />
                <RemediationBadge remediation={row.original.remediation} />
              </div>
            ),
        }),
        shared.window,
        ...(canEdit
          ? [
              col.display({
                id: 'remove',
                header: () => <span className="sr-only">{t('planned.cancel')}</span>,
                meta: { headerClassName: 'w-0' },
                cell: ({ row }) => {
                  const { booked, need } = row.original
                  if (!booked) return null
                  return (
                    <RemoveBookingButton
                      sessionExternalId={booked.externalId}
                      employeeExternalId={need.employee.externalId}
                      label={t('planned.remove', {
                        name: need.employee.name,
                        session: booked.courseName,
                      })}
                      confirmTitle={t('planned.removeConfirm', {
                        name: need.employee.name,
                        session: booked.courseName,
                      })}
                    />
                  )
                },
              }),
            ]
          : []),
      ]),
    [canEdit, shared, t]
  )

  if (items.length === 0) return <EmptyState title={t('planned.empty')} />
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{t('planned.rows')}</p>
      <DataTable
        caption={t('views.planned')}
        columns={columns}
        data={items}
        getRowId={itemId}
        pageSize={25}
        paginationLabels={paginationLabels}
      />
    </div>
  )
}
