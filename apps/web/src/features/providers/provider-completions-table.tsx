'use client'

import type { ProviderDetail } from '@muni/db/repositories'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
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
import { CompletionActions } from '@/features/employees/completion-tables'

type CompletionRow = ProviderDetail['completionList'][number]

const completed = createDataColumns<CompletionRow>()

/**
 * A provider's completions, a page at a time, newest first unless sorted: who, which course,
 * when, until when and for how much.
 */
export function ProviderCompletionsTable({
  rows,
  paging,
  prices,
  canEdit,
}: {
  rows: CompletionRow[]
  paging: TablePaging
  prices: boolean
  canEdit: boolean
}) {
  const paginationLabels = usePaginationLabels()
  const t = useTranslations()
  const tc = useTranslations('providers.detail.columns')
  const columns = useMemo(
    () =>
      completed.columns([
        completed.accessor(c => personText(c.employee), {
          id: 'employee',
          header: tc('employee'),
          sortFn: 'text',
          cell: ({ row }) => {
            const person = row.original.employee
            return person.archived ? (
              <PersonLink person={person} />
            ) : (
              <CellStack title={<PersonLink person={person} />} meta={person.externalId} />
            )
          },
        }),
        completed.accessor('courseName', {
          id: 'course',
          header: tc('course'),
          sortFn: 'text',
          cell: ({ row }) => (
            <RecordLink
              href={`/courses/${row.original.courseCode}`}
              archived={row.original.courseArchived}
            >
              {row.original.courseName}
            </RecordLink>
          ),
        }),
        dateColumn(completed, {
          id: 'completedOn',
          header: tc('completedOn'),
          value: c => c.completedOn,
        }),
        validUntilColumn(completed, {
          header: tc('validUntil'),
          never: t('common.noExpiry'),
          value: c => c.validUntil,
        }),
        ...(prices ? [priceColumn(completed, { header: tc('price'), value: c => c.price })] : []),
        ...(canEdit
          ? [
              actionsColumn(completed, t('common.actions'), row => (
                <CompletionActions
                  completion={row}
                  personId={row.employee.archived ? null : row.employee.externalId}
                  courseName={row.courseName}
                />
              )),
            ]
          : []),
      ]),
    [canEdit, prices, t, tc]
  )
  return (
    <DataTable
      caption={t('providers.detail.recent')}
      columns={columns}
      data={rows}
      getRowId={c => c.externalId}
      paging={paging}
      paginationLabels={paginationLabels}
    />
  )
}
