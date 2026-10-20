import { addDays, type IsoDate } from '@muni/utils/dates'

import { type RoomFacts, roomMismatch, type RoomRef } from '../rooms'
import { type DemandGroup, demandGroups } from './demand'
import { proposedOffering } from './offering'
import { firstFreeSlot, noRoomProblem, roomsFor, slotOn } from './slots'
import {
  DEFAULT_START,
  type OfferProblem,
  type PlannerGroup,
  type PlannerInput,
  type PlannerSession,
  type SessionOffer,
} from './types'

const toRef = (room: RoomFacts): RoomRef => ({ id: room.id, name: room.name, kind: room.kind })

/**
 * The sessions one group of demand needs: `ceil(people / seats)`, people earliest lapse first
 * (a course without seats set fills the largest room that suits it; online: everyone). Each
 * takes the first working day from `from` on which a valid room is free at the course's usual
 * start, or says why none can be offered. A placed session takes its room in `busy`.
 */
function offersFor(
  group: DemandGroup,
  rooms: readonly RoomFacts[],
  busy: PlannerSession[],
  from: IsoDate
): SessionOffer[] {
  const { course, people } = group
  const minutes = course.sessionMinutes
  const offering = proposedOffering(course.offerings)
  const start = course.usualStart ?? DEFAULT_START
  const needs = {
    seats: course.seats,
    onlineAllowed: course.onlineAllowed,
    capabilities: course.capabilities,
  }
  // Rooms that suit the course, seats aside.
  const suitable = rooms.filter(r => roomMismatch(r, needs, null) === null)
  const seats = course.seats ?? Math.max(1, ...suitable.map(r => r.capacity ?? people.length))
  const { usualStart: _start, heldIn: _held, ...offerCourse } = course

  const offers: SessionOffer[] = []
  for (let i = 0; i * seats < people.length; i++) {
    const chunk = people.slice(i * seats, (i + 1) * seats)
    const size = chunk.length
    const base = {
      id: `${course.code}|${group.bucket}|${String(i + 1)}`,
      course: offerCourse,
      bucket: group.bucket,
      deadline: group.deadline,
      size,
      people: chunk,
      offering,
    }
    const unplaced = (problem: OfferProblem): SessionOffer => ({
      ...base,
      slot: null,
      room: null,
      capacity: null,
      alternatives: [],
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
    const valid = roomsFor(course, suitable, needs, size)
    if (valid.length === 0) {
      offers.push(unplaced(noRoomProblem(course, rooms, size)))
      continue
    }
    if (!slotOn(from, start, minutes)) {
      offers.push(unplaced({ kind: 'RUNS_PAST_MIDNIGHT' }))
      continue
    }
    const placed = firstFreeSlot(valid, busy, { from, start, minutes })
    if (!placed) {
      offers.push(unplaced({ kind: 'NO_FREE_SLOT' }))
      continue
    }
    const [room, ...others] = placed.free
    busy.push({ roomId: room.id, startsAt: placed.slot.startsAt, endsAt: placed.slot.endsAt })
    const wanted = Math.max(course.seats ?? size, size)
    offers.push({
      ...base,
      slot: placed.slot,
      room: toRef(room),
      capacity: room.capacity === null ? wanted : Math.min(room.capacity, wanted),
      alternatives: others.map(toRef),
      late: placed.slot.date > group.deadline,
      problem: null,
    })
  }
  return offers
}

/**
 * The session planner: for trainings the advisor could not place (no session of the course
 * ahead, or every one full), new sessions, each with a slot and a room, groups in order of
 * their due date so the most urgent take the first free slots. Planned sessions and offers
 * made earlier both block a physical room; an online room is never taken.
 */
export function planSessions(input: PlannerInput): SessionOffer[] {
  const busy: PlannerSession[] = [...input.sessions]
  const tomorrow = addDays(input.asOf, 1)
  return demandGroups(input).flatMap(group => offersFor(group, input.rooms, busy, tomorrow))
}

/** The offers grouped by course, in the order the courses first appear (most urgent first). */
export function groupOffers(offers: readonly SessionOffer[]): PlannerGroup[] {
  return [...Map.groupBy(offers, o => o.course.code).values()].flatMap(courseOffers => {
    const [first] = courseOffers
    return first ? [{ course: first.course, offers: courseOffers }] : []
  })
}
