import type { RoomKind } from '@muni/domain/enums'
import type { RoomRef } from '@muni/domain/rooms'

import { ACTIVE, isArchived, personSelect, toPersonRef } from './archive'
import { dbOf, type RepoOptions, toAmount } from './context'
import type { SessionListItem } from './courses'

/**
 * What "upcoming" means wherever sessions are shown or counted: planned and not yet ended,
 * so a session under way still counts. (Taking a booking is stricter: a session that has
 * started takes nobody new; see assignments.)
 */
export const upcomingSessionWhere = (now: Date) => ({
  ...ACTIVE,
  status: 'PLANNED' as const,
  endsAt: { gte: now },
})

/** The same test in memory. */
export const isUpcoming = (s: { status: string; endsAt: Date }, now: Date) =>
  s.status === 'PLANNED' && s.endsAt >= now

/** Select this to read a session's room as a `RoomRef` (through `toRoomRef`). */
export const roomRefSelect = { id: true, name: true, kind: true, archivedAt: true } as const

export const toRoomRef = (room: {
  id: string
  name: string
  kind: RoomKind
  archivedAt: Date | null
}): RoomRef => ({ id: room.id, name: room.name, kind: room.kind, archived: isArchived(room) })

export type SessionWindow = 'upcoming' | 'past'

/** What every session read selects: the course and the named bookings. */
export const sessionInclude = {
  course: { select: { code: true, name: true, archivedAt: true } },
  room: { select: roomRefSelect },
  assignments: { select: { employee: { select: personSelect } }, orderBy: { createdAt: 'asc' } },
} as const

interface SessionRow {
  id: string
  externalId: string
  startsAt: Date
  endsAt: Date
  room: { id: string; name: string; kind: RoomKind; archivedAt: Date | null }
  capacity: number
  unnamedBookings: number
  pricePerPerson: { toString(): string } | null
  status: SessionListItem['status']
  course: { code: string; name: string; archivedAt: Date | null }
  assignments: {
    employee: {
      id: string
      externalId: string
      firstName: string
      lastName: string
      archivedAt: Date | null
    }
  }[]
}

/** The booked total is derived: anonymous seats plus named assignments. */
export function toSessionItem(s: SessionRow): SessionListItem {
  return {
    id: s.id,
    externalId: s.externalId,
    courseCode: s.course.code,
    courseName: s.course.name,
    courseArchived: isArchived(s.course),
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    room: toRoomRef(s.room),
    capacity: s.capacity,
    unnamedBookings: s.unnamedBookings,
    assigned: s.assignments.map(a => toPersonRef(a.employee)),
    bookedCount: s.unnamedBookings + s.assignments.length,
    pricePerPerson: toAmount(s.pricePerPerson),
    status: s.status,
  }
}

export async function listSessions(
  {
    window = 'upcoming',
    course,
    room,
    status,
    limit,
  }: {
    window?: SessionWindow | undefined
    course?: string | undefined
    room?: string | undefined
    /** Only sessions in this state; both by default (the lists show cancelled ones marked). */
    status?: SessionListItem['status'] | undefined
    limit?: number | undefined
  } = {},
  options?: RepoOptions & { now?: Date }
): Promise<SessionListItem[]> {
  const now = options?.now ?? new Date()
  const sessions = await dbOf(options).courseSession.findMany({
    where: {
      ...ACTIVE,
      ...(window === 'upcoming' ? { endsAt: { gte: now } } : { endsAt: { lt: now } }),
      ...(course && { course: { code: course, ...ACTIVE } }),
      ...(room && { roomId: room }),
      ...(status && { status }),
    },
    include: sessionInclude,
    orderBy: { startsAt: window === 'upcoming' ? 'asc' : 'desc' },
    ...(limit && { take: limit }),
  })
  return sessions.map(toSessionItem)
}

export async function getSession(
  externalId: string,
  options?: RepoOptions
): Promise<SessionListItem | null> {
  const session = await dbOf(options).courseSession.findFirst({
    where: { externalId, ...ACTIVE },
    include: sessionInclude,
  })
  return session ? toSessionItem(session) : null
}
