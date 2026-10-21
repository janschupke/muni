import { revertUserRole, setUserRole } from '@muni/db/repositories'
import { describe, expect, it, vi } from 'vitest'

import { expectLogged } from '@/test/console'
import { clerkUsers, form, idle, redirectOf, serverSession } from '@/test/server'

import { saveUserRole } from './users'

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

describe('role changes', () => {
  it('write the role here first, then to Clerk, and show the user', async () => {
    vi.mocked(setUserRole).mockResolvedValue({ ok: true, clerkId: 'user_2', previous: 'VIEWER' })
    expect(await redirectOf(saveUserRole('usr_2', idle, form({ role: 'FULL' })))).toBe(
      '/users/usr_2'
    )
    expect(setUserRole).toHaveBeenCalledWith('usr_2', 'FULL', 'usr_1')
    expect(clerkUsers.updateUserMetadata).toHaveBeenCalledWith('user_2', {
      publicMetadata: { role: 'full' },
    })
    expect(revertUserRole).not.toHaveBeenCalled()
  })

  it('refuse an unknown role, one’s own, the last admin’s, and a user who is gone', async () => {
    expect(await saveUserRole('usr_2', idle, form({ role: 'OWNER' }))).toMatchObject({
      fieldErrors: { role: 'required' },
    })
    vi.mocked(setUserRole).mockResolvedValueOnce({ ok: false, reason: 'SELF' })
    expect(await saveUserRole('usr_1', idle, form({ role: 'FULL' }))).toMatchObject({
      fieldErrors: { role: 'own_role' },
    })
    vi.mocked(setUserRole).mockResolvedValueOnce({ ok: false, reason: 'LAST_ADMIN' })
    expect(await saveUserRole('usr_2', idle, form({ role: 'FULL' }))).toMatchObject({
      fieldErrors: { role: 'last_admin' },
    })
    vi.mocked(setUserRole).mockResolvedValueOnce({ ok: false, reason: 'NOT_FOUND' })
    expect(await saveUserRole('gone', idle, form({ role: 'FULL' }))).toMatchObject({
      formError: 'not_found',
    })
    // Nothing refused here ever reaches Clerk.
    expect(clerkUsers.updateUserMetadata).not.toHaveBeenCalled()
    expectLogged('error')
    vi.mocked(setUserRole).mockRejectedValueOnce(new Error('deadlock'))
    expect(await saveUserRole('usr_2', idle, form({ role: 'FULL' }))).toMatchObject({
      formError: 'generic',
    })
  })

  it('puts the role back when Clerk refuses it', async () => {
    expectLogged('error')
    vi.mocked(setUserRole).mockResolvedValue({ ok: true, clerkId: 'user_2', previous: 'ADMIN' })
    clerkUsers.updateUserMetadata.mockRejectedValueOnce(new Error('Clerk down'))
    expect(await saveUserRole('usr_2', idle, form({ role: 'FULL' }))).toMatchObject({
      formError: 'generic',
    })
    expect(revertUserRole).toHaveBeenCalledWith('usr_2', { from: 'ADMIN', to: 'FULL' })
  })
})
