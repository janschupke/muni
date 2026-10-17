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

import { byExternalId, read } from './define'

/** Upcoming or past sessions, everywhere or in one room. */
export const sessionsList = read({
  guard: 'reader',
  input: z.object({
    when: z.literal('past').optional(),
    room: z.string().min(1).max(64).optional(),
  }),
  load: async ({ when, room: roomId }) => {
    // Every room, for the filter; the sessions in the one asked for, if it is one.
    const [rooms, sessions] = await Promise.all([
      listRoomOptions(),
      listSessions({ window: when ?? 'upcoming', room: roomId }),
    ])
    const room = roomId ? (rooms.find(r => r.id === roomId) ?? null) : null
    return {
      sessions: roomId && !room ? [] : sessions,
      room,
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
