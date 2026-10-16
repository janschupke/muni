'use client'

import type { CourseListItem } from '@muni/db/repositories'
import { BarRow } from '@muni/ui/bar-row'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger, formatPercent, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { ComplianceBar } from './compliance-breakdown'
import { CoursePanel } from './course-panel'
import { RequirementList } from './requirement-list'

const col = createDataColumns<CourseListItem>()

export function CoursesTable({ courses }: { courses: CourseListItem[] }) {
  const t = useTranslations('courses')
  const tc = useTranslations('common')
  const locale = useLocale()

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor('name', {
          header: t('columns.name'),
          sortFn: 'text',
          cell: ({ row }) => (
            <CellStack
              title={
                <TextLink asChild emphasis>
                  <Link href={`/courses/${row.original.code}`}>{row.original.name}</Link>
                </TextLink>
              }
              meta={row.original.code}
            />
          ),
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
                value={formatPercent(row.original.rate, locale)}
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
      ]),
    [locale, t, tc]
  )

  return (
    <DataTable
      columns={columns}
      data={courses}
      getRowId={c => c.code}
      renderExpanded={c => <CoursePanel course={c} />}
      expandLabel={c => t('panel.toggle', { name: c.name })}
      expandHeader={t('panel.header')}
    />
  )
}
