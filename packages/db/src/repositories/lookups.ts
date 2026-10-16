import type { RoomKind } from '@muni/domain/enums'

import { ACTIVE } from './archive'
import { dbOf, type RepoOptions } from './context'

export async function listDepartments(options?: RepoOptions): Promise<string[]> {
  const rows = await dbOf(options).department.findMany({
    where: ACTIVE,
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  return rows.map(r => r.name)
}

export async function listPositions(options?: RepoOptions): Promise<string[]> {
  const rows = await dbOf(options).position.findMany({
    where: ACTIVE,
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  return rows.map(r => r.name)
}

/** Every provider's name, for the completion form to suggest. */
export async function listProviderNames(options?: RepoOptions): Promise<string[]> {
  const rows = await dbOf(options).provider.findMany({
    where: ACTIVE,
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  return rows.map(r => r.name)
}

export interface RoomOption {
  id: string
  name: string
  kind: RoomKind
  capacity: number | null
}

/** Every room, for pickers. */
export async function listRoomOptions(options?: RepoOptions): Promise<RoomOption[]> {
  return dbOf(options).room.findMany({
    where: ACTIVE,
    select: { id: true, name: true, kind: true, capacity: true },
    orderBy: { name: 'asc' },
  })
}

/** A person's name as the lists show it ("Last First"), or null when there is no such person. */
export async function getPersonName(externalId: string, options?: RepoOptions) {
  const person = await dbOf(options).employee.findFirst({
    where: { externalId, ...ACTIVE },
    select: { firstName: true, lastName: true },
  })
  return person && `${person.lastName} ${person.firstName}`
}

export interface PersonOption {
  externalId: string
  name: string
}

/** Everyone active who has not left, by name, for pickers (a manager, an attendee). */
export async function listEmployeeOptions(options?: RepoOptions): Promise<PersonOption[]> {
  const people = await dbOf(options).employee.findMany({
    where: { ...ACTIVE, status: { not: 'TERMINATED' } },
    select: { externalId: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  return people
    .map(p => ({ externalId: p.externalId, name: `${p.lastName} ${p.firstName}` }))
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
}

export interface SessionOption {
  externalId: string
  courseCode: string
  courseName: string
  startsAt: string
  endsAt: string
  free: number
}

/**
 * Planned sessions that have not started and have a free seat, soonest first: where a person
 * can be booked by hand. Sessions they are already booked on are left out.
 */
export async function listBookableSessions(
  employeeExternalId: string,
  options?: RepoOptions & { now?: Date }
): Promise<SessionOption[]> {
  const sessions = await dbOf(options).courseSession.findMany({
    where: {
      ...ACTIVE,
      status: 'PLANNED',
      startsAt: { gt: options?.now ?? new Date() },
      course: ACTIVE,
      assignments: { none: { employee: { externalId: employeeExternalId, ...ACTIVE } } },
    },
    select: {
      externalId: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      unnamedBookings: true,
      course: { select: { code: true, name: true } },
      _count: { select: { assignments: true } },
    },
    orderBy: { startsAt: 'asc' },
  })
  return sessions.flatMap(s => {
    const free = s.capacity - s.unnamedBookings - s._count.assignments
    return free > 0
      ? [
          {
            externalId: s.externalId,
            courseCode: s.course.code,
            courseName: s.course.name,
            startsAt: s.startsAt.toISOString(),
            endsAt: s.endsAt.toISOString(),
            free,
          },
        ]
      : []
  })
}
