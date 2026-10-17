import { effectiveNeeds, type RoomFacts } from '@muni/domain/rooms'

// How a course's needs and a room's facts are read, on their own so the session reads can
// select them without importing the session-fit checks (which import the session reads).

/** Select this on a course to read what its sessions need (`needsOf`). */
export const needsSelect = {
  sessionMinutes: true,
  groupSize: true,
  onlineAllowed: true,
  sessionMinutesOverride: true,
  groupSizeOverride: true,
  onlineAllowedOverride: true,
  capabilities: { select: { capability: true } },
} as const

interface StoredNeedsRow {
  sessionMinutes: number | null
  groupSize: number | null
  onlineAllowed: boolean
  sessionMinutesOverride: number | null
  groupSizeOverride: number | null
  onlineAllowedOverride: boolean | null
  capabilities: { capability: RoomFacts['capabilities'][number] }[]
}

/** What a session of the course needs: the app's overrides, else what imports derived. */
export const needsOf = (course: StoredNeedsRow) =>
  effectiveNeeds({ ...course, capabilities: course.capabilities.map(c => c.capability) })

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
