import { type PersonRef, personRef, type UserRef, userRef } from '@muni/domain/archive'

// Archived records leave every list, count and lookup. The filter is spelled out at each query
// rather than hidden in a client extension, because the rules differ by position:
// - top-level reads and to-many relations (a course's sessions, a count) take ACTIVE;
// - to-one relations (a completion's course, a session's room) are never filtered: the record
//   still points there, so the reference is read with `archivedAt` and shown muted;
// - raw SQL adds `archived_at IS NULL` itself.
// Unique keys (name, code, external ID, email, IČO, Clerk ID) are unique among active rows
// only, so a lookup by one of them must carry ACTIVE too (lint enforces it).

export const ACTIVE = { archivedAt: null } as const

export const isArchived = (row: { archivedAt: Date | null }) => row.archivedAt !== null

/** Select this to read an employee as a `PersonRef`. */
export const personSelect = {
  id: true,
  externalId: true,
  firstName: true,
  lastName: true,
  archivedAt: true,
  archiveTag: true,
} as const

export const toPersonRef = personRef

/** Select this to read an app user as a `UserRef`. */
export const userSelect = {
  id: true,
  name: true,
  email: true,
  archivedAt: true,
  archiveTag: true,
} as const

export const toUserRef = userRef

export type { PersonRef, UserRef }
