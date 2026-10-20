import type { IsoDate } from '@muni/utils/dates'

import type { RoomRef } from '../rooms'
import { seatsLeft } from '../sessions'

/** Months covered by the forecast, the current one included. */
export const FORECAST_MONTHS = 6

export type NeedStatus = 'EXPIRED' | 'MISSING' | 'EXPIRING' | 'VALID'

export interface AdvisorNeed {
  employee: {
    externalId: string
    name: string
    department: string | null
    departmentId: string | null
    positionId: string | null
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
  /** Seats the room has; null for an online room (no limit). */
  roomCapacity: number | null
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
  /** The moment the plan is made (ISO): a session that has started takes no new bookings. */
  now: string
  /** Non-compliant now, or lapsing before `forecastEnd(asOf)`. */
  needs: AdvisorNeed[]
  /**
   * Sessions not yet over (any status; cancelled ones are ignored). One under way still counts
   * as its people's booking; only those still to start are proposed or take moved seats.
   */
  sessions: AdvisorSession[]
}

/** `now`, or the month (`2026-11`) in which the training lapses. */
export type Bucket = string
export const NOW: Bucket = 'now'
/** The breakdown's row for everything that lapses in the forecast, all months together. */
export const UPCOMING: Bucket = 'upcoming'

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

/** A session a person could take, with the gap it would leave. */
export interface SessionChoice {
  session: AdvisorSession
  window: NonComplianceWindow | null
}

/** How many alternatives a proposal offers besides its own session. */
export const MAX_ALTERNATIVES = 5

/** Seats a session has free now: its capacity less every booking, named or not. */
export function seatsFree(session: AdvisorSession): number {
  return seatsLeft({ ...session, named: session.assigned.length })
}

export type Proposal =
  | {
      kind: 'SESSION'
      /** Position in the queue, from 1. */
      rank: number
      session: AdvisorSession
      /** The window this session would leave; null when it ends before the training lapses. */
      window: NonComplianceWindow | null
      /**
       * Other sessions with a seat and no clash, for the admin to pick instead: those that end
       * before the training lapses first, then by start; at most `MAX_ALTERNATIVES`.
       */
      alternatives: SessionChoice[]
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

type SessionProposal = Extract<Proposal, { kind: 'SESSION' }>
/** A training the advisor has a session for. */
export type ProposedItem = PlanItem & { proposal: SessionProposal }

export const isProposed = (item: PlanItem): item is ProposedItem =>
  item.proposal?.kind === 'SESSION'

/** The sessions a proposed training can take: the advisor's pick, then the alternatives. */
export const choicesOf = (item: ProposedItem): SessionChoice[] => [
  { session: item.proposal.session, window: item.proposal.window },
  ...item.proposal.alternatives,
]

export interface SeatMove {
  to: AdvisorSession
  count: number
}
export interface OverbookedSession {
  session: AdvisorSession
  booked: number
  excess: number
  /** The suggestion: anonymous seats moved to the earliest sessions with room. */
  moves: SeatMove[]
  /** Seats still over capacity after the moves (no room elsewhere, or only named bookings). */
  remaining: number
  /** Every upcoming session of the course with free seats, by start: where seats could go. */
  targets: { session: AdvisorSession; free: number }[]
  /** The capacity that fits every booking, when the room has the seats; null when it has not. */
  raiseTo: number | null
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
