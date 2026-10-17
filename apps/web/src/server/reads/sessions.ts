import 'server-only'

import {
  getSession,
  listCourseOptions,
  listEmployeeOptions,
  listRoomOptions,
  listSessions,
} from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import * as z from 'zod'

import { read } from './define'

/** Upcoming or past sessions, everywhere or in one room. */
export const sessionsList = read({
  guard: 'reader',
  input: z.object({
    when: z.literal('past').optional(),
    room: z.string().min(1).max(64).optional(),
  }),
  load: async ({ when, room: roomId }) => {
    const room = roomId ? ((await listRoomOptions()).find(r => r.id === roomId) ?? null) : null
    const sessions = await listSessions({ window: when ?? 'upcoming', room: room?.id })
    return { sessions, room }
  },
})

const byExternalId = z.object({ externalId: z.string().min(1).max(32) })

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
    const [edited, courses, rooms] = await Promise.all([
      externalId ? getSession(externalId) : null,
      listCourseOptions(),
      listRoomOptions(),
    ])
    if (externalId && !edited) return null
    if (!edited || courses.some(c => c.id === edited.courseId))
      return { session: edited, courses, rooms }
    const own = {
      id: edited.courseId,
      code: edited.courseCode,
      name: edited.courseName,
      validityMonths: null,
      needs: { sessionMinutes: null, groupSize: null, onlineAllowed: true, capabilities: [] },
    }
    return { session: edited, courses: [...courses, own], rooms }
  },
})
