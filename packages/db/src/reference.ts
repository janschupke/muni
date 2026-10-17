import 'server-only'

import { sortName } from '@muni/domain/names'
import { type ArchivedKeys, NO_ARCHIVED, type ReferenceSnapshot } from '@muni/importer'
import { toZonedParts } from '@muni/utils/dates'
import { fold } from '@muni/utils/text'

import type { Db } from './client'
import { ACTIVE } from './repositories/archive'

/**
 * What the importer needs to resolve references against existing data. Sent to the
 * signed-in browser, so it carries names and emails only: no national IDs, no notes.
 * Lookups are among active records. Nothing about archived records is included: which of a
 * batch's keys are archived is asked separately (findArchivedKeys).
 */
export async function loadReferenceSnapshot(db: Db): Promise<ReferenceSnapshot> {
  const [courses, employees, departments, positions, providers, rooms, sessions] =
    await Promise.all([
      db.course.findMany({
        where: ACTIVE,
        select: {
          code: true,
          validityMonths: true,
          onlineAllowedOverride: true,
          capabilities: { select: { capability: true } },
        },
        orderBy: { code: 'asc' },
      }),
      db.employee.findMany({
        where: ACTIVE,
        select: { externalId: true, email: true, firstName: true, lastName: true },
        orderBy: { externalId: 'asc' },
      }),
      db.department.findMany({ where: ACTIVE, select: { name: true }, orderBy: { name: 'asc' } }),
      db.position.findMany({ where: ACTIVE, select: { name: true }, orderBy: { name: 'asc' } }),
      db.provider.findMany({ where: ACTIVE, select: { name: true }, orderBy: { name: 'asc' } }),
      db.room.findMany({
        where: ACTIVE,
        select: {
          name: true,
          kind: true,
          capacity: true,
          capabilities: { select: { capability: true } },
        },
        orderBy: { name: 'asc' },
      }),
      db.courseSession.findMany({
        where: { ...ACTIVE, status: 'PLANNED', room: { ...ACTIVE, kind: { not: 'ONLINE' } } },
        select: {
          externalId: true,
          startsAt: true,
          endsAt: true,
          room: { select: { name: true } },
        },
      }),
    ])
  return {
    courses: courses.map(c => ({
      code: c.code,
      validityMonths: c.validityMonths,
      // Whether it may be online is derived from the very sessions an import brings, so only
      // the app's own "no" counts here; equipment is only ever set in the app.
      needs: {
        groupSize: null,
        onlineAllowed: c.onlineAllowedOverride ?? true,
        capabilities: c.capabilities.map(x => x.capability),
      },
    })),
    employees: employees.map(e => ({
      externalId: e.externalId,
      email: e.email,
      fullName: sortName(e),
    })),
    departments: departments.map(d => d.name),
    positions: positions.map(p => p.name),
    providers: providers.map(p => p.name),
    rooms: rooms.map(r => r.name),
    roomFacts: rooms.map(r => ({ ...r, capabilities: r.capabilities.map(x => x.capability) })),
    plannedSessions: sessions.map(s => {
      const start = toZonedParts(s.startsAt)
      return {
        externalId: s.externalId,
        room: s.room.name,
        date: start.date,
        startTime: start.time,
        endTime: toZonedParts(s.endsAt).time,
      }
    }),
    archived: NO_ARCHIVED,
  }
}

/**
 * Which of the candidate keys (a batch's, see archivedCandidates) only archived records hold.
 * Answers with the candidates as given, so nothing reaches the browser that its own files did
 * not already say. Names compare folded, as the importer matches them; codes and IDs exactly.
 */
export async function findArchivedKeys(db: Db, candidates: ArchivedKeys): Promise<ArchivedKeys> {
  type Row = Record<string, unknown>
  interface Delegate {
    findMany(args: object): Promise<Row[]>
  }

  const exact = async (model: unknown, field: string, wanted: string[]) => {
    if (wanted.length === 0) return []
    const rows = await (model as Delegate).findMany({
      where: { [field]: { in: wanted } },
      select: { [field]: true, archivedAt: true },
    })
    const active = new Set(rows.filter(r => r['archivedAt'] === null).map(r => r[field]))
    const archived = new Set(rows.filter(r => r['archivedAt'] !== null).map(r => r[field]))
    return wanted.filter(v => archived.has(v) && !active.has(v))
  }

  const folded = async (model: unknown, wanted: string[]) => {
    if (wanted.length === 0) return []
    const rows = await (model as Delegate).findMany({ select: { name: true, archivedAt: true } })
    const key = (r: Row) => fold(String(r['name']))
    const active = new Set(rows.filter(r => r['archivedAt'] === null).map(key))
    const archived = new Set(rows.filter(r => r['archivedAt'] !== null).map(key))
    return wanted.filter(v => archived.has(fold(v)) && !active.has(fold(v)))
  }

  const [
    courses,
    employees,
    employeeEmails,
    departments,
    positions,
    providers,
    rooms,
    sessions,
    completions,
  ] = await Promise.all([
    exact(db.course, 'code', candidates.courses),
    exact(db.employee, 'externalId', candidates.employees),
    exact(db.employee, 'email', candidates.employeeEmails),
    folded(db.department, candidates.departments),
    folded(db.position, candidates.positions),
    folded(db.provider, candidates.providers),
    folded(db.room, candidates.rooms),
    exact(db.courseSession, 'externalId', candidates.sessions),
    exact(db.courseCompletion, 'externalId', candidates.completions),
  ])
  return {
    courses,
    employees,
    employeeEmails,
    departments,
    positions,
    providers,
    rooms,
    sessions,
    completions,
  }
}
