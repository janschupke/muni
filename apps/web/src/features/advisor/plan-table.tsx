'use client'

import type { Suggestion } from '@muni/domain/advisor'
import { BarRow } from '@muni/ui/bar-row'
import { Button } from '@muni/ui/button'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { Meter } from '@muni/ui/meter'
import { CellStack, Table, TBody, Td, Th, THead } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import {
  formatDate,
  formatDecimal,
  formatRelativeDays,
  formatTimeRange,
  PLACEHOLDER,
} from '@muni/utils/format'
import { diffInDays } from '@muni/utils/dates'
import { CalendarPlus } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { ComplianceBadge } from '@/components/status-badges'

const col = createDataColumns<Suggestion>()

const suggestionId = (s: Suggestion) => `${s.need.employee.externalId}|${s.need.course.code}`

/** The suggested bookings; each row opens to the terms its score is made of. */
export function PlanTable({
  suggestions,
  asOf,
  onApply,
  pending,
}: {
  suggestions: Suggestion[]
  asOf: string
  /** Signed-in only: saves one suggestion. */
  onApply?: (suggestion: Suggestion) => void
  pending: boolean
}) {
  const t = useTranslations('advisor.plan')
  const locale = useLocale()

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor(s => s.need.employee.name, {
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
        col.accessor(s => s.need.course.name, {
          id: 'course',
          header: t('course'),
          sortFn: 'text',
          cell: ({ row }) => (
            <div className="flex flex-col items-start gap-1">
              <span>{row.original.need.course.name}</span>
              <ComplianceBadge status={row.original.need.status} />
            </div>
          ),
        }),
        col.accessor(s => s.need.validUntil ?? undefined, {
          id: 'expiry',
          header: t('expiry'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ getValue }) => {
            const validUntil = getValue()
            if (validUntil === undefined) return PLACEHOLDER
            return (
              <CellStack
                title={formatDate(validUntil, locale)}
                meta={formatRelativeDays(diffInDays(asOf, validUntil), locale)}
              />
            )
          },
        }),
        col.accessor(s => Date.parse(s.session.startsAt), {
          id: 'session',
          header: t('session'),
          sortFn: 'basic',
          meta: { nowrap: true },
          cell: ({ row }) => (
            <CellStack
              title={formatTimeRange(
                row.original.session.startsAt,
                row.original.session.endsAt,
                locale
              )}
              meta={`${row.original.session.externalId} · ${row.original.session.location}`}
            />
          ),
        }),
        col.accessor(
          s => (s.session.capacity > 0 ? s.bookedAfter / s.session.capacity : undefined),
          {
            id: 'fill',
            header: t('fillAfter'),
            sortFn: 'basic',
            meta: { headerClassName: 'w-40' },
            cell: ({ row }) => (
              <BarRow
                layout="inline"
                bar={
                  <Meter
                    value={row.original.bookedAfter}
                    max={row.original.session.capacity}
                    label={t('fillAfter')}
                  />
                }
                value={`${String(row.original.bookedAfter)} / ${String(row.original.session.capacity)}`}
              />
            ),
          }
        ),
        col.accessor('score', {
          header: t('score'),
          sortFn: 'basic',
          meta: { align: 'right' },
          cell: ({ getValue }) => formatDecimal(getValue(), locale),
        }),
        ...(onApply
          ? [
              col.display({
                id: 'apply',
                header: () => <span className="sr-only">{t('apply')}</span>,
                meta: { nowrap: true },
                cell: ({ row }) => (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      onApply(row.original)
                    }}
                    aria-label={t('applyOne', {
                      name: row.original.need.employee.name,
                      session: row.original.session.externalId,
                    })}
                  >
                    <CalendarPlus aria-hidden />
                    {t('apply')}
                  </Button>
                ),
              }),
            ]
          : []),
      ]),
    [asOf, locale, onApply, pending, t]
  )

  return (
    <DataTable
      columns={columns}
      data={suggestions}
      getRowId={suggestionId}
      initialSorting={[{ id: 'score', desc: true }]}
      pageSize={25}
      paginationLabels={{
        nav: t('pagination'),
        previous: t('previous'),
        next: t('next'),
        status: (page, pageCount) => t('page', { page, pageCount }),
      }}
      renderExpanded={s => <ScoreTerms suggestion={s} />}
      expandLabel={s => t('why', { name: s.need.employee.name })}
      expandHeader={t('whyHeader')}
    />
  )
}

/** Why this session for this person: every term of the score, adding up to it. */
function ScoreTerms({ suggestion }: { suggestion: Suggestion }) {
  const t = useTranslations('advisor.terms')
  const locale = useLocale()
  return (
    <Table density="compact" className="max-w-md">
      <caption className="mb-2 text-left text-sm font-medium text-fg">{t('caption')}</caption>
      <THead className="bg-transparent">
        <tr>
          <Th>{t('term')}</Th>
          <Th align="right">{t('points')}</Th>
        </tr>
      </THead>
      <TBody>
        {suggestion.terms.map(term => (
          <tr key={term.key}>
            <Td>
              {t(`names.${term.key}`, {
                days: suggestion.daysUntil,
                status: suggestion.need.status,
              })}
            </Td>
            <Td align="right">{formatDecimal(term.value, locale, { signed: true })}</Td>
          </tr>
        ))}
        <tr className="font-semibold">
          <Td>{t('total')}</Td>
          <Td align="right">{formatDecimal(suggestion.score, locale)}</Td>
        </tr>
      </TBody>
    </Table>
  )
}
