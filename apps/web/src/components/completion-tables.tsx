'use client'

import type { CourseDetail, EmployeeDetail } from '@muni/db/repositories'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { formatCurrency, formatDate, PLACEHOLDER } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { PersonLink, personText, RecordLink } from './archived'
import { RowActions } from './record-actions'

type EmployeeCompletion = EmployeeDetail['completions'][number]
type CourseCompletion = CourseDetail['recentCompletions'][number]

// ISO dates (`YYYY-MM-DD`) order correctly as plain strings, so they sort with `basic`.

const history = createDataColumns<EmployeeCompletion>()

/**
 * An employee's completions, newest first; notes only for roles that may see them. With
 * `editFor` (the person's ID, for admins) each row gets a pencil and archive.
 */
export function CompletionHistoryTable({
  completions,
  showNotes,
  editFor,
}: {
  completions: EmployeeCompletion[]
  showNotes: boolean
  editFor?: string | undefined
}) {
  const t = useTranslations()
  const locale = useLocale()

  const columns = useMemo(
    () =>
      history.columns([
        history.accessor('courseName', {
          id: 'course',
          header: t('courses.columns.name'),
          sortFn: 'text',
          cell: ({ row }) => (
            <CellStack
              title={
                <RecordLink
                  href={`/courses/${row.original.courseCode}`}
                  archived={row.original.courseArchived}
                >
                  {row.original.courseName}
                </RecordLink>
              }
              meta={row.original.externalId}
            />
          ),
        }),
        history.accessor('completedOn', {
          header: t('courses.detail.completedOn'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => formatDate(getValue(), locale),
        }),
        history.accessor(c => c.validUntil ?? undefined, {
          id: 'validUntil',
          header: t('courses.detail.validUntil'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => {
            const value = getValue()
            return value === undefined ? t('common.noExpiry') : formatDate(value, locale)
          },
        }),
        history.accessor(c => c.provider?.name, {
          id: 'provider',
          header: t('forms.completion.provider'),
          sortFn: 'text',
          cell: ({ row }) => {
            const { provider } = row.original
            return provider ? (
              <RecordLink href={`/providers/${provider.id}`} archived={provider.archived}>
                {provider.name}
              </RecordLink>
            ) : (
              PLACEHOLDER
            )
          },
        }),
        history.accessor(c => c.price ?? undefined, {
          id: 'price',
          header: t('employees.detail.price'),
          sortFn: 'basic',
          meta: { align: 'right' },
          cell: ({ getValue }) => formatCurrency(getValue(), locale),
        }),
        ...(showNotes
          ? [
              history.display({
                id: 'note',
                header: t('employees.detail.note'),
                meta: { className: 'max-w-xs whitespace-pre-line text-fg-muted' },
                cell: ({ row }) => row.original.note ?? '',
              }),
            ]
          : []),
        ...(editFor
          ? [
              history.display({
                id: 'actions',
                header: () => <span className="sr-only">{t('common.actions')}</span>,
                meta: { headerClassName: 'w-0', align: 'right' },
                cell: ({ row }) => (
                  <RowActions
                    kind="completion"
                    id={row.original.id}
                    name={`${row.original.courseName} (${row.original.externalId})`}
                    editHref={`/employees/${editFor}/completions/${row.original.id}/edit`}
                  />
                ),
              }),
            ]
          : []),
      ]),
    [editFor, locale, showNotes, t]
  )

  return (
    <DataTable
      caption={t('employees.detail.history')}
      columns={columns}
      data={completions}
      getRowId={c => c.externalId}
    />
  )
}

const recent = createDataColumns<CourseCompletion>()

/** The latest completions of one course. */
export function RecentCompletionsTable({ completions }: { completions: CourseCompletion[] }) {
  const t = useTranslations()
  const locale = useLocale()

  const columns = useMemo(
    () =>
      recent.columns([
        recent.accessor(c => personText(c.employee), {
          id: 'employee',
          header: t('courses.detail.employee'),
          sortFn: 'text',
          cell: ({ row }) => <PersonLink person={row.original.employee} />,
        }),
        recent.accessor('completedOn', {
          header: t('courses.detail.completedOn'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => formatDate(getValue(), locale),
        }),
        recent.accessor(c => c.validUntil ?? undefined, {
          id: 'validUntil',
          header: t('courses.detail.validUntil'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => {
            const value = getValue()
            return value === undefined ? t('common.noExpiry') : formatDate(value, locale)
          },
        }),
      ]),
    [locale, t]
  )

  return (
    <DataTable
      caption={t('courses.detail.recentCompletions')}
      columns={columns}
      data={completions}
      getRowId={c => c.externalId}
    />
  )
}
