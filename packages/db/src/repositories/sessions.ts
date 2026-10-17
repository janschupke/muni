import type { RoomKind } from '@muni/domain/enums'
import type { RoomFacts, RoomRef } from '@muni/domain/rooms'

import { ACTIVE, isArchived, personSelect, toPersonRef } from './archive'
import { dbOf, type RepoOptions, toAmount } from './context'
import type { SessionListItem } from './courses'
import { needsOf, needsSelect } from './fit-selects'

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

/** What a list of sessions shows of each: when, where, and how full. */
export const sessionSummarySelect = {
  externalId: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  unnamedBookings: true,
  room: { select: roomRefSelect },
  _count: { select: { assignments: true } },
} as const

export interface SessionSummary {
  externalId: string
  startsAt: string
  endsAt: string
  room: RoomRef
  capacity: number
  /** Unnamed plus named bookings. */
  bookedCount: number
}

export const toSessionSummary = (s: {
  externalId: string
  startsAt: Date
  endsAt: Date
  capacity: number
  unnamedBookings: number
  room: Parameters<typeof toRoomRef>[0]
  _count: { assignments: number }
}): SessionSummary => ({
  externalId: s.externalId,
  startsAt: s.startsAt.toISOString(),
  endsAt: s.endsAt.toISOString(),
  room: toRoomRef(s.room),
  capacity: s.capacity,
  bookedCount: s.unnamedBookings + s._count.assignments,
})

/**
 * What every session read selects: the course and what its sessions need, the room with its
 * seats and equipment, and the named bookings with who they are and how they were made.
 */
export const sessionInclude = {
  course: { select: { id: true, code: true, name: true, archivedAt: true, ...needsSelect } },
  room: {
    select: {
      ...roomRefSelect,
      capacity: true,
      capabilities: { select: { capability: true }, orderBy: { capability: 'asc' } },
    },
  },
  assignments: {
    select: {
      source: true,
      createdAt: true,
      employee: {
        select: {
          ...personSelect,
          department: { select: { id: true, name: true } },
          position: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const

interface SessionRow {
  id: string
  externalId: string
  startsAt: Date
  endsAt: Date
  room: {
    id: string
    name: string
    kind: RoomKind
    archivedAt: Date | null
    capacity: number | null
    capabilities: { capability: RoomFacts['capabilities'][number] }[]
  }
  capacity: number
  unnamedBookings: number
  pricePerPerson: { toString(): string } | null
  status: SessionListItem['status']
  course: { id: string; code: string; name: string; archivedAt: Date | null } & Parameters<
    typeof needsOf
  >[0]
  assignments: {
    source: 'ADVISOR' | 'MANUAL'
    createdAt: Date
    employee: {
      id: string
      externalId: string
      firstName: string
      lastName: string
      archivedAt: Date | null
      archiveTag: string | null
      department: { id: string; name: string } | null
      position: { id: string; name: string } | null
    }
  }[]
}

/** The booked total is derived: anonymous seats plus named assignments. */
export function toSessionItem(s: SessionRow): SessionListItem {
  return {
    id: s.id,
    externalId: s.externalId,
    courseId: s.course.id,
    courseCode: s.course.code,
    courseName: s.course.name,
    courseArchived: isArchived(s.course),
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    room: toRoomRef(s.room),
    roomSeats: s.room.capacity,
    roomCapabilities: s.room.capabilities.map(c => c.capability),
    needs: needsOf(s.course),
    capacity: s.capacity,
    unnamedBookings: s.unnamedBookings,
    // An archived person shows only as their tag: nothing else about them.
    bookings: s.assignments.map(a => {
      const archived = isArchived(a.employee)
      return {
        person: toPersonRef(a.employee),
        departmentId: archived ? null : (a.employee.department?.id ?? null),
        department: archived ? null : (a.employee.department?.name ?? null),
        positionId: archived ? null : (a.employee.position?.id ?? null),
        position: archived ? null : (a.employee.position?.name ?? null),
        source: a.source,
        bookedAt: a.createdAt.toISOString(),
      }
    }),
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
