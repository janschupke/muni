import type { AdvisorInput, AdvisorNeed } from '@muni/domain/advisor'
import { countStatuses } from '@muni/domain/compliance'

import { dbOf, loadCompliance, type RepoOptions } from './context'

/**
 * Everything the advisor needs, as plain data: open needs (with names, for the plan table),
 * upcoming sessions with their named bookings, and the active compliance counts. The plan
 * itself is computed by `planAssignments` (in the browser, so the calculator is live).
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
        location: true,
        course: { select: { code: true, name: true } },
        assignments: { select: { employee: { select: { externalId: true } } } },
      },
      orderBy: [{ startsAt: 'asc' }, { externalId: 'asc' }],
    }),
  ])

  const employeeById = new Map(employees.map(e => [e.id, e]))
  const courseById = new Map(courses.map(c => [c.id, c]))
  const needs: AdvisorNeed[] = []
  for (const cell of compliance.cells) {
    if (cell.status === 'VALID') continue
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
      validUntil: cell.basis?.validUntil ?? null,
    })
  }

  const active = new Set(employees.filter(e => e.status === 'ACTIVE').map(e => e.id))
  return {
    asOf: compliance.options.asOf,
    expiringWithinDays: compliance.options.expiringWithinDays,
    needs,
    sessions: sessions.map(s => ({
      externalId: s.externalId,
      courseCode: s.course.code,
      courseName: s.course.name,
      location: s.location,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      capacity: s.capacity,
      unnamedBookings: s.unnamedBookings,
      assigned: s.assignments.map(a => a.employee.externalId),
      pricePerPerson: s.pricePerPerson === null ? null : Number(s.pricePerPerson),
      status: s.status,
    })),
    activeCounts: countStatuses(compliance.cells.filter(c => active.has(c.employeeId))),
  }
}
