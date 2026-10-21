import { createRoom, updateRoom } from '@muni/db/repositories'
import { describe, expect, it, vi } from 'vitest'

import { expectLogged } from '@/test/console'
import { form, idle, redirectOf, serverSession } from '@/test/server'

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

describe('room actions', () => {
  const roomForm = {
    name: 'Laboratoř 4',
    kind: 'LAB',
    capacity: '16',
    note: '',
  }
  const withEquipment = () => {
    const data = form(roomForm)
    data.append('capabilities', 'LAB_EQUIPMENT')
    data.append('capabilities', 'PROJECTOR')
    return data
  }

  it('create a room or save one, then show it', async () => {
    vi.mocked(createRoom).mockResolvedValue({ ok: true, id: 'room_new' })
    expect(await redirectOf(saveRoom(null, idle, withEquipment()))).toBe('/rooms/room_new')
    expect(createRoom).toHaveBeenCalledWith({
      name: 'Laboratoř 4',
      kind: 'LAB',
      capacity: 16,
      capabilities: ['LAB_EQUIPMENT', 'PROJECTOR'],
      note: null,
    })
    vi.mocked(updateRoom).mockResolvedValue({ ok: true, id: 'room_lab' })
    expect(await redirectOf(saveRoom('room_lab', idle, form(roomForm)))).toBe('/rooms/room_lab')
    expect(updateRoom).toHaveBeenCalledWith(
      'room_lab',
      expect.objectContaining({ capabilities: [] })
    )
    // Smaller than sessions planned in it need: refused, with how many.
    vi.mocked(updateRoom).mockResolvedValueOnce({
      ok: false,
      field: 'capacity',
      reason: 'sessions_unfit',
      count: 2,
    })
    expect(await saveRoom('room_lab', idle, form(roomForm))).toEqual({
      status: 'error',
      fieldErrors: { capacity: 'sessions_unfit' },
      values: { capacity: { count: 2 } },
    })
  })

  it('name what is wrong: a missing name, a name in use, a room that is gone', async () => {
    expect(await saveRoom(null, idle, form({ ...roomForm, name: '' }))).toMatchObject({
      fieldErrors: { name: 'required' },
    })
    vi.mocked(createRoom).mockRejectedValueOnce({ code: 'P2002' })
    expect(await saveRoom(null, idle, form(roomForm))).toEqual({
      status: 'error',
      fieldErrors: { name: 'taken' },
    })
    vi.mocked(updateRoom).mockRejectedValueOnce({ code: 'P2025' })
    expect(await saveRoom('gone', idle, form(roomForm))).toMatchObject({ formError: 'not_found' })
    expectLogged('error')
    vi.mocked(updateRoom).mockRejectedValueOnce(new Error('down'))
    expect(await saveRoom('room_lab', idle, form(roomForm))).toMatchObject({ formError: 'generic' })
  })
})
