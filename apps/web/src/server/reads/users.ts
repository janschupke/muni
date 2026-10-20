import 'server-only'

import { getUser, listUsers, pageOf } from '@muni/db/repositories'
import * as z from 'zod'

import { USER_SORT } from '@/lib/list/list-keys'
import { listQuery } from '@/lib/list/search-params'

import { byId, listInput, read } from './core/define'
import { userKeys } from './core/sorters'

/** Everyone who can sign in, for admins, a page at a time; admins first without a sort. */
export const usersList = read({
  guard: 'admin',
  input: z.object(listInput(USER_SORT)),
  load: async input => pageOf(await listUsers(), listQuery(input, USER_SORT), userKeys),
})

/** One user, for admins; `self` when it is the admin looking. */
export const user = read({
  guard: 'admin',
  input: byId,
  load: async ({ id }, admin) => {
    const found = await getUser(id)
    return found && { user: found, self: found.id === admin.id }
  },
})
