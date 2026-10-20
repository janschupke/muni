import type { RoomKind } from '@muni/domain/enums'
import type { RoomFacts, RoomRef } from '@muni/domain/rooms'

import type { Prisma } from '../../generated/prisma/client'
import { ACTIVE, isArchived, personSelect, toPersonRef } from '../archive/archive'
import type { SessionListItem } from '../catalog/courses'
import { dbOf, type RepoOptions, toAmount } from '../core/context'
import { needsOf, needsSelect } from './fit-selects'

/** Not archived and not yet ended, whatever its status: a cancelled one ahead included. */
export const sessionAheadWhere = (now: Date) => ({ ...ACTIVE, endsAt: { gte: now } })

/**
 * What "upcoming" means wherever sessions are shown or counted: planned and not yet ended,
 * so a session under way still counts. (Taking a booking is stricter: `bookableSessionWhere`.)
 */
export const upcomingSessionWhere = (now: Date) => ({
  ...sessionAheadWhere(now),
  status: 'PLANNED' as const,
})

/** What a booking can still be taken on: planned and not yet started. */
export const bookableSessionWhere = (now: Date) => ({
  ...ACTIVE,
  status: 'PLANNED' as const,
  startsAt: { gt: now },
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
  provider: { select: { id: true, name: true, archivedAt: true } },
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
  provider: { id: string; name: string; archivedAt: Date | null }
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
    provider: { id: s.provider.id, name: s.provider.name, archived: isArchived(s.provider) },
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

/** Which sessions a list shows: the window, and optionally one course, room or state. */
export interface SessionFilter {
  window?: SessionWindow | undefined
  /** A course's code. */
  course?: string | undefined
  room?: string | undefined
  /** A provider's ID: the sessions it holds. */
  provider?: string | undefined
  /** Only sessions in this state; both by default (the lists show cancelled ones marked). */
  status?: SessionListItem['status'] | undefined
}

function sessionWhere(
  { window = 'upcoming', course, room, provider, status }: SessionFilter,
  now: Date
): Prisma.CourseSessionWhereInput {
  return {
    ...ACTIVE,
    ...(window === 'upcoming' ? sessionAheadWhere(now) : { endsAt: { lt: now } }),
    ...(course && { course: { code: course, ...ACTIVE } }),
    ...(room && { roomId: room }),
    ...(provider && { providerId: provider }),
    ...(status && { status }),
  }
}

/** Upcoming soonest first, past newest first; sessions at the same time by ID. */
const sessionOrder = (window: SessionWindow | undefined) => [
  { startsAt: window === 'past' ? ('desc' as const) : ('asc' as const) },
  { externalId: 'asc' as const },
]

export async function listSessions(
  { limit, ...filter }: SessionFilter & { limit?: number | undefined } = {},
  options?: RepoOptions & { now?: Date }
): Promise<SessionListItem[]> {
  const sessions = await dbOf(options).courseSession.findMany({
    where: sessionWhere(filter, options?.now ?? new Date()),
    include: sessionInclude,
    orderBy: sessionOrder(filter.window),
    ...(limit && { take: limit }),
  })
  return sessions.map(toSessionItem)
}

/** How many sessions the filter matches (a course page counts its past ones). */
export function countSessions(
  filter: SessionFilter,
  options?: RepoOptions & { now?: Date }
): Promise<number> {
  return dbOf(options).courseSession.count({
    where: sessionWhere(filter, options?.now ?? new Date()),
  })
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
