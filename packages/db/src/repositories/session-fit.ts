import {
  effectiveNeeds,
  type RoomFacts,
  type RoomMismatch,
  roomMismatch,
  type SessionNeeds,
} from '@muni/domain/rooms'

import type { Tx } from '../client'
import { upcomingSessionWhere } from './sessions'

// Whether planned sessions fit their rooms, shared by the session form and by the room and
// course forms: a room or a course cannot change so that sessions already planned in it (or
// of it) stop fitting.

/** Session writes take turns, so two cannot both find a room free and both take it. */
export const lockSessions = (tx: Tx) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('course_sessions'))`

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

/**
 * Upcoming planned sessions in the room (or of the course) that fit today and would not after
 * the change, with the reasons they would not. Sessions that already do not fit (an import
 * may have planned them so) are left alone: the change does not make them worse.
 */
export async function newlyUnfit(
  tx: Tx,
  change: { roomId: string; room: RoomFacts } | { courseId: string; needs: SessionNeeds },
  now: Date = new Date()
): Promise<RoomMismatch[]> {
  const sessions = await tx.courseSession.findMany({
    where: {
      ...upcomingSessionWhere(now),
      ...('roomId' in change ? { roomId: change.roomId } : { courseId: change.courseId }),
    },
    select: {
      capacity: true,
      room: { select: roomFactsSelect },
      course: { select: needsSelect },
    },
  })
  return sessions.flatMap(s => {
    const room = roomFactsOf(s.room)
    const needs = needsOf(s.course)
    if (roomMismatch(room, needs, s.capacity) !== null) return []
    const after = roomMismatch(
      'room' in change ? change.room : room,
      'needs' in change ? change.needs : needs,
      s.capacity
    )
    return after ? [after] : []
  })
}
