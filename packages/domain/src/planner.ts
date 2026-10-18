import {
  addDays,
  type IsoDate,
  isWorkingDay,
  toZonedParts,
  zonedTimeToUtc,
} from '@muni/utils/dates'

import { needsNewSession, NOW, type PlanItem } from './advisor'
import type { Capability } from './enums'
import { type RoomFacts, roomMismatch, type RoomRef } from './rooms'

/*
 * The session planner: for trainings the advisor could not place (no session of the course
 * ahead, or every one full), it proposes new sessions, each with a slot and a room.
 *
 * One fixed rule:
 * - Demand is grouped by course and by when it is due: everything already lapsed together
 *   (due within PLAN_NOW_DAYS), then one group per month in which trainings lapse (due the
 *   day before the first of them lapses).
 * - A group needs ceil(people / group size) sessions; people go into them earliest lapse first.
 *   A course without a group size fills the largest room that suits it (online: everyone).
 * - Each session takes the first working day (Czech holidays are not) from tomorrow on which
 *   a valid room is free at the course's usual start time, for the course's usual length.
 *   Valid: online if the course allows it; otherwise a physical room with every capability
 *   the course needs and enough seats. Rooms the course was held in before come first, then
 *   the smallest that fits. Sessions already planned and offers made earlier both block a
 *   physical room; an online room is never taken.
 * - A slot past the due date is offered anyway, marked late; with no valid room, a session
 *   that would run past midnight, or no free slot within PLAN_HORIZON_DAYS, the offer says
 *   why.
 */

/** Already lapsed or never held: wanted within this many days. */
export const PLAN_NOW_DAYS = 14
/** How far ahead the planner looks for a free slot. */
export const PLAN_HORIZON_DAYS = 120
export const DEFAULT_START = '09:00'

/** A provider that offers a course, at its price per person. */
export interface CourseOffering {
  providerId: string
  providerName: string
  price: number
  /** The provider imported sessions without one fall to. */
  isDefault: boolean
}

/**
 * Who a new session of the course goes to unless chosen otherwise: the default provider if it
 * offers the course, else the cheapest offering (ties by name); null when nobody offers it.
 */
export function proposedOffering(offerings: readonly CourseOffering[]): CourseOffering | null {
  return (
    offerings.find(o => o.isDefault) ??
    offerings.toSorted(
      (a, b) => a.price - b.price || a.providerName.localeCompare(b.providerName, 'cs')
    )[0] ??
    null
  )
}

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

const overlaps = (
  a: { startsAt: string; endsAt: string },
  b: { startsAt: string; endsAt: string }
) => a.startsAt < b.endsAt && b.startsAt < a.endsAt

/** The slot on `date`, or null when it would run past midnight. */
function slotOn(date: IsoDate, start: string, minutes: number): Slot | null {
  const startsAt = zonedTimeToUtc(date, start)
  const endsAt = new Date(startsAt.getTime() + minutes * 60_000)
  const end = toZonedParts(endsAt)
  if (end.date !== date) return null
  return {
    date,
    startTime: start,
    endTime: end.time,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  }
}

/** Why no room can hold a session of the course for `size` people. */
function noRoomProblem(
  course: PlannerCourse,
  rooms: readonly RoomFacts[],
  size: number
): OfferProblem {
  const physical = rooms.filter(r => r.kind !== 'ONLINE')
  if (physical.length === 0) return { kind: 'NO_ONLINE_OR_ROOM' }
  const lacking = (room: RoomFacts) =>
    course.capabilities.filter(c => !room.capabilities.includes(c))
  const equipped = physical.filter(r => lacking(r).length === 0)
  if (equipped.length === 0) {
    const closest = physical.toSorted(
      (a, b) => lacking(a).length - lacking(b).length || a.name.localeCompare(b.name, 'cs')
    )[0] as RoomFacts
    return { kind: 'NO_ROOM_WITH', missing: lacking(closest) }
  }
  return {
    kind: 'NO_ROOM_LARGE_ENOUGH',
    largest: Math.max(...equipped.map(r => r.capacity ?? size)),
  }
}

const toRef = (room: RoomFacts): RoomRef => ({ id: room.id, name: room.name, kind: room.kind })

export function planSessions(input: PlannerInput): SessionOffer[] {
  const courses = new Map(input.courses.map(c => [c.code, c]))
  const busy: (PlannerSession & { roomId: string })[] = [...input.sessions]
  const tomorrow = addDays(input.asOf, 1)

  // ---- demand, grouped by course and due date -------------------------------------------
  const groups = new Map<
    string,
    { course: PlannerCourse; bucket: string; deadline: IsoDate; people: PlannedPerson[] }
  >()
  for (const item of input.items) {
    if (!needsNewSession(item)) continue
    const course = courses.get(item.need.course.code)
    if (!course) continue
    const due =
      item.bucket === NOW || item.lapses === null
        ? addDays(input.asOf, PLAN_NOW_DAYS)
        : addDays(item.lapses, -1)
    const bucket = item.bucket
    const key = `${course.code}|${bucket}`
    const group = groups.get(key) ?? { course, bucket, deadline: due, people: [] }
    if (due < group.deadline) group.deadline = due
    group.people.push({
      externalId: item.need.employee.externalId,
      name: item.need.employee.name,
      department: item.need.employee.department,
      lapses: item.lapses,
    })
    groups.set(key, group)
  }
  const ordered = [...groups.values()].sort(
    (a, b) => a.deadline.localeCompare(b.deadline) || a.course.code.localeCompare(b.course.code)
  )

  // ---- one offer per session needed, slots taken in deadline order ----------------------
  const offers: SessionOffer[] = []
  for (const group of ordered) {
    const { course } = group
    const people = group.people.toSorted(
      (a, b) => (a.lapses ?? '').localeCompare(b.lapses ?? '') || a.name.localeCompare(b.name, 'cs')
    )
    const minutes = course.sessionMinutes
    const offering = proposedOffering(course.offerings)
    const start = course.usualStart ?? DEFAULT_START
    const needs = {
      seats: course.seats,
      onlineAllowed: course.onlineAllowed,
      capabilities: course.capabilities,
    }
    // Rooms that suit the course, seats aside. Without a group size a session fills the
    // largest of them; an online one takes everyone.
    const suitable = input.rooms.filter(r => roomMismatch(r, needs, null) === null)
    const roomSeats = suitable.map(r => r.capacity ?? people.length)
    const seats = course.seats ?? Math.max(1, ...roomSeats)
    const { id, code, name, sessionMinutes, onlineAllowed, capabilities, offerings } = course
    for (let i = 0; i * seats < people.length; i++) {
      const chunk = people.slice(i * seats, (i + 1) * seats)
      const size = chunk.length
      const base = {
        id: `${course.code}|${group.bucket}|${String(i + 1)}`,
        course: {
          id,
          code,
          name,
          sessionMinutes,
          seats: course.seats,
          onlineAllowed,
          capabilities,
          offerings,
        },
        bucket: group.bucket,
        deadline: group.deadline,
        size,
        people: chunk,
      }
      const unplaced = (problem: OfferProblem): SessionOffer => ({
        ...base,
        slot: null,
        room: null,
        capacity: null,
        alternatives: [],
        offering,
        late: false,
        problem,
      })
      if (minutes === null) {
        offers.push(unplaced({ kind: 'NO_LENGTH' }))
        continue
      }
      if (offering === null) {
        offers.push(unplaced({ kind: 'NO_PROVIDER' }))
        continue
      }
      // Rooms the course has used before first, then the smallest that fits, then by name.
      const valid = suitable
        .filter(r => roomMismatch(r, needs, size) === null)
        .toSorted(
          (a, b) =>
            Number(course.heldIn.includes(b.id)) - Number(course.heldIn.includes(a.id)) ||
            (a.capacity ?? Number.POSITIVE_INFINITY) - (b.capacity ?? Number.POSITIVE_INFINITY) ||
            a.name.localeCompare(b.name, 'cs')
        )
      if (valid.length === 0) {
        offers.push(unplaced(noRoomProblem(course, input.rooms, size)))
        continue
      }
      if (!slotOn(tomorrow, start, minutes)) {
        offers.push(unplaced({ kind: 'RUNS_PAST_MIDNIGHT' }))
        continue
      }
      let placed: { slot: Slot; free: RoomFacts[] } | null = null
      for (let day = 0; day < PLAN_HORIZON_DAYS && !placed; day++) {
        const date = addDays(tomorrow, day)
        const slot = isWorkingDay(date) ? slotOn(date, start, minutes) : null
        if (!slot) continue
        const free = valid.filter(
          r => r.kind === 'ONLINE' || !busy.some(s => s.roomId === r.id && overlaps(s, slot))
        )
        if (free.length > 0) placed = { slot, free }
      }
      if (!placed) {
        offers.push(unplaced({ kind: 'NO_FREE_SLOT' }))
        continue
      }
      const [room, ...others] = placed.free as [RoomFacts, ...RoomFacts[]]
      busy.push({ roomId: room.id, startsAt: placed.slot.startsAt, endsAt: placed.slot.endsAt })
      const wanted = Math.max(course.seats ?? size, size)
      offers.push({
        ...base,
        slot: placed.slot,
        room: toRef(room),
        capacity: room.capacity === null ? wanted : Math.min(room.capacity, wanted),
        alternatives: others.map(toRef),
        offering,
        late: placed.slot.date > group.deadline,
        problem: null,
      })
    }
  }
  return offers
}

/** A course's offers, as the planner lists them: one group per course. */
export interface PlannerGroup {
  course: OfferCourse
  offers: SessionOffer[]
}

/** The offers grouped by course, in the order the courses first appear (most urgent first). */
export function groupOffers(offers: readonly SessionOffer[]): PlannerGroup[] {
  return [...Map.groupBy(offers, o => o.course.code).values()].flatMap(courseOffers => {
    const [first] = courseOffers
    return first ? [{ course: first.course, offers: courseOffers }] : []
  })
}
