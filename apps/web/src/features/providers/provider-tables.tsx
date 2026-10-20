'use client'

import type { ProviderDetail } from '@muni/db/repositories'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatCurrency, formatDate, formatInteger, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { PersonLink, personText, RecordLink } from '@/components/badges/archived'
import { usePaginationLabels } from '@/components/table/pagination-labels'
import { actionsColumn } from '@/components/table/table-columns'
import { CompletionActions } from '@/features/employees/completion-tables'
import { ScheduleSessionButton } from '@/features/sessions/schedule-button'

type CourseRow = ProviderDetail['byCourse'][number]
type OfferingRow = ProviderDetail['offerings'][number]
type CompletionRow = ProviderDetail['completionList'][number]

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
        completed.accessor('completedOn', {
          header: tc('completedOn'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => formatDate(getValue()),
        }),
        completed.accessor(c => c.validUntil ?? undefined, {
          id: 'validUntil',
          header: tc('validUntil'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => {
            const value = getValue()
            return value === undefined ? t('common.noExpiry') : formatDate(value)
          },
        }),
        ...(prices
          ? [
              completed.accessor(c => c.price ?? undefined, {
                id: 'price',
                header: tc('price'),
                sortFn: 'basic',
                meta: { align: 'right', nowrap: true },
                cell: ({ getValue }) => formatCurrency(getValue()),
              }),
            ]
          : []),
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

const offered = createDataColumns<OfferingRow>()

/**
 * The courses a provider offers: each at its price, with its sessions planned with it; for
 * admins, the way to schedule another with this provider (`ScheduleSessionButton`).
 */
export function ProviderOfferingsTable({
  providerId,
  providerName,
  rows,
  canEdit,
}: {
  providerId: string
  providerName: string
  rows: OfferingRow[]
  canEdit: boolean
}) {
  const t = useTranslations('providers.detail.offerings')
  const ts = useTranslations('sessions.schedule')
  const locale = useLocale()
  const columns = useMemo(
    () =>
      offered.columns([
        offered.accessor('name', {
          id: 'course',
          header: t('course'),
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
        offered.accessor('price', {
          id: 'price',
          header: t('price'),
          meta: { align: 'right', nowrap: true },
          cell: ({ getValue }) => formatCurrency(getValue()),
        }),
        offered.accessor('upcomingSessions', {
          id: 'upcoming',
          header: t('upcoming'),
          meta: { align: 'right' },
          cell: ({ getValue }) => formatInteger(getValue(), locale),
        }),
        ...(canEdit
          ? [
              actionsColumn(offered, ts('action'), o => (
                <ScheduleSessionButton
                  course={o.code}
                  provider={providerId}
                  label={t('scheduleWith', { course: o.name, provider: providerName })}
                  block={o.sessionMinutes === null ? 'NO_LENGTH' : null}
                />
              )),
            ]
          : []),
      ]),
    [t, ts, locale, canEdit, providerId, providerName]
  )
  return (
    <DataTable
      caption={t('caption', { name: providerName })}
      columns={columns}
      data={rows}
      getRowId={o => o.courseId}
      paging={{ local: 'the courses one provider offers: bounded by the catalogue' }}
    />
  )
}
