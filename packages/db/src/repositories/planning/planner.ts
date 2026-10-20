import type { PlannerInput } from '@muni/domain/planner'
import { mostCommon } from '@muni/utils/collections'
import { toZonedParts } from '@muni/utils/dates'

import { ACTIVE } from '../archive/archive'
import { offeringsInclude, toOffering } from '../catalog/offerings'
import { dbOf, type RepoOptions } from '../core/context'
import { needsOf, needsSelect } from '../scheduling/session-fit'
import { upcomingSessionWhere } from '../scheduling/sessions'

/**
 * What the session planner needs besides the advisor's plan: each course's session needs,
 * usual start, rooms used and offerings, every room, and the planned sessions that occupy rooms.
 */
export async function getPlannerInput(
  options?: RepoOptions & { now?: Date }
): Promise<Omit<PlannerInput, 'asOf' | 'items'>> {
  const db = dbOf(options)
  const now = options?.now ?? new Date()
  const [courses, rooms, sessions] = await Promise.all([
    db.course.findMany({
      where: ACTIVE,
      select: {
        id: true,
        code: true,
        name: true,
        ...needsSelect,
        offerings: offeringsInclude,
        sessions: {
          where: { ...ACTIVE, status: 'PLANNED', room: ACTIVE },
          select: { startsAt: true, roomId: true },
        },
      },
      orderBy: { code: 'asc' },
    }),
    db.room.findMany({
      where: ACTIVE,
      select: {
        id: true,
        name: true,
        kind: true,
        capacity: true,
        capabilities: { select: { capability: true } },
      },
      orderBy: { name: 'asc' },
    }),
    db.courseSession.findMany({
      where: upcomingSessionWhere(now),
      select: { roomId: true, startsAt: true, endsAt: true },
    }),
  ])
  return {
    courses: courses.map(c => ({
      id: c.id,
      code: c.code,
      name: c.name,
      ...needsOf(c),
      // The most frequent start, the earliest on a tie.
      usualStart:
        mostCommon(
          c.sessions.map(s => toZonedParts(s.startsAt).time),
          (a, b) => a.localeCompare(b)
        ) ?? null,
      heldIn: [...new Set(c.sessions.map(s => s.roomId))],
      offerings: c.offerings.map(toOffering),
    })),
    rooms: rooms.map(r => ({ ...r, capabilities: r.capabilities.map(x => x.capability) })),
    sessions: sessions.map(s => ({
      roomId: s.roomId,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
    })),
  }
}
