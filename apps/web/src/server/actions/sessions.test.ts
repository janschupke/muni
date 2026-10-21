import {
  cancelSession,
  checkSessionSlot,
  createSession,
  createSessionWithBookings,
  reinstateSession,
} from '@muni/db/repositories'
import { describe, expect, it, vi } from 'vitest'

import { expectLogged } from '@/test/console'
import { form, idle, redirectOf, serverSession, signedIn } from '@/test/server'

import {
  cancelSessionAction,
  checkSessionSlotAction,
  createPlannedSessionAction,
  reinstateSessionAction,
  saveNewSession,
} from './sessions'

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

describe('cancelling and reinstating a session', () => {
  it('changes the status by the act, says why not, and answers nonsense and readers', async () => {
    vi.mocked(cancelSession).mockResolvedValueOnce({
      ok: true,
      externalId: 'T016',
      courseCode: 'BOZP-Z',
    })
    expect(await cancelSessionAction('T016')).toEqual({ ok: true })
    expect(cancelSession).toHaveBeenCalledWith('T016')
    vi.mocked(cancelSession).mockResolvedValueOnce({ ok: false, problem: 'STARTED' })
    expect(await cancelSessionAction('T016')).toEqual({ ok: false, reason: 'STARTED' })
    vi.mocked(reinstateSession).mockResolvedValueOnce({ ok: false, problem: 'ROOM_BUSY' })
    expect(await reinstateSessionAction('T017')).toEqual({ ok: false, reason: 'ROOM_BUSY' })
    expect(await cancelSessionAction({ id: 'T016' })).toEqual({ ok: false, reason: 'invalid' })
    expectLogged('error')
    vi.mocked(reinstateSession).mockRejectedValueOnce(new Error('deadlock'))
    expect(await reinstateSessionAction('T017')).toEqual({ ok: false, reason: 'failed' })
    expect(cancelSession).toHaveBeenCalledTimes(2)
    signedIn('user_1', 'FULL')
    expect(await cancelSessionAction('T016')).toEqual({ ok: false, reason: 'unauthorized' })
  })
})

describe('session creation', () => {
  const create = {
    courseId: 'course_poz',
    providerId: 'prv_internal',
    date: '2026-10-19',
    startTime: '10:00',
    roomId: 'room_aula_a',
    capacity: 40,
  }

  it('checks, then creates a planned session with its people, or says why not', async () => {
    const created = {
      ok: true as const,
      externalId: 'S001',
      courseCode: 'POZ-OCH',
      booked: 2,
      dryRun: true,
    }
    vi.mocked(createSessionWithBookings).mockResolvedValue(created)
    const people = ['E0153', 'E0002']
    expect(await createPlannedSessionAction({ session: create, people, dryRun: true })).toEqual(
      created
    )
    expect(createSessionWithBookings).toHaveBeenCalledWith(create, people, 'usr_1', {
      dryRun: true,
    })
    expect(
      await createPlannedSessionAction({
        session: { ...create, providerId: '' },
        people,
        dryRun: false,
      })
    ).toEqual({ ok: false, problem: 'invalid', refusals: [] })
    expectLogged('error')
    vi.mocked(createSessionWithBookings).mockRejectedValueOnce(new Error('down'))
    expect(await createPlannedSessionAction({ session: create, people, dryRun: false })).toEqual({
      ok: false,
      problem: 'failed',
      refusals: [],
    })
    // Signed out meanwhile: a reason to show, not an error page.
    signedIn(null)
    expect(await createPlannedSessionAction({ session: create, people, dryRun: false })).toEqual({
      ok: false,
      problem: 'unauthorized',
      refusals: [],
    })
  })

  it('creates a session from the form and opens it', async () => {
    vi.mocked(createSession).mockResolvedValue({
      ok: true,
      externalId: 'S002',
      courseCode: 'POZ-OCH',
    })
    const fields = {
      courseId: 'course_poz',
      providerId: 'prv_internal',
      date: '2026-11-02',
      startTime: '10:00',
      roomId: 'room_aula_a',
      capacity: '40',
    }
    expect(await redirectOf(saveNewSession(idle, form(fields)))).toBe('/sessions/S002')
    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ courseId: 'course_poz', providerId: 'prv_internal', capacity: 40 })
    )
    expect(await saveNewSession(idle, form({ ...fields, roomId: '' }))).toMatchObject({
      fieldErrors: { roomId: 'required' },
    })
    expect(await saveNewSession(idle, form({ ...fields, courseId: '' }))).toMatchObject({
      fieldErrors: { courseId: 'required' },
    })
    expectLogged('error')
    vi.mocked(createSession).mockRejectedValueOnce(new Error('down'))
    expect(await saveNewSession(idle, form(fields))).toMatchObject({
      formError: 'generic',
    })
    vi.mocked(createSession).mockResolvedValueOnce({
      ok: false,
      problem: 'ROOM_MISSING_CAPABILITIES',
    })
    expect(await saveNewSession(idle, form(fields))).toMatchObject({
      fieldErrors: { roomId: 'room_missing_capabilities' },
    })
  })

  it('tells the form whether the room is taken then, and only admins', async () => {
    const slot = { roomId: 'room_aula_a', date: '2026-11-02', startTime: '10:00', endTime: '12:00' }
    vi.mocked(checkSessionSlot).mockResolvedValue('ROOM_BUSY')
    expect(await checkSessionSlotAction(slot, 'T016')).toBe('ROOM_BUSY')
    expect(checkSessionSlot).toHaveBeenLastCalledWith(slot, 'T016')
    // Nonsense in: no question asked.
    expect(await checkSessionSlotAction({ ...slot, date: 'zítra' }, null)).toBeNull()
    expect(await checkSessionSlotAction(slot, 5 as unknown as string)).toBeNull()
    expectLogged('error')
    vi.mocked(checkSessionSlot).mockRejectedValueOnce(new Error('down'))
    expect(await checkSessionSlotAction(slot, null)).toBeNull()
    expect(checkSessionSlot).toHaveBeenCalledTimes(2)
    for (const user of [null, 'user_2'] as const) {
      signedIn(user, 'FULL')
      expect(await checkSessionSlotAction(slot, null)).toBeNull()
    }
    expect(checkSessionSlot).toHaveBeenCalledTimes(2)
  })
})
