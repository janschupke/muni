import 'server-only'

import {
  getSession,
  listCourseOptions,
  listEmployeeOptions,
  listRoomOptions,
  listSessions,
  pageSessions,
} from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import * as z from 'zod'

import { byExternalId, read } from './define'

/** Past sessions per page of the list. */
const PAST_PAGE_SIZE = 25

/**
 * Upcoming or past sessions, everywhere or in one room or of one course. The past grows
 * without end, so it comes a page at a time; what is ahead comes whole.
 */
export const sessionsList = read({
  guard: 'reader',
  input: z.object({
    when: z.literal('past').optional(),
    room: z.string().min(1).max(64).optional(),
    course: z.string().min(1).max(64).optional(),
    page: z.coerce.number().int().min(1).optional(),
  }),
  load: async ({ when, room: roomId, course: code, page }) => {
    const filter = { room: roomId, course: code }
    // Every room, for the filter; the course, for its chip; then the sessions asked for.
    const [rooms, courses, past, upcoming] = await Promise.all([
      listRoomOptions(),
      code ? listCourseOptions() : [],
      when === 'past'
        ? pageSessions({ ...filter, window: 'past', page, pageSize: PAST_PAGE_SIZE })
        : null,
      when === 'past' ? null : listSessions({ ...filter, window: 'upcoming' }),
    ])
    const room = roomId ? (rooms.find(r => r.id === roomId) ?? null) : null
    const course = code ? (courses.find(c => c.code === code) ?? null) : null
    // A room or course that is not there (archived, mistyped) shows nothing, not everything.
    const unknown =
      (roomId !== undefined && room === null) || (code !== undefined && course === null)
    return {
      sessions: unknown ? [] : (past?.items ?? upcoming ?? []),
      paging: past && { page: past.page, pageCount: past.pageCount, total: past.total },
      room,
      course: course && { code: course.code, name: course.name },
      rooms: rooms.map(r => ({ id: r.id, name: r.name })),
    }
  },
})

/** A session's page, and for admins the people who can be booked on it. */
export const session = read({
  guard: 'reader',
  input: byExternalId,
  load: async ({ externalId }, user) => {
    const [found, people] = await Promise.all([
      getSession(externalId),
      canWrite(user.role) ? listEmployeeOptions() : [],
    ])
    return found && { session: found, people }
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
