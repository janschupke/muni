import 'server-only'

import { getSessionUser, isAccountArchived } from '@/server/auth'
import { RateLimitedError, spendRequest } from '@/server/rate-limit'

import { type ReadName, reads } from './registry'
import { runRead } from './run'

const answer = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Response.json(body, {
    status,
    // Per user, and never kept: the browser's own cache (TanStack Query) decides freshness.
    headers: { 'Cache-Control': 'private, no-store', ...headers },
  })

const isRead = (name: string): name is ReadName => Object.hasOwn(reads, name)

/**
 * Runs one read for the signed-in user. Refusals answer with a status and a reason the
 * browser can tell apart: 401 signed out, 403 archived account or not an admin, 400 an
 * address that does not parse, 404 an unknown read or a record that is not there, 429 too
 * many reads this minute.
 */
export async function handleRead(name: string, search: URLSearchParams): Promise<Response> {
  if (!isRead(name)) return answer(404, { error: 'unknown_read' })
  const user = await getSessionUser()
  if (!user)
    return (await isAccountArchived())
      ? answer(403, { error: 'archived' })
      : answer(401, { error: 'unauthenticated' })
  try {
    await spendRequest('read', user.id)
  } catch (error) {
    if (!(error instanceof RateLimitedError)) throw error
    return answer(
      429,
      { error: 'rate_limited' },
      { 'Retry-After': String(error.retryAfterSeconds) }
    )
  }
  try {
    const result = await runRead(name, Object.fromEntries(search), user)
    switch (result.kind) {
      case 'ok':
        return answer(200, result.data)
      case 'not_found':
        return answer(404, { error: 'not_found' })
      case 'forbidden':
        return answer(403, { error: 'forbidden' })
      case 'invalid':
        return answer(400, { error: 'invalid_input' })
    }
  } catch (error) {
    console.error(error)
    return answer(500, { error: 'failed' })
  }
}
