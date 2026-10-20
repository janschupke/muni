import type { SessionOpening } from '../sessions'
import {
  type AdvisorPlan,
  type AdvisorSession,
  type NeedStatus,
  type PlanItem,
  seatsFree,
} from './types'

/** Why a training that needs booking cannot be booked from where it is shown. */
export const BOOKING_BLOCKS = ['ON_LEAVE', 'NO_SESSION', 'NO_SEATS'] as const
export type BookingBlock = (typeof BOOKING_BLOCKS)[number]

/** What a screen offers for a required training: book it, or say why it cannot. */
export type BookingState = { kind: 'BOOK' } | { kind: 'BLOCKED'; reason: BookingBlock }

/**
 * What a requirement a screen shows comes to, booking-wise. Null: nothing to do, because it is
 * held (valid), already booked, or the person has left. Otherwise, for a training not held
 * (missing, expired) or expiring soon: `BOOK` when the person is at work and a session of the
 * course still to start has a seat (`opening`), else `BLOCKED` with the reason. Each `BOOK` is
 * a training the advisor's plan needs action on (`itemsToBook` finds it); the plan may still
 * find no seat for it, having handed the last ones to more urgent people, and the dialog says so.
 */
export function bookingState(
  requirement: { status: NeedStatus; booked: unknown; opening: SessionOpening },
  employment: 'ACTIVE' | 'PARENTAL_LEAVE' | 'LEFT'
): BookingState | null {
  if (requirement.status === 'VALID' || requirement.booked !== null || employment === 'LEFT')
    return null
  if (employment === 'PARENTAL_LEAVE') return { kind: 'BLOCKED', reason: 'ON_LEAVE' }
  if (requirement.opening === 'NONE') return { kind: 'BLOCKED', reason: 'NO_SESSION' }
  if (requirement.opening === 'FULL') return { kind: 'BLOCKED', reason: 'NO_SEATS' }
  return { kind: 'BOOK' }
}

/** How many of the requirements are ones to book now (`bookingState` is `BOOK`). */
export function countBookable(
  requirements: Iterable<Parameters<typeof bookingState>[0]>,
  employment: Parameters<typeof bookingState>[1]
): number {
  let count = 0
  for (const r of requirements) if (bookingState(r, employment)?.kind === 'BOOK') count += 1
  return count
}

/** Why none of a person's needed trainings can be booked: one reason, or several. */
export const PERSON_BOOKING_BLOCKS = [...BOOKING_BLOCKS, 'MIXED'] as const
export type PersonBookingBlock = (typeof PERSON_BOOKING_BLOCKS)[number]

/**
 * What a person's row offers: book the trainings that can be (`count` of them), or, when some
 * need booking but none can be, why. Null when none needs it.
 */
export function personBookingState(
  requirements: readonly Parameters<typeof bookingState>[0][],
  employment: Parameters<typeof bookingState>[1]
): { kind: 'BOOK'; count: number } | { kind: 'BLOCKED'; reason: PersonBookingBlock } | null {
  const count = countBookable(requirements, employment)
  if (count > 0) return { kind: 'BOOK', count }
  const states = requirements.flatMap(r => {
    const state = bookingState(r, employment)
    return state ? [state] : []
  })
  const reasons = new Set(states.flatMap(s => (s.kind === 'BLOCKED' ? [s.reason] : [])))
  const [only] = reasons
  if (only === undefined) return null
  return { kind: 'BLOCKED', reason: reasons.size === 1 ? only : 'MIXED' }
}

/** Whose trainings to book: a person, a course, a department, a position, or a mix. */
export interface BookingQuery {
  employee?: string | undefined
  course?: string | undefined
  department?: string | undefined
  position?: string | undefined
}

/**
 * The trainings `bookingState` offers to book, as the plan has them (with the proposed session and
 * the alternatives, or why there is none), matching the query: the ones a "Book…" opens.
 */
export function itemsToBook(plan: AdvisorPlan, query: BookingQuery): PlanItem[] {
  const { employee, course, department, position } = query
  return plan.items.filter(
    ({ need, remediation }) =>
      remediation === 'ACTION_REQUIRED' &&
      need.status !== 'VALID' &&
      (employee === undefined || need.employee.externalId === employee) &&
      (course === undefined || need.course.code === course) &&
      (department === undefined || need.employee.departmentId === department) &&
      (position === undefined || need.employee.positionId === position)
  )
}

/**
 * What a set of chosen bookings comes to: their cost, and each session that would get more
 * people than it has free seats (with how many it would get). The Book… dialog stops its
 * confirm while any session is over.
 */
export function summarizeBookings(sessions: readonly AdvisorSession[]): {
  cost: number
  over: { session: AdvisorSession; count: number }[]
} {
  const bySession = new Map<string, { session: AdvisorSession; count: number }>()
  for (const session of sessions) {
    const entry = bySession.get(session.externalId) ?? { session, count: 0 }
    bySession.set(session.externalId, { session, count: entry.count + 1 })
  }
  return {
    cost: sessions.reduce((sum, s) => sum + (s.pricePerPerson ?? 0), 0),
    over: [...bySession.values()].filter(({ session, count }) => count > seatsFree(session)),
  }
}
