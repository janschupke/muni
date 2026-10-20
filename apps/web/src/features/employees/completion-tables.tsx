'use client'

import type { CourseDetail, EmployeeDetail } from '@muni/db/repositories'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { PLACEHOLDER } from '@muni/utils/format'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { PersonLink, personText, RecordLink } from '@/components/badges/archived'
import { usePaginationLabels } from '@/components/table/pagination-labels'
import {
  actionsColumn,
  dateColumn,
  priceColumn,
  validUntilColumn,
} from '@/components/table/table-columns'
import { RowActions } from '@/components/views/record-actions'

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
        dateColumn(history, {
          id: 'completedOn',
          header: t('courses.detail.completedOn'),
          value: c => c.completedOn,
        }),
        validUntilColumn(history, {
          header: t('courses.detail.validUntil'),
          never: t('common.noExpiry'),
          value: c => c.validUntil,
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
        priceColumn(history, { header: t('employees.detail.price'), value: c => c.price }),
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
              actionsColumn(history, t('common.actions'), row => (
                <CompletionActions
                  completion={row}
                  personId={editFor}
                  courseName={row.courseName}
                />
              )),
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
        dateColumn(ofCourse, {
          id: 'completedOn',
          header: t('courses.detail.completedOn'),
          value: c => c.completedOn,
        }),
        validUntilColumn(ofCourse, {
          header: t('courses.detail.validUntil'),
          never: t('common.noExpiry'),
          value: c => c.validUntil,
        }),
        ...(canEdit
          ? [
              actionsColumn(ofCourse, t('common.actions'), row => (
                <CompletionActions
                  completion={row}
                  personId={row.employee.archived ? null : row.employee.externalId}
                  courseName={courseName}
                />
              )),
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
