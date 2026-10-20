import { intervalsOverlap, type IsoDate } from '@muni/utils/dates'

import { breakdownOf, shortfallOf } from './breakdown'
import {
  bucketOf,
  endDay,
  forecastEnd,
  inForecast,
  isNonCompliant,
  lapsesOn,
  windowFor,
} from './forecast'
import { resolveOverbooking, type Slot } from './overbooking'
import { compareQueue } from './queue'
import {
  type AdvisorInput,
  type AdvisorNeed,
  type AdvisorPlan,
  type AdvisorSession,
  MAX_ALTERNATIVES,
  NOW,
  type PlanItem,
  type Proposal,
} from './types'

const span = (s: AdvisorSession) => ({ start: Date.parse(s.startsAt), end: Date.parse(s.endsAt) })
const overlaps = (a: AdvisorSession, b: AdvisorSession) => intervalsOverlap(span(a), span(b))
const byStart = (a: AdvisorSession, b: AdvisorSession) =>
  Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.externalId.localeCompare(b.externalId)

/**
 * What is in scope (at work, non-compliant now or lapsing by `end`), split into what a named
 * booking on a planned session already remedies (in time, or with a gap) and the queue.
 */
function splitRemedied(
  needs: readonly AdvisorNeed[],
  planned: readonly AdvisorSession[],
  end: IsoDate
): { remedied: PlanItem[]; queue: AdvisorNeed[] } {
  const remedied: PlanItem[] = []
  const queue: AdvisorNeed[] = []
  for (const need of needs) {
    if (need.employee.status === 'PARENTAL_LEAVE' || !inForecast(need, end)) continue
    const booking = planned.find(
      s => s.courseCode === need.course.code && s.assigned.includes(need.employee.externalId)
    )
    if (!booking) {
      queue.push(need)
      continue
    }
    const window = windowFor(need, booking)
    remedied.push({
      need,
      bucket: bucketOf(need),
      lapses: lapsesOn(need),
      booked: booking,
      remediation: window === null ? 'PLANNED' : 'PLANNED_LATE',
      window,
      proposal: null,
    })
  }
  return { remedied, queue }
}

/**
 * The queue, most urgent first; each takes a session with a free seat that does not clash
 * with the person's other bookings (a lapsed training the earliest; one not lapsed yet the last
 * that still ends in time, or the earliest if none does), or says why it cannot. Taking a seat
 * fills its slot and the person's diary for the trainings after it.
 */
function placeQueue(
  queue: readonly AdvisorNeed[],
  slots: Slot[],
  planned: readonly AdvisorSession[]
): PlanItem[] {
  const busy = new Map<string, AdvisorSession[]>()
  for (const session of planned)
    for (const id of session.assigned) busy.set(id, [...(busy.get(id) ?? []), session])

  return queue.toSorted(compareQueue).map((need, index) => {
    const rank = index + 1
    const person = need.employee.externalId
    const item = (proposal: Proposal): PlanItem => ({
      need,
      bucket: bucketOf(need),
      lapses: lapsesOn(need),
      booked: null,
      remediation: 'ACTION_REQUIRED',
      window: windowFor(need, null),
      proposal,
    })

    const ofCourse = slots.filter(({ session }) => session.courseCode === need.course.code)
    if (ofCourse.length === 0) return item({ kind: 'NONE', rank, reason: 'NO_SESSION' })
    const withSeats = ofCourse.filter(slot => slot.taken < slot.session.capacity)
    if (withSeats.length === 0) return item({ kind: 'NONE', rank, reason: 'NO_SEATS' })
    const free = withSeats.filter(
      ({ session }) => !(busy.get(person) ?? []).some(b => overlaps(b, session))
    )
    const [earliest] = free
    if (earliest === undefined) return item({ kind: 'NONE', rank, reason: 'CONFLICT' })

    // Lapsed: as soon as possible. Not yet: the last session that still ends in time.
    const lastDay = need.validUntil
    const inTime =
      isNonCompliant(need) || lastDay === null
        ? []
        : free.filter(({ session }) => endDay(session) <= lastDay)
    const slot = inTime.at(-1) ?? earliest
    slot.taken += 1
    busy.set(person, [...(busy.get(person) ?? []), slot.session])
    const others = free.filter(other => other !== slot)
    const alternatives = [
      ...others.filter(other => inTime.includes(other)),
      ...others.filter(other => !inTime.includes(other)),
    ]
      .slice(0, MAX_ALTERNATIVES)
      .map(({ session }) => ({ session, window: windowFor(need, session) }))
    return item({
      kind: 'SESSION',
      rank,
      session: slot.session,
      window: windowFor(need, slot.session),
      alternatives,
    })
  })
}

const priceOf = (item: PlanItem) =>
  item.proposal?.kind === 'SESSION' ? (item.proposal.session.pricePerPerson ?? 0) : 0

/**
 * The advisor's plan: overbooked sessions resolved first (moving their anonymous seats takes
 * room the plan must not reuse), then what is in scope split into the remedied and the queue,
 * and the queue placed. Same input, same plan.
 */
export function planAssignments(input: AdvisorInput): AdvisorPlan {
  const { asOf } = input
  const now = new Date(input.now)
  // Planned sessions not yet over: each one's people count as booked on it.
  const planned = input.sessions.filter(s => s.status === 'PLANNED').toSorted(byStart)
  // Each session still to start with its seats taken, filled as moves and proposals take them.
  const slots: Slot[] = planned
    .filter(s => new Date(s.startsAt) > now)
    .map(session => ({ session, taken: session.unnamedBookings + session.assigned.length }))

  const overbooked = resolveOverbooking(slots)
  const { remedied, queue } = splitRemedied(input.needs, planned, forecastEnd(asOf))
  const queued = placeQueue(queue, slots, planned)

  const items = [...queued, ...remedied.toSorted((a, b) => compareQueue(a.need, b.need))]
  return {
    items,
    breakdown: breakdownOf(items, asOf),
    overbooked,
    shortfall: shortfallOf(queued),
    totals: {
      now: items.filter(i => i.bucket === NOW).length,
      upcoming: items.filter(i => i.bucket !== NOW).length,
      planned: remedied.length,
      actionRequired: queued.length,
      proposed: queued.filter(i => i.proposal?.kind === 'SESSION').length,
    },
    cost: queued.reduce((n, i) => n + priceOf(i), 0),
  }
}
