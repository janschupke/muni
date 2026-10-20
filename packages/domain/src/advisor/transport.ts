import type { AdvisorSession } from './types'

/**
 * A plan (or some of its items) as it travels to the browser: each session once, named by its
 * ID elsewhere. `T` is only what `unpack` gives back.
 */
export interface Packed<T> {
  sessions: Record<string, AdvisorSession>
  /** The value, with `{ $session: externalId }` wherever it held a session. */
  value: unknown
  /** Never set: carries `T` to `unpack`. */
  of?: T
}

const isSession = (value: object): value is AdvisorSession =>
  'externalId' in value && 'unnamedBookings' in value && 'courseCode' in value

/**
 * Packs a plan, or items of one, for sending. A plan names the same few sessions on hundreds
 * of items (the proposal and its alternatives, overbooked targets): sent once each, it is a
 * fraction of the size. `unpack` gives back the same value.
 */
export function pack<T>(value: T): Packed<T> {
  const sessions: Record<string, AdvisorSession> = {}
  const walk = (inner: unknown): unknown => {
    if (Array.isArray(inner)) return inner.map(walk)
    if (inner === null || typeof inner !== 'object') return inner
    if (isSession(inner)) {
      sessions[inner.externalId] = inner
      return { $session: inner.externalId }
    }
    return Object.fromEntries(Object.entries(inner).map(([key, v]) => [key, walk(v)]))
  }
  return { sessions, value: walk(value) }
}

export function unpack<T>(packed: Packed<T>): T {
  const walk = (inner: unknown): unknown => {
    if (Array.isArray(inner)) return inner.map(walk)
    if (inner === null || typeof inner !== 'object') return inner
    if ('$session' in inner && typeof inner.$session === 'string') {
      const session = packed.sessions[inner.$session]
      if (!session) throw new Error(`The plan names an unknown session ${inner.$session}`)
      return session
    }
    return Object.fromEntries(Object.entries(inner).map(([key, v]) => [key, walk(v)]))
  }
  return walk(packed.value) as T
}
