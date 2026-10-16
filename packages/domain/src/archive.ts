// Archiving replaces deleting: an archived record keeps its history but leaves every list and
// count. Archived PEOPLE (employees, users) are also anonymised wherever they are referenced,
// for every role; only an admin opening that archived record's own page sees who it was.

/** What can be archived. Bookings and the join rows are removed outright instead. */
export const ARCHIVABLE = [
  'employee',
  'course',
  'session',
  'completion',
  'department',
  'position',
  'room',
  'provider',
  'user',
] as const
export type Archivable = (typeof ARCHIVABLE)[number]

/**
 * A short, stable, non-reversible tag for an archived record, from its internal id: FNV-1a
 * (32 bit) as six hex digits. Six, not four: among ~170 people four digits collide often.
 */
export function archiveTag(id: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return ((hash >>> 0) % 0x1000000).toString(16).padStart(6, '0')
}

/** A person as another record refers to them: by name, or by a tag once archived. */
export type PersonRef =
  { archived: false; externalId: string; name: string } | { archived: true; tag: string }

export interface PersonRow {
  id: string
  externalId: string
  firstName: string
  lastName: string
  archivedAt: Date | null
}

/**
 * The reference every list and page shows for an employee. Built from an allowlist: an
 * archived person yields nothing but the tag, whatever fields the row carries.
 */
export function personRef(row: PersonRow): PersonRef {
  if (row.archivedAt !== null) return { archived: true, tag: archiveTag(row.id) }
  return { archived: false, externalId: row.externalId, name: `${row.lastName} ${row.firstName}` }
}

/** An app user as another record refers to them (who archived it, who booked a seat). */
export type UserRef =
  | { archived: false; id: string; name: string | null; email: string | null }
  | { archived: true; tag: string }

export interface UserRow {
  id: string
  name: string | null
  email: string | null
  archivedAt: Date | null
}

export function userRef(row: UserRow): UserRef {
  if (row.archivedAt !== null) return { archived: true, tag: archiveTag(row.id) }
  return { archived: false, id: row.id, name: row.name, email: row.email }
}
