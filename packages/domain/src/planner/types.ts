import type { IsoDate } from '@muni/utils/dates'

import type { PlanItem } from '../advisor'
import type { Capability } from '../enums'
import type { RoomFacts, RoomRef } from '../rooms'
import type { CourseOffering } from './offering'

/** Already lapsed or never held: wanted within this many days. */
export const PLAN_NOW_DAYS = 14
/** How far ahead the planner looks for a free slot. */
export const PLAN_HORIZON_DAYS = 120
export const DEFAULT_START = '09:00'

export interface PlannerCourse {
  /** Internal id: a session is created for the course by it. */
  id: string
  code: string
  name: string
  sessionMinutes: number | null
  seats: number | null
  onlineAllowed: boolean
  capabilities: readonly Capability[]
  /** The start time most of its sessions had (Prague wall clock), if any. */
  usualStart: string | null
  /** Rooms it was held in before. */
  heldIn: readonly string[]
  /** Who offers it, at what price. */
  offerings: readonly CourseOffering[]
}

export interface PlannerSession {
  roomId: string
  startsAt: string
  endsAt: string
}

export interface PlannerInput {
  asOf: IsoDate
  /** The advisor's plan items; only the unplaced ones (no session, no seats) are demand. */
  items: readonly PlanItem[]
  courses: readonly PlannerCourse[]
  rooms: readonly RoomFacts[]
  /** Planned sessions (any course), which occupy their rooms. */
  sessions: readonly PlannerSession[]
}

export interface PlannedPerson {
  externalId: string
  name: string
  department: string | null
  /** First day without the training; null when never held. */
  lapses: IsoDate | null
}

export interface Slot {
  date: IsoDate
  startTime: string
  endTime: string
  startsAt: string
  endsAt: string
}

export type OfferProblem =
  /** No room has all the equipment: what the best-equipped one still lacks. */
  | { kind: 'NO_ROOM_WITH'; missing: Capability[] }
  /** The equipped rooms all seat fewer than the group: the largest of them. */
  | { kind: 'NO_ROOM_LARGE_ENOUGH'; largest: number }
  /** The course is on site and there is no physical room at all. */
  | { kind: 'NO_ONLINE_OR_ROOM' }
  /** Its usual start and length end after midnight. */
  | { kind: 'RUNS_PAST_MIDNIGHT' }
  /** The course has no length set: nothing can be scheduled. */
  | { kind: 'NO_LENGTH' }
  /** No provider offers the course. */
  | { kind: 'NO_PROVIDER' }
  | { kind: 'NO_FREE_SLOT' }

/** The course an offer is for, with what its sessions need. */
export type OfferCourse = Omit<PlannerCourse, 'usualStart' | 'heldIn'>

export interface SessionOffer {
  /** Stable within one plan: course, group and index. */
  id: string
  course: OfferCourse
  /** `now`, or the month the group's trainings lapse in. */
  bucket: string
  /** The last day the session should be held by. */
  deadline: IsoDate
  /** People the session is for. */
  size: number
  /** Seats to open: the group size (or the people) as far as the room allows; null without a room. */
  capacity: number | null
  people: PlannedPerson[]
  slot: Slot | null
  room: RoomRef | null
  /** Other valid rooms free at the same slot. */
  alternatives: RoomRef[]
  /** Who would hold it (`proposedOffering`), at what price; another offering can be chosen. */
  offering: CourseOffering | null
  late: boolean
  problem: OfferProblem | null
}

/** A course's offers, as the planner lists them: one group per course. */
export interface PlannerGroup {
  course: OfferCourse
  offers: SessionOffer[]
}
