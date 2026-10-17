import 'server-only'

import { getArchivedRecord, listArchived } from '@muni/db/repositories'
import { ARCHIVABLE } from '@muni/domain/archive'
import * as z from 'zod'

import { read } from './define'

const kind = z.enum(ARCHIVABLE)

/** The archived records of one kind, for admins. */
export const archivedList = read({
  guard: 'admin',
  input: z.object({ kind }),
  load: ({ kind }, user) => listArchived(kind, user.role),
})

/** One archived record with its real details, for admins. */
export const archivedRecord = read({
  guard: 'admin',
  input: z.object({ kind, id: z.string().min(1).max(64) }),
  load: ({ kind, id }, user) => getArchivedRecord(kind, id, user.role),
})
