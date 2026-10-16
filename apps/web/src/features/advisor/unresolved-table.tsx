'use client'

import type { AdvisorPlan, Unresolved } from '@muni/domain/advisor'
import { Alert } from '@muni/ui/alert'
import { Badge } from '@muni/ui/badge'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { EmptyState } from '@muni/ui/empty-state'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { ComplianceBadge } from '@/components/status-badges'

const col = createDataColumns<Unresolved>()

/** Needs the plan could not place, why, and which courses need another session. */
export function UnresolvedTable({
  unresolved,
  shortfall,
  horizonDays,
}: {
  unresolved: Unresolved[]
  shortfall: AdvisorPlan['shortfall']
  horizonDays: number
}) {
  const t = useTranslations('advisor.unresolved')

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor(u => u.need.employee.name, {
          id: 'worker',
          header: t('worker'),
          sortFn: 'text',
          cell: ({ row }) => (
            <CellStack
              title={
                <TextLink asChild emphasis>
                  <Link href={`/employees/${row.original.need.employee.externalId}`}>
                    {row.original.need.employee.name}
                  </Link>
                </TextLink>
              }
              meta={row.original.need.employee.department ?? PLACEHOLDER}
            />
          ),
        }),
        col.accessor(u => u.need.course.name, {
          id: 'course',
          header: t('course'),
          sortFn: 'text',
        }),
        col.accessor(u => u.need.status, {
          id: 'status',
          header: t('status'),
          sortFn: 'text',
          cell: ({ getValue }) => <ComplianceBadge status={getValue()} />,
        }),
        col.accessor('reason', {
          header: t('reason'),
          sortFn: 'text',
          cell: ({ getValue }) => (
            <Badge tone="neutral">{t(`reasons.${getValue()}`, { days: horizonDays })}</Badge>
          ),
        }),
      ]),
    [horizonDays, t]
  )

  if (unresolved.length === 0) return <EmptyState title={t('none')} />
  return (
    <div className="flex flex-col gap-4">
      {shortfall.length > 0 && (
        <Alert tone="info" title={t('shortfallTitle')}>
          <ul className="mt-1 flex flex-col gap-0.5">
            {shortfall.map(s => (
              <li key={s.courseCode}>
                {t('shortfall', { people: s.people, course: s.courseName, days: horizonDays })}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <DataTable
        columns={columns}
        data={unresolved}
        getRowId={u => `${u.need.employee.externalId}|${u.need.course.code}`}
        pageSize={25}
        paginationLabels={{
          nav: t('pagination'),
          previous: t('previous'),
          next: t('next'),
          status: (page, pageCount) => t('page', { page, pageCount }),
        }}
      />
    </div>
  )
}
