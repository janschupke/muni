import { getRoom, listRooms } from '@muni/db/repositories'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/read/[name]/route'
import { getSessionUser, isAccountArchived } from '@/server/auth'
import { RateLimitedError, spendRequest } from '@/server/rate-limit'
import { signInAs, signOut } from '@/test/auth'

import { handleRead } from './handle'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getRoom: vi.fn(),
  listRooms: vi.fn(),
}))
vi.mock('@/server/auth')

const search = (entries: Record<string, string> = {}) => new URLSearchParams(entries)
const body = async (response: Response) => (await response.json()) as unknown

beforeEach(() => {
  signInAs('VIEWER')
  vi.mocked(listRooms).mockResolvedValue([])
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('reads', () => {
  it('answer the signed-in user with the data, never cached on the way', async () => {
    const response = await handleRead('rooms-list', search())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await body(response)).toEqual([])
  })

  it('tell the browser why not: unknown, signed out, archived, not an admin', async () => {
    expect((await handleRead('nope', search())).status).toBe(404)
    expect(await body(await handleRead('toString', search()))).toEqual({ error: 'unknown_read' })
    signOut()
    expect(await body(await handleRead('rooms-list', search()))).toEqual({
      error: 'unauthenticated',
    })
    vi.mocked(isAccountArchived).mockResolvedValueOnce(true)
    const archived = await handleRead('rooms-list', search())
    expect([archived.status, await body(archived)]).toEqual([403, { error: 'archived' }])
    signInAs('FULL')
    const forbidden = await handleRead('users-list', search())
    expect([forbidden.status, await body(forbidden)]).toEqual([403, { error: 'forbidden' }])
    expect(listRooms).not.toHaveBeenCalled()
  })

  it('refuse a user past the minute’s limit, saying when to come back', async () => {
    vi.mocked(spendRequest).mockRejectedValueOnce(new RateLimitedError(20))
    const refused = await handleRead('rooms-list', search())
    expect([refused.status, await body(refused)]).toEqual([429, { error: 'rate_limited' }])
    expect(refused.headers.get('retry-after')).toBe('20')
    expect(listRooms).not.toHaveBeenCalled()
  })

  it('refuse an address that does not parse, and say when the record is not there', async () => {
    const invalid = await handleRead('room', search())
    expect([invalid.status, await body(invalid)]).toEqual([400, { error: 'invalid_input' }])
    vi.mocked(getRoom).mockResolvedValueOnce(null)
    const missing = await handleRead('room', search({ id: 'gone' }))
    expect([missing.status, await body(missing)]).toEqual([404, { error: 'not_found' }])
    expect(getRoom).toHaveBeenCalledWith('gone')
  })

  it('log a failure and answer 500', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(listRooms).mockRejectedValueOnce(new Error('down'))
    const failed = await handleRead('rooms-list', search())
    expect([failed.status, await body(failed)]).toEqual([500, { error: 'failed' }])
    expect(logged).toHaveBeenCalled()
  })

  it('are served at /api/read/<name>, with the input in the query string', async () => {
    vi.mocked(getRoom).mockResolvedValueOnce(null)
    const response = await GET(new NextRequest('http://localhost/api/read/room?id=room_1'), {
      params: Promise.resolve({ name: 'room' }),
    })
    expect(response.status).toBe(404)
    expect(getRoom).toHaveBeenCalledWith('room_1')
    expect(getSessionUser).toHaveBeenCalled()
  })
})
