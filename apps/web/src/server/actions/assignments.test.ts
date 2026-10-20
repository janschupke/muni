import {
  applyAssignments,
  moveSeatsMany,
  raiseCapacity,
  removeAssignment,
} from '@muni/db/repositories'
import { describe, expect, it, vi } from 'vitest'

import { form, serverSession, signedIn } from '@/test/server'

import {
  addBookingAction,
  applyAssignmentsAction,
  removeAssignmentAction,
  resolveOverbookingAction,
} from './assignments'

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

describe('booking actions', () => {
  const pair = { sessionExternalId: 'T018', employeeExternalId: 'E0153', source: 'ADVISOR' }

  it('save bookings as the signed-in admin and report each refusal', async () => {
    vi.mocked(applyAssignments).mockResolvedValue([
      { request: { ...pair, source: 'ADVISOR' }, ok: true },
      {
        request: { ...pair, employeeExternalId: 'E0002', source: 'ADVISOR' },
        ok: false,
        reason: 'SESSION_FULL',
      },
    ])
    expect(await applyAssignmentsAction([pair, { ...pair, employeeExternalId: 'E0002' }])).toEqual({
      ok: true,
      applied: 1,
      failed: [{ sessionExternalId: 'T018', employeeExternalId: 'E0002', reason: 'SESSION_FULL' }],
    })
    // The users-table id, not the Clerk id.
    expect(applyAssignments).toHaveBeenCalledWith(expect.any(Array), 'usr_1')
    // Nonsense is answered, never thrown, and never reaches the database.
    expect(await applyAssignmentsAction([])).toEqual({ ok: false, problem: 'invalid' })
    expect(await applyAssignmentsAction([{ ...pair, score: 1, source: 'GUESS' }])).toEqual({
      ok: false,
      problem: 'invalid',
    })
    expect(applyAssignments).toHaveBeenCalledTimes(1)
    // A write that fails says so.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(applyAssignments).mockRejectedValueOnce(new Error('deadlock'))
    expect(await applyAssignmentsAction([pair])).toEqual({ ok: false, problem: 'failed' })
    signedIn('user_1', 'FULL')
    expect(await applyAssignmentsAction([pair])).toEqual({ ok: false, problem: 'unauthorized' })
  })

  it('cancel a booking, and resolve overbooking the way the admin chose', async () => {
    vi.mocked(removeAssignment).mockResolvedValueOnce(true)
    const booking = { sessionExternalId: 'T018', employeeExternalId: 'E0153' }
    expect(await removeAssignmentAction(booking)).toEqual({ ok: true })
    vi.mocked(removeAssignment).mockResolvedValueOnce(false)
    expect(await removeAssignmentAction(booking)).toEqual({ ok: false, reason: 'gone' })
    expect(await removeAssignmentAction({ sessionExternalId: 'T018' })).toEqual({
      ok: false,
      reason: 'invalid',
    })
    // Seats moved to the sessions picked, all at once, or why not and where.
    vi.mocked(moveSeatsMany).mockResolvedValueOnce({ ok: false, reason: 'TARGET_FULL', to: 'T018' })
    const moves = [{ to: 'T018', count: 1 }]
    expect(
      await resolveOverbookingAction({ from: 'T016', resolution: { kind: 'move', moves } })
    ).toEqual({ ok: false, reason: 'TARGET_FULL', to: 'T018' })
    expect(moveSeatsMany).toHaveBeenCalledWith('T016', moves)
    vi.mocked(moveSeatsMany).mockResolvedValueOnce({ ok: true, moved: 1 })
    expect(
      await resolveOverbookingAction({ from: 'T016', resolution: { kind: 'move', moves } })
    ).toEqual({ ok: true })
    // Or the capacity raised, when the room has the seats.
    vi.mocked(raiseCapacity).mockResolvedValueOnce({ ok: false, problem: 'ROOM_TOO_SMALL' })
    expect(
      await resolveOverbookingAction({ from: 'T016', resolution: { kind: 'raise', capacity: 31 } })
    ).toEqual({ ok: false, reason: 'ROOM_TOO_SMALL' })
    vi.mocked(raiseCapacity).mockResolvedValueOnce({ ok: true })
    expect(
      await resolveOverbookingAction({ from: 'T016', resolution: { kind: 'raise', capacity: 31 } })
    ).toEqual({ ok: true })
    // Nonsense never reaches the database.
    expect(
      await resolveOverbookingAction({ from: 'T016', resolution: { kind: 'move', moves: [] } })
    ).toEqual({ ok: false, reason: 'invalid' })
  })

  it('book one person by hand, as the admin, and say why the server refused', async () => {
    vi.mocked(applyAssignments).mockResolvedValueOnce([
      { request: { ...pair, source: 'MANUAL' }, ok: true },
    ])
    expect(
      await addBookingAction('T018', { status: 'idle' }, form({ employeeExternalId: 'E0153' }))
    ).toEqual({ status: 'done' })
    expect(applyAssignments).toHaveBeenLastCalledWith(
      [{ sessionExternalId: 'T018', employeeExternalId: 'E0153', source: 'MANUAL' }],
      'usr_1'
    )
    vi.mocked(applyAssignments).mockResolvedValueOnce([
      { request: { ...pair, source: 'MANUAL' }, ok: false, reason: 'CONFLICT' },
    ])
    expect(
      await addBookingAction('T018', { status: 'idle' }, form({ employeeExternalId: 'E0153' }))
    ).toEqual({ status: 'refused', reason: 'CONFLICT' })
    // Nothing chosen: nothing is sent.
    expect(await addBookingAction('T018', { status: 'idle' }, form({}))).toEqual({
      status: 'refused',
      reason: 'invalid',
    })
    expect(applyAssignments).toHaveBeenCalledTimes(2)
    signedIn('user_1', 'VIEWER')
    expect(await addBookingAction('T018', { status: 'idle' }, form({}))).toEqual({
      status: 'refused',
      reason: 'unauthorized',
    })
  })
})
