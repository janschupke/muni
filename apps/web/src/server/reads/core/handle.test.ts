import { getAdvisorInput, getRoom, listRooms } from '@muni/db/repositories'
import {
  type AdvisorPlan,
  type Packed,
  planAssignments,
  type PlanItem,
  unpack,
} from '@muni/domain/advisor'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/read/[name]/route'
import { getSessionUser, isAccountArchived } from '@/server/auth'
import { RateLimitedError, spendRequest } from '@/server/rate-limit'
import { signInAs, signOut } from '@/test/auth'
import { advisorInput, roomRow } from '@/test/fixtures'

import { handleRead } from './handle'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getAdvisorInput: vi.fn(),
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
    expect(await body(response)).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      pageCount: 1,
    })
  })

  it('sort and page a list on the server: the column asked for, the page asked for', async () => {
    // 30 rooms, 1 to 30 seats; online ones (no capacity) sort last either way.
    vi.mocked(listRooms).mockResolvedValue([
      roomRow({ id: 'online', name: 'Online', capacity: null }),
      ...Array.from({ length: 30 }, (_, i) =>
        roomRow({ id: `r${String(i + 1)}`, name: `Room ${String(i + 1)}`, capacity: i + 1 })
      ),
    ])
    interface Rooms {
      items: { capacity: number | null }[]
      total: number
      pageCount: number
    }
    const first = (await body(
      await handleRead('rooms-list', search({ sort: 'capacity', dir: 'desc' }))
    )) as Rooms
    expect(first).toMatchObject({ total: 31, pageCount: 2 })
    expect(first.items.slice(0, 3).map(r => r.capacity)).toEqual([30, 29, 28])
    const second = (await body(
      await handleRead('rooms-list', search({ sort: 'capacity', dir: 'desc', page: '2' }))
    )) as Rooms
    expect(second.items.map(r => r.capacity)).toEqual([5, 4, 3, 2, 1, null])
    // A column the list does not have is refused, not ignored.
    const unknown = await handleRead('rooms-list', search({ sort: 'password' }))
    expect(unknown.status).toBe(400)
  })

  it('send the advisor one table a page at a time, with the counts for the rest', async () => {
    vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput())
    const plan = planAssignments(advisorInput())
    interface Advisor {
      plan: Packed<AdvisorPlan>
      page: { total: number }
      counts: { action: number; planned: number }
    }
    const action = (await body(
      await handleRead('advisor', search({ view: 'action', sort: 'person', dir: 'desc' }))
    )) as Advisor
    const needed = plan.items.filter(i => i.remediation === 'ACTION_REQUIRED')
    expect(action.counts.action).toBe(needed.length)
    expect(action.page.total).toBe(needed.length)
    const names = unpack(action.plan).items.map(i => i.need.employee.name)
    expect(names).toEqual(
      needed
        .map(i => i.need.employee.name)
        .toSorted((a, b) => b.localeCompare(a, 'cs'))
        .slice(0, 25)
    )
  })

  it('send admins, as a Book dialog opens, the trainings a query names with their sessions', async () => {
    vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput())
    interface Choices {
      asOf: string
      items: Packed<PlanItem[]>
    }
    const choices = async (query: Record<string, string>) =>
      unpack(((await body(await handleRead('booking-choices', search(query)))) as Choices).items)
    // Readers do not book.
    expect((await handleRead('booking-choices', search())).status).toBe(403)
    signInAs('ADMIN')
    const all = await choices({})
    expect(all.map(i => [i.need.employee.externalId, i.need.course.code])).toEqual([
      ['E0153', 'BOZP-Z'],
      ['E0002', 'POZ-OCH'],
    ])
    expect((await choices({ employee: 'E0153' }))[0]?.proposal).toMatchObject({
      kind: 'SESSION',
      session: { externalId: 'T018' },
    })
    expect(await choices({ department: 'dep_lib', course: 'BOZP-Z' })).toEqual([])
    expect(await choices({ position: 'pos_lib' })).toHaveLength(1)
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
