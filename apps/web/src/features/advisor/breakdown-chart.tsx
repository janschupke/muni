'use client'

import { type BreakdownRow, type Bucket, REMEDIATIONS, upcomingRow } from '@muni/domain/advisor'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { Legend } from '@muni/ui/charts/legend'
import { StackedBar } from '@muni/ui/charts/stacked-bar'
import { cn } from '@muni/ui/cn'
import { useTranslations } from 'next-intl'

import { Link } from '@/components/navigation/link'

import { advisorHref, REMEDIATION_FILL, useBucketName } from './labels'

/**
 * Non-compliant now, then everything lapsing in the forecast, then each of its months under
 * it, split by remediation: one row for each count the advisor's cards show. Bars share one
 * scale (the largest row is full width), so rows compare by length; each row selects its
 * trainings.
 */
export function BreakdownChart({
  breakdown,
  selected,
  asOf,
  end,
}: {
  breakdown: BreakdownRow[]
  selected: Bucket
  asOf: string
  /** The forecast's last day, as the page writes it. */
  end: string
}) {
  const t = useTranslations('advisor.breakdown')
  const tr = useTranslations('advisor.remediation')
  const bucketName = useBucketName(asOf)
  const [now, ...months] = breakdown
  const rows = [
    ...(now ? [{ row: now, month: false }] : []),
    { row: upcomingRow(months), month: false },
    ...months.map(row => ({ row, month: true })),
  ]
  const max = Math.max(1, ...rows.map(r => r.row.total))

  return (
    <Card>
      <CardHeader title={t('title')} description={t('description', { date: end })} />
      <CardBody className="flex flex-col gap-3">
        <Legend
          items={REMEDIATIONS.map(r => ({
            key: r,
            label: tr(r),
            swatchClassName: REMEDIATION_FILL[r],
          }))}
        />
        <ul className="-mx-2 flex flex-col">
          {rows.map(({ row, month }) => {
            const active = row.bucket === selected
            const name = bucketName(row.bucket)
            return (
              // The months make up the row above them: set in under it.
              <li key={row.bucket} className={cn(month && 'ml-4 border-l border-border-default')}>
                {/* A choice in a list, like a tab: its name in the link colour, the chosen one
                    filled; judged as a choice, not as a link in text (data-slot). */}
                <Link
                  href={advisorHref('breakdown', row.bucket)}
                  data-slot="choice"
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'group block rounded-md px-2 py-2 transition-colors hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-focus-ring',
                    active && 'bg-state-selected'
                  )}
                >
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span
                      className={cn(
                        'min-w-0 underline-offset-2 group-hover:underline',
                        active ? 'font-semibold' : 'font-medium text-link'
                      )}
                    >
                      {name}
                    </span>
                    <span className="text-fg tabular-nums">
                      {t('trainings', { count: row.total })}
                    </span>
                  </div>
                  <StackedBar
                    label={name}
                    scale={row.total / max}
                    segments={REMEDIATIONS.map(r => ({
                      key: r,
                      label: tr(r),
                      value: row.counts[r],
                      fillClass: REMEDIATION_FILL[r],
                    }))}
                  />
                  {row.total > 0 && (
                    <div className="mt-1 text-xs text-fg-muted tabular-nums">
                      {t('counts', {
                        planned: row.counts.PLANNED,
                        late: row.counts.PLANNED_LATE,
                        action: row.counts.ACTION_REQUIRED,
                      })}
                    </div>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </CardBody>
    </Card>
  )
}
