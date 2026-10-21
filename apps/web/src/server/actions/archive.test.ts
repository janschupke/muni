import { archiveImpact, archiveRecord, unarchiveRecord } from '@muni/db/repositories'
import { describe, expect, it, vi } from 'vitest'

import { expectLogged } from '@/test/console'
import { idle, redirectOf, serverSession, signedIn } from '@/test/server'

import { archiveAction, previewArchive, unarchiveAction } from './archive'

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

describe('archive actions', () => {
  it('archive for an admin, as them, then show the list', async () => {
    vi.mocked(archiveRecord).mockResolvedValue({ ok: true, removesBookings: 2 })
    expect(await redirectOf(archiveAction('room', 'room_1', '/rooms', idle))).toBe('/rooms')
    expect(archiveRecord).toHaveBeenCalledWith('room', 'room_1', 'usr_1')
    // From a list row, the page stays.
    expect(await archiveAction('room', 'room_1', null, idle)).toEqual({ status: 'done' })
  })

  it('say why a record cannot be archived, and how much is in the way', async () => {
    vi.mocked(archiveRecord).mockResolvedValueOnce({ ok: false, reason: 'IN_USE', count: 7 })
    expect(await archiveAction('room', 'room_1', '/rooms', idle)).toEqual({
      status: 'refused',
      reason: 'in_use',
      count: 7,
    })
    vi.mocked(archiveRecord).mockResolvedValueOnce({ ok: false, reason: 'NOT_FOUND', count: 0 })
    expect(await archiveAction('room', 'gone', '/rooms', idle)).toMatchObject({
      reason: 'not_found',
    })
    vi.mocked(archiveRecord).mockResolvedValueOnce({ ok: false, reason: 'LAST_ADMIN', count: 0 })
    expect(await archiveAction('user', 'usr_2', null, idle)).toMatchObject({ reason: 'last_admin' })
    expectLogged('error')
    vi.mocked(archiveRecord).mockRejectedValueOnce(new Error('down'))
    expect(await archiveAction('room', 'room_1', null, idle)).toMatchObject({ reason: 'generic' })
  })

  it('take no kind, id or destination the app does not know', async () => {
    for (const [kind, id, then] of [
      ['pet', 'x', null],
      ['room', '', null],
      ['room', 'room_1', 'https://evil.example'],
      ['room', 'room_1', '//evil.example'],
    ] as const) {
      expect(await archiveAction(kind as never, id, then, idle)).toMatchObject({
        reason: 'generic',
      })
      expect(await unarchiveAction(kind as never, id, then, idle)).toMatchObject({
        reason: 'generic',
      })
    }
    expect(await previewArchive('pet' as never, 'x')).toBeNull()
    expect(await previewArchive('room', '')).toBeNull()
    expect(archiveRecord).not.toHaveBeenCalled()
  })

  it('bring a record back, or say what holds its name or what it belongs to', async () => {
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({ ok: true })
    expect(await redirectOf(unarchiveAction('course', 'c1', '/courses', idle))).toBe('/courses')
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({
      ok: false,
      reason: 'TAKEN',
      fields: ['code'],
    })
    expect(await unarchiveAction('course', 'c1', null, idle)).toEqual({
      status: 'refused',
      reason: 'taken',
      fields: ['code'],
    })
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({ ok: false, reason: 'PARENT_ARCHIVED' })
    expect(await unarchiveAction('session', 's1', null, idle)).toMatchObject({
      reason: 'parent_archived',
    })
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({ ok: false, reason: 'NOT_FOUND' })
    expect(await unarchiveAction('session', 's1', null, idle)).toMatchObject({
      reason: 'not_found',
    })
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({
      ok: false,
      reason: 'SESSION',
      problem: 'ROOM_BUSY',
    })
    expect(await unarchiveAction('session', 's1', null, idle)).toMatchObject({
      reason: 'room_busy',
    })
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({
      ok: false,
      reason: 'SESSION',
      problem: 'ROOM_TOO_SMALL',
    })
    expect(await unarchiveAction('session', 's1', null, idle)).toMatchObject({
      reason: 'room_unfit',
    })
    vi.mocked(unarchiveRecord).mockResolvedValueOnce({ ok: true })
    expect(await unarchiveAction('session', 's1', null, idle)).toEqual({ status: 'done' })
    expectLogged('error')
    vi.mocked(unarchiveRecord).mockRejectedValueOnce(new Error('down'))
    expect(await unarchiveAction('session', 's1', null, idle)).toMatchObject({ reason: 'generic' })
  })

  it('preview for admins only; everyone else is refused', async () => {
    vi.mocked(archiveImpact).mockResolvedValue({ ok: true, removesBookings: 1 })
    expect(await previewArchive('employee', 'e1')).toEqual({ ok: true, removesBookings: 1 })
    for (const role of ['VIEWER', 'FULL'] as const) {
      signedIn('user_1', role)
      expect(await previewArchive('employee', 'e1')).toBeNull()
      expect(await archiveAction('employee', 'e1', null, idle)).toEqual({
        status: 'refused',
        reason: 'unauthorized',
      })
      expect(await unarchiveAction('employee', 'e1', null, idle)).toEqual({
        status: 'refused',
        reason: 'unauthorized',
      })
    }
    expect(archiveImpact).toHaveBeenCalledTimes(1)
  })
})
