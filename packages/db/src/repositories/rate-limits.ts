import { dbOf, type RepoOptions } from './context'

/** One minute: the window requests are counted in. */
const WINDOW_MS = 60_000

/**
 * Counts one request for `key` in the current minute and says whether it is within `limit`.
 * One round trip: the count is incremented and read in one statement, so concurrent
 * requests each see their own number. A key's first request in a new minute clears its
 * older windows, so the table stays one row per active key.
 */
export async function hitRateLimit(
  key: string,
  limit: number,
  options?: RepoOptions & { now?: Date }
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const now = options?.now ?? new Date()
  const windowStart = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS)
  const db = dbOf(options)
  const [row] = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`
  const count = row?.count ?? 1
  if (count === 1)
    // A counter, not a record: its old windows carry nothing worth archiving.
    // eslint-disable-next-line no-restricted-syntax
    await db.rateLimit.deleteMany({ where: { key, windowStart: { lt: windowStart } } })
  if (count <= limit) return { ok: true }
  const retryAfterSeconds = Math.ceil((windowStart.getTime() + WINDOW_MS - now.getTime()) / 1000)
  return { ok: false, retryAfterSeconds }
}
