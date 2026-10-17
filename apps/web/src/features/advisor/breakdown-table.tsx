'use client'

import { type Bucket, forecastEnd, NOW, type PlanItem } from '@muni/domain/advisor'
import { DataTable, type TablePaging } from '@muni/ui/data-table'
import { EmptyState } from '@muni/ui/empty-state'
import { SectionHeading } from '@muni/ui/section-heading'
import { formatDate, formatMonth } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useMemo } from 'react'

import { usePaginationLabels } from '@/components/pagination-labels'
import { RoomLink, SessionDateLink } from '@/components/session-links'

import { RowRemedy, useBookDialog } from './booking'
import { col, itemId, usePlanColumns } from './columns'
import { RemediationBadge, UPCOMING, useBucketName } from './labels'

/**
 * One bucket's trainings (or the whole forecast's): who, which, when it lapses, what is being
 * done, and the gap; for admins, a row with nothing booked books the proposed session or
 * schedules a new one. A page at a time, the page in the address.
 */
export function BreakdownTable({
  items,
  total,
  paging,
  bucket,
  asOf,
  canBook,
}: {
  /** The page the server sorted and cut. */
  items: PlanItem[]
  /** Trainings in the row, on every page. */
  total: number
  paging: TablePaging
  bucket: Bucket
  asOf: string
  /** Admins only: book or schedule from a row. */
  canBook: boolean
}) {
  const t = useTranslations('advisor')
  const locale = useLocale()
  const bucketName = useBucketName(asOf)
  const paginationLabels = usePaginationLabels()
  const shared = usePlanColumns(asOf)
  const { ask, dialog } = useBookDialog()

  const columns = useMemo(
    () =>
      col.columns([
        shared.person,
        shared.training,
        shared.lapses,
        col.accessor('remediation', {
          header: t('columns.remediation'),
          sortFn: 'text',
          cell: ({ row }) => <RemediationCell item={row.original} />,
        }),
        shared.window,
        ...(canBook
          ? [
              col.display({
                id: 'remedy',
                header: () => <span className="sr-only">{t('columns.remedy')}</span>,
                meta: { nowrap: true, sticky: 'right', headerClassName: 'w-0' },
                cell: ({ row }) =>
                  row.original.remediation === 'ACTION_REQUIRED' && (
                    <RowRemedy
                      item={row.original}
                      onBook={(item, from) => {
                        ask([{ item, session: item.proposal.session }], from)
                      }}
                    />
                  ),
              }),
            ]
          : []),
      ]),
    [shared, t, canBook, ask]
  )

  const title = `${bucketName(bucket)}: ${t('breakdown.trainings', { count: total })}`
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div>
        <SectionHeading id={headingId} className="mt-0">
          {title}
        </SectionHeading>
        <p className="text-sm text-fg-muted">
          {bucket === NOW
            ? t('breakdown.rowsNow')
            : bucket === UPCOMING
              ? t('breakdown.rowsUpcoming', { date: formatDate(forecastEnd(asOf)) })
              : t('breakdown.rowsMonth', { month: formatMonth(bucket, locale) })}
        </p>
      </div>
      {total === 0 ? (
        <EmptyState title={t('breakdown.empty')} />
      ) : (
        <DataTable
          caption={title}
          columns={columns}
          data={items}
          getRowId={itemId}
          paging={paging}
          paginationLabels={paginationLabels}
        />
      )}
      {dialog}
    </section>
  )
}

/** The remediation, and under it the booked session, the proposal, or why there is none. */
function RemediationCell({ item }: { item: PlanItem }) {
  const t = useTranslations('advisor')
  const session = item.booked ?? (item.proposal?.kind === 'SESSION' ? item.proposal.session : null)
  return (
    <div className="flex flex-col items-start gap-1">
      <RemediationBadge remediation={item.remediation} />
      {session ? (
        <div className="flex flex-col text-xs">
          {item.booked === null && <span className="text-fg-muted">{t('columns.proposal')}</span>}
          <span>
            <SessionDateLink
              session={session}
              employee={item.booked === null ? item.need.employee.externalId : undefined}
            />
            {' · '}
            <RoomLink room={session.room} />
          </span>
        </div>
      ) : (
        item.proposal?.kind === 'NONE' && (
          <span className="text-xs text-fg-muted">
            {t(`action.reasons.${item.proposal.reason}`)}
          </span>
        )
      )}
    </div>
  )
}
