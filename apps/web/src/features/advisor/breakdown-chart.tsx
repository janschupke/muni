'use client'

import { type BreakdownRow, type Bucket, REMEDIATIONS } from '@muni/domain/advisor'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { Legend } from '@muni/ui/charts/legend'
import { StackedBar } from '@muni/ui/charts/stacked-bar'
import { cn } from '@muni/ui/cn'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { advisorHref, REMEDIATION_FILL, useBucketName } from './labels'

/**
 * Non-compliant now, then each forecast month, split by remediation. Bars share one scale
 * (the largest bucket is full width), so months compare by length; each row selects its bucket.
 */
export function BreakdownChart({
  breakdown,
  selected,
}: {
  breakdown: BreakdownRow[]
  selected: Bucket
}) {
  const t = useTranslations('advisor.breakdown')
  const tr = useTranslations('advisor.remediation')
  const bucketName = useBucketName()
  const max = Math.max(1, ...breakdown.map(r => r.total))

  return (
    <Card>
      <CardHeader title={t('title')} description={t('description')} />
      <CardBody className="flex flex-col gap-3">
        <Legend
          items={REMEDIATIONS.map(r => ({
            key: r,
            label: tr(r),
            swatchClassName: REMEDIATION_FILL[r],
          }))}
        />
        <ul className="-mx-2 flex flex-col">
          {breakdown.map(row => {
            const active = row.bucket === selected
            const name = bucketName(row.bucket)
            return (
              <li key={row.bucket}>
                {/* A choice in a list, like a tab: its name in the link colour, the chosen one
                    filled; judged as a choice, not as a link in text (data-slot). */}
                <Link
                  href={advisorHref('breakdown', row.bucket)}
                  data-slot="choice"
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'block rounded-md px-2 py-2 transition-colors hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-focus-ring',
                    active && 'bg-state-selected'
                  )}
                >
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span
                      className={cn('min-w-0', active ? 'font-semibold' : 'font-medium text-link')}
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
