'use client'

import { type Bucket, NOW, type PlanItem } from '@muni/domain/advisor'
import { DataTable } from '@muni/ui/data-table'
import { EmptyState } from '@muni/ui/empty-state'
import { SectionHeading } from '@muni/ui/section-heading'
import { formatMonth } from '@muni/utils/format'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useMemo } from 'react'

import { usePaginationLabels } from '@/components/pagination-labels'
import { RoomLink, SessionDateLink } from '@/components/session-links'

import { col, itemId, usePlanColumns } from './columns'
import { RemediationBadge, useBucketName } from './labels'

/** One bucket's trainings: who, which, when it lapses, what is being done, and the gap. */
export function BreakdownTable({
  items,
  bucket,
  asOf,
}: {
  items: PlanItem[]
  bucket: Bucket
  asOf: string
}) {
  const t = useTranslations('advisor')
  const locale = useLocale()
  const bucketName = useBucketName()
  const shared = usePlanColumns(asOf)
  const paginationLabels = usePaginationLabels()

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
            : t('breakdown.rowsMonth', { month: formatMonth(bucket, locale) })}
        </p>
      </div>
      {items.length === 0 ? (
        <EmptyState title={t('breakdown.empty')} />
      ) : (
        <DataTable
          caption={title}
          columns={columns}
          data={items}
          getRowId={itemId}
          pageSize={25}
          paginationLabels={paginationLabels}
        />
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
          <SessionDateLink session={session} />
          {' · '}
          <RoomLink room={session.room} />
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
