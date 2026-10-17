import type { Role } from '@muni/domain/enums'

import { ACTIVE } from './archive'
import { dbOf, type RepoOptions } from './context'

// Users mirrored from Clerk. Clerk owns sign-in and the role (`publicMetadata.role`); this
// table holds the copy the app reads on every request, refreshed by the web app's auth layer.

export interface UserRecord {
  id: string
  clerkId: string
  email: string | null
  name: string | null
  role: Role
  lastSessionId: string | null
  lastSignInAt: Date | null
  syncedAt: Date
  /** An archived user may not sign in; nothing about them is synced any more. */
  archived: boolean
}

export interface UserListItem {
  id: string
  clerkId: string
  email: string | null
  name: string | null
  role: Role
  /** ISO timestamps: the list goes to the browser as JSON. */
  lastSignInAt: string | null
  createdAt: string
}

const listItemOf = <T extends { lastSignInAt: Date | null; createdAt: Date }>({
  lastSignInAt,
  createdAt,
  ...rest
}: T) => ({
  ...rest,
  lastSignInAt: lastSignInAt?.toISOString() ?? null,
  createdAt: createdAt.toISOString(),
})

const RECORD = {
  id: true,
  clerkId: true,
  email: true,
  name: true,
  role: true,
  lastSessionId: true,
  lastSignInAt: true,
  syncedAt: true,
  archivedAt: true,
} as const

type RecordRow = Omit<UserRecord, 'archived'> & { archivedAt: Date | null }

const toRecord = ({ archivedAt, ...row }: RecordRow): UserRecord => ({
  ...row,
  archived: archivedAt !== null,
})

/** The active row first; an archived one only when there is no active one. */
const ACTIVE_FIRST = { archivedAt: { sort: 'desc', nulls: 'first' } } as const

/** The user signed in with this Clerk ID; `archived` when they have been archived. */
export async function findUserByClerkId(
  clerkId: string,
  options?: RepoOptions
): Promise<UserRecord | null> {
  const row = await dbOf(options).user.findFirst({
    // eslint-disable-next-line no-restricted-syntax -- an archived user is found, to refuse them
    where: { clerkId },
    orderBy: ACTIVE_FIRST,
    select: RECORD,
  })
  return row && toRecord(row)
}

/** What Clerk says about a user, as of `syncedAt`. */
export interface ClerkUserSync {
  clerkId: string
  email: string | null
  name: string | null
  role: Role
  /** The session being synced; a new one marks a sign-in. */
  sessionId: string | null
  /** Clerk's last sign-in time, when it has one. */
  lastSignInAt: Date | null
  syncedAt: Date
}

/**
 * Creates or refreshes the user's row from Clerk. An archived user is returned as they are:
 * signing in again neither revives them nor creates a new row.
 */
export async function upsertUserFromClerk(
  sync: ClerkUserSync,
  options?: RepoOptions
): Promise<UserRecord> {
  const { clerkId, sessionId, ...fields } = sync
  const data = { ...fields, lastSessionId: sessionId }
  const db = dbOf(options)
  const current = await findUserByClerkId(clerkId, options)
  if (current?.archived) return current
  if (current) {
    return toRecord(await db.user.update({ where: { id: current.id }, data, select: RECORD }))
  }
  try {
    return toRecord(await db.user.create({ data: { clerkId, ...data }, select: RECORD }))
  } catch (error) {
    // Two first requests at once: the other created the row; refresh that one.
    if ((error as { code?: unknown }).code !== 'P2002') throw error
    return upsertUserFromClerk(sync, options)
  }
}

/** Everyone who has signed in (or booked a seat before users existed), admins first. */
export async function listUsers(options?: RepoOptions): Promise<UserListItem[]> {
  const users = await dbOf(options).user.findMany({
    where: ACTIVE,
    select: {
      id: true,
      clerkId: true,
      email: true,
      name: true,
      role: true,
      lastSignInAt: true,
      createdAt: true,
    },
    // The enum's declared order is VIEWER, FULL, ADMIN.
    orderBy: [{ role: 'desc' }, { name: 'asc' }, { email: 'asc' }],
  })
  return users.map(listItemOf)
}

export interface UserDetail extends UserListItem {
  /** Named bookings this user made (they stay, whatever happens to the user). */
  bookingsMade: number
}

/** One active user, for the admin's user page. */
export async function getUser(id: string, options?: RepoOptions): Promise<UserDetail | null> {
  const user = await dbOf(options).user.findFirst({
    where: { id, ...ACTIVE },
    select: {
      id: true,
      clerkId: true,
      email: true,
      name: true,
      role: true,
      lastSignInAt: true,
      createdAt: true,
      _count: { select: { assignments: true } },
    },
  })
  if (!user) return null
  const { _count, ...rest } = user
  return { ...listItemOf(rest), bookingsMade: _count.assignments }
}

export type RoleChange =
  { ok: true; clerkId: string } | { ok: false; reason: 'NOT_FOUND' | 'SELF' | 'LAST_ADMIN' }

/**
 * Sets a user's role in the mirror, after it was written to Clerk (the source of truth; the
 * next sync would bring it anyway). Admins do not change their own role, and the last admin
 * stays one: both checks hold the admins' rows, so two admins cannot demote each other.
 */
export async function setUserRole(
  id: string,
  role: Role,
  byUserId: string,
  options?: RepoOptions
): Promise<RoleChange> {
  if (id === byUserId) return { ok: false, reason: 'SELF' }
  return dbOf(options).$transaction(async tx => {
    const admins = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE role = 'ADMIN' AND archived_at IS NULL ORDER BY id FOR UPDATE`
    const user = await tx.user.findFirst({
      where: { id, ...ACTIVE },
      select: { clerkId: true, role: true },
    })
    if (!user) return { ok: false, reason: 'NOT_FOUND' }
    if (user.role === 'ADMIN' && role !== 'ADMIN' && !admins.some(a => a.id !== id))
      return { ok: false, reason: 'LAST_ADMIN' }
    await tx.user.update({ where: { id }, data: { role } })
    return { ok: true, clerkId: user.clerkId }
  })
}

/** Whether a role change would be allowed now (the Clerk write happens only if so). */
export async function canSetUserRole(
  id: string,
  role: Role,
  byUserId: string,
  options?: RepoOptions
): Promise<RoleChange> {
  if (id === byUserId) return { ok: false, reason: 'SELF' }
  const db = dbOf(options)
  const user = await db.user.findFirst({
    where: { id, ...ACTIVE },
    select: { clerkId: true, role: true },
  })
  if (!user) return { ok: false, reason: 'NOT_FOUND' }
  if (user.role === 'ADMIN' && role !== 'ADMIN') {
    const others = await db.user.count({ where: { role: 'ADMIN', ...ACTIVE, id: { not: id } } })
    if (others === 0) return { ok: false, reason: 'LAST_ADMIN' }
  }
  return { ok: true, clerkId: user.clerkId }
}
