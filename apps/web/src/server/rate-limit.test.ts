import { hitRateLimit } from '@muni/db/repositories'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.unmock('@/server/rate-limit')
vi.mock('@muni/db/repositories', () => ({ hitRateLimit: vi.fn() }))

const { RATE_LIMITS, RateLimitedError, spendRequest } = await import('./rate-limit')

afterEach(() => {
  vi.clearAllMocks()
})

describe('rate limit', () => {
  it('counts reads and writes apart, per user, and refuses past the limit', async () => {
    vi.mocked(hitRateLimit).mockResolvedValueOnce({ ok: true })
    await spendRequest('read', 'usr_1')
    expect(hitRateLimit).toHaveBeenCalledWith('read:usr_1', RATE_LIMITS.read)
    vi.mocked(hitRateLimit).mockResolvedValueOnce({ ok: false, retryAfterSeconds: 12 })
    const refused = await spendRequest('write', 'usr_1').catch((e: unknown) => e)
    expect(hitRateLimit).toHaveBeenLastCalledWith('write:usr_1', RATE_LIMITS.write)
    expect(refused).toBeInstanceOf(RateLimitedError)
    expect(refused).toMatchObject({ retryAfterSeconds: 12 })
  })
})
