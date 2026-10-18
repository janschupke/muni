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
  /** Set where the room may be archived (a past session's): shown muted, not linked. */
  archived?: boolean
}

export interface RoomFacts extends RoomRef {
  /** Seats; null = no fixed limit. */
  capacity: number | null
  capabilities: readonly Capability[]
}

/** What one session of a course needs from its room. */
/**
 * What a session of a course needs from its room, as the course holds it: its seats (the
 * default; a session may open its own number), whether it may be held online, and the
 * equipment.
 */
export interface SessionNeeds {
  seats: number | null
  onlineAllowed: boolean
  capabilities: readonly Capability[]
}

export type RoomMismatch =
  | { kind: 'ONLINE_NOT_ALLOWED' }
  | { kind: 'TOO_SMALL'; needed: number; capacity: number }
  | { kind: 'MISSING_CAPABILITIES'; missing: Capability[] }

/**
 * What a session of a course needs from a room next to what the room provides, one measure
 * at a time, and the first reason it cannot hold it (null when it can).
 *
 * An online room is judged only on whether the course may be held online: it has no seats
 * to run out of and no equipment to lack. A physical room needs every capability the course
 * lists and a seat for each of `seats` people. With `seats` null (a course with no group
 * size, which the planner splits by the room) seats are no limit.
 */
export type RoomFit =
  | { online: true; allowed: boolean; mismatch: RoomMismatch | null }
  | {
      online: false
      seats: { needed: number | null; provided: number | null; ok: boolean }
      equipment: { needed: Capability[]; missing: Capability[]; ok: boolean }
      mismatch: RoomMismatch | null
    }

export function roomFit(room: RoomFacts, needs: SessionNeeds, seats: number | null): RoomFit {
  if (room.kind === 'ONLINE')
    return {
      online: true,
      allowed: needs.onlineAllowed,
      mismatch: needs.onlineAllowed ? null : { kind: 'ONLINE_NOT_ALLOWED' },
    }
  const missing = needs.capabilities.filter(c => !room.capabilities.includes(c))
  const tooSmall: RoomMismatch | null =
    seats !== null && room.capacity !== null && room.capacity < seats
      ? { kind: 'TOO_SMALL', needed: seats, capacity: room.capacity }
      : null
  return {
    online: false,
    seats: { needed: seats, provided: room.capacity, ok: tooSmall === null },
    equipment: { needed: [...needs.capabilities], missing, ok: missing.length === 0 },
    mismatch: missing.length > 0 ? { kind: 'MISSING_CAPABILITIES', missing } : tooSmall,
  }
}

/** Why a room cannot hold a session of the course, or null when it can (see `roomFit`). */
export function roomMismatch(
  room: RoomFacts,
  needs: SessionNeeds,
  seats: number | null
): RoomMismatch | null {
  return roomFit(room, needs, seats).mismatch
}
