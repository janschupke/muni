import { fold } from '@muni/utils/text'

import type { Capability, RoomKind } from './enums'

/** A room's utilisation is measured over this many days, from tomorrow. */
export const UTILISATION_DAYS = 30

/** Bookable hours in a working day, against which utilisation is measured. */
export const WORKING_HOURS = 8

/** Folded words that name a room kind, in a kind column or in a room's name. */
export const ROOM_KIND_WORDS: ReadonlyMap<string, RoomKind> = new Map([
  ['ucebna', 'CLASSROOM'],
  ['trida', 'CLASSROOM'],
  ['sal', 'CLASSROOM'],
  ['aula', 'CLASSROOM'],
  ['classroom', 'CLASSROOM'],
  ['laborator', 'LAB'],
  ['lab', 'LAB'],
  ['online', 'ONLINE'],
  ['on-line', 'ONLINE'],
  ['e-learning', 'ONLINE'],
  ['virtualni', 'ONLINE'],
  ['webinar', 'ONLINE'],
  ['externi', 'EXTERNAL'],
  ['external', 'EXTERNAL'],
  ['venkovni', 'OUTDOOR'],
  ['venku', 'OUTDOOR'],
  ['outdoor', 'OUTDOOR'],
])

/**
 * The kind a room's name implies, for a room nobody described: the first kind word in it
 * ("Laboratoř 3" is a lab, "Online" online), otherwise a classroom.
 */
export function roomKindOfName(name: string): RoomKind {
  for (const word of fold(name).split(/[^a-z0-9-]+/)) {
    const kind = ROOM_KIND_WORDS.get(word)
    if (kind) return kind
  }
  return 'CLASSROOM'
}

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
 * capability the course lists and a seat for each of `seats` people. With `seats` null
 * (a course with no group size, which the planner splits by the room) seats are no limit.
 */
export function roomMismatch(
  room: RoomFacts,
  needs: SessionNeeds,
  seats: number | null
): RoomMismatch | null {
  if (room.kind === 'ONLINE') return needs.onlineAllowed ? null : { kind: 'ONLINE_NOT_ALLOWED' }
  const missing = needs.capabilities.filter(c => !room.capabilities.includes(c))
  if (missing.length > 0) return { kind: 'MISSING_CAPABILITIES', missing }
  if (seats !== null && room.capacity !== null && room.capacity < seats)
    return { kind: 'TOO_SMALL', capacity: room.capacity }
  return null
}
