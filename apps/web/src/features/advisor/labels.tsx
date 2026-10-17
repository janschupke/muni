import {
  type Bucket,
  forecastEnd,
  type NonComplianceWindow,
  NOW,
  type Remediation,
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

import { withParams } from '@/lib/search-params'

export const ADVISOR_VIEWS = ['breakdown', 'action', 'planned', 'overbooked'] as const
export type AdvisorView = (typeof ADVISOR_VIEWS)[number]

export const VIEW_ICON: Record<AdvisorView, LucideIcon> = {
  breakdown: ChartColumn,
  action: CircleAlert,
  planned: CalendarCheck,
  overbooked: ArrowRightLeft,
}

/** The breakdown's row for everything that lapses in the forecast, all months together. */
export const UPCOMING: Bucket = 'upcoming'

/**
 * `/advisor` with a view, (breakdown only) a bucket, and a page; defaults are left out of
 * the URL. A new view or bucket starts from the first page.
 */
export function advisorHref(view: AdvisorView, bucket?: Bucket, page = 1): string {
  return withParams(
    '/advisor',
    {},
    {
      view: view === 'breakdown' ? undefined : view,
      bucket: view === 'breakdown' && bucket !== NOW ? bucket : undefined,
      page: page > 1 ? page : undefined,
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
  PLANNED_LATE: 'bg-status-expiring',
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
    if (bucket === UPCOMING) return t('upcoming', { date: formatDate(forecastEnd(asOf), locale) })
    const tomorrow = addDays(asOf, 1)
    if (tomorrow.startsWith(bucket) && !tomorrow.endsWith('-01')) {
      const last = addDays(addMonths(`${bucket}-01`, 1), -1)
      return formatDateRange(tomorrow, last, locale)
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
      title={formatDate(lapses, locale)}
      meta={formatRelativeDays(diffInDays(asOf, lapses), locale)}
    />
  )
}

/** When the person is without the training: none, open-ended, or a closed range in days. */
export function WindowText({ window }: { window: NonComplianceWindow | null }) {
  const t = useTranslations('advisor.window')
  const locale = useLocale()
  const date = (value: string) => formatDate(value, locale)
  if (window === null) return <span className="text-fg-muted">{t('none')}</span>
  const { from, until, days } = window
  if (until === null) {
    return (
      <CellStack
        title={from === null ? t('never') : t('open', { from: date(from) })}
        meta={t('nothingBooked')}
      />
    )
  }
  if (from === null) return <span>{t('neverUntil', { until: date(until) })}</span>
  return (
    <CellStack
      title={t('range', { from: date(from), until: date(until) })}
      meta={days === null ? undefined : t('days', { count: days })}
    />
  )
}
