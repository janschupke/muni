import 'server-only'

import { getDb } from '@muni/db/client'
import { loadReferenceSnapshot } from '@muni/db/reference'
import { todayIn } from '@muni/utils/dates'

import { none, read } from './core/define'

/** What an import is checked against: the records there are now, and today. */
export const importReference = read({
  guard: 'admin',
  input: none,
  load: async () => ({ reference: await loadReferenceSnapshot(getDb()), today: todayIn() }),
})
