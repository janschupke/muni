import type { Capability, RoomKind } from '@muni/domain/enums'
import { roomMismatch, type RoomMismatch } from '@muni/domain/rooms'

import { dbOf, type RepoOptions } from './context'
import type { SessionListItem } from './courses'
import { listSessions } from './sessions'

/** Utilisation is measured over this many days ahead, against 8-hour working days. */
export const UTILISATION_DAYS = 30
const WORKING_HOURS = 8

export interface RoomListItem {
  id: string
  name: string
  kind: RoomKind
  capacity: number | null
  capabilities: Capability[]
  upcomingSessions: number
  /** Booked hours ÷ working hours over the next UTILISATION_DAYS; null for online rooms. */
  utilisation: number | null
}

export interface RoomDetail extends RoomListItem {
  note: string | null
  upcoming: SessionListItem[]
  pastCount: number
  /** Courses with what a session needs set, and whether this room can hold one. */
  courses: { code: string; name: string; groupSize: number | null; mismatch: RoomMismatch | null }[]
}

const roomSelect = {
  id: true,
  name: true,
  kind: true,
  capacity: true,
  note: true,
  capabilities: { select: { capability: true }, orderBy: { capability: 'asc' } },
} as const

/** Weekdays (Mon–Fri) from `from` for `days` days. */
function workingDays(from: Date, days: number): number {
  let count = 0
  for (let i = 0; i < days; i++) {
    const day = new Date(from.getTime() + i * 86_400_000).getUTCDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

export async function listRooms(options?: RepoOptions & { now?: Date }): Promise<RoomListItem[]> {
  const now = options?.now ?? new Date()
  const until = new Date(now.getTime() + UTILISATION_DAYS * 86_400_000)
  const rooms = await dbOf(options).room.findMany({
    select: {
      ...roomSelect,
      sessions: {
        where: { status: 'PLANNED', endsAt: { gte: now } },
        select: { startsAt: true, endsAt: true },
      },
    },
    orderBy: { name: 'asc' },
  })
  const available = workingDays(now, UTILISATION_DAYS) * WORKING_HOURS
  return rooms.map(room => {
    const booked = room.sessions
      .filter(s => s.startsAt < until)
      .reduce((hours, s) => hours + (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000, 0)
    return {
      id: room.id,
      name: room.name,
      kind: room.kind,
      capacity: room.capacity,
      capabilities: room.capabilities.map(c => c.capability),
      upcomingSessions: room.sessions.length,
      utilisation: room.kind === 'ONLINE' ? null : booked / available,
    }
  })
}

export async function getRoom(
  id: string,
  options?: RepoOptions & { now?: Date }
): Promise<RoomDetail | null> {
  const db = dbOf(options)
  const now = options?.now ?? new Date()
  const [room, listed, upcoming, pastCount, courses] = await Promise.all([
    db.room.findUnique({ where: { id }, select: roomSelect }),
    listRooms(options),
    listSessions({ window: 'upcoming', room: id }, options),
    db.courseSession.count({ where: { roomId: id, endsAt: { lt: now } } }),
    db.course.findMany({
      where: { sessionMinutes: { not: null } },
      select: {
        code: true,
        name: true,
        groupSize: true,
        onlineAllowed: true,
        capabilities: { select: { capability: true } },
      },
      orderBy: { code: 'asc' },
    }),
  ])
  const summary = listed.find(r => r.id === id)
  if (!room || !summary) return null
  const facts = {
    id: room.id,
    name: room.name,
    kind: room.kind,
    capacity: room.capacity,
    capabilities: room.capabilities.map(c => c.capability),
  }
  return {
    ...facts,
    note: room.note,
    upcomingSessions: summary.upcomingSessions,
    utilisation: summary.utilisation,
    upcoming,
    pastCount,
    courses: courses.map(c => ({
      code: c.code,
      name: c.name,
      groupSize: c.groupSize,
      mismatch: roomMismatch(
        facts,
        {
          groupSize: c.groupSize,
          onlineAllowed: c.onlineAllowed,
          capabilities: c.capabilities.map(x => x.capability),
        },
        c.groupSize ?? 1
      ),
    })),
  }
}

export async function getRoomForEdit(id: string, options?: RepoOptions) {
  const room = await dbOf(options).room.findUnique({ where: { id }, select: roomSelect })
  return room && { ...room, capabilities: room.capabilities.map(c => c.capability) }
}
