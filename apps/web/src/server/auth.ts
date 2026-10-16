import 'server-only'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { findUserByClerkId, upsertUserFromClerk, type UserRecord } from '@muni/db/repositories'
import { canWrite, parseRole, type Role, roleMetadata } from '@muni/domain/enums'
import { notFound } from 'next/navigation'
import { cache } from 'react'

// Clerk signs people in and owns their role (`publicMetadata.role`: viewer, full or admin).
// The users table mirrors it; this module keeps the mirror fresh and guards pages and actions.

/** The signed-in person, as the app sees them. `id` is the users-table id. */
export interface SessionUser {
  id: string
  clerkId: string
  role: Role
  name: string | null
  email: string | null
}

/** How long a synced role is trusted before Clerk is asked again. */
export const SYNC_INTERVAL_MS = 5 * 60 * 1000

const toSessionUser = ({ id, clerkId, role, name, email }: UserRecord): SessionUser => ({
  id,
  clerkId,
  role,
  name,
  email,
})

/** A new sign-in (another session), or a row older than the sync interval. */
function isStale(row: UserRecord, sessionId: string | null, now: Date): boolean {
  return (
    (sessionId !== null && row.lastSessionId !== sessionId) ||
    now.getTime() - row.syncedAt.getTime() > SYNC_INTERVAL_MS
  )
}

/**
 * Reads the user from Clerk and stores it. A missing or unknown role becomes `viewer`, and a
 * role spelled differently (`Full`) is rewritten, so Clerk always holds a valid lowercase role.
 */
async function syncFromClerk(
  clerkId: string,
  sessionId: string | null,
  now: Date
): Promise<UserRecord> {
  const users = (await clerkClient()).users
  const user = await users.getUser(clerkId)
  const stored = user.publicMetadata['role']
  const role = parseRole(stored) ?? 'VIEWER'
  if (stored !== roleMetadata(role)) {
    await users.updateUserMetadata(clerkId, { publicMetadata: { role: roleMetadata(role) } })
  }
  return upsertUserFromClerk({
    clerkId,
    email: user.primaryEmailAddress?.emailAddress ?? null,
    name: user.fullName ?? user.username ?? null,
    role,
    sessionId,
    lastSignInAt: user.lastSignInAt === null ? null : new Date(user.lastSignInAt),
    syncedAt: now,
  })
}

/** The signed-in user, or null for a visitor. Synced with Clerk at most once a request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const { userId, sessionId } = await auth()
  if (!userId) return null
  const row = await findUserByClerkId(userId)
  const now = new Date()
  if (row && !isStale(row, sessionId, now)) return toSessionUser(row)
  try {
    return toSessionUser(await syncFromClerk(userId, sessionId, now))
  } catch (error) {
    // Without a stored role there is nothing safe to fall back on: show the error page.
    if (!row) throw error
    console.warn('Clerk sync failed; using the stored role', error)
    return toSessionUser(row)
  }
})

/** For data pages: signed-out visitors are sent to sign-in. */
export async function requireReader(): Promise<SessionUser> {
  await auth.protect()
  const user = await getSessionUser()
  if (!user) notFound()
  return user
}

/** For edit, create and import pages: 404 for everyone but admins. */
export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requireReader()
  if (!canWrite(user.role)) notFound()
  return user
}

class UnauthorizedError extends Error {
  override name = 'UnauthorizedError'
}

/**
 * Guards every mutation. Server actions are plain POSTs that can target any route,
 * so each one checks on its own, whatever page rendered the form.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user || !canWrite(user.role)) throw new UnauthorizedError()
  return user
}
