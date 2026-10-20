// @vitest-environment jsdom
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReadView } from '@/components/views/read-view'
import { QueryProvider } from '@/lib/query/query-provider'
import { router } from '@/test/next'
import { Providers, renderClient, testQueryClient } from '@/test/render'

import { fetchRead, ReadError, readSearch } from './fetch-read'
import { changedBy } from './invalidation'
import { makeQueryClient, STALE_MS } from './query-client'
import { useAfterWrite } from './use-after-write'
import { useDocumentTitle } from './use-document-title'

const answer = (status: number, body: unknown) => Promise.resolve(Response.json(body, { status }))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reads in the browser', () => {
  it('put the input in the query string, leaving out what is empty or not a value', () => {
    expect(readSearch({ q: 'Nová', page: 2, archived: false, empty: '', none: null })).toBe(
      '?q=Nov%C3%A1&page=2&archived=false'
    )
    expect(readSearch({ nested: { a: 1 }, gone: undefined })).toBe('')
  })

  it('answer with the data, or throw the reason as a ReadError', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    fetch.mockReturnValueOnce(answer(200, [{ id: 'r' }]))
    expect(await fetchRead('rooms-list', {})).toEqual([{ id: 'r' }])
    expect(fetch).toHaveBeenCalledWith('/api/read/rooms-list', expect.anything())
    fetch.mockReturnValueOnce(answer(403, { error: 'forbidden' }))
    await expect(fetchRead('users-list', {})).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    })
  })

  it('reload the page when signed out, so the middleware sends it to sign-in', async () => {
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ reload } as unknown as Location)
    const fetch = vi.spyOn(globalThis, 'fetch')
    fetch.mockReturnValueOnce(answer(401, { error: 'unauthenticated' }))
    await expect(fetchRead('rooms-list', {})).rejects.toBeInstanceOf(ReadError)
    // The middleware's own refusal carries no JSON reason.
    fetch.mockReturnValueOnce(Promise.resolve(new Response('', { status: 404 })))
    await expect(fetchRead('rooms-list', {})).rejects.toMatchObject({ code: 'unknown' })
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('keep data fresh for five minutes, and retry only what failed on the server', () => {
    const client = makeQueryClient()
    const queries = client.getDefaultOptions().queries
    expect(queries?.staleTime).toBe(STALE_MS)
    expect(queries?.refetchOnWindowFocus).toBe(true)
    const retry = queries?.retry as (failures: number, error: Error) => boolean
    expect(retry(0, new ReadError(404, 'not_found'))).toBe(false)
    expect(retry(0, new ReadError(500, 'failed'))).toBe(true)
    expect(retry(2, new ReadError(500, 'failed'))).toBe(false)
    expect(retry(0, new TypeError('offline'))).toBe(true)
  })
})

describe('the read cache', () => {
  it('starts empty for another user or role', async () => {
    const { rerender } = renderClient(
      <QueryProvider scope="usr_1:ADMIN">
        <Probe />
      </QueryProvider>
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'remember' }))
    expect(await screen.findByText('cached: yes')).toBeTruthy()
    rerender(
      <Providers>
        <QueryProvider scope="usr_2:VIEWER">
          <Probe />
        </QueryProvider>
      </Providers>
    )
    expect(screen.getByText('cached: no')).toBeTruthy()
  })
})

/** Shows whether its cache holds the probe; the button puts it there. */
function Probe() {
  const client = useQueryClient()
  const { data } = useQuery({ queryKey: ['probe'], queryFn: () => 0, enabled: false })
  const cached = data !== undefined
  return (
    <>
      <p>{`cached: ${cached ? 'yes' : 'no'}`}</p>
      <button
        type="button"
        onClick={() => {
          client.setQueryData(['probe'], 1)
        }}
      >
        remember
      </button>
    </>
  )
}

describe('after a write', () => {
  it('drops pages not on screen, refreshes this one, and goes on', () => {
    const client = testQueryClient()
    client.setQueryData(['read', 'gone'], 1)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Providers client={client}>{children}</Providers>
    )
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useAfterWrite('booking'), { wrapper })
    act(() => {
      result.current('/rooms/r1')
    })
    expect(client.getQueryData(['read', 'gone'])).toBeUndefined()
    expect(invalidate).toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledWith('/rooms/r1')
    act(() => {
      result.current()
    })
    expect(router.push).toHaveBeenCalledTimes(1)
  })

  it('leaves alone what the write cannot have changed', () => {
    const client = testQueryClient()
    client.setQueryData(['read', 'users-list', {}], ['kept'])
    client.setQueryData(['read', 'rooms-list', {}], ['dropped'])
    client.setQueryData(['read', 'dashboard', {}], ['kept'])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Providers client={client}>{children}</Providers>
    )
    const { result } = renderHook(() => useAfterWrite('room'), { wrapper })
    act(() => {
      result.current('/rooms')
    })
    // A room is on the rooms' pages and the planning ones, never on the users'.
    expect(client.getQueryData(['read', 'users-list', {}])).toEqual(['kept'])
    expect(client.getQueryData(['read', 'rooms-list', {}])).toBeUndefined()
    expect(client.getQueryData(['read', 'dashboard', {}])).toBeUndefined()
    expect(changedBy('role')(['read', 'user', { id: 'u1' }])).toBe(true)
    expect(changedBy('role')(['read', 'dashboard', {}])).toBe(false)
    expect(changedBy('import')(['read', 'dashboard', {}])).toBe(true)
    expect(changedBy('import')(['probe'])).toBe(false)
  })

  it('names the tab after the record once it is there', () => {
    const { rerender } = renderHook(
      ({ title }) => {
        useDocumentTitle(title)
      },
      {
        initialProps: { title: undefined as string | undefined },
        wrapper: ({ children }: { children: ReactNode }) => {
          return <Providers>{children}</Providers>
        },
      }
    )
    document.title = 'Rooms'
    rerender({ title: 'Aula A' })
    expect(document.title).toBe('Aula A · Training register')
  })
})

describe('a page reading its data', () => {
  function Page({ fail }: { fail: () => Promise<string> }) {
    const read = useQuery({ queryKey: ['page'], queryFn: fail })
    return (
      <ReadView query={read} skeleton={<p>skeleton</p>} entity="rooms">
        {data => <p>{data}</p>}
      </ReadView>
    )
  }

  it('shows the skeleton, then the page; a failure offers to try again', async () => {
    const user = userEvent.setup()
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ReadError(500, 'failed'))
      .mockResolvedValueOnce('Aula A')
    renderClient(<Page fail={load} />)
    expect(screen.getByRole('status').textContent).toContain('Loading')
    expect(await screen.findByText('Could not load the data')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Aula A')).toBeTruthy()
  })

  it('says which record is missing', async () => {
    renderClient(<Page fail={() => Promise.reject(new ReadError(404, 'not_found'))} />)
    expect(await screen.findByRole('heading', { name: 'Room not found' })).toBeTruthy()
  })

  it('keeps showing what it has when a refetch fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['page'], 'Aula A')
    renderClient(<Page fail={() => Promise.reject(new ReadError(500, 'failed'))} />, client)
    await waitFor(() => {
      expect(client.getQueryState(['page'])?.status).toBe('error')
    })
    expect(screen.getByText('Aula A')).toBeTruthy()
  })
})
