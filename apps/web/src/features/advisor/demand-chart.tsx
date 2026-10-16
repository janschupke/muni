'use client'

import type { CourseDemand, NeedStatus } from '@muni/domain/advisor'
import { BarRow } from '@muni/ui/bar-row'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { Legend } from '@muni/ui/charts/legend'
import { StackedBar } from '@muni/ui/charts/stacked-bar'
import { Meter } from '@muni/ui/meter'
import { useTranslations } from 'next-intl'

import { COMPLIANCE_FILL } from '@/components/status-badges'

const STATUSES: NeedStatus[] = ['EXPIRED', 'MISSING', 'EXPIRING']

/**
 * Per course: who needs it, split by status, and whether the seats on offer cover them.
 * The second bar is demand against free seats; it turns critical when demand exceeds supply.
 */
export function DemandChart({ demand }: { demand: CourseDemand[] }) {
  const t = useTranslations('advisor.demand')
  const ts = useTranslations('status.compliance')
  return (
    <Card>
      <CardHeader title={t('title')} description={t('description')} />
      <CardBody className="flex flex-col gap-4">
        <Legend
          items={STATUSES.map(status => ({
            key: status,
            label: ts(status),
            swatchClassName: COMPLIANCE_FILL[status],
          }))}
        />
        <ul className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {demand.map(d => {
            const needs = d.needs.EXPIRED + d.needs.MISSING + d.needs.EXPIRING
            return (
              <li key={d.courseCode} className="flex flex-col gap-1.5">
                <BarRow
                  label={d.courseName}
                  value={t('people', { count: needs })}
                  bar={
                    <StackedBar
                      label={d.courseName}
                      segments={STATUSES.map(status => ({
                        key: status,
                        label: ts(status),
                        value: d.needs[status],
                        fillClass: COMPLIANCE_FILL[status],
                      }))}
                    />
                  }
                />
                <BarRow
                  layout="inline"
                  bar={
                    <Meter
                      value={needs}
                      max={d.freeSeats}
                      label={t('coverage', { course: d.courseName })}
                    />
                  }
                  value={t('seats', { seats: d.freeSeats, placed: d.placed })}
                />
              </li>
            )
          })}
        </ul>
      </CardBody>
    </Card>
  )
}
