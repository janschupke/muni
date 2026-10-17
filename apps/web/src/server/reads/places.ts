import 'server-only'

import {
  getProvider,
  getProviderForEdit,
  getRoom,
  getRoomForEdit,
  getUser,
  listProviders,
  listRooms,
  listUsers,
} from '@muni/db/repositories'
import * as z from 'zod'

import { read } from './define'

// Providers, rooms and users: plain lists, a page each, and the edit forms.

const none = z.object({})
const byId = z.object({ id: z.string().min(1).max(64) })

/** Every provider; prices only for the roles that may see them. */
export const providersList = read({
  guard: 'reader',
  input: none,
  load: (_, user) => listProviders(user.role),
})

/** A provider's page, as the role may see it. */
export const provider = read({
  guard: 'reader',
  input: byId,
  load: ({ id }, user) => getProvider(id, user.role),
})

export const providerForm = read({
  guard: 'admin',
  input: byId,
  load: ({ id }) => getProviderForEdit(id),
})

/** Every room, with its seats, equipment and use. */
export const roomsList = read({ guard: 'reader', input: none, load: () => listRooms() })

/** A room's page: its sessions and the courses it can hold. */
export const room = read({ guard: 'reader', input: byId, load: ({ id }) => getRoom(id) })

export const roomForm = read({ guard: 'admin', input: byId, load: ({ id }) => getRoomForEdit(id) })

/** Everyone who can sign in, for admins. */
export const usersList = read({ guard: 'admin', input: none, load: () => listUsers() })

/** One user, for admins; `self` when it is the admin looking. */
export const user = read({
  guard: 'admin',
  input: byId,
  load: async ({ id }, admin) => {
    const found = await getUser(id)
    return found && { user: found, self: found.id === admin.id }
  },
})
