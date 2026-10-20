// Shared by the server tests: who is signed in, Clerk's answers, form data, and redirects.
// The modules they mock are mocked in each test file (vi.mock applies only there); the
// repositories' mock is built in repositories-mock.ts.
import { auth, clerkClient } from '@clerk/nextjs/server'
import { findUserByClerkId, upsertUserFromClerk, type UserRecord } from '@muni/db/repositories'
import type { Role } from '@muni/domain/enums'
import { afterEach, beforeEach, vi } from 'vitest'

import { RedirectError } from '@/test/next'

export type AuthResult = Awaited<ReturnType<typeof auth>>

/** A users row for `clerkId`, synced just now in session `sess_1`. */
export const userRow = (
  clerkId: string,
  role: Role,
  overrides: Partial<UserRecord> = {}
): UserRecord => ({
  id: clerkId.replace('user_', 'usr_'),
  clerkId,
  email: `${clerkId}@example.com`,
  name: clerkId,
  role,
  lastSessionId: 'sess_1',
  lastSignInAt: null,
  syncedAt: new Date(),
  archived: false,
  ...overrides,
})

/** Signs in `clerkId` with a fresh users row of `role` (no Clerk call needed), or signs out. */
export const signedIn = (clerkId: string | null, role: Role = 'ADMIN') => {
  vi.mocked(auth).mockResolvedValue({
    userId: clerkId,
    sessionId: clerkId && 'sess_1',
  } as AuthResult)
  vi.mocked(findUserByClerkId).mockResolvedValue(clerkId ? userRow(clerkId, role) : null)
}

/** Clerk's backend client: one user, whose public metadata holds `role`. */
export const clerkUsers = {
  getUser: vi.fn(),
  updateUserMetadata: vi.fn(),
}
export const clerkHas = (role: unknown) => {
  clerkUsers.getUser.mockResolvedValue({
    publicMetadata: role === undefined ? {} : { role },
    primaryEmailAddress: { emailAddress: 'jana@example.com' },
    fullName: 'Jana Nová',
    username: null,
    lastSignInAt: Date.parse('2026-10-16T09:00:00Z'),
    updatedAt: Date.parse('2026-10-16T08:00:00Z'),
  })
}

/** Every server test runs signed in as `user_1`, an admin, with Clerk answering. */
export function serverSession() {
  beforeEach(() => {
    signedIn('user_1')
    vi.mocked(auth.protect).mockResolvedValue({ userId: 'user_1' } as never)
    vi.mocked(clerkClient).mockResolvedValue({ users: clerkUsers } as never)
    vi.mocked(upsertUserFromClerk).mockImplementation(sync =>
      Promise.resolve(
        userRow(sync.clerkId, sync.role, {
          email: sync.email,
          name: sync.name,
          lastSessionId: sync.sessionId,
          lastSignInAt: sync.lastSignInAt,
          syncedAt: sync.syncedAt,
        })
      )
    )
  })
  afterEach(() => {
    vi.clearAllMocks()
  })
}

export const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
export const idle = { status: 'idle' } as const

/**
 * Where an action or guard sends the user: a guard redirects (throws), a save answers with
 * the page to show next (`saved` / `done` with `href`), which the browser then opens.
 */
export async function redirectOf(action: Promise<unknown>): Promise<string> {
  const outcome = await action.catch((e: unknown) => e)
  if (outcome instanceof RedirectError) return outcome.url
  const state = outcome as { status?: unknown; href?: unknown } | null
  if ((state?.status === 'saved' || state?.status === 'done') && typeof state.href === 'string')
    return state.href
  throw new Error(`expected a redirect, got ${JSON.stringify(outcome)}`)
}
