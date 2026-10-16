import type { PlannerInput } from '@muni/domain/planner'
import { toZonedParts } from '@muni/utils/dates'

import { dbOf, type RepoOptions } from './context'

/** The most frequent value; the smallest one on a tie; null for none. */
function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
}

/**
 * What the session planner needs besides the advisor's plan: each course's session needs,
 * usual start and rooms used, every room, and the planned sessions that occupy rooms.
 */
export async function getPlannerInput(
  options?: RepoOptions & { now?: Date }
): Promise<Omit<PlannerInput, 'asOf' | 'items'>> {
  const db = dbOf(options)
  const now = options?.now ?? new Date()
  const [courses, rooms, sessions] = await Promise.all([
    db.course.findMany({
      select: {
        code: true,
        name: true,
        sessionMinutes: true,
        groupSize: true,
        onlineAllowed: true,
        capabilities: { select: { capability: true } },
        sessions: { where: { status: 'PLANNED' }, select: { startsAt: true, roomId: true } },
      },
      orderBy: { code: 'asc' },
    }),
    db.room.findMany({
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
      where: { status: 'PLANNED', endsAt: { gte: now } },
      select: { roomId: true, startsAt: true, endsAt: true },
    }),
  ])
  return {
    courses: courses.map(c => ({
      code: c.code,
      name: c.name,
      sessionMinutes: c.sessionMinutes,
      groupSize: c.groupSize,
      onlineAllowed: c.onlineAllowed,
      capabilities: c.capabilities.map(x => x.capability),
      usualStart: mostCommon(c.sessions.map(s => toZonedParts(s.startsAt).time)),
      heldIn: [...new Set(c.sessions.map(s => s.roomId))],
    })),
    rooms: rooms.map(r => ({ ...r, capabilities: r.capabilities.map(x => x.capability) })),
    sessions: sessions.map(s => ({
      roomId: s.roomId,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
    })),
  }
}
