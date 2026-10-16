import { addDays, toZonedParts, zonedTimeToUtc, type IsoDate } from '@muni/utils/dates'

import { NOW, type PlanItem } from './advisor'
import type { Capability } from './enums'
import { roomMismatch, type RoomFacts, type RoomRef } from './rooms'

/*
 * The session planner: for trainings the advisor could not place (no session of the course
 * ahead, or every one full), it proposes new sessions, each with a slot and a room.
 *
 * One fixed rule:
 * - Demand is grouped by course and by when it is due: everything already lapsed together
 *   (due within PLAN_NOW_DAYS), then one group per month in which trainings lapse (due the
 *   day before the first of them lapses).
 * - A group needs ceil(people / group size) sessions; people go into them earliest lapse first.
 * - Each session takes the first working day from tomorrow on which a valid room is free at
 *   the course's usual start time, for the course's usual length. Valid: online if the
 *   course allows it; otherwise a physical room with every capability the course needs and
 *   enough seats. Rooms the course was held in before come first, then the smallest that
 *   fits. Sessions already planned and offers made earlier both block a room.
 * - A slot past the due date is offered anyway, marked late; with no valid room, or no free
 *   slot within PLAN_HORIZON_DAYS, the offer says why.
 */

/** Already lapsed or never held: wanted within this many days. */
export const PLAN_NOW_DAYS = 14
/** How far ahead the planner looks for a free slot. */
export const PLAN_HORIZON_DAYS = 120
export const DEFAULT_SESSION_MINUTES = 180
export const DEFAULT_START = '09:00'

export interface PlannerCourse {
  code: string
  name: string
  sessionMinutes: number | null
  groupSize: number | null
  onlineAllowed: boolean
  capabilities: readonly Capability[]
  /** The start time most of its sessions had (Prague wall clock), if any. */
  usualStart: string | null
  /** Rooms it was held in before. */
  heldIn: readonly string[]
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
  | { kind: 'NO_ROOM_WITH'; missing: Capability[] }
  | { kind: 'NO_ROOM_LARGE_ENOUGH'; largest: number }
  | { kind: 'NO_ONLINE_OR_ROOM' }
  | { kind: 'NO_FREE_SLOT' }

export interface SessionOffer {
  /** Stable within one plan: course, group and index. */
  id: string
  course: { code: string; name: string }
  /** `now`, or the month the group's trainings lapse in. */
  bucket: string
  /** The last day the session should be held by. */
  deadline: IsoDate
  /** People the session is for. */
  size: number
  /** Seats to open: the course's group size, as far as the room allows; null without a room. */
  capacity: number | null
  people: PlannedPerson[]
  slot: Slot | null
  room: RoomRef | null
  /** Other valid rooms free at the same slot. */
  alternatives: RoomRef[]
  late: boolean
  problem: OfferProblem | null
}

const isWorkingDay = (date: IsoDate) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day !== 0 && day !== 6
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

/** Why no room at all can hold the course's sessions. */
function noRoomProblem(
  course: PlannerCourse,
  rooms: readonly RoomFacts[],
  size: number
): OfferProblem {
  const physical = rooms.filter(r => r.kind !== 'ONLINE')
  const missing = course.capabilities.filter(c => !physical.some(r => r.capabilities.includes(c)))
  if (missing.length > 0) return { kind: 'NO_ROOM_WITH', missing }
  const largest = Math.max(0, ...physical.map(r => r.capacity ?? Number.POSITIVE_INFINITY))
  if (physical.length > 0 && largest < size) return { kind: 'NO_ROOM_LARGE_ENOUGH', largest }
  return { kind: 'NO_ONLINE_OR_ROOM' }
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
    const proposal = item.proposal
    if (proposal?.kind !== 'NONE' || proposal.reason === 'CONFLICT') continue
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
    const groupSize = course.groupSize ?? people.length
    const minutes = course.sessionMinutes ?? DEFAULT_SESSION_MINUTES
    const start = course.usualStart ?? DEFAULT_START
    const needs = {
      groupSize: course.groupSize,
      onlineAllowed: course.onlineAllowed,
      capabilities: course.capabilities,
    }
    for (let i = 0; i * groupSize < people.length; i++) {
      const chunk = people.slice(i * groupSize, (i + 1) * groupSize)
      const size = chunk.length
      const base = {
        id: `${course.code}|${group.bucket}|${String(i + 1)}`,
        course: { code: course.code, name: course.name },
        bucket: group.bucket,
        deadline: group.deadline,
        size,
        people: chunk,
      }
      // Rooms the course has used before first, then the smallest that fits, then by name.
      const valid = input.rooms
        .filter(r => roomMismatch(r, needs, size) === null)
        .toSorted(
          (a, b) =>
            Number(course.heldIn.includes(b.id)) - Number(course.heldIn.includes(a.id)) ||
            (a.capacity ?? Number.POSITIVE_INFINITY) - (b.capacity ?? Number.POSITIVE_INFINITY) ||
            a.name.localeCompare(b.name, 'cs')
        )
      if (valid.length === 0) {
        offers.push({
          ...base,
          slot: null,
          room: null,
          capacity: null,
          alternatives: [],
          late: false,
          problem: noRoomProblem(course, input.rooms, size),
        })
        continue
      }
      let placed: { slot: Slot; free: RoomFacts[] } | null = null
      for (let day = 0; day < PLAN_HORIZON_DAYS && !placed; day++) {
        const date = addDays(tomorrow, day)
        if (!isWorkingDay(date)) continue
        const slot = slotOn(date, start, minutes)
        if (!slot) break
        const free = valid.filter(r => !busy.some(s => s.roomId === r.id && overlaps(s, slot)))
        if (free.length > 0) placed = { slot, free }
      }
      if (!placed) {
        offers.push({
          ...base,
          slot: null,
          room: null,
          capacity: null,
          alternatives: [],
          late: false,
          problem: { kind: 'NO_FREE_SLOT' },
        })
        continue
      }
      const [room, ...others] = placed.free as [RoomFacts, ...RoomFacts[]]
      busy.push({ roomId: room.id, startsAt: placed.slot.startsAt, endsAt: placed.slot.endsAt })
      offers.push({
        ...base,
        slot: placed.slot,
        room: toRef(room),
        capacity: Math.min(room.capacity ?? Number.POSITIVE_INFINITY, Math.max(groupSize, size)),
        alternatives: others.map(toRef),
        late: placed.slot.date > group.deadline,
        problem: null,
      })
    }
  }
  return offers
}
