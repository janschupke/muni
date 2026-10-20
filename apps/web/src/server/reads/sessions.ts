import 'server-only'

import {
  getAdvisorInput,
  getSession,
  listCourseOptions,
  listRoomOptions,
  listSessions,
  pageOf,
} from '@muni/db/repositories'
import { itemsToBook, planAssignments } from '@muni/domain/advisor'
import { canWrite } from '@muni/domain/enums'
import * as z from 'zod'

import { SESSION_SORT } from '@/lib/list/list-keys'
import { listQuery } from '@/lib/list/search-params'

import { byExternalId, listInput, read } from './core/define'
import { sessionKeys } from './core/sorters'

/**
 * Upcoming or past sessions, everywhere or in one room or of one course: a page at a time,
 * sorted on the server by the column asked for (soonest first ahead, latest first past).
 */
export const sessionsList = read({
  guard: 'reader',
  input: z.object({
    when: z.literal('past').optional(),
    room: z.string().min(1).max(64).optional(),
    course: z.string().min(1).max(64).optional(),
    ...listInput(SESSION_SORT),
  }),
  load: async ({ when, room: roomId, course: code, ...list }) => {
    const filter = { room: roomId, course: code }
    // Every room, for the filter; the course, for its chip; then the sessions asked for.
    const [rooms, courses, sessions] = await Promise.all([
      listRoomOptions(),
      code ? listCourseOptions() : [],
      listSessions({ ...filter, window: when === 'past' ? 'past' : 'upcoming' }),
    ])
    const room = roomId ? (rooms.find(r => r.id === roomId) ?? null) : null
    const course = code ? (courses.find(c => c.code === code) ?? null) : null
    // A room or course that is not there (archived, mistyped) shows nothing, not everything.
    const unknown =
      (roomId !== undefined && room === null) || (code !== undefined && course === null)
    return {
      sessions: pageOf(unknown ? [] : sessions, listQuery(list, SESSION_SORT), sessionKeys),
      room,
      course: course && { code: course.code, name: course.name },
      rooms: rooms.map(r => ({ id: r.id, name: r.name })),
    }
  },
})

/** The people who need a course booked (not held, lapsed or lapsing soon, nothing booked). */
export interface NeedingPerson {
  externalId: string
  name: string
  status: 'EXPIRED' | 'EXPIRING' | 'MISSING' | 'VALID'
  validUntil: string | null
}

/**
 * Who needs a course booked, most overdue first, as the advisor queues them: the people a
 * session of it can take by hand.
 */
async function needingOf(courseCode: string): Promise<NeedingPerson[]> {
  return itemsToBook(planAssignments(await getAdvisorInput()), { course: courseCode }).map(
    ({ need }) => ({
      externalId: need.employee.externalId,
      name: need.employee.name,
      status: need.status,
      validUntil: need.validUntil,
    })
  )
}

/** A session's page, and for admins the people to book on it (`needingOf`). */
export const session = read({
  guard: 'reader',
  input: byExternalId,
  load: async ({ externalId }, user) => {
    const found = await getSession(externalId)
    if (!found) return null
    return { session: found, needing: canWrite(user.role) ? await needingOf(found.courseCode) : [] }
  },
})

/**
 * The people a session can take by hand, for admins: what a session's opened row in a list
 * reads when it opens, so the list itself stays light.
 */
export const sessionCandidates = read({
  guard: 'admin',
  input: byExternalId,
  load: async ({ externalId }) => {
    const found = await getSession(externalId)
    return found && { needing: await needingOf(found.courseCode) }
  },
})

/**
 * The session form: the courses and rooms it offers, and the session being edited (none for
 * a new one). A session of an archived course keeps it, though it is offered to no other.
 */
export const sessionForm = read({
  guard: 'admin',
  input: byExternalId.partial(),
  load: async ({ externalId }) => {
    const [edited, rooms] = await Promise.all([
      externalId ? getSession(externalId) : null,
      listRoomOptions(),
    ])
    if (externalId && !edited) return null
    const courses = await listCourseOptions({ keep: edited?.courseId })
    return { session: edited, courses, rooms }
  },
})
