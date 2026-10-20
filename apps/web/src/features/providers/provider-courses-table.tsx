'use client'

import type { ProviderDetail } from '@muni/db/repositories'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatCurrency, formatDate, formatInteger, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { usePaginationLabels } from '@/components/table/pagination-labels'

type CourseRow = ProviderDetail['byCourse'][number]

const optionalDate = (value: string | undefined) =>
  value === undefined ? PLACEHOLDER : formatDate(value)

const byCourse = createDataColumns<CourseRow>()

/**
 * What was completed with a provider, per course, a page at a time; spend only for viewers who
 * see prices.
 */
export function ProviderCoursesTable({
  rows,
  paging,
  prices,
}: {
  rows: CourseRow[]
  paging: TablePaging
  prices: boolean
}) {
  const paginationLabels = usePaginationLabels()
  const t = useTranslations('providers.detail.columns')
  const td = useTranslations('providers.detail')
  const locale = useLocale()
  const columns = useMemo(
    () =>
      byCourse.columns([
        byCourse.accessor('name', {
          id: 'course',
          header: t('course'),
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
        byCourse.accessor('completions', {
          header: t('completions'),
          sortFn: 'basic',
          meta: { align: 'right' },
          cell: ({ getValue }) => formatInteger(getValue(), locale),
        }),
        byCourse.accessor('people', {
          header: t('people'),
          sortFn: 'basic',
          meta: { align: 'right' },
          cell: ({ getValue }) => formatInteger(getValue(), locale),
        }),
        ...(prices
          ? [
              byCourse.accessor(c => c.spend ?? undefined, {
                id: 'spend',
                header: t('spend'),
                sortFn: 'basic',
                meta: { align: 'right', nowrap: true },
                cell: ({ getValue }) => formatCurrency(getValue()),
              }),
            ]
          : []),
        byCourse.accessor(c => c.lastCompletedOn ?? undefined, {
          id: 'last',
          header: t('last'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => optionalDate(getValue()),
        }),
      ]),
    [locale, prices, t]
  )
  return (
    <DataTable
      caption={td('byCourse')}
      columns={columns}
      data={rows}
      getRowId={c => c.code}
      paging={paging}
      paginationLabels={paginationLabels}
    />
  )
}
