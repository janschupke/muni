import {
  type Bucket,
  forecastEnd,
  type NonComplianceWindow,
  NOW,
  type Remediation,
  UPCOMING,
} from '@muni/domain/advisor'
import { Badge, type BadgeTone } from '@muni/ui/badge'
import { CellStack } from '@muni/ui/table'
import { addDays, addMonths, diffInDays } from '@muni/utils/dates'
import { formatDate, formatDateRange, formatMonth, formatRelativeDays } from '@muni/utils/format'
import {
  ArrowRightLeft,
  CalendarCheck,
  CalendarClock,
  ChartColumn,
  CircleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import type { ADVISOR_VIEWS } from '@/lib/list/list-keys'
import { withParams } from '@/lib/list/search-params'

export type AdvisorView = (typeof ADVISOR_VIEWS)[number]

export const VIEW_ICON: Record<AdvisorView, LucideIcon> = {
  breakdown: ChartColumn,
  action: CircleAlert,
  planned: CalendarCheck,
  overbooked: ArrowRightLeft,
}

/**
 * `/advisor` with a view and (breakdown only) a bucket; defaults are left out of the URL. A
 * new view or bucket starts from the first page, in the table's own order.
 */
export function advisorHref(view: AdvisorView, bucket?: Bucket): string {
  return withParams(
    '/advisor',
    {},
    {
      view: view === 'breakdown' ? undefined : view,
      bucket: view === 'breakdown' && bucket !== NOW ? bucket : undefined,
    }
  )
}

// Status colours always come with an icon and a label, never colour alone.
const REMEDIATION: Record<Remediation, { tone: BadgeTone; Icon: LucideIcon }> = {
  PLANNED: { tone: 'success', Icon: CalendarCheck },
  PLANNED_LATE: { tone: 'warning', Icon: CalendarClock },
  ACTION_REQUIRED: { tone: 'danger', Icon: CircleAlert },
}

export const REMEDIATION_FILL: Record<Remediation, string> = {
  PLANNED: 'bg-status-valid',
  PLANNED_LATE: 'bg-status-expiring inset-ring inset-ring-warning-edge',
  ACTION_REQUIRED: 'bg-status-missing',
}

export function RemediationBadge({ remediation }: { remediation: Remediation }) {
  const t = useTranslations('advisor.remediation')
  const { tone, Icon } = REMEDIATION[remediation]
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {t(remediation)}
    </Badge>
  )
}

/**
 * A bucket's name: now, the whole forecast ("Lapsing by March 31, 2027"), or a month. The
 * current month holds only what lapses after today, so it is named by those days.
 */
export function useBucketName(asOf: string): (bucket: Bucket) => string {
  const t = useTranslations('advisor.breakdown')
  const locale = useLocale()
  return bucket => {
    if (bucket === NOW) return t('now')
    if (bucket === UPCOMING) return t('upcoming', { date: formatDate(forecastEnd(asOf)) })
    const tomorrow = addDays(asOf, 1)
    if (tomorrow.startsWith(bucket) && !tomorrow.endsWith('-01')) {
      const last = addDays(addMonths(`${bucket}-01`, 1), -1)
      return formatDateRange(tomorrow, last)
    }
    return formatMonth(bucket, locale)
  }
}

/** The first day without the training, and how far that is from today. */
export function LapsesText({ lapses, asOf }: { lapses: string | null; asOf: string }) {
  const t = useTranslations('advisor.lapses')
  const locale = useLocale()
  if (lapses === null) return <span>{t('never')}</span>
  return (
    <CellStack
      title={formatDate(lapses)}
      meta={formatRelativeDays(diffInDays(asOf, lapses), locale)}
    />
  )
}

/** When the person is without the training: none, from a day on (nothing booked), or a range. */
export function WindowText({ window }: { window: NonComplianceWindow | null }) {
  const t = useTranslations('advisor.window')
  if (window === null) return <span className="text-fg-muted">{t('none')}</span>
  const { from, until, days } = window
  if (until === null) {
    return (
      <CellStack
        title={from === null ? t('never') : t('open', { from: formatDate(from) })}
        meta={t('nothingBooked')}
      />
    )
  }
  if (from === null) return <span>{t('neverUntil', { until: formatDate(until) })}</span>
  return (
    <CellStack
      title={formatDateRange(from, until)}
      meta={days === null ? undefined : t('days', { count: days })}
    />
  )
}
