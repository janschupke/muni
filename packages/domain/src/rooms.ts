import type { Capability, RoomKind } from './enums'

/** How a session or a list names its room. */
export interface RoomRef {
  id: string
  name: string
  kind: RoomKind
}

export interface RoomFacts extends RoomRef {
  /** Seats; null = no fixed limit. */
  capacity: number | null
  capabilities: readonly Capability[]
}

/** What one session of a course needs from its room. */
export interface SessionNeeds {
  groupSize: number | null
  onlineAllowed: boolean
  capabilities: readonly Capability[]
}

export type RoomMismatch =
  | { kind: 'ONLINE_NOT_ALLOWED' }
  | { kind: 'TOO_SMALL'; capacity: number }
  | { kind: 'MISSING_CAPABILITIES'; missing: Capability[] }

/**
 * Why a room cannot hold a session of the course, or null when it can. An online room
 * needs the course to allow online delivery and nothing else; a physical room needs every
 * capability the course lists and enough seats for `seats` people.
 */
export function roomMismatch(
  room: RoomFacts,
  needs: SessionNeeds,
  seats: number
): RoomMismatch | null {
  if (room.kind === 'ONLINE') return needs.onlineAllowed ? null : { kind: 'ONLINE_NOT_ALLOWED' }
  const missing = needs.capabilities.filter(c => !room.capabilities.includes(c))
  if (missing.length > 0) return { kind: 'MISSING_CAPABILITIES', missing }
  if (room.capacity !== null && room.capacity < seats)
    return { kind: 'TOO_SMALL', capacity: room.capacity }
  return null
}
