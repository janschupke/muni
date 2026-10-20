import {
  type RoomFacts,
  type RoomMismatch,
  roomMismatch,
  type SessionNeeds,
} from '@muni/domain/rooms'

import type { Tx } from '../../client'
import { needsOf, needsSelect, roomFactsOf, roomFactsSelect } from './fit-selects'
import { upcomingSessionWhere } from './sessions'

// Whether planned sessions fit their rooms, shared by the session form and by the room and
// course forms: a room or a course cannot change so that sessions already planned in it (or
// of it) stop fitting.

/** Session writes take turns, so two cannot both find a room free and both take it. */
export const lockSessionWrites = (tx: Tx) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('course_sessions'))`

export { needsOf, needsSelect, roomFactsOf, roomFactsSelect } from './fit-selects'

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
