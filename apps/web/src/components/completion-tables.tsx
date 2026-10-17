'use client'

import type { CourseDetail, EmployeeDetail } from '@muni/db/repositories'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { formatCurrency, formatDate, PLACEHOLDER } from '@muni/utils/format'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { PersonLink, personText, RecordLink } from './archived'
import { usePaginationLabels } from './pagination-labels'
import { RowActions } from './record-actions'

type EmployeeCompletion = EmployeeDetail['completions'][number]
type CourseCompletion = CourseDetail['completionList'][number]

// ISO dates (`YYYY-MM-DD`) order correctly as plain strings, so they sort with `basic`.

const history = createDataColumns<EmployeeCompletion>()

/**
 * An employee's completions, a page at a time, newest first unless sorted; notes only for
 * roles that may see them. With `editFor` (the person's ID, for admins) each row gets a pencil
 * and archive.
 */
export function CompletionHistoryTable({
  completions,
  paging,
  showNotes,
  editFor,
}: {
  completions: EmployeeCompletion[]
  paging: TablePaging
  showNotes: boolean
  editFor?: string | undefined
}) {
  const t = useTranslations()
  const paginationLabels = usePaginationLabels()

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
          cell: ({ getValue }) => formatDate(getValue()),
        }),
        history.accessor(c => c.validUntil ?? undefined, {
          id: 'validUntil',
          header: t('courses.detail.validUntil'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => {
            const value = getValue()
            return value === undefined ? t('common.noExpiry') : formatDate(value)
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
          cell: ({ getValue }) => formatCurrency(getValue()),
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
                  <CompletionActions
                    completion={row.original}
                    personId={editFor}
                    courseName={row.original.courseName}
                  />
                ),
              }),
            ]
          : []),
      ]),
    [editFor, showNotes, t]
  )

  return (
    <DataTable
      caption={t('employees.detail.history')}
      columns={columns}
      data={completions}
      getRowId={c => c.externalId}
      paging={paging}
      paginationLabels={paginationLabels}
    />
  )
}

const ofCourse = createDataColumns<CourseCompletion>()

/**
 * A completion's pencil and archive, for admins, wherever it is listed. An archived person's
 * completions stay as they are: the person's page is gone.
 */
export function CompletionActions({
  completion,
  personId,
  courseName,
}: {
  completion: { id: string; externalId: string }
  /** The person's ID, or null when they are archived. */
  personId: string | null
  courseName: string
}) {
  if (personId === null) return null
  return (
    <RowActions
      kind="completion"
      id={completion.id}
      name={`${completion.externalId} · ${courseName}`}
      editHref={`/employees/${personId}/completions/${completion.id}/edit`}
    />
  )
}

/**
 * The completions of one course, a page at a time, newest first unless sorted; each editable
 * by admins (`canEdit`).
 */
export function CourseCompletionsTable({
  completions,
  paging,
  courseName,
  canEdit,
}: {
  completions: CourseCompletion[]
  paging: TablePaging
  courseName: string
  canEdit: boolean
}) {
  const t = useTranslations()
  const paginationLabels = usePaginationLabels()

  const columns = useMemo(
    () =>
      ofCourse.columns([
        ofCourse.accessor(c => personText(c.employee), {
          id: 'employee',
          header: t('courses.detail.employee'),
          sortFn: 'text',
          cell: ({ row }) => <PersonLink person={row.original.employee} />,
        }),
        ofCourse.accessor('completedOn', {
          header: t('courses.detail.completedOn'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => formatDate(getValue()),
        }),
        ofCourse.accessor(c => c.validUntil ?? undefined, {
          id: 'validUntil',
          header: t('courses.detail.validUntil'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => {
            const value = getValue()
            return value === undefined ? t('common.noExpiry') : formatDate(value)
          },
        }),
        ...(canEdit
          ? [
              ofCourse.display({
                id: 'actions',
                header: () => <span className="sr-only">{t('common.actions')}</span>,
                meta: { headerClassName: 'w-0', align: 'right' },
                cell: ({ row }) => (
                  <CompletionActions
                    completion={row.original}
                    personId={
                      row.original.employee.archived ? null : row.original.employee.externalId
                    }
                    courseName={courseName}
                  />
                ),
              }),
            ]
          : []),
      ]),
    [canEdit, courseName, t]
  )

  return (
    <DataTable
      caption={t('courses.detail.completions')}
      columns={columns}
      data={completions}
      getRowId={c => c.externalId}
      paging={paging}
      paginationLabels={paginationLabels}
    />
  )
}
