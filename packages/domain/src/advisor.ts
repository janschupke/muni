import { addDays, addMonths, diffInDays, toZonedParts, type IsoDate } from '@muni/utils/dates'

import type { RoomRef } from './rooms'

/*
 * The advisor: what is non-compliant now, what becomes non-compliant month by month, what is
 * already being remedied (a named booking), and who should go to which session for the rest.
 *
 * One fixed rule, no weights: the most overdue training is served first and takes the earliest
 * session that can take it (or, for one that has not lapsed yet, the last session that still
 * ends in time). Same input, same plan: input order never matters.
 */

/** Months covered by the forecast, the current one included. */
export const FORECAST_MONTHS = 6

/** Last day the forecast covers: the end of the sixth month, counting the current one. */
export function forecastEnd(asOf: IsoDate): IsoDate {
  const firstOfLast = `${addMonths(asOf, FORECAST_MONTHS - 1).slice(0, 7)}-01`
  return addDays(addMonths(firstOfLast, 1), -1)
}

export type NeedStatus = 'EXPIRED' | 'MISSING' | 'EXPIRING' | 'VALID'

export interface AdvisorNeed {
  employee: {
    externalId: string
    name: string
    department: string | null
    status: 'ACTIVE' | 'PARENTAL_LEAVE'
  }
  course: { code: string; name: string }
  /** EXPIRED and MISSING are non-compliant now; EXPIRING and VALID lapse within the forecast. */
  status: NeedStatus
  /** Last valid day of the current training; null when it was never completed. */
  validUntil: IsoDate | null
}

export interface AdvisorSession {
  externalId: string
  courseCode: string
  courseName: string
  room: RoomRef
  startsAt: string
  endsAt: string
  capacity: number
  unnamedBookings: number
  /** Employee external IDs already booked by name. */
  assigned: string[]
  pricePerPerson: number | null
  status: 'PLANNED' | 'CANCELLED'
}

export interface AdvisorInput {
  asOf: IsoDate
  /** Non-compliant now, or lapsing before `forecastEnd(asOf)`. */
  needs: AdvisorNeed[]
  /** Upcoming sessions (any status; cancelled ones are ignored). */
  sessions: AdvisorSession[]
}

/** `now`, or the month (`2026-11`) in which the training lapses. */
export type Bucket = string
export const NOW: Bucket = 'now'

export type Remediation = 'PLANNED' | 'PLANNED_LATE' | 'ACTION_REQUIRED'
export const REMEDIATIONS: Remediation[] = ['PLANNED', 'PLANNED_LATE', 'ACTION_REQUIRED']

/**
 * When the person is without the training. `from` is null when they never held it; `until` is
 * the day the remedying session ends, null while nothing is booked (the window is open).
 * `days` is set only when both ends are known.
 */
export interface NonComplianceWindow {
  from: IsoDate | null
  until: IsoDate | null
  days: number | null
}

export type UnplacedReason = 'NO_SESSION' | 'NO_SEATS' | 'CONFLICT'

export type Proposal =
  | {
      kind: 'SESSION'
      /** Position in the queue, from 1. */
      rank: number
      session: AdvisorSession
      /** The window this session would leave; null when it ends before the training lapses. */
      window: NonComplianceWindow | null
    }
  | { kind: 'NONE'; rank: number; reason: UnplacedReason }

export interface PlanItem {
  need: AdvisorNeed
  bucket: Bucket
  /** First day without the training; null when it was never held. */
  lapses: IsoDate | null
  /** The person's named booking on an upcoming session of the course (the earliest). */
  booked: AdvisorSession | null
  remediation: Remediation
  /** Null when the booking ends before the training lapses: no window at all. */
  window: NonComplianceWindow | null
  /** For ACTION_REQUIRED only: the session the advisor proposes, or why there is none. */
  proposal: Proposal | null
}

export interface SeatMove {
  to: AdvisorSession
  count: number
}
export interface OverbookedSession {
  session: AdvisorSession
  booked: number
  excess: number
  moves: SeatMove[]
  /** Seats still over capacity after the moves (no room elsewhere, or only named bookings). */
  remaining: number
}

export interface BreakdownRow {
  bucket: Bucket
  counts: Record<Remediation, number>
  total: number
}

export interface AdvisorPlan {
  /** Every training in scope: the queue first (in order), then the remedied ones. */
  items: PlanItem[]
  /** `now`, then each forecast month; months with nothing lapsing are kept. */
  breakdown: BreakdownRow[]
  overbooked: OverbookedSession[]
  /** Per course: trainings with no session to propose (drives "schedule another session"). */
  shortfall: { courseCode: string; courseName: string; people: number }[]
  totals: {
    now: number
    upcoming: number
    planned: number
    actionRequired: number
    proposed: number
  }
  /** Price of every proposed booking. */
  cost: number
}

const collator = new Intl.Collator('cs', { sensitivity: 'base', numeric: true })

const startDay = (s: AdvisorSession) => toZonedParts(s.startsAt).date
const endDay = (s: AdvisorSession) => toZonedParts(s.endsAt).date
const overlaps = (a: AdvisorSession, b: AdvisorSession) =>
  Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt)
const byStart = (a: AdvisorSession, b: AdvisorSession) =>
  Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.externalId.localeCompare(b.externalId)

const isNonCompliant = (need: AdvisorNeed) => need.status === 'EXPIRED' || need.status === 'MISSING'
const lapsesOn = (need: AdvisorNeed) =>
  need.validUntil === null ? null : addDays(need.validUntil, 1)

/** The window a session leaves for a need; null when it ends before the training lapses. */
function windowFor(need: AdvisorNeed, session: AdvisorSession | null): NonComplianceWindow | null {
  const from = lapsesOn(need)
  if (session === null) return { from, until: null, days: null }
  const until = endDay(session)
  if (from !== null && until < from) return null
  return { from, until, days: from === null ? null : diffInDays(from, until) }
}

/** Queue order: expired (earliest expiry first), never completed, then by lapse date. */
function compareQueue(a: AdvisorNeed, b: AdvisorNeed): number {
  const group = (n: AdvisorNeed) => (n.status === 'EXPIRED' ? 0 : n.status === 'MISSING' ? 1 : 2)
  return (
    group(a) - group(b) ||
    (a.validUntil ?? '').localeCompare(b.validUntil ?? '') ||
    collator.compare(a.employee.name, b.employee.name) ||
    a.employee.externalId.localeCompare(b.employee.externalId) ||
    a.course.code.localeCompare(b.course.code)
  )
}

export function planAssignments(input: AdvisorInput): AdvisorPlan {
  const { asOf } = input
  const end = forecastEnd(asOf)
  // Each upcoming session with its seats taken, updated as moves and proposals fill it.
  const upcoming = input.sessions
    .filter(s => s.status === 'PLANNED' && startDay(s) >= asOf)
    .toSorted(byStart)
    .map(session => ({ session, taken: session.unnamedBookings + session.assigned.length }))

  // 1. Overbooking first: moving anonymous seats out takes room the plan must not reuse.
  const overbooked: OverbookedSession[] = []
  for (const source of upcoming) {
    const before = source.taken
    const excess = before - source.session.capacity
    if (excess <= 0) continue
    let movable = Math.min(excess, source.session.unnamedBookings)
    const moves: SeatMove[] = []
    for (const target of upcoming) {
      if (movable === 0) break
      if (target === source || target.session.courseCode !== source.session.courseCode) continue
      const room = target.session.capacity - target.taken
      if (room <= 0) continue
      const count = Math.min(room, movable)
      moves.push({ to: target.session, count })
      target.taken += count
      source.taken -= count
      movable -= count
    }
    const moved = moves.reduce((n, m) => n + m.count, 0)
    overbooked.push({
      session: source.session,
      booked: before,
      excess,
      moves,
      remaining: excess - moved,
    })
  }

  // 2. What is in scope, and what is already remedied by a named booking.
  const remedied: PlanItem[] = []
  const queue: AdvisorNeed[] = []
  for (const need of input.needs) {
    if (need.employee.status === 'PARENTAL_LEAVE') continue
    const lapses = lapsesOn(need)
    if (!isNonCompliant(need) && (lapses === null || lapses > end)) continue
    const booking = upcoming.find(
      ({ session: s }) =>
        s.courseCode === need.course.code && s.assigned.includes(need.employee.externalId)
    )?.session
    if (!booking) {
      queue.push(need)
      continue
    }
    const window = windowFor(need, booking)
    remedied.push({
      need,
      bucket: bucketOf(need),
      lapses,
      booked: booking,
      remediation: window === null ? 'PLANNED' : 'PLANNED_LATE',
      window,
      proposal: null,
    })
  }

  // 3. The queue, most overdue first; each takes a session or says why it cannot.
  const busy = new Map<string, AdvisorSession[]>()
  for (const { session } of upcoming)
    for (const id of session.assigned) busy.set(id, [...(busy.get(id) ?? []), session])

  const queued: PlanItem[] = queue.toSorted(compareQueue).map((need, index) => {
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

    const ofCourse = upcoming.filter(({ session }) => session.courseCode === need.course.code)
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
    return item({
      kind: 'SESSION',
      rank,
      session: slot.session,
      window: windowFor(need, slot.session),
    })
  })

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
    cost: queued.reduce(
      (n, i) => n + (i.proposal?.kind === 'SESSION' ? (i.proposal.session.pricePerPerson ?? 0) : 0),
      0
    ),
  }
}

function bucketOf(need: AdvisorNeed): Bucket {
  const lapses = lapsesOn(need)
  return isNonCompliant(need) || lapses === null ? NOW : lapses.slice(0, 7)
}

/** The forecast's months, `2026-10` … `2027-03`. */
export function forecastMonths(asOf: IsoDate): Bucket[] {
  return Array.from({ length: FORECAST_MONTHS }, (_, i) =>
    addMonths(`${asOf.slice(0, 7)}-01`, i).slice(0, 7)
  )
}

function breakdownOf(items: PlanItem[], asOf: IsoDate): BreakdownRow[] {
  return [NOW, ...forecastMonths(asOf)].map(bucket => {
    const counts: Record<Remediation, number> = { PLANNED: 0, PLANNED_LATE: 0, ACTION_REQUIRED: 0 }
    for (const item of items) if (item.bucket === bucket) counts[item.remediation] += 1
    return { bucket, counts, total: counts.PLANNED + counts.PLANNED_LATE + counts.ACTION_REQUIRED }
  })
}

/**
 * A training no session can take: nothing of the course is ahead, or every session is full.
 * New sessions would place it (the shortfall, the planner); a clash with the person's other
 * bookings would not.
 */
export const needsNewSession = (item: PlanItem): boolean =>
  item.proposal?.kind === 'NONE' && item.proposal.reason !== 'CONFLICT'

function shortfallOf(queued: PlanItem[]): AdvisorPlan['shortfall'] {
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
