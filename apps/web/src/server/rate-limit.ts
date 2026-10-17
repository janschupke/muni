import 'server-only'

import { hitRateLimit } from '@muni/db/repositories'

/** A whole number of requests per minute from the environment, or the default. */
const perMinute = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Requests a user may make per minute: reads (every page and refetch) and writes (every save,
 * booking and import chunk). Far above what a person clicking does; they stop a script.
 * `MUNI_RATE_LIMIT_READS` / `MUNI_RATE_LIMIT_WRITES` change them (the browser tests, which
 * click faster than anyone, raise them).
 */
export const RATE_LIMITS = {
  read: perMinute(process.env.MUNI_RATE_LIMIT_READS, 300),
  write: perMinute(process.env.MUNI_RATE_LIMIT_WRITES, 60),
}

export class RateLimitedError extends Error {
  override name = 'RateLimitedError'
  constructor(readonly retryAfterSeconds: number) {
    super('Too many requests')
  }
}

/** Counts one request of the user's; throws `RateLimitedError` past the limit. */
export async function spendRequest(kind: keyof typeof RATE_LIMITS, userId: string) {
  const outcome = await hitRateLimit(`${kind}:${userId}`, RATE_LIMITS[kind])
  if (!outcome.ok) throw new RateLimitedError(outcome.retryAfterSeconds)
}
