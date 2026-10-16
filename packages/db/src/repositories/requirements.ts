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

/** One required course of one person, as the lists and the matrix show it. */
export function requirementOf(
  cell: ComplianceCell,
  course: { code: string; name: string } | undefined,
  asOf: IsoDate,
  bookings: NextBookings
): EmployeeListRequirement {
  const validUntil = cell.basis?.validUntil ?? null
  return {
    courseCode: course?.code ?? '',
    courseName: course?.name ?? '',
    status: cell.status,
    completedOn: cell.basis?.completedOn ?? null,
    validUntil,
    daysLeft: validUntil === null ? null : diffInDays(asOf, validUntil),
    booked: bookings.get(`${cell.employeeId}|${cell.courseId}`) ?? null,
  }
}
