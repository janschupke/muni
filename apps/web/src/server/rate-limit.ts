import 'server-only'

import { hitRateLimit } from '@muni/db/repositories'

/**
 * Requests a user may make per minute: reads (every page and refetch) and writes (every save,
 * booking and import chunk). Far above what a person clicking does; they stop a script.
 */
export const RATE_LIMITS = { read: 300, write: 60 } as const

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
