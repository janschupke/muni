import type { ReferenceSnapshot } from '@muni/importer'

import type { Db } from './client'

/**
 * What the importer needs to resolve references against existing data. Sent to the
 * signed-in browser, so it carries names and emails only: no national IDs, no notes.
 */
export async function loadReferenceSnapshot(db: Db): Promise<ReferenceSnapshot> {
  const [courses, employees, departments, positions, providers, rooms] = await Promise.all([
    db.course.findMany({ select: { code: true, validityMonths: true }, orderBy: { code: 'asc' } }),
    db.employee.findMany({
      select: { externalId: true, email: true, firstName: true, lastName: true },
      orderBy: { externalId: 'asc' },
    }),
    db.department.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
    db.position.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
    db.provider.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
    db.room.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
  ])
  return {
    courses,
    employees: employees.map(e => ({
      externalId: e.externalId,
      email: e.email,
      fullName: `${e.lastName} ${e.firstName}`,
    })),
    departments: departments.map(d => d.name),
    positions: positions.map(p => p.name),
    providers: providers.map(p => p.name),
    rooms: rooms.map(r => r.name),
  }
}
