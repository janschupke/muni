import {
  addDays,
  addMonths,
  diffInDays,
  type IsoDate,
  monthOf,
  startOfMonth,
  toZonedParts,
} from '@muni/utils/dates'

import {
  type AdvisorNeed,
  type AdvisorSession,
  type Bucket,
  FORECAST_MONTHS,
  type NonComplianceWindow,
  NOW,
} from './types'

/** Last day the forecast covers: the end of the sixth month, counting the current one. */
export function forecastEnd(asOf: IsoDate): IsoDate {
  const firstOfLast = startOfMonth(addMonths(asOf, FORECAST_MONTHS - 1))
  return addDays(addMonths(firstOfLast, 1), -1)
}

/** The forecast's months, `2026-10` … `2027-03`. */
export function forecastMonths(asOf: IsoDate): Bucket[] {
  return Array.from({ length: FORECAST_MONTHS }, (_, i) =>
    monthOf(addMonths(startOfMonth(asOf), i))
  )
}

export const isNonCompliant = (need: Pick<AdvisorNeed, 'status'>) =>
  need.status === 'EXPIRED' || need.status === 'MISSING'

/** First day without the training (the day after its last valid one); null if never held. */
export const lapsesOn = (need: Pick<AdvisorNeed, 'validUntil'>) =>
  need.validUntil === null ? null : addDays(need.validUntil, 1)

/**
 * Whether a training is the advisor's business: non-compliant now, or lapsing (the day after
 * its last valid day) by `end`. The repository reads what it plans with this, and the plan
 * scopes with it.
 */
export function inForecast(
  need: Pick<AdvisorNeed, 'status' | 'validUntil'>,
  end: IsoDate
): boolean {
  if (isNonCompliant(need)) return true
  const lapses = lapsesOn(need)
  return lapses !== null && lapses <= end
}

/** `now` for what is non-compliant already, else the month the training lapses in. */
export function bucketOf(need: AdvisorNeed): Bucket {
  const lapses = lapsesOn(need)
  return isNonCompliant(need) || lapses === null ? NOW : monthOf(lapses)
}

/** The day a session ends, in Prague. */
export const endDay = (s: AdvisorSession) => toZonedParts(s.endsAt).date

/** The window a session leaves for a need; null when it ends before the training lapses. */
export function windowFor(
  need: AdvisorNeed,
  session: AdvisorSession | null
): NonComplianceWindow | null {
  const from = lapsesOn(need)
  if (session === null) return { from, until: null, days: null }
  const until = endDay(session)
  if (from !== null && until < from) return null
  return { from, until, days: from === null ? null : diffInDays(from, until) }
}
