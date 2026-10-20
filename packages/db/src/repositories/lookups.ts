import { sortName } from '@muni/domain/names'
import type { RoomFacts } from '@muni/domain/rooms'
import { compareCs } from '@muni/utils/text'

import { ACTIVE } from './archive'
import { dbOf, type RepoOptions } from './context'
import { stillEmployed } from './employment'
import { roomFactsOf, roomFactsSelect } from './session-fit'

/** Every active department's id and name, by name: what breakdowns by department list. */
export function activeDepartments(options?: RepoOptions): Promise<{ id: string; name: string }[]> {
  return dbOf(options).department.findMany({
    where: ACTIVE,
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

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

/** Every active provider, for the completion form's picker. */
export function listProviderOptions(
  options?: RepoOptions
): Promise<{ id: string; name: string }[]> {
  return dbOf(options).provider.findMany({
    where: ACTIVE,
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

/** A room as the session form offers it: what it holds, so the form can check the fit. */
export type RoomOption = RoomFacts

/** Every room, for pickers. */
export async function listRoomOptions(options?: RepoOptions): Promise<RoomOption[]> {
  const rooms = await dbOf(options).room.findMany({
    where: ACTIVE,
    select: roomFactsSelect,
    orderBy: { name: 'asc' },
  })
  return rooms.map(roomFactsOf)
}

/** A person's name as the lists show it ("Last First"), or null when there is no such person. */
export async function getPersonName(externalId: string, options?: RepoOptions) {
  const person = await dbOf(options).employee.findFirst({
    where: { externalId, ...ACTIVE },
    select: { firstName: true, lastName: true },
  })
  return person && sortName(person)
}

export interface PersonOption {
  id: string
  externalId: string
  name: string
  departmentId: string | null
}

/** Everyone active who has not left, by name, for pickers (a manager, an attendee, a head). */
export async function listEmployeeOptions(options?: RepoOptions): Promise<PersonOption[]> {
  const people = await dbOf(options).employee.findMany({
    where: { ...ACTIVE, ...stillEmployed(options?.asOf) },
    select: { id: true, externalId: true, firstName: true, lastName: true, departmentId: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  return people
    .map(p => ({
      id: p.id,
      externalId: p.externalId,
      name: sortName(p),
      departmentId: p.departmentId,
    }))
    .sort((a, b) => compareCs(a.name, b.name))
}
