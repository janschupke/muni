'use client'

import { type Bucket, forecastEnd, NOW, type PlanItem } from '@muni/domain/advisor'
import { DataTable } from '@muni/ui/data-table'
import { EmptyState } from '@muni/ui/empty-state'
import { SectionHeading } from '@muni/ui/section-heading'
import { formatDate, formatMonth } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useMemo } from 'react'

import { RoomLink, SessionDateLink } from '@/components/session-links'

import { col, itemId, usePlanColumns } from './columns'
import { RemediationBadge, UPCOMING, useBucketName } from './labels'
import { useAdvisorPages } from './paging'

/**
 * One bucket's trainings (or the whole forecast's): who, which, when it lapses, what is being
 * done, and the gap. A page at a time, the page in the address.
 */
export function BreakdownTable({
  items,
  bucket,
  asOf,
  page,
}: {
  items: PlanItem[]
  bucket: Bucket
  asOf: string
  page: number
}) {
  const t = useTranslations('advisor')
  const locale = useLocale()
  const bucketName = useBucketName(asOf)
  const pages = useAdvisorPages('breakdown', bucket, page)
  const shared = usePlanColumns(asOf)

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
      ]),
    [shared, t]
  )

  const title = `${bucketName(bucket)}: ${t('breakdown.trainings', { count: items.length })}`
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
              ? t('breakdown.rowsUpcoming', { date: formatDate(forecastEnd(asOf), locale) })
              : t('breakdown.rowsMonth', { month: formatMonth(bucket, locale) })}
        </p>
      </div>
      {items.length === 0 ? (
        <EmptyState title={t('breakdown.empty')} />
      ) : (
        <DataTable caption={title} columns={columns} data={items} getRowId={itemId} {...pages} />
      )}
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
        <span className="text-xs text-fg-muted">
          {item.booked === null && `${t('columns.proposal')}: `}
          <SessionDateLink session={session} inText />
          {' · '}
          <RoomLink room={session.room} inText />
        </span>
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
