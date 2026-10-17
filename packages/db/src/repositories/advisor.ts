import { type AdvisorInput, type AdvisorNeed, forecastEnd } from '@muni/domain/advisor'
import { sortName } from '@muni/domain/names'

import { ACTIVE } from './archive'
import { dbOf, loadCompliance, toAmount, type WithCompliance } from './context'
import { stillEmployed } from './employment'
import { roomRefSelect, toRoomRef } from './sessions'

/**
 * Everything the advisor needs, as plain data: every training that is non-compliant now or
 * lapses within the forecast (with names, for the tables), and the upcoming sessions with
 * their named bookings. The plan itself is `planAssignments`, a pure function of this.
 * Names and departments are already public on the employee list; nothing sensitive is read.
 */
export async function getAdvisorInput(
  options?: WithCompliance & { now?: Date }
): Promise<AdvisorInput> {
  const db = dbOf(options)
  const now = options?.now ?? new Date()
  const [compliance, employees, courses, sessions] = await Promise.all([
    options?.compliance ?? loadCompliance(options),
    db.employee.findMany({
      where: { ...ACTIVE, ...stillEmployed(options?.asOf) },
      select: {
        id: true,
        externalId: true,
        firstName: true,
        lastName: true,
        status: true,
        departmentId: true,
        positionId: true,
        department: { select: { name: true } },
      },
    }),
    db.course.findMany({ where: ACTIVE, select: { id: true, code: true, name: true } }),
    db.courseSession.findMany({
      where: { ...ACTIVE, startsAt: { gt: now }, course: ACTIVE },
      select: {
        externalId: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        unnamedBookings: true,
        pricePerPerson: true,
        status: true,
        room: { select: { ...roomRefSelect, capacity: true } },
        course: { select: { code: true, name: true } },
        // Every named booking holds a seat. (Archiving a person removes their future ones.)
        assignments: { select: { employee: { select: { externalId: true } } } },
      },
      orderBy: [{ startsAt: 'asc' }, { externalId: 'asc' }],
    }),
  ])

  const employeeById = new Map(employees.map(e => [e.id, e]))
  const courseById = new Map(courses.map(c => [c.id, c]))
  const needs: AdvisorNeed[] = []
  const end = forecastEnd(compliance.options.asOf)
  for (const cell of compliance.cells) {
    // A valid training is in scope only if it lapses (the day after validUntil) by the end.
    const validUntil = cell.basis?.validUntil ?? null
    if (cell.status === 'VALID' && (validUntil === null || validUntil >= end)) continue
    const employee = employeeById.get(cell.employeeId)
    const course = courseById.get(cell.courseId)
    if (!employee || !course) continue
    needs.push({
      employee: {
        externalId: employee.externalId,
        name: sortName(employee),
        department: employee.department?.name ?? null,
        departmentId: employee.departmentId,
        positionId: employee.positionId,
        status: employee.status,
      },
      course: { code: course.code, name: course.name },
      status: cell.status,
      validUntil,
    })
  }

  return {
    asOf: compliance.options.asOf,
    needs,
    sessions: sessions.map(s => ({
      externalId: s.externalId,
      courseCode: s.course.code,
      courseName: s.course.name,
      room: toRoomRef(s.room),
      roomCapacity: s.room.capacity,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      capacity: s.capacity,
      unnamedBookings: s.unnamedBookings,
      assigned: s.assignments.map(a => a.employee.externalId),
      pricePerPerson: toAmount(s.pricePerPerson),
      status: s.status,
    })),
  }
}
