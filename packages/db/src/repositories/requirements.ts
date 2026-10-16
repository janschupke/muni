import type { ComplianceCell } from '@muni/domain/compliance'
import { diffInDays, type IsoDate } from '@muni/utils/dates'

import type { Db } from '../client'
import type { EmployeeListRequirement } from './employees'

/** Soonest named booking per `${employeeId}|${courseId}`. */
export type NextBookings = Map<string, { sessionExternalId: string; startsAt: string }>

/** Each person's soonest named booking per course, among planned sessions still ahead. */
export async function loadNextBookings(db: Db, now = new Date()): Promise<NextBookings> {
  const bookings = await db.sessionAssignment.findMany({
    where: { session: { startsAt: { gt: now }, status: 'PLANNED' } },
    select: {
      employeeId: true,
      session: { select: { externalId: true, startsAt: true, courseId: true } },
    },
    orderBy: { session: { startsAt: 'asc' } },
  })
  const next: NextBookings = new Map()
  for (const b of bookings) {
    const key = `${b.employeeId}|${b.session.courseId}`
    if (!next.has(key))
      next.set(key, {
        sessionExternalId: b.session.externalId,
        startsAt: b.session.startsAt.toISOString(),
      })
  }
  return next
}

/** What turns compliance cells into the requirement rows the lists show. */
export interface RequirementContext {
  /** Every course a cell can name, by id. */
  courses: ReadonlyMap<string, { code: string; name: string }>
  asOf: IsoDate
  bookings: NextBookings
}

/** One required course of one person, as the lists and the matrix show it. */
export function requirementOf(
  cell: ComplianceCell,
  context: RequirementContext
): EmployeeListRequirement {
  const course = context.courses.get(cell.courseId)
  // Cells come from the mandatory courses, which the context always carries.
  if (!course) throw new Error(`No course ${cell.courseId} for a compliance cell`)
  const validUntil = cell.basis?.validUntil ?? null
  return {
    courseCode: course.code,
    courseName: course.name,
    status: cell.status,
    completedOn: cell.basis?.completedOn ?? null,
    validUntil,
    daysLeft: validUntil === null ? null : diffInDays(context.asOf, validUntil),
    booked: context.bookings.get(`${cell.employeeId}|${cell.courseId}`) ?? null,
  }
}
