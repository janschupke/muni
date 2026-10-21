// @vitest-environment jsdom
import { EMPTY_REFERENCE, type ImportBatch, parseFile, validateBatch } from '@muni/importer'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { commitImportChunk } from '@/server/actions/import'
import { Providers } from '@/test/render'

import { useChunkedImport } from './use-chunked-import'

vi.mock('@/server/actions/import', () => ({ commitImportChunk: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
})

/** Two courses and nothing else: the other datasets are not in the batch at all. */
function coursesOnly(): ImportBatch {
  const file = parseFile(
    'katalog.csv',
    new TextEncoder().encode(
      [
        'kod,nazev,platnost_mesicu,povinne_pro',
        'BOZP-Z,BOZP – základní školení,24,VSICHNI',
        'GDPR,Ochrana osobních údajů,24,VSICHNI',
      ].join('\n')
    ),
    { today: '2026-10-16' }
  )
  return {
    courses: validateBatch({ courses: file.rows } as ImportBatch, EMPTY_REFERENCE).courses ?? [],
  }
}

const wrapper = ({ children }: { children: ReactNode }) => <Providers>{children}</Providers>

describe('useChunkedImport', () => {
  it('writes only the datasets the batch has, and totals what the server did', async () => {
    vi.mocked(commitImportChunk).mockResolvedValue({
      ok: true,
      created: 1,
      updated: 1,
      unchanged: 3,
      skipped: 0,
    })
    const { result } = renderHook(() => useChunkedImport(), { wrapper })
    await act(() => result.current.run(coursesOnly()))
    expect(vi.mocked(commitImportChunk).mock.calls.map(([kind]) => kind)).toEqual(['courses'])
    expect(result.current.job).toEqual({
      status: 'succeeded',
      total: 2,
      results: { courses: { created: 1, updated: 1, unchanged: 3, skipped: 0 } },
    })
    act(() => {
      result.current.clear()
    })
    expect(result.current.job).toBeNull()
  })

  it('names what the server refused, with its detail when it gives one', async () => {
    vi.mocked(commitImportChunk).mockResolvedValueOnce({
      ok: false,
      error: 'invalid',
      detail: '#1: name is required',
    })
    const { result } = renderHook(() => useChunkedImport(), { wrapper })
    await act(() => result.current.run(coursesOnly()))
    expect(result.current.job).toEqual({
      status: 'failed',
      total: 2,
      written: 0,
      message: 'the server refused the records as invalid (#1: name is required)',
    })
  })

  it('says the server could not be reached when the call fails', async () => {
    vi.mocked(commitImportChunk).mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useChunkedImport(), { wrapper })
    await act(() => result.current.run(coursesOnly()))
    expect(result.current.job).toEqual({
      status: 'failed',
      total: 2,
      written: 0,
      message: 'the server could not be reached',
    })
  })
})
