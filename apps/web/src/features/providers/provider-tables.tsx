'use client'

import type { ProviderDetail } from '@muni/db/repositories'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatCurrency, formatDate, formatInteger, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

type CourseRow = ProviderDetail['byCourse'][number]
type CompletionRow = ProviderDetail['recentCompletions'][number]

const optionalDate = (value: string | undefined, locale: string) =>
  value === undefined ? PLACEHOLDER : formatDate(value, locale)

const byCourse = createDataColumns<CourseRow>()

/** What was completed with a provider, per course; spend only for viewers who see prices. */
export function ProviderCoursesTable({ rows, prices }: { rows: CourseRow[]; prices: boolean }) {
  const t = useTranslations('providers.detail.columns')
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
                cell: ({ getValue }) => formatCurrency(getValue(), locale),
              }),
            ]
          : []),
        byCourse.accessor(c => c.lastCompletedOn ?? undefined, {
          id: 'last',
          header: t('last'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => optionalDate(getValue(), locale),
        }),
      ]),
    [locale, prices, t]
  )
  return <DataTable columns={columns} data={rows} getRowId={c => c.code} />
}

const recent = createDataColumns<CompletionRow>()

/** A provider's newest completions: who, which course, when, until when and for how much. */
export function ProviderCompletionsTable({
  rows,
  prices,
}: {
  rows: CompletionRow[]
  prices: boolean
}) {
  const t = useTranslations()
  const tc = useTranslations('providers.detail.columns')
  const locale = useLocale()
  const columns = useMemo(
    () =>
      recent.columns([
        recent.accessor('employeeName', {
          id: 'employee',
          header: tc('employee'),
          sortFn: 'text',
          cell: ({ row }) => (
            <CellStack
              title={
                <TextLink asChild>
                  <Link href={`/employees/${row.original.employeeExternalId}`}>
                    {row.original.employeeName}
                  </Link>
                </TextLink>
              }
              meta={row.original.employeeExternalId}
            />
          ),
        }),
        recent.accessor('courseName', {
          id: 'course',
          header: tc('course'),
          sortFn: 'text',
          cell: ({ row }) => (
            <TextLink asChild>
              <Link href={`/courses/${row.original.courseCode}`}>{row.original.courseName}</Link>
            </TextLink>
          ),
        }),
        recent.accessor('completedOn', {
          header: tc('completedOn'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => formatDate(getValue(), locale),
        }),
        recent.accessor(c => c.validUntil ?? undefined, {
          id: 'validUntil',
          header: tc('validUntil'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => {
            const value = getValue()
            return value === undefined ? t('common.noExpiry') : formatDate(value, locale)
          },
        }),
        ...(prices
          ? [
              recent.accessor(c => c.price ?? undefined, {
                id: 'price',
                header: tc('price'),
                sortFn: 'basic',
                meta: { align: 'right', nowrap: true },
                cell: ({ getValue }) => formatCurrency(getValue(), locale),
              }),
            ]
          : []),
      ]),
    [locale, prices, t, tc]
  )
  return <DataTable columns={columns} data={rows} getRowId={c => c.externalId} />
}
