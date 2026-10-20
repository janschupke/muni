import type { IsoDate } from '@muni/utils/dates'

import { forecastMonths } from './forecast'
import {
  type AdvisorPlan,
  type BreakdownRow,
  type Bucket,
  NOW,
  type PlanItem,
  type Remediation,
  REMEDIATIONS,
  UPCOMING,
} from './types'

const noCounts = (): Record<Remediation, number> => ({
  PLANNED: 0,
  PLANNED_LATE: 0,
  ACTION_REQUIRED: 0,
})

/** `now`, then each forecast month (empty ones kept), each split by remediation. */
export function breakdownOf(items: readonly PlanItem[], asOf: IsoDate): BreakdownRow[] {
  return [NOW, ...forecastMonths(asOf)].map(bucket => {
    const counts = noCounts()
    for (const item of items) if (item.bucket === bucket) counts[item.remediation] += 1
    return { bucket, counts, total: counts.PLANNED + counts.PLANNED_LATE + counts.ACTION_REQUIRED }
  })
}

/** Every forecast month's trainings in one row (`UPCOMING`): what the "lapsing" count adds up. */
export function upcomingRow(months: readonly BreakdownRow[]): BreakdownRow {
  const counts = noCounts()
  for (const row of months) for (const r of REMEDIATIONS) counts[r] += row.counts[r]
  return { bucket: UPCOMING, counts, total: months.reduce((total, r) => total + r.total, 0) }
}

/**
 * A training no session can take: nothing of the course is ahead, or every session is full.
 * New sessions would place it (the shortfall, the planner); a clash with the person's other
 * bookings would not.
 */
export const needsNewSession = (item: PlanItem): boolean =>
  item.proposal?.kind === 'NONE' && item.proposal.reason !== 'CONFLICT'

/** Per course, the trainings only a new session would place, most first. */
export function shortfallOf(queued: readonly PlanItem[]): AdvisorPlan['shortfall'] {
  const byCourse = new Map<string, { courseCode: string; courseName: string; people: number }>()
  for (const item of queued) {
    if (!needsNewSession(item)) continue
    const { need } = item
    const entry = byCourse.get(need.course.code) ?? {
      courseCode: need.course.code,
      courseName: need.course.name,
      people: 0,
    }
    entry.people += 1
    byCourse.set(need.course.code, entry)
  }
  return [...byCourse.values()].sort(
    (a, b) => b.people - a.people || a.courseCode.localeCompare(b.courseCode)
  )
}

/** The advisor's views: the breakdown by month, what needs action, what is booked, overbooked. */
export type AdvisorTableView = 'breakdown' | 'action' | 'planned' | 'overbooked'

/**
 * The trainings one of the advisor's tables lists, in the plan's order: the breakdown's row
 * (`now`, `upcoming` for the whole forecast, or a month; a row that is not there is `now`),
 * the ones needing action, the booked ones; none for the overbooked sessions. With the row it
 * settled on, and the tabs' counts.
 */
export function tableItems(
  plan: AdvisorPlan,
  view: AdvisorTableView,
  asked: Bucket | undefined
): { bucket: Bucket; items: PlanItem[]; counts: { action: number; planned: number } } {
  const bucket =
    asked === UPCOMING ? UPCOMING : (plan.breakdown.find(r => r.bucket === asked)?.bucket ?? NOW)
  const action = plan.items.filter(i => i.remediation === 'ACTION_REQUIRED')
  const planned = plan.items.filter(i => i.remediation !== 'ACTION_REQUIRED')
  const inRow = (i: PlanItem) => (bucket === UPCOMING ? i.bucket !== NOW : i.bucket === bucket)
  const byView: Record<AdvisorTableView, () => PlanItem[]> = {
    action: () => action,
    planned: () => planned,
    breakdown: () => plan.items.filter(inRow),
    overbooked: () => [],
  }
  return {
    bucket,
    items: byView[view](),
    counts: { action: action.length, planned: planned.length },
  }
}
