import 'server-only'

import { getArchivedRecord, listArchived, pageOf } from '@muni/db/repositories'
import { ARCHIVABLE } from '@muni/domain/archive'
import * as z from 'zod'

import { ARCHIVED_SORT } from '@/lib/list/list-keys'
import { listQuery } from '@/lib/list/search-params'

import { listInput, read } from './core/define'
import { archivedKeys } from './core/sorters'

const kind = z.enum(ARCHIVABLE)

/**
 * The archived records of one kind, for admins: a page at a time, most recently archived
 * first unless sorted. People sort by their tag (`~1a2b`), the one name the list shows.
 */
export const archivedList = read({
  guard: 'admin',
  input: z.object({ kind, ...listInput(ARCHIVED_SORT) }),
  load: async ({ kind, ...list }, user) =>
    pageOf(await listArchived(kind, user.role), listQuery(list, ARCHIVED_SORT), archivedKeys),
})

/** One archived record with its real details, for admins. */
export const archivedRecord = read({
  guard: 'admin',
  input: z.object({ kind, id: z.string().min(1).max(64) }),
  load: ({ kind, id }, user) => getArchivedRecord(kind, id, user.role),
})
