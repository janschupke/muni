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
