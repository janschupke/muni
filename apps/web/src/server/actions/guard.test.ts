import { auth } from '@clerk/nextjs/server'
import { findArchivedKeys } from '@muni/db/reference'
import {
  applyAssignments,
  archiveImpact,
  createRoom,
  findUserByClerkId,
  moveSeatsMany,
  removeAssignment,
} from '@muni/db/repositories'
import { NO_ARCHIVED } from '@muni/importer'
import { describe, expect, it, vi } from 'vitest'

import { findArchived } from '@/server/actions/import'
import { requireAdmin, requireAdminPage, requireReader } from '@/server/auth'
import { spendRequest } from '@/server/rate-limit'
import { expectLogged } from '@/test/console'
import { NotFoundError, RedirectError } from '@/test/next'
import { type AuthResult, form, idle, serverSession, signedIn } from '@/test/server'

import { previewArchive } from './archive'
import { addBookingAction, removeAssignmentAction, resolveOverbookingAction } from './assignments'
import { saveCourse } from './edit'
import { saveRoom } from './rooms'

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

describe('guards', () => {
  it('let every role read; signed-out readers go to sign-in', async () => {
    for (const role of ['VIEWER', 'FULL', 'ADMIN'] as const) {
      signedIn('user_1', role)
      expect(await requireReader()).toMatchObject({ role })
    }
    vi.mocked(auth.protect).mockRejectedValue(new RedirectError('/sign-in'))
    signedIn(null)
    await expect(requireReader()).rejects.toThrow(RedirectError)
  })

  it('a reader without a row (it cannot be made) gets a 404, not a guessed role', async () => {
    vi.mocked(findUserByClerkId).mockResolvedValue(null)
    vi.mocked(auth).mockResolvedValue({ userId: null, sessionId: null } as AuthResult)
    await expect(requireReader()).rejects.toThrow(NotFoundError)
  })

  it('keep edit pages and mutations to admins', async () => {
    expect(await requireAdminPage()).toMatchObject({ role: 'ADMIN' })
    expect(await requireAdmin()).toMatchObject({ id: 'usr_1' })
    for (const role of ['VIEWER', 'FULL'] as const) {
      signedIn('user_1', role)
      await expect(requireAdminPage()).rejects.toThrow(NotFoundError)
      await expect(requireAdmin()).rejects.toMatchObject({ name: 'UnauthorizedError' })
    }
    signedIn(null)
    await expect(requireAdmin()).rejects.toMatchObject({ name: 'UnauthorizedError' })
  })
})

describe('the write guard', () => {
  it('answers every failure with the write’s own outcome, never a throw', async () => {
    const log = expectLogged('error')
    // The rate limit itself failing (the database is down) is a failure, not a refusal.
    vi.mocked(spendRequest).mockRejectedValueOnce(new Error('db down'))
    expect(await saveCourse('BOZP-Z', idle, form({ name: 'BOZP' }))).toMatchObject({
      formError: 'generic',
    })
    // Two rooms named alike at once: the index refused the second.
    vi.mocked(createRoom).mockRejectedValueOnce({ code: 'P2002' })
    expect(
      await saveRoom(
        null,
        idle,
        form({ name: 'Aula A', kind: 'CLASSROOM', capacity: '20', note: '' })
      )
    ).toEqual({ status: 'error', fieldErrors: { name: 'taken' } })
    vi.mocked(archiveImpact).mockRejectedValueOnce(new Error('timeout'))
    expect(await previewArchive('employee', 'e1')).toBeNull()
    vi.mocked(findArchivedKeys).mockRejectedValueOnce(new Error('timeout'))
    expect(await findArchived(NO_ARCHIVED)).toEqual(NO_ARCHIVED)
    vi.mocked(removeAssignment).mockRejectedValueOnce(new Error('timeout'))
    expect(
      await removeAssignmentAction({ sessionExternalId: 'T018', employeeExternalId: 'E0153' })
    ).toEqual({ ok: false, reason: 'failed' })
    vi.mocked(moveSeatsMany).mockRejectedValueOnce(new Error('timeout'))
    expect(
      await resolveOverbookingAction({
        from: 'T016',
        resolution: { kind: 'move', moves: [{ to: 'T018', count: 1 }] },
      })
    ).toEqual({ ok: false, reason: 'failed' })
    vi.mocked(applyAssignments).mockResolvedValueOnce([])
    expect(
      await addBookingAction('T018', { status: 'idle' }, form({ employeeExternalId: 'E0153' }))
    ).toEqual({ status: 'refused', reason: 'failed' })
    expect(log).toHaveBeenCalled()
  })
})
