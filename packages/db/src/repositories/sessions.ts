import type { RoomRef } from '@muni/domain/rooms'

import type { SessionListItem } from './courses'
import { dbOf, type RepoOptions } from './context'

/** Select this to read a session's room as a `RoomRef`. */
export const roomRefSelect = { id: true, name: true, kind: true } as const

export type SessionWindow = 'upcoming' | 'past'

/** What every session read selects: the course and the named bookings. */
export const sessionInclude = {
  course: { select: { code: true, name: true } },
  room: { select: roomRefSelect },
  assignments: {
    select: { employee: { select: { externalId: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  },
} as const

type SessionRow = {
  externalId: string
  startsAt: Date
  endsAt: Date
  room: RoomRef
  capacity: number
  unnamedBookings: number
  pricePerPerson: { toString(): string } | null
  status: SessionListItem['status']
  course: { code: string; name: string }
  assignments: { employee: { externalId: string; firstName: string; lastName: string } }[]
}

/** The booked total is derived: anonymous seats plus named assignments. */
export function toSessionItem(s: SessionRow): SessionListItem {
  return {
    externalId: s.externalId,
    courseCode: s.course.code,
    courseName: s.course.name,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    room: s.room,
    capacity: s.capacity,
    unnamedBookings: s.unnamedBookings,
    assigned: s.assignments.map(a => ({
      externalId: a.employee.externalId,
      name: `${a.employee.lastName} ${a.employee.firstName}`,
    })),
    bookedCount: s.unnamedBookings + s.assignments.length,
    pricePerPerson: s.pricePerPerson === null ? null : Number(s.pricePerPerson.toString()),
    status: s.status,
  }
}

export async function listSessions(
  {
    window = 'upcoming',
    course,
    room,
    limit,
  }: { window?: SessionWindow; course?: string; room?: string; limit?: number } = {},
  options?: RepoOptions
): Promise<SessionListItem[]> {
  const now = new Date()
  const sessions = await dbOf(options).courseSession.findMany({
    where: {
      ...(window === 'upcoming' ? { endsAt: { gte: now } } : { endsAt: { lt: now } }),
      ...(course && { course: { code: course } }),
      ...(room && { roomId: room }),
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
  const session = await dbOf(options).courseSession.findUnique({
    where: { externalId },
    include: sessionInclude,
  })
  return session ? toSessionItem(session) : null
}
