import 'server-only'

import { getRoom, getRoomForEdit, listRooms, pageOf } from '@muni/db/repositories'
import * as z from 'zod'

import { ROOM_SORT, SESSION_SORT } from '@/lib/list/list-keys'
import { listQuery } from '@/lib/list/search-params'

import { byId, listInput, read } from './core/define'
import { roomKeys, sessionKeys } from './core/sorters'

/** Rooms, a page at a time, with their seats, equipment and use. */
export const roomsList = read({
  guard: 'reader',
  input: z.object(listInput(ROOM_SORT)),
  load: async input => pageOf(await listRooms(), listQuery(input, ROOM_SORT), roomKeys),
})

/**
 * A room's page: a page of its sessions ahead (`sessionsSort`…), sorted on the server, and
 * the courses it can hold.
 */
export const room = read({
  guard: 'reader',
  input: byId.extend(listInput(SESSION_SORT, 'sessions')),
  load: async ({ id, ...list }) => {
    const found = await getRoom(id)
    return (
      found && {
        ...found,
        upcoming: pageOf(found.upcoming, listQuery(list, SESSION_SORT, 'sessions'), sessionKeys),
      }
    )
  },
})

/** The room form: the room (none for a new one). */
export const roomForm = read({
  guard: 'admin',
  input: byId.partial(),
  load: async ({ id }) => {
    const room = id ? await getRoomForEdit(id) : null
    if (id && !room) return null
    return { room }
  },
})
