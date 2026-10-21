import { clerkClient } from '@clerk/nextjs/server'
import { findUserByClerkId, upsertUserFromClerk } from '@muni/db/repositories'
import { describe, expect, it, vi } from 'vitest'

import { expectLogged } from '@/test/console'
import { clerkHas, clerkUsers, redirectOf, serverSession, signedIn, userRow } from '@/test/server'

import {
  getSessionUser,
  isAccountArchived,
  requireAdmin,
  requireReader,
  SESSION_RESYNC_MS,
  SYNC_INTERVAL_MS,
} from './auth'

vi.mock('@clerk/nextjs/server', () => ({
  auth: Object.assign(vi.fn(), { protect: vi.fn() }),
  clerkClient: vi.fn(),
  clerkMiddleware: vi.fn((handler: unknown) => handler),
}))

vi.mock('@muni/db/repositories', async () =>
  (await import('@/test/repositories-mock')).repositoriesMock()
)

vi.mock('@muni/db/client', () => ({ getDb: () => 'db' }))

vi.mock('@muni/db/reference', () => ({ findArchivedKeys: vi.fn() }))

vi.mock('@muni/db/writer', async importOriginal => ({
  ...(await importOriginal<object>()),
  commitChunk: vi.fn(),
}))

serverSession()

describe('session user', () => {
  it('is null for visitors, without touching the database', async () => {
    signedIn(null)
    expect(await getSessionUser()).toBeNull()
    expect(findUserByClerkId).not.toHaveBeenCalled()
  })

  it('reads a fresh row from the database, without asking Clerk', async () => {
    signedIn('user_1', 'FULL')
    expect(await getSessionUser()).toEqual({
      id: 'usr_1',
      clerkId: 'user_1',
      role: 'FULL',
      name: 'user_1',
      email: 'user_1@example.com',
    })
    expect(clerkClient).not.toHaveBeenCalled()
  })

  it('on a first sign-in, gives a user without a role the viewer role, in Clerk and the row', async () => {
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    clerkHas(undefined)
    expect(await getSessionUser()).toMatchObject({ role: 'VIEWER', name: 'Jana Nová' })
    expect(clerkUsers.updateUserMetadata).toHaveBeenCalledWith('user_1', {
      publicMetadata: { role: 'viewer' },
    })
    expect(upsertUserFromClerk).toHaveBeenCalledWith({
      clerkId: 'user_1',
      email: 'jana@example.com',
      name: 'Jana Nová',
      role: 'VIEWER',
      sessionId: 'sess_1',
      lastSignInAt: new Date('2026-10-16T09:00:00Z'),
      clerkUpdatedAt: new Date('2026-10-16T08:00:00Z'),
      syncedAt: expect.any(Date) as Date,
    })
  })

  it.each([
    ['an unknown role', 'owner', 'VIEWER', 'viewer'],
    ['a role spelled differently', ' Full', 'FULL', 'full'],
  ])('rewrites %s in Clerk', async (_, stored, role, written) => {
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    clerkHas(stored)
    expect(await getSessionUser()).toMatchObject({ role })
    expect(clerkUsers.updateUserMetadata).toHaveBeenCalledWith('user_1', {
      publicMetadata: { role: written },
    })
  })

  it('leaves a valid role alone', async () => {
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    clerkHas('admin')
    expect(await getSessionUser()).toMatchObject({ role: 'ADMIN' })
    expect(clerkUsers.updateUserMetadata).not.toHaveBeenCalled()
  })

  it('stores what Clerk lacks as empty: no email, no name, never signed in', async () => {
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    clerkUsers.getUser.mockResolvedValue({
      publicMetadata: { role: 'viewer' },
      primaryEmailAddress: null,
      fullName: null,
      username: 'jnova',
      lastSignInAt: null,
    })
    await getSessionUser()
    expect(upsertUserFromClerk).toHaveBeenCalledWith(
      expect.objectContaining({ email: null, name: 'jnova', lastSignInAt: null })
    )
    clerkUsers.getUser.mockResolvedValue({
      publicMetadata: { role: 'viewer' },
      primaryEmailAddress: null,
      fullName: null,
      username: null,
      lastSignInAt: null,
    })
    await getSessionUser()
    expect(upsertUserFromClerk).toHaveBeenLastCalledWith(expect.objectContaining({ name: null }))
  })

  it('checks Clerk again on a new sign-in, and picks up a role changed there', async () => {
    const earlier = new Date(Date.now() - SESSION_RESYNC_MS - 1000)
    vi.mocked(findUserByClerkId).mockResolvedValue(
      userRow('user_1', 'VIEWER', { lastSessionId: 'sess_0', syncedAt: earlier })
    )
    clerkHas('full')
    expect(await getSessionUser()).toMatchObject({ role: 'FULL' })
    expect(upsertUserFromClerk).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'FULL', sessionId: 'sess_1' })
    )
  })

  it('asks Clerk once for sessions used in turn: another session just synced is trusted', async () => {
    // Synced a moment ago by the other session: a request from this one does not ask again,
    // so two sessions alternating cannot make every request a call to Clerk.
    vi.mocked(findUserByClerkId).mockResolvedValue(
      userRow('user_1', 'VIEWER', { lastSessionId: 'sess_0', syncedAt: new Date() })
    )
    expect(await getSessionUser()).toMatchObject({ role: 'VIEWER' })
    expect(clerkClient).not.toHaveBeenCalled()
  })

  it('checks Clerk again once the stored role is older than the sync interval', async () => {
    const stale = new Date(Date.now() - SYNC_INTERVAL_MS - 1000)
    vi.mocked(findUserByClerkId).mockResolvedValue(userRow('user_1', 'ADMIN', { syncedAt: stale }))
    clerkHas('viewer')
    expect(await getSessionUser()).toMatchObject({ role: 'VIEWER' })
  })

  it('gives an archived user no access, and says why', async () => {
    vi.mocked(findUserByClerkId).mockResolvedValue(userRow('user_1', 'ADMIN', { archived: true }))
    expect(await getSessionUser()).toBeNull()
    expect(await isAccountArchived()).toBe(true)
    expect(clerkClient).not.toHaveBeenCalled()
    expect(await redirectOf(requireReader())).toBe('/')
    await expect(requireAdmin()).rejects.toMatchObject({ name: 'UnauthorizedError' })
    // Archived while their row was being refreshed: still nobody.
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    vi.mocked(upsertUserFromClerk).mockResolvedValueOnce(
      userRow('user_1', 'ADMIN', { archived: true })
    )
    clerkHas('admin')
    expect(await getSessionUser()).toBeNull()
    signedIn(null)
    expect(await isAccountArchived()).toBe(false)
    signedIn('user_2', 'VIEWER')
    expect(await isAccountArchived()).toBe(false)
  })

  it('keeps the stored role when Clerk cannot be reached, and fails without one', async () => {
    const warn = expectLogged('warn')
    clerkUsers.getUser.mockRejectedValue(new Error('Clerk down'))
    const earlier = new Date(Date.now() - SESSION_RESYNC_MS - 1000)
    vi.mocked(findUserByClerkId).mockResolvedValue(
      userRow('user_1', 'FULL', { lastSessionId: 'sess_0', syncedAt: earlier })
    )
    expect(await getSessionUser()).toMatchObject({ role: 'FULL' })
    expect(warn).toHaveBeenCalled()
    // Unconfirmed for over twice the interval: read-only until Clerk answers.
    const long = new Date(Date.now() - 2 * SYNC_INTERVAL_MS - 1000)
    vi.mocked(findUserByClerkId).mockResolvedValue(userRow('user_1', 'ADMIN', { syncedAt: long }))
    expect(await getSessionUser()).toMatchObject({ role: 'VIEWER' })
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    await expect(getSessionUser()).rejects.toThrow('Clerk down')
  })
})
