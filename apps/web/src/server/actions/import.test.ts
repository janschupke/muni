import { findArchivedKeys } from '@muni/db/reference'
import { commitChunk, CommitRefusedError, CommitValidationError } from '@muni/db/writer'
import { NO_ARCHIVED } from '@muni/importer'
import { describe, expect, it, vi } from 'vitest'

import { commitImportChunk, findArchived } from '@/server/actions/import'
import { expectLogged } from '@/test/console'
import { serverSession, signedIn } from '@/test/server'

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

describe('import commit', () => {
  const course = { code: 'BOZP-Z', name: 'BOZP', validityMonths: 24, requirements: [] }

  it('writes a chunk for a signed-in user', async () => {
    vi.mocked(commitChunk).mockResolvedValue({ created: 1, updated: 0, skipped: 2 })
    expect(await commitImportChunk('courses', [course], true)).toEqual({
      ok: true,
      created: 1,
      updated: 0,
      skipped: 2,
    })
    expect(commitChunk).toHaveBeenCalledWith('db', 'courses', [course], { last: true })
  })

  it('refuses visitors, unknown datasets and oversized chunks', async () => {
    signedIn(null)
    expect(await commitImportChunk('courses', [course], true)).toEqual({
      ok: false,
      error: 'unauthorized',
    })
    signedIn('user_1')
    expect(await commitImportChunk('pets' as never, [], true)).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(await commitImportChunk('courses', 'x' as never, true)).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(await commitImportChunk('courses', [course], 'yes' as never)).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(
      await commitImportChunk(
        'courses',
        Array.from({ length: 501 }, () => course),
        true
      )
    ).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('names the first invalid record, and hides other failures', async () => {
    vi.mocked(commitChunk).mockRejectedValueOnce(
      new CommitValidationError(3, [{ code: 'custom', message: 'before_start', path: [] } as never])
    )
    expect(await commitImportChunk('sessions', [course], true)).toEqual({
      ok: false,
      error: 'invalid',
      detail: '#3: before_start',
    })
    // Valid, but in the way of what the app planned.
    vi.mocked(commitChunk).mockRejectedValueOnce(
      new CommitRefusedError(1, 'ROOM_BUSY', 'T951 → S001')
    )
    expect(await commitImportChunk('sessions', [course], true)).toEqual({
      ok: false,
      error: 'room_busy',
      detail: '#1: T951 → S001',
    })
    vi.mocked(commitChunk).mockRejectedValueOnce(new CommitRefusedError(0, 'ROOM_UNFIT', 'Aula A'))
    expect(await commitImportChunk('rooms', [course], true)).toMatchObject({ error: 'room_unfit' })
    // A record naming what the register no longer has says which.
    vi.mocked(commitChunk).mockRejectedValueOnce(
      new CommitRefusedError(4, 'REFERENCE_MISSING', 'employee E0066')
    )
    expect(await commitImportChunk('completions', [course], false)).toEqual({
      ok: false,
      error: 'reference_missing',
      detail: '#4: employee E0066',
    })
    const log = expectLogged('error')
    vi.mocked(commitChunk).mockRejectedValueOnce(new Error('deadlock'))
    expect(await commitImportChunk('sessions', [course], true)).toEqual({
      ok: false,
      error: 'failed',
    })
    expect(log).toHaveBeenCalled()
  })
})

describe('archived keys for the import review', () => {
  const candidates = { ...NO_ARCHIVED, employees: ['E0066'] }

  it('asks the database about the batch keys, for admins only', async () => {
    vi.mocked(findArchivedKeys).mockResolvedValue({ ...NO_ARCHIVED, employees: ['E0066'] })
    expect(await findArchived(candidates)).toEqual({ ...NO_ARCHIVED, employees: ['E0066'] })
    expect(findArchivedKeys).toHaveBeenCalledWith('db', candidates)
    expect(await findArchived({ ...candidates, rooms: 'x' } as never)).toEqual(NO_ARCHIVED)
    signedIn('user_1', 'FULL')
    expect(await findArchived(candidates)).toEqual(NO_ARCHIVED)
    expect(findArchivedKeys).toHaveBeenCalledTimes(1)
  })
})
