import {
  addDays,
  intervalsOverlap,
  type IsoDate,
  isWorkingDay,
  toZonedParts,
  zonedTimeToUtc,
} from '@muni/utils/dates'
import { compareCs } from '@muni/utils/text'

import { type RoomFacts, roomMismatch, type SessionNeeds } from '../rooms'
import {
  type OfferProblem,
  PLAN_HORIZON_DAYS,
  type PlannerCourse,
  type PlannerSession,
  type Slot,
} from './types'

// ISO instants in one format order as the time does.
const overlaps = (
  a: { startsAt: string; endsAt: string },
  b: { startsAt: string; endsAt: string }
) => intervalsOverlap({ start: a.startsAt, end: a.endsAt }, { start: b.startsAt, end: b.endsAt })

/** The slot on `date`, or null when it would run past midnight. */
export function slotOn(date: IsoDate, start: string, minutes: number): Slot | null {
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

/**
 * The rooms that can hold a session of the course for `size` people: the ones it was held in
 * before first, then the smallest that fits, then by name.
 */
export function roomsFor(
  course: PlannerCourse,
  suitable: readonly RoomFacts[],
  needs: SessionNeeds,
  size: number
): RoomFacts[] {
  return suitable
    .filter(r => roomMismatch(r, needs, size) === null)
    .toSorted(
      (a, b) =>
        Number(course.heldIn.includes(b.id)) - Number(course.heldIn.includes(a.id)) ||
        (a.capacity ?? Number.POSITIVE_INFINITY) - (b.capacity ?? Number.POSITIVE_INFINITY) ||
        compareCs(a.name, b.name)
    )
}

/** Why no room can hold a session of the course for `size` people. */
export function noRoomProblem(
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
      (a, b) => lacking(a).length - lacking(b).length || compareCs(a.name, b.name)
    )[0] as RoomFacts
    return { kind: 'NO_ROOM_WITH', missing: lacking(closest) }
  }
  return {
    kind: 'NO_ROOM_LARGE_ENOUGH',
    largest: Math.max(...equipped.map(r => r.capacity ?? size)),
  }
}

/**
 * The first working day from `from` on which one of the rooms is free at `start` for `minutes`
 * (an online room always is; `busy` holds what the others are taken by), with every room free
 * then; null within `PLAN_HORIZON_DAYS`.
 */
export function firstFreeSlot(
  rooms: readonly RoomFacts[],
  busy: readonly PlannerSession[],
  { from, start, minutes }: { from: IsoDate; start: string; minutes: number }
): { slot: Slot; free: [RoomFacts, ...RoomFacts[]] } | null {
  for (let day = 0; day < PLAN_HORIZON_DAYS; day++) {
    const date = addDays(from, day)
    const slot = isWorkingDay(date) ? slotOn(date, start, minutes) : null
    if (!slot) continue
    const free = rooms.filter(
      r => r.kind === 'ONLINE' || !busy.some(s => s.roomId === r.id && overlaps(s, slot))
    )
    const [first, ...others] = free
    if (first) return { slot, free: [first, ...others] }
  }
  return null
}
