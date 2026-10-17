import 'server-only'

import { isPrismaCode } from '@muni/db/repositories'
import * as z from 'zod'

import { formError, type FormState } from '@/lib/form'
import { requireAdmin, type SessionUser, UnauthorizedError } from '@/server/auth'
import { RateLimitedError } from '@/server/rate-limit'

// Every write runs through `asAdmin`, so none throws into the page: the guard's refusals and
// any unexpected error come back as an outcome the caller's type spells out.

/** Why the guard turned a write away before it ran. */
export type Denied = 'unauthorized' | 'rate_limited'

export interface Outcomes<T> {
  /** Not an admin (or signed out meanwhile), or past the minute's write limit. */
  denied: (why: Denied) => T
  /** Anything the write threw: logged here, never shown. */
  failed: (error: unknown) => T
}

/**
 * Runs `write` for the signed-in admin, after the rate limit. Never throws: a refusal is
 * `denied`, an error `failed`.
 */
export async function asAdmin<T>(
  write: (admin: SessionUser) => Promise<T>,
  outcomes: Outcomes<T>
): Promise<T> {
  let admin: SessionUser
  try {
    admin = await requireAdmin()
  } catch (error) {
    if (error instanceof UnauthorizedError) return outcomes.denied('unauthorized')
    if (error instanceof RateLimitedError) return outcomes.denied('rate_limited')
    return outcomes.failed(error)
  }
  try {
    return await write(admin)
  } catch (error) {
    return outcomes.failed(error)
  }
}

/**
 * An id bound into an action (`saveSession.bind(null, id)`): it comes back from the browser,
 * so it is checked like any input. Null where the action also creates.
 */
const boundIdSchema = z.string().min(1).max(64)
export const isBoundId = (value: unknown): value is string => boundIdSchema.safeParse(value).success
export const isBoundIdOrNull = (value: unknown): value is string | null =>
  value === null || isBoundId(value)

/** Logs what a write threw; the caller answers with its own "failed". */
export function logFailure(error: unknown): void {
  console.error(error)
}

/** An `Outcomes.failed` that logs the error and answers `answer`. */
export const failedWith =
  <T>(answer: T) =>
  (error: unknown): T => {
    logFailure(error)
    return answer
  }

/**
 * A form's save for the signed-in admin: a refusal or failure is the form's own message (a
 * record gone meanwhile, P2025, is "not found"). `bound` is false when an id bound into the
 * action did not come back as one.
 */
export function saveForm(
  bound: boolean,
  write: (admin: SessionUser) => Promise<FormState>
): Promise<FormState> {
  if (!bound) return Promise.resolve(formError('not_found'))
  return asAdmin(write, {
    denied: why => formError(why),
    failed: error => {
      if (isPrismaCode(error, 'P2025')) return formError('not_found')
      logFailure(error)
      return formError('generic')
    },
  })
}
