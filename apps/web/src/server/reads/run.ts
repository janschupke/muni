import 'server-only'

import { canWrite } from '@muni/domain/enums'

import { readSearch } from '@/lib/query/fetch-read'
import type { SessionUser } from '@/server/auth'

import { type ReadInput, type ReadName, type ReadOutput, reads } from './registry'

/** What running a read for a user came to. */
export type ReadAnswer<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'not_found' }
  /** Not this user's to read (an admin read), or an address that does not parse. */
  | { kind: 'forbidden' | 'invalid' }

/**
 * Runs one read for the signed-in user, from the API route or a page's prefetch alike. The
 * input goes through the same query string the browser sends (`readSearch`), so it parses
 * exactly as the browser's request would.
 */
export async function runRead<N extends ReadName>(
  name: N,
  input: ReadInput<N> | Record<string, unknown>,
  user: SessionUser
): Promise<ReadAnswer<ReadOutput<N>>> {
  const definition = reads[name]
  if (definition.guard === 'admin' && !canWrite(user.role)) return { kind: 'forbidden' }
  const search = new URLSearchParams(readSearch(input))
  const parsed = definition.input.safeParse(Object.fromEntries(search))
  if (!parsed.success) return { kind: 'invalid' }
  // Each read parses its own input above; the union of loads takes it as it parsed.
  const data = await (definition.load as (input: unknown, u: SessionUser) => Promise<unknown>)(
    parsed.data,
    user
  )
  return data === null ? { kind: 'not_found' } : { kind: 'ok', data: data as ReadOutput<N> }
}
