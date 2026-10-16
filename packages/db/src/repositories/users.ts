import type { Role } from '@muni/domain/enums'

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
}

export interface UserListItem {
  id: string
  clerkId: string
  email: string | null
  name: string | null
  role: Role
  lastSignInAt: Date | null
  createdAt: Date
}

const RECORD = {
  id: true,
  clerkId: true,
  email: true,
  name: true,
  role: true,
  lastSessionId: true,
  lastSignInAt: true,
  syncedAt: true,
} as const

export function findUserByClerkId(
  clerkId: string,
  options?: RepoOptions
): Promise<UserRecord | null> {
  return dbOf(options).user.findUnique({ where: { clerkId }, select: RECORD })
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

/** Creates or refreshes the user's row from Clerk. */
export function upsertUserFromClerk(
  sync: ClerkUserSync,
  options?: RepoOptions
): Promise<UserRecord> {
  const { clerkId, sessionId, ...fields } = sync
  const data = { ...fields, lastSessionId: sessionId }
  return dbOf(options).user.upsert({
    where: { clerkId },
    create: { clerkId, ...data },
    update: data,
    select: RECORD,
  })
}

/** Everyone who has signed in (or booked a seat before users existed), admins first. */
export function listUsers(options?: RepoOptions): Promise<UserListItem[]> {
  return dbOf(options).user.findMany({
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
}
