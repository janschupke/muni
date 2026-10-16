import { forecastEnd, type AdvisorInput, type AdvisorNeed } from '@muni/domain/advisor'

import { dbOf, loadCompliance, toAmount, type RepoOptions } from './context'
import { roomRefSelect } from './sessions'

/**
 * Everything the advisor needs, as plain data: every training that is non-compliant now or
 * lapses within the forecast (with names, for the tables), and the upcoming sessions with
 * their named bookings. The plan itself is `planAssignments`, a pure function of this.
 * Names and departments are already public on the employee list; nothing sensitive is read.
 */
export async function getAdvisorInput(
  options?: RepoOptions & { now?: Date }
): Promise<AdvisorInput> {
  const db = dbOf(options)
  const now = options?.now ?? new Date()
  const [compliance, employees, courses, sessions] = await Promise.all([
    loadCompliance(options),
    db.employee.findMany({
      where: { status: { not: 'TERMINATED' } },
      select: {
        id: true,
        externalId: true,
        firstName: true,
        lastName: true,
        status: true,
        department: { select: { name: true } },
      },
    }),
    db.course.findMany({ select: { id: true, code: true, name: true } }),
    db.courseSession.findMany({
      where: { startsAt: { gt: now } },
      select: {
        externalId: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        unnamedBookings: true,
        pricePerPerson: true,
        status: true,
        room: { select: roomRefSelect },
        course: { select: { code: true, name: true } },
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
    if (!employee || !course || employee.status === 'TERMINATED') continue
    needs.push({
      employee: {
        externalId: employee.externalId,
        name: `${employee.lastName} ${employee.firstName}`,
        department: employee.department?.name ?? null,
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
      room: s.room,
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
