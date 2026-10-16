import type { SessionListItem } from './courses'
import { dbOf, type RepoOptions } from './context'

export type SessionWindow = 'upcoming' | 'past'

/** What every session read selects: the course and the named bookings. */
export const sessionInclude = {
  course: { select: { code: true, name: true } },
  assignments: {
    select: { employee: { select: { externalId: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  },
} as const

type SessionRow = {
  externalId: string
  startsAt: Date
  endsAt: Date
  location: string
  isOnline: boolean
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
    location: s.location,
    isOnline: s.isOnline,
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
    limit,
  }: { window?: SessionWindow; course?: string; limit?: number } = {},
  options?: RepoOptions
): Promise<SessionListItem[]> {
  const now = new Date()
  const sessions = await dbOf(options).courseSession.findMany({
    where: {
      ...(window === 'upcoming' ? { endsAt: { gte: now } } : { endsAt: { lt: now } }),
      ...(course && { course: { code: course } }),
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
