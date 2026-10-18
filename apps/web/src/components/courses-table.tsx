'use client'

import type { CourseListItem } from '@muni/db/repositories'
import { scheduleBlock } from '@muni/domain/sessions'
import { BarRow } from '@muni/ui/bar-row'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { formatInteger, PLACEHOLDER } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { ScheduleSessionButton } from '@/features/sessions/schedule-button'
import { formatRate } from '@/lib/format-rate'

import { ComplianceBar } from './compliance-breakdown'
import { CoursePanel } from './course-panel'
import { usePaginationLabels } from './pagination-labels'
import { RequirementList } from './requirement-list'
import { hiddenHeader, nameColumn, rowActionsColumn } from './table-columns'

const col = createDataColumns<CourseListItem>()

export function CoursesTable({
  courses,
  paging,
  canEdit = false,
}: {
  courses: CourseListItem[]
  paging: TablePaging
  /** Admins get a way to schedule a session of each, a pencil and archive. */
  canEdit?: boolean | undefined
}) {
  const t = useTranslations('courses')
  const tc = useTranslations('common')
  const ts = useTranslations('sessions.schedule')
  const paginationLabels = usePaginationLabels()
  const locale = useLocale()

  const columns = useMemo(
    () =>
      col.columns([
        nameColumn(col, {
          header: t('columns.name'),
          name: c => c.name,
          href: c => `/courses/${c.code}`,
          meta: c => c.code,
        }),
        // Courses that never expire sort after every finite validity.
        col.accessor(c => c.validityMonths ?? undefined, {
          id: 'validity',
          header: t('columns.validity'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => {
            const months = getValue()
            return months === undefined ? tc('noExpiry') : tc('months', { count: months })
          },
        }),
        col.display({
          id: 'requiredFor',
          header: t('columns.requiredFor'),
          cell: ({ row }) => <RequirementList requirements={row.original.requirements} />,
        }),
        col.accessor(c => (c.counts.total > 0 ? c.rate : undefined), {
          id: 'compliance',
          header: t('columns.compliance'),
          sortFn: 'basic',
          meta: { headerClassName: 'w-56' },
          cell: ({ row }) =>
            row.original.counts.total > 0 ? (
              <BarRow
                layout="inline"
                bar={<ComplianceBar counts={row.original.counts} label={row.original.name} />}
                value={formatRate(row.original.rate, locale)}
              />
            ) : (
              <span className="text-fg-subtle">{PLACEHOLDER}</span>
            ),
        }),
        col.accessor('completionCount', {
          id: 'completions',
          header: t('columns.completions'),
          sortFn: 'basic',
          meta: { align: 'right' },
          cell: ({ getValue }) => formatInteger(getValue(), locale),
        }),
        col.accessor('upcomingSessions', {
          id: 'upcoming',
          header: t('columns.upcoming'),
          sortFn: 'basic',
          meta: { align: 'right' },
          cell: ({ getValue }) => formatInteger(getValue(), locale),
        }),
        ...(canEdit
          ? [
              // Scheduling a session of it: the same button as on its page, a room's or a
              // provider's, dimmed with the reason when it cannot be.
              col.display({
                id: 'schedule',
                header: hiddenHeader(ts('action')),
                meta: { headerClassName: 'w-0', nowrap: true },
                cell: ({ row }) => (
                  <ScheduleSessionButton
                    course={row.original.code}
                    label={ts('actionFor', { course: row.original.name })}
                    block={scheduleBlock({
                      sessionMinutes: row.original.sessionNeeds.minutes,
                      offerings: row.original.offerings.length,
                    })}
                  />
                ),
              }),
              rowActionsColumn(col, tc('actions'), r => ({
                kind: 'course',
                id: r.id,
                name: r.name,
                editHref: `/courses/${r.code}/edit`,
              })),
            ]
          : []),
      ]),
    [canEdit, locale, t, tc, ts]
  )

  return (
    <DataTable
      caption={t('title')}
      columns={columns}
      data={courses}
      getRowId={c => c.code}
      paging={paging}
      paginationLabels={paginationLabels}
      renderExpanded={c => <CoursePanel course={c} />}
      expandLabel={c => t('panel.toggle', { name: c.name })}
      expandHeader={t('panel.header')}
    />
  )
}
