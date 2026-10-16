import type { RoomKind } from '@muni/domain/enums'

import { dbOf, type RepoOptions } from './context'

export async function listDepartments(options?: RepoOptions): Promise<string[]> {
  const rows = await dbOf(options).department.findMany({
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  return rows.map(r => r.name)
}

export async function listPositions(options?: RepoOptions): Promise<string[]> {
  const rows = await dbOf(options).position.findMany({
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  return rows.map(r => r.name)
}

export async function listProviders(options?: RepoOptions): Promise<string[]> {
  const rows = await dbOf(options).provider.findMany({
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
    select: { id: true, name: true, kind: true, capacity: true },
    orderBy: { name: 'asc' },
  })
}
