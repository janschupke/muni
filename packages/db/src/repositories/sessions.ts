import type { SessionListItem } from './courses'
import { dbOf, type RepoOptions } from './context'

export type SessionWindow = 'upcoming' | 'past'

type SessionRow = {
  externalId: string
  startsAt: Date
  endsAt: Date
  location: string
  isOnline: boolean
  capacity: number
  bookedCount: number
  pricePerPerson: { toString(): string } | null
  status: SessionListItem['status']
  course: { code: string; name: string }
}

function toSessionItem(s: SessionRow): SessionListItem {
  return {
    externalId: s.externalId,
    courseCode: s.course.code,
    courseName: s.course.name,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    location: s.location,
    isOnline: s.isOnline,
    capacity: s.capacity,
    bookedCount: s.bookedCount,
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
    include: { course: { select: { code: true, name: true } } },
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
    include: { course: { select: { code: true, name: true } } },
  })
  return session ? toSessionItem(session) : null
}
