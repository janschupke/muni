import type { ReadName } from '@/server/reads/registry'

/** What a write changed, by what it saved. */
export type WriteKind =
  | 'booking'
  | 'session'
  | 'course'
  | 'person'
  | 'group'
  | 'room'
  | 'provider'
  | 'role'
  | 'import'
  | 'archive'

/**
 * The reads each write can change, or `everything`. Bookings, sessions, courses, people,
 * departments, positions, imports and archiving all reach compliance, the advisor and the
 * dashboard, which most pages show some of: those refresh everything. A role, a provider or a
 * room touches only the pages that show it.
 */
const WRITES: Record<WriteKind, readonly ReadName[] | 'everything'> = {
  booking: 'everything',
  session: 'everything',
  course: 'everything',
  person: 'everything',
  group: 'everything',
  import: 'everything',
  archive: 'everything',
  role: ['users-list', 'user'],
  provider: ['providers-list', 'provider', 'provider-form', 'employee', 'completion-form'],
  room: [
    'rooms-list',
    'room',
    'room-form',
    'sessions-list',
    'session',
    'session-form',
    'course',
    'courses-list',
    'planner',
    'advisor',
    'dashboard',
  ],
}

/** Whether a cached read (its query key) is one the write changed. */
export function changedBy(kind: WriteKind): (queryKey: readonly unknown[]) => boolean {
  const reads = WRITES[kind]
  return queryKey =>
    queryKey[0] === 'read' && (reads === 'everything' || reads.includes(queryKey[1] as ReadName))
}
