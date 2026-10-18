import type { RoomFacts, SessionNeeds } from '@muni/domain/rooms'

// How a course's needs and a room's facts are read, on their own so the session reads can
// select them without importing the session-fit checks (which import the session reads).

/** Select this on a course to read what its sessions are (`needsOf`). */
export const needsSelect = {
  sessionMinutes: true,
  seats: true,
  onlineAllowed: true,
  capabilities: { select: { capability: true } },
} as const

/** What every session of the course is, as the course holds it: its length and its needs. */
export const needsOf = (course: {
  sessionMinutes: number | null
  seats: number | null
  onlineAllowed: boolean
  capabilities: { capability: RoomFacts['capabilities'][number] }[]
}): SessionNeeds & { sessionMinutes: number | null } => ({
  sessionMinutes: course.sessionMinutes,
  seats: course.seats,
  onlineAllowed: course.onlineAllowed,
  capabilities: course.capabilities.map(c => c.capability),
})

/** Select this on a room to read it as `RoomFacts` (`roomFactsOf`). */
export const roomFactsSelect = {
  id: true,
  name: true,
  kind: true,
  capacity: true,
  capabilities: { select: { capability: true }, orderBy: { capability: 'asc' } },
} as const

export const roomFactsOf = (room: {
  id: string
  name: string
  kind: RoomFacts['kind']
  capacity: number | null
  capabilities: { capability: RoomFacts['capabilities'][number] }[]
}): RoomFacts => ({ ...room, capabilities: room.capabilities.map(c => c.capability) })
