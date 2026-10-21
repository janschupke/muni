import type { ComplianceCell } from '@muni/domain/compliance'
import type { RoomRef } from '@muni/domain/rooms'
import { openingOf, seatsLeft, type SessionOpening } from '@muni/domain/sessions'
import { diffInDays, type IsoDate } from '@muni/utils/dates'

import type { Db } from '../../client'
import { ACTIVE } from '../archive/archive'
import type { EmployeeListRequirement } from '../people/employees'
import {
  bookableSessionWhere,
  roomRefSelect,
  toRoomRef,
  upcomingSessionWhere,
} from '../scheduling/sessions'

/** A person's next booking on a course, as the requirement rows show it. */
export interface NextBooking {
  sessionExternalId: string
  startsAt: string
  endsAt: string
  room: RoomRef
}

/** Soonest named booking per `${employeeId}|${courseId}`. */
type NextBookings = Map<string, NextBooking>

/** Whether each course can be booked now, by course id (a course with no session: absent). */
type Openings = ReadonlyMap<string, SessionOpening>

/** What the requirement rows need to say about booking: who is booked, and what is open. */
export interface BookingContext {
  bookings: NextBookings
  openings: Openings
}

/**
 * Each person's soonest named booking per course, among planned sessions not yet over (only
 * `employeeIds`' when given: one person's page), and for every course whether a planned
 * session still to start has a seat free (`openingOf`), as the advisor counts seats.
 */
export async function loadBookingContext(
  db: Db,
  now: Date,
  employeeIds?: readonly string[]
): Promise<BookingContext> {
  const [bookings, sessions] = await Promise.all([
    db.sessionAssignment.findMany({
      where: {
        session: upcomingSessionWhere(now),
        ...(employeeIds && { employeeId: { in: [...employeeIds] } }),
      },
      select: {
        employeeId: true,
        session: {
          select: {
            externalId: true,
            startsAt: true,
            endsAt: true,
            courseId: true,
            room: { select: roomRefSelect },
          },
        },
      },
      orderBy: { session: { startsAt: 'asc' } },
    }),
    db.courseSession.findMany({
      where: { ...bookableSessionWhere(now), course: ACTIVE },
      select: {
        courseId: true,
        capacity: true,
        unnamedBookings: true,
        _count: { select: { assignments: true } },
      },
    }),
  ])
  const next: NextBookings = new Map()
  for (const b of bookings) {
    const key = `${b.employeeId}|${b.session.courseId}`
    if (!next.has(key))
      next.set(key, {
        sessionExternalId: b.session.externalId,
        startsAt: b.session.startsAt.toISOString(),
        endsAt: b.session.endsAt.toISOString(),
        room: toRoomRef(b.session.room),
      })
  }
  const openings = new Map(
    [...Map.groupBy(sessions, s => s.courseId)].map(([courseId, of]) => [
      courseId,
      openingOf(of.map(s => seatsLeft({ ...s, named: s._count.assignments }))),
    ])
  )
  return { bookings: next, openings }
}

/** What turns compliance cells into the requirement rows the lists show. */
export interface RequirementContext {
  /** Every course a cell can name, by id. */
  courses: ReadonlyMap<string, { code: string; name: string }>
  asOf: IsoDate
  bookings: NextBookings
  openings: Openings
}

/** The course a cell is about. Cells come from the mandatory courses, which callers load. */
function courseOf<C>(courses: ReadonlyMap<string, C>, cell: ComplianceCell): C {
  const course = courses.get(cell.courseId)
  if (!course) throw new Error(`No course ${cell.courseId} for a compliance cell`)
  return course
}

/** One required course of one person, as the lists and the matrix show it. */
export function requirementOf(
  cell: ComplianceCell,
  context: RequirementContext
): EmployeeListRequirement {
  const course = courseOf(context.courses, cell)
  const validUntil = cell.basis?.validUntil ?? null
  return {
    courseCode: course.code,
    courseName: course.name,
    status: cell.status,
    completedOn: cell.basis?.completedOn ?? null,
    validUntil,
    daysLeft: validUntil === null ? null : diffInDays(context.asOf, validUntil),
    booked: context.bookings.get(`${cell.employeeId}|${cell.courseId}`) ?? null,
    opening: context.openings.get(cell.courseId) ?? 'NONE',
  }
}
